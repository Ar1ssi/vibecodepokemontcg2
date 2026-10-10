"""Dump the TCG Live attack-overlay style table to client/src/assets/attack-ui/attack-ui.json.

Reads the game's own serialized data, so it needs UnityPy (E:/TCGLive_Extract/tools/venv has it):
  venv/Scripts/python.exe -I scripts/attack-ui/dump-registry.py "<game>/Pokemon TCG Live_Data" client/src/assets/attack-ui/attack-ui.json

Source of truth: ScriptableObject `AttackEntryAssetRegistry_AttackOverlay` in sharedassets6.assets
(class AttackEntryAssetRegistryData, Code/TPCI.RainierClient/AttackEntryAssetRegistryData.cs). Player builds
strip MonoBehaviour typetrees, so the fields are read by walking the C# field order.
Array index = MatchLogic.EnergyType (NONE=0, Colorless=1 ... Psychic=11).
"""
import json
import os
import struct
import sys

import UnityPy

TYPE_KEYS = [None, "colorless", "fire", "grass", "water", "fighting", "fairy", "darkness", "lightning", "dragon", "metal", "psychic"]
REGISTRY_NAME = "AttackEntryAssetRegistry_AttackOverlay"

game, out = sys.argv[1], sys.argv[2]
shared6 = UnityPy.load(os.path.join(game, "sharedassets6.assets"))
shared1 = UnityPy.load(os.path.join(game, "sharedassets1.assets"))
sprites1 = {o.path_id: o.read() for o in shared1.objects if o.type.name == "Sprite"}
sprites6 = {o.path_id: o.read() for o in shared6.objects if o.type.name == "Sprite"}


def sprite_name(file_id, path_id):
    if path_id == 0:
        return None
    return (sprites6 if file_id == 0 else sprites1)[path_id].m_Name


class Reader:
    def __init__(self, raw, pos):
        self.raw, self.pos = raw, pos

    def pptr(self):
        file_id, path_id = struct.unpack_from("<iq", self.raw, self.pos)
        self.pos += 12
        return sprite_name(file_id, path_id)

    def sprites(self):
        (count,) = struct.unpack_from("<i", self.raw, self.pos)
        self.pos += 4
        return [self.pptr() for _ in range(count)]

    def color(self):
        r, g, b, a = struct.unpack_from("<ffff", self.raw, self.pos)
        self.pos += 16
        return "#%02x%02x%02x" % tuple(round(c * 255) for c in (r, g, b))

    def colors(self):
        (count,) = struct.unpack_from("<i", self.raw, self.pos)
        self.pos += 4
        return [self.color() for _ in range(count)]


registry = None
for obj in shared6.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    raw = bytes(obj.get_raw_data())
    (name_len,) = struct.unpack_from("<i", raw, 28)
    if raw[32:32 + name_len].decode(errors="replace") == REGISTRY_NAME:
        registry = Reader(raw, 32 + (name_len + 3) // 4 * 4)
        break
if registry is None:
    sys.exit("registry %s not found in sharedassets6.assets" % REGISTRY_NAME)

r = registry
for _ in range(8):  # damage backgrounds, ability header, transparent image, ability tags
    r.pptr()
bars, bars_short = r.sprites(), r.sprites()
bar_colors, ink_colors = r.colors(), r.colors()
retreat = r.sprites()
cant_use, cant_use_ink = r.color(), r.color()
r.pptr(), r.pptr()  # GX headers
gx_ink, gx_off_ink = r.color(), r.color()
assert r.pos == len(r.raw) - 6 * 12 - 32, "registry layout drifted from the C# field order"

borders = {}
for sprite in sprites1.values():
    if sprite.m_Name.lower().startswith("atkov"):
        b = sprite.m_Border  # Unity order: x=left, y=bottom, z=right, w=top
        borders[sprite.m_Name] = {
            "left": int(b.x), "bottom": int(b.y), "right": int(b.z), "top": int(b.w),
            "width": int(sprite.m_Rect.width), "height": int(sprite.m_Rect.height),
        }

result = {
    "source": "sharedassets6.assets " + REGISTRY_NAME,
    "types": {
        key: {"bar": bar_colors[i], "ink": ink_colors[i], "titlebar": bars[i], "titlebarShort": bars_short[i], "retreat": retreat[i]}
        for i, key in enumerate(TYPE_KEYS) if key
    },
    "cantUse": {"bar": cant_use, "ink": cant_use_ink},
    "gx": {"ink": gx_ink, "inkOff": gx_off_ink},
    "borders": dict(sorted(borders.items())),
}
with open(out, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(result, handle, indent=2)
    handle.write("\n")
print("wrote", out, len(borders), "sprite borders")
