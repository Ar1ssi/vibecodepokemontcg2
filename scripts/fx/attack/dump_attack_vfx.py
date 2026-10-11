"""Dump TCG Live's attack impact prefabs (design 068) from the Unity bundle cache.

Usage (UnityPy lives in the extract's venv; -I keeps the cache dir off sys.path):
  E:/TCGLive_Extract/tools/venv/Scripts/python.exe -I scripts/fx/attack/dump_attack_vfx.py \
      "<unity cache dir>" "<out dir>"
  <unity cache dir> = C:/Users/<you>/AppData/LocalLow/Unity/pokemon_Pokemon TCG Live

Writes <out dir>/attack-raw.json (prefab trees with the full ParticleSystem type trees, and
every material, shader, texture and mesh they reach, across bundles), <out dir>/textures/*.webp
(lossless, RGB kept under alpha 0) and <out dir>/meshes/*.json. Shaders carry the pass
states, the reflection tables and the D3D disassembly of every compiled variant, so
scripts/fx/attack/import-tcgl-attack-fx.mjs can translate them without guessing.
This file only extracts; every choice is made by the importer.
"""
import ctypes
import glob
import json
import os
import struct
import sys

import lz4.block
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

BUNDLES = [
    "attack_colorless", "attack_dark", "attack_dragon", "attack_fairy", "attack_fighting",
    "attack_fire", "attack_grass", "attack_lightning", "attack_metal", "attack_psychic",
    "attack_water",
]
BUILTIN = "builtin"
BINDING_TEXTURE = 0


def read_cstring(handle):
    out = b""
    while True:
        char = handle.read(1)
        if char in (b"", b"\0"):
            return out.decode()
        out += char


def bundle_cab_names(path):
    """The serialized-file names inside a UnityFS bundle, read from its header only."""
    with open(path, "rb") as handle:
        if read_cstring(handle) != "UnityFS":
            return []
        version = struct.unpack(">I", handle.read(4))[0]
        read_cstring(handle)
        read_cstring(handle)
        size, compressed_size, raw_size, flags = struct.unpack(">qIII", handle.read(20))
        if version >= 7:
            handle.seek((handle.tell() + 15) // 16 * 16)
        if flags & 0x80:
            handle.seek(size - compressed_size)
        blob = handle.read(compressed_size)
        compression = flags & 0x3F
        if compression in (2, 3):
            data = lz4.block.decompress(blob, uncompressed_size=raw_size)
        elif compression == 0:
            data = blob
        else:
            return []
        pos = 16
        block_count = struct.unpack_from(">i", data, pos)[0]
        pos += 4 + block_count * 10
        node_count = struct.unpack_from(">i", data, pos)[0]
        pos += 4
        names = []
        for _ in range(node_count):
            pos += 20
            end = data.index(b"\0", pos)
            names.append(data[pos:end].decode())
            pos = end + 1
        return names


def build_cab_index(cache):
    index = {}
    for bundle in sorted(os.listdir(cache)):
        for path in glob.glob(os.path.join(cache, bundle, "*", "__data")):
            try:
                for name in bundle_cab_names(path):
                    if not name.endswith((".resS", ".resource")):
                        index[name] = bundle
            except (OSError, ValueError, struct.error, lz4.block.LZ4BlockError):
                continue
    return index


class BlobReader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def int(self):
        value = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return value

    def string(self):
        length = self.int()
        text = self.data[self.pos:self.pos + length].decode()
        self.pos += (length + 3) // 4 * 4
        return text


def read_parameters(reader):
    """Vector / matrix parameters: name, then type, rows, columns, isMatrix, arraySize, byte offset."""
    params = []
    for _ in range(reader.int()):
        name = reader.string()
        kind, rows, columns, is_matrix, array_size, offset = (reader.int() for _ in range(6))
        params.append({
            "name": name, "type": kind, "rows": rows, "columns": columns,
            "isMatrix": bool(is_matrix), "arraySize": array_size, "offset": offset,
        })
    struct_count = reader.int()
    if struct_count:
        raise ValueError("struct parameters are not handled")
    return params


def parse_parameter_blob(data):
    """
    A variant's own parameter table (Unity 2021.2+ keeps it apart from the program): the
    version, the group count (loose parameters + one group per constant buffer), then the
    bindings as name, type, slot, a third int; a texture (type 0) has its sampler slot there
    and one more int. A constant buffer (type 1) not listed sits in slot 0. Returns the raw
    bytes as hex instead when the layout is not the one read here, so the importer can refuse it.
    """
    try:
        reader = BlobReader(data)
        version = reader.int()
        group_count = reader.int()
        reader.int()
        reader.int()
        loose = read_parameters(reader)
        buffers = []
        for _ in range(group_count - 1):
            name = reader.string()
            size = reader.int()
            buffers.append({"name": name, "size": size, "params": read_parameters(reader)})
        bindings = []
        for _ in range(reader.int()):
            name = reader.string()
            kind, slot, sampler = (reader.int() for _ in range(3))
            binding = {"name": name, "type": kind, "slot": slot}
            if kind == BINDING_TEXTURE:
                binding["sampler"] = sampler
                binding["dimension"] = reader.int()
            bindings.append(binding)
        if reader.pos != len(data):
            raise ValueError("%d of %d bytes read" % (reader.pos, len(data)))
        return {"version": version, "loose": loose, "buffers": buffers, "bindings": bindings}
    except (ValueError, struct.error, UnicodeDecodeError) as error:
        return {"error": str(error), "hex": data.hex()}


class Disassembler:
    """D3DDisassemble from the system d3dcompiler_47.dll."""

    def __init__(self):
        self.dll = ctypes.WinDLL("d3dcompiler_47.dll")

    def __call__(self, bytecode):
        blob = ctypes.c_void_p()
        result = self.dll.D3DDisassemble(
            ctypes.c_char_p(bytecode), ctypes.c_size_t(len(bytecode)), 0, None, ctypes.byref(blob)
        )
        if result != 0:
            raise RuntimeError("D3DDisassemble failed: 0x%08x" % (result & 0xFFFFFFFF))
        vtable = ctypes.cast(blob, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        get_pointer = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vtable[3])
        get_size = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vtable[4])
        release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtable[2])
        text = ctypes.string_at(get_pointer(blob), get_size(blob)).decode("ascii", "replace")
        release(blob)
        return text.rstrip("\0")


