"""Numbers from docs/card-art-gen9-ex-mega-generation-spec.md.

Pure Python (no bpy), so the QA script can import it outside Blender. Frame coordinates are
normalized to the card face: u runs left to right, v runs top to bottom, both 0..1.
"""

CARD_ASPECT = 63 / 88
FINAL_RESOLUTION = (1200, 1676)

SUBLINES = ('standard', 'tera', 'mega')
STAGES = ('basic', 'stage')

BORDER_X = 0.037
BORDER_TOP = 0.025
HERO_BOTTOM = 0.475
TEXT_ZONE = (0.57, 0.85)
_HEADER_BOTTOM = {'basic': 0.08, 'stage': 0.115, 'mega': 0.14, 'tera': 0.164}

# Crop the spec's tone targets were measured on (tighter than the hero zone; clears every header).
QA_CROP = (0.10, 0.17, 0.90, 0.47)

# Spec section 4: (10th percentile, median, 90th percentile) per sub-line.
TONE_RANGES = {
    'standard': {
        'sat': (0.24, 0.41, 0.58), 'val': (0.52, 0.69, 0.81), 'contrast': (45, 55, 64),
        'colorful': (46, 82, 114), 'edge': (0.18, 0.26, 0.35), 'hi': (0.01, 0.04, 0.13),
        'lo': (0.00, 0.01, 0.06), 'hue_entropy': (0.95, 1.75, 2.37),
    },
    'tera': {
        'sat': (0.26, 0.38, 0.46), 'val': (0.67, 0.79, 0.84), 'contrast': (46, 55, 64),
        'colorful': (66, 93, 110), 'edge': (0.35, 0.41, 0.50), 'hi': (0.06, 0.12, 0.16),
        'lo': (0.00, 0.00, 0.03), 'hue_entropy': (1.55, 2.26, 2.81),
    },
    'mega': {
        'sat': (0.33, 0.48, 0.63), 'val': (0.55, 0.67, 0.84), 'contrast': (55, 64, 73),
        'colorful': (81, 104, 125), 'edge': (0.24, 0.29, 0.36), 'hi': (0.02, 0.05, 0.13),
        'lo': (0.00, 0.05, 0.12), 'hue_entropy': (1.75, 2.37, 2.74),
    },
}

# Spec 4c vivid-pixel clusters, weighted by their share. Lime and cobalt were measured separately
# (median colour on 10/41 and 5/41 regular Megas); their weights are chosen to match that rarity.
MEGA_SHARD_PALETTE = (
    ('#E9DF1E', 0.32), ('#DC2C2F', 0.20), ('#0FA3D9', 0.18), ('#E5752D', 0.17),
    ('#EA0989', 0.08), ('#E1327A', 0.06), ('#93C643', 0.08), ('#2D3292', 0.04),
)
MEGA_RIM_COLORS = ('#E9DF1E', '#0FA3D9')

# Median colour of the most over-represented hue per type on Gen 9 regular ex hero zones
# (accent), and the second one where it is meaningful. Colorless and Metal measure as mostly
# neutral, so their accents are chosen neutrals; their secondaries are measured.
TYPE_COLORS = {
    'Colorless': ('#E8E2D6', '#D79456'),
    'Darkness': ('#633F92', '#8C468E'),
    'Dragon': ('#2FABB2', '#564C9A'),
    'Fighting': ('#C6824A', '#C6824A'),
    'Fire': ('#D54232', '#EC9743'),
    'Grass': ('#1D964F', '#49A24E'),
    'Lightning': ('#F9DD55', '#E09A3A'),
    'Metal': ('#B8C6D1', '#3C81B4'),
    'Psychic': ('#D55B8F', '#925093'),
    'Water': ('#3C8FC3', '#2DB2D9'),
}


def header_bottom(subline, stage='basic'):
    """Bottom edge (v) of the frame header that covers the art for this sub-line."""
    _check_subline(subline)
    if stage not in STAGES:
        raise ValueError(f'stage must be one of {STAGES}, got {stage!r}')
    if subline in ('mega', 'tera'):
        return _HEADER_BOTTOM[subline]
    return _HEADER_BOTTOM[stage]


def hero_zone(subline, stage='basic'):
    """(left, top, right, bottom) of the area where art is visible and no text sits."""
    return (BORDER_X, header_bottom(subline, stage), 1 - BORDER_X, HERO_BOTTOM)


def hero_center(subline, stage='basic'):
    left, top, right, bottom = hero_zone(subline, stage)
    return ((left + right) / 2, (top + bottom) / 2)


def type_colors(type_name):
    if type_name not in TYPE_COLORS:
        raise ValueError(f'type must be one of {sorted(TYPE_COLORS)}, got {type_name!r}')
    return TYPE_COLORS[type_name]


def hex_to_srgb(hex_color):
    """'#RRGGBB' -> (r, g, b) floats in 0..1 (display-referred sRGB)."""
    value = hex_color.lstrip('#')
    if len(value) != 6:
        raise ValueError(f'expected #RRGGBB, got {hex_color!r}')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(channel):
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_color):
    """Shader colours in Blender are scene-linear; convert so the Standard view shows the hex."""
    return tuple(srgb_to_linear(c) for c in hex_to_srgb(hex_color))


def _check_subline(subline):
    if subline not in SUBLINES:
        raise ValueError(f'subline must be one of {SUBLINES}, got {subline!r}')
