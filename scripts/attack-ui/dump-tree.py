"""Dump a TCG Live UI GameObject tree with every component's serialized fields, as JSON.

The game ships no MonoBehaviour typetrees, so they are generated from its Mono assemblies
(TypeTreeGeneratorAPI, in E:/TCGLive_Extract/tools/venv). Used to read the AttackOverlay and its
option prefabs exactly (RectTransforms, TextMeshPro fonts/sizes/colours, Image sprites, layout groups)
for design 074.

  venv/Scripts/python.exe -I scripts/attack-ui/dump-tree.py "<game>/Pokemon TCG Live_Data" <file> <root name|path id> <out.json>

<file> is a serialized file in the data dir (level6, sharedassets6.assets). A root given by name picks
the first GameObject whose name matches and that has no parent.
"""
import json
import os
import struct
import sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

data_dir, file_name, root_arg, out_path = sys.argv[1:5]

# Load the target plus the files its PPtrs point into, so sprite, font and script names resolve.
EXTERNALS = ["globalgamemanagers.assets", "resources.assets"] + [f"sharedassets{i}.assets" for i in range(0, 12)]
paths = [os.path.join(data_dir, file_name)] + [
    os.path.join(data_dir, name) for name in EXTERNALS if name != file_name and os.path.exists(os.path.join(data_dir, name))
]
env = UnityPy.load(*paths)
target_file = next(f for f in env.files.values() if os.path.basename(getattr(f, "name", "")) == file_name)
loaded = {os.path.basename(getattr(f, "name", "")).lower(): f for f in env.files.values()}
generator = TypeTreeGenerator(target_file.unity_version)
generator.load_local_game(os.path.dirname(data_dir))
env.typetree_generator = generator

objects = {o.path_id: o for o in target_file.objects.values()}
generator_version = None
script_names = {}


def resolve(file_id, path_id):
    """The object a serialized PPtr names, looked up across the loaded files."""
    if path_id == 0:
        return None
    if file_id == 0:
        return objects.get(path_id)
    try:
        external = target_file.externals[file_id - 1].path
    except IndexError:
        return None
    other = loaded.get(os.path.basename(external).lower())
    return other.objects.get(path_id) if other is not None else None


def object_name(obj):
    """A component is named after its GameObject; anything else by its own m_Name."""
    try:
        tree = obj.read_typetree()
    except Exception:
        try:
            raw = obj.get_raw_data()
            file_id, path_id = struct.unpack_from("<iq", raw, 0)
            owner = resolve_in(obj.assets_file, file_id, path_id)
            return f"{object_name(owner)}" if owner else ""
        except Exception:
            return ""
    if tree.get("m_Name"):
        return tree["m_Name"]
    game_object = tree.get("m_GameObject")
    if isinstance(game_object, dict) and game_object.get("m_PathID"):
        owner = resolve_in(obj.assets_file, game_object["m_FileID"], game_object["m_PathID"])
        return object_name(owner) if owner else ""
    return tree.get("m_ClassName") or ""


def resolve_in(assets_file, file_id, path_id):
    if file_id == 0:
        return assets_file.objects.get(path_id)
    external = assets_file.externals[file_id - 1].path
    other = loaded.get(os.path.basename(external).lower())
    return other.objects.get(path_id) if other is not None else None


def script_name(pptr):
    key = (pptr["m_FileID"], pptr["m_PathID"])
    if key not in script_names:
        found = resolve(*key)
        script_names[key] = (found.read_typetree().get("m_ClassName") if found else None) or f"script{key}"
    return script_names[key]


def ref_name(value):
    """A PPtr as 'Name (Type)' when it resolves inside this file, else its ids."""
    try:
        if value.path_id == 0:
            return None
        if value.file_id == 0 and value.path_id in objects:
            target = objects[value.path_id]
            name = getattr(target.peek_name(), "__str__", lambda: "")() if hasattr(target, "peek_name") else ""
            return f"{name or ''} ({target.type.name}#{value.path_id})"
        return f"ext({value.file_id}:{value.path_id})"
    except Exception:
        return f"ref({value.file_id}:{value.path_id})"


