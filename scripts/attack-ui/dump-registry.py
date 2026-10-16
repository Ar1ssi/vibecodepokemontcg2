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
vstar_bar, vstar_bar_short = r.pptr(), r.pptr()
vstar_dmg, vstar_dmg_short, vstar_dmg_empty, vstar_dmg_empty_short = r.pptr(), r.pptr(), r.pptr(), r.pptr()
vstar_ink, vstar_off_ink = r.color(), r.color()
assert r.pos == len(r.raw), "registry layout drifted from the C# field order"

# Sprites the overlay HUD, the damage-mod indicator, the stack view and the status popup draw (design
# 074), written as PNGs the size of their sprite rect. The extract's PNGs are cropped to the packed
# texture rect, which would stretch an icon the game draws with preserveAspect over its full rect.
HUD_SPRITES = {
    "atkOv_Brdr_B1": "list-border-b1.png",
    "atkOv_DmgMod_Bg": "dmg-mod-bg.png",
    "atkOv_RetreatBtn_Shadow": "retreat-shadow.png",
    "accentLarge": "accent-large.png",
    "accentSmall": "accent-small.png",
    "btn_Oct_10": "oct-10.png",
    "btn_Oct_16": "oct-16.png",
    "btn_Oct_16_Half": "oct-16-half.png",
    "circle_28": "circle-28.png",
    "circle_26": "circle-26.png",
    "circle_32": "circle-32.png",
    "gradient_Vert": "gradient-vert.png",
    "healthBarFill_L": "hp-fill.png",
    "healthBar_L": "hp-bar.png",
    "icn_Close": "icn-close.png",
    "icn_CloseShadow": "icn-close-shadow.png",
    "icn_DropDown": "icn-dropdown.png",
    "icn_RightArrow": "icn-arrow-right.png",
    "icn_StackView": "icn-stack.png",
    "icn_StatusArrow": "icn-status.png",
    "shadow_32": "shadow-32.png",
    "shadow_Hex_16": "shadow-hex-16.png",
    "shadow_60": "shadow-60.png",
    "statusArrow_Down": "arrow-down.png",
    "statusArrow_Up": "arrow-up.png",
    "toolFrame_L": "tool-frame.png",
}
resources = UnityPy.load(os.path.join(game, "resources.assets"))
sprites_res = [o.read() for o in resources.objects if o.type.name == "Sprite"]


def write_full_rect(sprite, path):
    """The sprite's pixels placed on a canvas the size of its rect (Unity's offset is from the bottom)."""
    from PIL import Image

    image = sprite.image
    width, height = int(round(sprite.m_Rect.width)), int(round(sprite.m_Rect.height))
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    offset = sprite.m_RD.textureRectOffset
    canvas.paste(image, (int(round(offset.x)), height - int(round(offset.y)) - image.size[1]))
    canvas.save(path, optimize=True)


written = set()
for sprite in list(sprites1.values()) + sprites_res:
    target = HUD_SPRITES.get(sprite.m_Name)
    if target and target not in written:
        write_full_rect(sprite, os.path.join(os.path.dirname(out), target))
        written.add(target)
missing = sorted(set(HUD_SPRITES.values()) - written)
assert not missing, "HUD sprites not found: %s" % missing

borders = {}
for sprite in list(sprites1.values()) + sprites_res:
    if sprite.m_Name.lower().startswith("atkov") or sprite.m_Name in HUD_SPRITES:
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
    "vstar": {
        "ink": vstar_ink, "inkOff": vstar_off_ink,
        "titlebar": vstar_bar, "titlebarShort": vstar_bar_short,
        "dmg": vstar_dmg, "dmgShort": vstar_dmg_short,
        "dmgEmpty": vstar_dmg_empty, "dmgEmptyShort": vstar_dmg_empty_short,
    },
    "borders": dict(sorted(borders.items())),
    "hud": dict(sorted(HUD_SPRITES.items())),
}
with open(out, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(result, handle, indent=2)
    handle.write("\n")
print("wrote", out, len(borders), "sprite borders")