class Dumper:
    def __init__(self, cache, out_dir):
        self.cache = cache
        self.out_dir = out_dir
        self.cab_index = build_cab_index(cache)
        self.files = {}  # cab name -> SerializedFile
        self.loaded = set()
        self.disassemble = Disassembler()
        self.materials = {}
        self.shaders = {}
        self.textures = {}
        self.meshes = {}
        self.texture_dir = os.path.join(out_dir, "textures")
        self.mesh_dir = os.path.join(out_dir, "meshes")
        os.makedirs(self.texture_dir, exist_ok=True)
        os.makedirs(self.mesh_dir, exist_ok=True)

    def load_bundle(self, bundle):
        if bundle in self.loaded:
            return
        self.loaded.add(bundle)
        paths = glob.glob(os.path.join(self.cache, bundle, "*", "__data"))
        if not paths:
            raise RuntimeError("bundle not in the cache: " + bundle)
        env = UnityPy.load(paths[0])
        for bundle_file in env.files.values():
            for name, inner in getattr(bundle_file, "files", {}).items():
                if hasattr(inner, "objects"):
                    self.files[name] = inner

    def cab_of(self, bundle):
        self.load_bundle(bundle)
        return next(name for name, _ in self.files.items() if self.cab_index.get(name) == bundle)

    def resolve(self, cab, pptr):
        """(cab, path id) of a PPtr seen from `cab`; (BUILTIN, id) for Unity's own resources."""
        pptr = pptr or {}
        path_id = pptr.get("m_PathID", 0)
        file_id = pptr.get("m_FileID", 0)
        if not path_id:
            return None
        if file_id == 0:
            return (cab, path_id)
        path = self.files[cab].externals[file_id - 1].path
        if "unity default resources" in path or "unity_builtin_extra" in path:
            return (BUILTIN, path_id)
        target = os.path.basename(path)
        bundle = self.cab_index.get(target)
        if bundle is None:
            raise RuntimeError("external file not in the cache: " + path)
        self.load_bundle(bundle)
        return (target, path_id)

    def reader(self, ref):
        cab, path_id = ref
        return self.files[cab].objects[path_id]

    @staticmethod
    def key(ref):
        return "%s:%d" % ref

    # ---- textures -------------------------------------------------------------------

    def texture(self, cab, pptr):
        ref = self.resolve(cab, pptr)
        if ref is None:
            return None
        key = self.key(ref)
        if key in self.textures:
            return key
        if ref[0] == BUILTIN:
            self.textures[key] = {"builtin": ref[1]}
            return key
        obj = self.reader(ref)
        if obj.type.name != "Texture2D":
            self.textures[key] = {"unsupported": obj.type.name}
            return key
        data = obj.read()
        tree = obj.read_typetree()
        settings = tree.get("m_TextureSettings", {})
        file_name = "%s.webp" % data.m_Name
        image = data.image
        image.save(os.path.join(self.texture_dir, file_name), "WEBP", lossless=True, exact=True, method=6)
        self.textures[key] = {
            "name": data.m_Name,
            "file": file_name,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "format": tree.get("m_TextureFormat"),
            "colorSpace": tree.get("m_ColorSpace"),
            "mipCount": tree.get("m_MipCount"),
            "filter": settings.get("m_FilterMode"),
            "wrapU": settings.get("m_WrapU"),
            "wrapV": settings.get("m_WrapV"),
        }
        return key

    # ---- meshes ---------------------------------------------------------------------

    def mesh(self, cab, pptr):
        ref = self.resolve(cab, pptr)
        if ref is None:
            return None
        key = self.key(ref)
        if key in self.meshes:
            return key
        if ref[0] == BUILTIN:
            self.meshes[key] = {"builtin": ref[1]}
            return key
        obj = self.reader(ref)
        data = obj.read()
        handler = MeshHandler(data)
        handler.process()
        triangles = []
        for submesh in handler.get_triangles():
            for triangle in submesh:
                triangles.extend(int(i) for i in triangle)

        def rows(values, width):
            return [[round(float(c), 6) for c in row[:width]] for row in values] if values else None

        file_name = "%s.json" % data.m_Name
        payload = {
            "name": data.m_Name,
            "positions": rows(handler.m_Vertices, 3),
            "normals": rows(handler.m_Normals, 3),
            "tangents": rows(handler.m_Tangents, 4),
            "colors": rows(handler.m_Colors, 4),
            "uv0": rows(handler.m_UV0, 4),
            "uv1": rows(handler.m_UV1, 4),
            "uv2": rows(handler.m_UV2, 4),
            "uv3": rows(handler.m_UV3, 4),
            "uvWidths": [len(c[0]) if c else 0 for c in (handler.m_UV0, handler.m_UV1, handler.m_UV2, handler.m_UV3)],
            "indices": triangles,
        }
        with open(os.path.join(self.mesh_dir, file_name), "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        self.meshes[key] = {"name": data.m_Name, "file": file_name, "vertexCount": len(handler.m_Vertices)}
        return key

    # ---- shaders --------------------------------------------------------------------

    def shader(self, cab, pptr):
        ref = self.resolve(cab, pptr)
        if ref is None:
            return None
        key = self.key(ref)
        if key in self.shaders:
            return key
        if ref[0] == BUILTIN:
            self.shaders[key] = {"builtin": ref[1]}
            return key
        tree = self.reader(ref).read_typetree()
        parsed = tree["m_ParsedForm"]
        blob = self.shader_blob(tree)
        entries = self.blob_entries(blob)
        subshader = parsed["m_SubShaders"][0]
        passes = []
        for shader_pass in subshader["m_Passes"]:
            names = {index: name for name, index in shader_pass.get("m_NameIndices", [])}
            passes.append({
                "type": shader_pass.get("m_Type"),
                "useName": shader_pass.get("m_UseName"),
                "textureName": shader_pass.get("m_TextureName"),
                "state": shader_pass.get("m_State"),
                "tags": shader_pass.get("m_Tags"),
                "names": names,
                "vertex": self.program(shader_pass.get("progVertex"), blob, entries),
                "fragment": self.program(shader_pass.get("progFragment"), blob, entries),
            })
        self.shaders[key] = {
            "name": parsed["m_Name"],
            "props": parsed["m_PropInfo"]["m_Props"],
            "keywordNames": parsed.get("m_KeywordNames"),
            "subShaderTags": subshader.get("m_Tags"),
            "lod": subshader.get("m_LOD"),
            "passes": passes,
            "nonModifiableTextures": [
                [name, self.texture(ref[0], texture)] for name, texture in tree.get("m_NonModifiableTextures", [])
            ],
        }
        return key

    @staticmethod
    def shader_blob(tree):
        """The first platform's compiled programs, decompressed (Windows bundles carry D3D11 only)."""
        blob = bytes(tree["compressedBlob"])
        offsets = tree["offsets"][0]
        compressed = tree["compressedLengths"][0]
        raw = tree["decompressedLengths"][0]
        return b"".join(
            lz4.block.decompress(blob[offset:offset + length], uncompressed_size=size)
            for offset, length, size in zip(offsets, compressed, raw)
        )

    @staticmethod
    def blob_entries(blob):
        count = struct.unpack_from("<i", blob, 0)[0]
        return [struct.unpack_from("<III", blob, 4 + index * 12)[:2] for index in range(count)]

    def program(self, program, blob, entries):
        if not program:
            return None
        variants = []
        tiers = zip(program.get("m_PlayerSubPrograms", []), program.get("m_ParameterBlobIndices", []))
        for subs, parameter_indices in tiers:
            for sub, parameter_index in zip(subs, parameter_indices):
                offset, length = entries[sub["m_BlobIndex"]]
                chunk = blob[offset:offset + length]
                start = chunk.find(b"DXBC")
                parameter_offset, parameter_length = entries[parameter_index]
                variant = {
                    "keywords": sub["m_KeywordIndices"],
                    "gpuProgramType": sub.get("m_GpuProgramType"),
                    "params": parse_parameter_blob(blob[parameter_offset:parameter_offset + parameter_length]),
                    "asm": None,
                }
                if start >= 0:
                    size = struct.unpack_from("<I", chunk, start + 24)[0]
                    variant["asm"] = self.disassemble(chunk[start:start + size])
                variants.append(variant)
        return {"variants": variants, "common": program.get("m_CommonParameters")}

    # ---- materials ------------------------------------------------------------------

    def material(self, cab, pptr):
        ref = self.resolve(cab, pptr)
        if ref is None:
            return None
        key = self.key(ref)
        if key in self.materials:
            return key
        if ref[0] == BUILTIN:
            self.materials[key] = {"builtin": ref[1]}
            return key
        tree = self.reader(ref).read_typetree()
        saved = tree.get("m_SavedProperties", {})
        self.materials[key] = {
            "name": tree.get("m_Name"),
            "shader": self.shader(ref[0], tree.get("m_Shader")),
            "validKeywords": tree.get("m_ValidKeywords"),
            "invalidKeywords": tree.get("m_InvalidKeywords"),
            "renderQueue": tree.get("m_CustomRenderQueue"),
            "tags": tree.get("stringTagMap"),
            "disabledPasses": tree.get("disabledShaderPasses"),
            "textures": {
                name: {
                    "texture": self.texture(ref[0], env.get("m_Texture")),
                    "scale": [env["m_Scale"]["x"], env["m_Scale"]["y"]],
                    "offset": [env["m_Offset"]["x"], env["m_Offset"]["y"]],
                }
                for name, env in saved.get("m_TexEnvs", [])
            },
            "floats": dict(saved.get("m_Floats", [])),
            "ints": dict(saved.get("m_Ints", [])),
            "colors": {name: [c["r"], c["g"], c["b"], c["a"]] for name, c in saved.get("m_Colors", [])},
        }
        return key

    # ---- prefab trees ---------------------------------------------------------------

    def node(self, cab, game_object_id):
        objects = self.files[cab].objects
        game_object = objects[game_object_id].read_typetree()
        entry = {"name": game_object.get("m_Name"), "active": bool(game_object.get("m_IsActive", True)), "others": []}
        children = []
        for component in game_object.get("m_Component", []):
            component_id = component["component"]["m_PathID"]
            if component_id not in objects:
                continue
            kind = objects[component_id].type.name
            if kind == "MonoBehaviour":
                entry["others"].append(kind)
                continue
            tree = objects[component_id].read_typetree()
            if kind == "Transform":
                position, rotation, scale = tree["m_LocalPosition"], tree["m_LocalRotation"], tree["m_LocalScale"]
                entry["position"] = [position["x"], position["y"], position["z"]]
                entry["rotation"] = [rotation["x"], rotation["y"], rotation["z"], rotation["w"]]
                entry["scale"] = [scale["x"], scale["y"], scale["z"]]
                children = [objects[c["m_PathID"]].read_typetree()["m_GameObject"]["m_PathID"] for c in tree.get("m_Children", [])]
            elif kind == "ParticleSystem":
                tree.pop("m_GameObject", None)
                self.resolve_shape_refs(cab, tree)
                entry["particleSystem"] = tree
            elif kind == "ParticleSystemRenderer":
                tree.pop("m_GameObject", None)
                tree["m_Materials"] = [self.material(cab, m) for m in tree.get("m_Materials", [])]
                for slot in ("m_Mesh", "m_Mesh1", "m_Mesh2", "m_Mesh3"):
                    if slot in tree:
                        tree[slot] = self.mesh(cab, tree[slot])
                entry["particleRenderer"] = tree
            elif kind == "MeshFilter":
                entry["meshFilter"] = self.mesh(cab, tree.get("m_Mesh"))
            elif kind == "MeshRenderer":
                entry["meshRenderer"] = {
                    "enabled": bool(tree.get("m_Enabled", True)),
                    "materials": [self.material(cab, m) for m in tree.get("m_Materials", [])],
                    "sortingOrder": tree.get("m_SortingOrder"),
                }
            else:
                entry["others"].append(kind)
        entry["children"] = [self.node(cab, child) for child in children]
        return entry

    def resolve_shape_refs(self, cab, tree):
        shape = tree.get("ShapeModule", {})
        for slot in ("m_Mesh",):
            if slot in shape:
                shape[slot] = self.mesh(cab, shape[slot])
        for slot in ("m_Texture",):
            if slot in shape:
                shape[slot] = self.texture(cab, shape[slot])
        for slot in ("m_MeshRenderer", "m_SkinnedMeshRenderer", "m_SpriteRenderer", "m_Sprite"):
            if slot in shape:
                shape[slot] = bool((shape[slot] or {}).get("m_PathID"))
        sprites = tree.get("UVModule", {}).get("sprites")
        if sprites is not None:
            tree["UVModule"]["sprites"] = len([s for s in sprites if (s.get("sprite") or {}).get("m_PathID")])

    def prefabs(self, bundle):
        cab = self.cab_of(bundle)
        objects = self.files[cab].objects
        roots = []
        for path_id, obj in objects.items():
            if obj.type.name != "Transform":
                continue
            tree = obj.read_typetree()
            if tree.get("m_Father", {}).get("m_PathID", 0) == 0:
                roots.append(self.node(cab, tree["m_GameObject"]["m_PathID"]))
        return roots


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    cache, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    dumper = Dumper(cache, out_dir)
    bundles = {}
    for bundle in BUNDLES:
        bundles[bundle] = dumper.prefabs(bundle)
        print("%s: %d roots" % (bundle, len(bundles[bundle])))
    unity_version = next(iter(dumper.files.values())).unity_version
    payload = {
        "unityVersion": unity_version,
        "bundles": bundles,
        "materials": dumper.materials,
        "shaders": dumper.shaders,
        "textures": dumper.textures,
        "meshes": dumper.meshes,
    }
    path = os.path.join(out_dir, "attack-raw.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    print("%d materials, %d shaders, %d textures, %d meshes -> %s" % (
        len(dumper.materials), len(dumper.shaders), len(dumper.textures), len(dumper.meshes), path))


if __name__ == "__main__":
    main()