def plain(value, depth=0):
    if depth > 6:
        return "…"
    if hasattr(value, "path_id") and hasattr(value, "file_id"):
        return ref_name(value)
    if isinstance(value, dict) and set(value) == {"m_FileID", "m_PathID"}:
        if value["m_PathID"] == 0:
            return None
        found = resolve(value["m_FileID"], value["m_PathID"])
        where = "" if value["m_FileID"] == 0 else f"{os.path.basename(found.assets_file.name)}:" if found else ""
        return f"{object_name(found)} ({found.type.name} {where}{value['m_PathID']})" if found else f"ref({value['m_FileID']}:{value['m_PathID']})"
    if isinstance(value, dict):
        return {k: plain(v, depth + 1) for k, v in value.items() if k not in ("m_GameObject", "m_Script", "m_ObjectHideFlags", "m_CorrespondingSourceObject", "m_PrefabInstance", "m_PrefabAsset", "m_EditorHideFlags", "m_EditorClassIdentifier")}
    if isinstance(value, list):
        if len(value) > 40:
            return [plain(v, depth + 1) for v in value[:40]] + ["…"]
        return [plain(v, depth + 1) for v in value]
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, (int, str, bool)) or value is None:
        return value
    if hasattr(value, "__dict__"):
        return plain({k: v for k, v in vars(value).items() if not k.startswith("_")}, depth)
    return str(value)


def component_dump(obj):
    kind = obj.type.name
    if kind == "MonoBehaviour":
        try:
            tree = obj.read_typetree()
        except Exception as error:
            return {"type": "MonoBehaviour(?)", "error": str(error)[:120]}
        # The generated tree misreads m_Script (it skips the m_Enabled alignment), so the class is
        # read off the raw header: m_GameObject PPtr (12 bytes), m_Enabled padded to 4, m_Script.
        raw = obj.get_raw_data()
        file_id, path_id = struct.unpack_from("<iq", raw, 16)
        return {"type": script_name({"m_FileID": file_id, "m_PathID": path_id}), **plain(tree)}
    if kind in ("RectTransform", "Transform"):
        t = obj.read_typetree()
        keep = {k: plain(t[k]) for k in ("m_LocalPosition", "m_LocalRotation", "m_LocalScale", "m_AnchorMin", "m_AnchorMax", "m_AnchoredPosition", "m_SizeDelta", "m_Pivot") if k in t}
        return {"type": kind, **keep}
    if kind == "CanvasRenderer":
        return None
    try:
        return {"type": kind, **plain(obj.read_typetree())}
    except Exception:
        return {"type": kind}


def go_dump(go_obj):
    go = go_obj.read_typetree()
    comps = []
    transform = None
    for entry in go["m_Component"]:
        ref = entry["component"]
        target = objects.get(ref["m_PathID"])
        if target is None:
            continue
        if target.type.name in ("RectTransform", "Transform"):
            transform = target
        dumped = component_dump(target)
        if dumped:
            comps.append(dumped)
    node = {"name": go["m_Name"], "active": go["m_IsActive"], "components": comps, "children": []}
    if transform is not None:
        for child in transform.read_typetree()["m_Children"]:
            child_t = objects.get(child["m_PathID"])
            if child_t is None:
                continue
            child_go = objects.get(child_t.read_typetree()["m_GameObject"]["m_PathID"])
            if child_go is not None:
                node["children"].append(go_dump(child_go))
    return node


def find_root():
    if root_arg.isdigit():
        found = objects[int(root_arg)]
        if found.type.name != "GameObject":
            found = objects[found.read_typetree()["m_GameObject"]["m_PathID"]]
        return found
    for o in env.objects:
        if o.type.name != "GameObject":
            continue
        tree = o.read_typetree()
        if tree["m_Name"] != root_arg:
            continue
        return o
    raise SystemExit(f"no GameObject named {root_arg}")


with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(go_dump(find_root()), fh, indent=1, ensure_ascii=False)
print("wrote", out_path)
