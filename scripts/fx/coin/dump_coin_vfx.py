"""Dump TCG Live's coin materials (design 069) from the extract's bundle files.

Usage (UnityPy lives in the extract's venv; -I keeps the extract folder off sys.path, -B stops
bytecode landing in scripts/fx/attack/):
  E:/TCGLive_Extract/tools/venv/Scripts/python.exe -I -B scripts/fx/coin/dump_coin_vfx.py \
      "E:/TCGLive_Extract/cosmetics" "E:/TCGLive_Extract/vfx_dump/coin_raw"

<cosmetics dir> holds bundles/<coin id> (one UnityFS file per coin) and bundles_deps/<name> (shared
files, coinshaders among them). Writes <out dir>/coin-raw.json (each coin's material keys, and the
materials, shaders and textures they reach) and <out dir>/textures/*.webp. Like dump_attack_vfx.py,
this file only extracts; scripts/fx/coin/import-tcgl-coins.mjs makes every choice.
"""
import glob
import json
import os
import struct
import sys

import lz4.block

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "attack"))

import dump_attack_vfx as attack  # noqa: E402  (shader, texture and material readers)
import UnityPy  # noqa: E402

SHADER_BUNDLE = "coinshaders"
COIN_PREFIX = "cn_"
THUMBNAIL_SUFFIX = "-t"
CUBE_FACES = 6


def bundle_files(cosmetics):
    """Bundle file name → path, across bundles/ and bundles_deps/."""
    paths = {}
    for folder in ("bundles", "bundles_deps"):
        for path in glob.glob(os.path.join(cosmetics, folder, "*")):
            if not os.path.isfile(path):
                continue
            name = os.path.basename(path)
            if name in paths:
                raise RuntimeError("bundle name in two folders: " + name)
            paths[name] = path
    return paths


class CoinDumper(attack.Dumper):
    """The attack dumper, reading one bundle file per bundle instead of a cache folder."""

    def __init__(self, cosmetics, out_dir):
        self.cache = cosmetics
        self.out_dir = out_dir
        self.bundle_paths = bundle_files(cosmetics)
        self.cab_index = {}
        for bundle, path in self.bundle_paths.items():
            try:
                names = attack.bundle_cab_names(path)
            except (OSError, ValueError, struct.error, lz4.block.LZ4BlockError):
                continue
            for name in names:
                if not name.endswith((".resS", ".resource")):
                    self.cab_index[name] = bundle
        self.files = {}
        self.loaded = set()
        self.disassemble = attack.Disassembler()
        self.materials = {}
        self.shaders = {}
        self.textures = {}
        self.meshes = {}
        self.texture_dir = os.path.join(out_dir, "textures")
        os.makedirs(self.texture_dir, exist_ok=True)

    def load_bundle(self, bundle):
        if bundle in self.loaded:
            return
        self.loaded.add(bundle)
        env = UnityPy.load(self.bundle_paths[bundle])
        for bundle_file in env.files.values():
            for name, inner in getattr(bundle_file, "files", {}).items():
                if hasattr(inner, "objects"):
                    self.files[name] = inner

    def texture(self, cab, pptr):
        """Texture2D as the base class; a Cubemap as its six faces, which UnityPy decodes one at a time."""
        ref = self.resolve(cab, pptr)
        if ref is None or ref[0] == attack.BUILTIN or self.reader(ref).type.name != "Cubemap":
            return super().texture(cab, pptr)
        key = self.key(ref)
        if key not in self.textures:
            self.textures[key] = self.cubemap(self.reader(ref).read())
        return key

    def cubemap(self, data):
        """Each face (+X -X +Y -Y +Z -Z) as its own lossless WebP, in Unity's face order."""
        whole = data.get_image_data()
        face_size = len(whole) // CUBE_FACES
        face_files = []
        for index in range(CUBE_FACES):
            data.image_data = whole[index * face_size:(index + 1) * face_size]
            face = data.image
            file_name = "%s.face%d.webp" % (data.m_Name, index)
            face.save(os.path.join(self.texture_dir, file_name), "WEBP", lossless=True, exact=True, method=6)
            face_files.append(file_name)
        return {
            "name": data.m_Name,
            "cube": True,
            "faces": face_files,
            "width": face.width,
            "height": face.height,
            "mode": face.mode,
            "format": data.m_TextureFormat,
            "colorSpace": data.m_ColorSpace,
        }


def objects_of_type(dumper, bundle, type_name):
    """(cab, path id) of every object of `type_name` in a bundle, listed before any read loads more bundles."""
    dumper.load_bundle(bundle)
    found = []
    for cab in list(dumper.files):
        if dumper.cab_index.get(cab) != bundle:
            continue
        found.extend((cab, obj.path_id) for obj in dumper.files[cab].objects.values() if obj.type.name == type_name)
    return found


def local_pptr(path_id):
    return {"m_FileID": 0, "m_PathID": path_id}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    cosmetics, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    dumper = CoinDumper(cosmetics, out_dir)

    for cab, path_id in objects_of_type(dumper, SHADER_BUNDLE, "Shader"):
        dumper.shader(cab, local_pptr(path_id))

    coins = {}
    for bundle in sorted(dumper.bundle_paths):
        if not bundle.startswith(COIN_PREFIX) or bundle.endswith(THUMBNAIL_SUFFIX):
            continue
        coins[bundle] = [
            dumper.material(cab, local_pptr(path_id)) for cab, path_id in objects_of_type(dumper, bundle, "Material")
        ]

    unity_version = next(iter(dumper.files.values())).unity_version
    payload = {
        "unityVersion": unity_version,
        "coins": coins,
        "materials": dumper.materials,
        "shaders": dumper.shaders,
        "textures": dumper.textures,
    }
    path = os.path.join(out_dir, "coin-raw.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    print("%d coins, %d materials, %d shaders, %d textures -> %s" % (
        len(coins), len(dumper.materials), len(dumper.shaders), len(dumper.textures), path))


if __name__ == "__main__":
    main()
