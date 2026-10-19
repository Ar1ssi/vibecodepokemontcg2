"""Special Energy tokens cut from each card's own art: a circle around the card's energy orb,
plus a ring of the surrounding art (capped so it never reaches the title bar or text box).
Cards that provide 2 Energy show two overlapping orbs. Foil printings get the card's finish as
an animated SVG overlay (holo: the whole coin; reverse holo: the art ring around the orb).

  python3 make-tokens.py <cardImagesDir> <outDir> [--write-client]

<cardImagesDir> holds TCGdex high.png renders (600x825) named <slug>.png; fetch-card-refs.py
downloads them. orb-circles.json gives each orb's centre/radius in those pixels (auto-detected by
detect-orbs.py, hand-checked; `orb2` is the second orb of a 2-Energy card, `box` overrides the
art window for older frames). card-refs.json gives each card's printing, finish and `double`.
Writes <outDir>/sheet.png; --write-client also writes client/src/assets/energy/special/ and the
generated client/src/actions/move-card-bundle/special-energy-tokens.mjs."""
import base64
import io
import json
import os
import shutil
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CARDS, OUT = sys.argv[1:3]
WRITE_CLIENT = '--write-client' in sys.argv
ASSET_DIR = os.path.join(ROOT, 'client/src/assets/energy/special')
ASSET_URL = '/src/assets/energy/special'
MODULE = os.path.join(ROOT, 'client/src/actions/move-card-bundle/special-energy-tokens.mjs')

TOKEN = 168
SS = 4  # supersampling for the circle edges
RING = 1.3  # single token: crop radius / orb radius
DOUBLE_RING = 1.12
DOUBLE_COIN = 0.64  # each coin's diameter / token size
ART_BOX = (28, 108, 572, 545)  # x0, y0, x1, y1 shared by every frame layout at 600x825

circles = json.load(open(os.path.join(HERE, 'orb-circles.json')))
refs = json.load(open(os.path.join(HERE, 'card-refs.json')))


def crop_radius(orb, ring, box):
    x0, y0, x1, y1 = box
    room = min(orb['cx'] - x0, x1 - orb['cx'], orb['cy'] - y0, y1 - orb['cy'])
    return max(orb['r'], min(orb['r'] * ring, room))


def disc(size):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def coin(card, orb, ring, box, size):
    """Circular crop of one orb at `size` px (supersampled), plus the orb's share of it."""
    rr = crop_radius(orb, ring, box)
    area = (round(orb['cx'] - rr), round(orb['cy'] - rr), round(orb['cx'] + rr), round(orb['cy'] + rr))
    img = card.crop(area).resize((size, size), Image.LANCZOS)
    img.putalpha(disc(size))
    return img, orb['r'] / rr


def single_token(card, c):
    big, orb_share = coin(card, c, RING, c.get('box', ART_BOX), TOKEN * SS)
    foil = Image.new('L', big.size, 0)
    inner = round(big.size[0] * (1 - orb_share) / 2)
    ImageDraw.Draw(foil).ellipse([0, 0, big.size[0] - 1, big.size[1] - 1], fill=255)
    ImageDraw.Draw(foil).ellipse([inner, inner, big.size[0] - 1 - inner, big.size[1] - 1 - inner], fill=0)
    reverse_mask = foil.filter(ImageFilter.GaussianBlur(SS * 2))
    return big, reverse_mask


def double_token(card, c):
    """Two coins overlapping on the diagonal, the second in front (Neo Upper / Double Dragon art)."""
    size = TOKEN * SS
    d = round(size * DOUBLE_COIN)
    box = c.get('box', ART_BOX)
    second = c.get('orb2', c)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    reverse_mask = Image.new('L', (size, size), 0)
    for orb, at in ((c, 0), (second, size - d)):
        img, orb_share = coin(card, orb, DOUBLE_RING, box, d)
        shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 140), (at + d // 24, at + d // 16), disc(d))
        canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(SS * 3)))
        canvas.alpha_composite(img, (at, at))
        ring = Image.new('L', (d, d), 0)
        inner = round(d * (1 - orb_share) / 2)
        ImageDraw.Draw(ring).ellipse([0, 0, d - 1, d - 1], fill=255)
        ImageDraw.Draw(ring).ellipse([inner, inner, d - 1 - inner, d - 1 - inner], fill=0)
        reverse_mask.paste(0, (at, at), disc(d))
        reverse_mask.paste(255, (at, at), ring)
    return canvas, reverse_mask.filter(ImageFilter.GaussianBlur(SS * 2))


def data_uri(img, fmt, **opts):
    buf = io.BytesIO()
    img.save(buf, fmt, **opts)
    mime = {'WEBP': 'image/webp', 'PNG': 'image/png'}[fmt]
    return f'data:{mime};base64,' + base64.b64encode(buf.getvalue()).decode()


FOIL_STOPS = ['#ff5f6d', '#ffc371', '#fff07a', '#7dffb0', '#6ad8ff', '#8f7bff', '#ff7ae0', '#ff5f6d']


def foil_svg(base, mask, finish):
    """Animated foil over the token art: a drifting rainbow band (overlay) and a white
    sheen sweep (screen), both clipped to `mask` — the whole coin for holo, the art ring
    around the orb for reverse holo (where the card's foil sits). Glitter only on reverse holo."""
    stops = ''.join(
        f'<stop offset="{i / (len(FOIL_STOPS) - 1):.3f}" stop-color="{c}"/>' for i, c in enumerate(FOIL_STOPS)
    )
    rainbow_opacity = 0.6 if finish == 'reverse' else 0.5
    glitter = ''
    if finish == 'reverse':
        glitter = (
            '<rect width="168" height="168" fill="url(#glit)" mask="url(#m)" opacity="0.9" style="mix-blend-mode:screen">'
            '<animate attributeName="opacity" values="0.35;0.95;0.35" dur="2.6s" repeatCount="indefinite"/></rect>'
        )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{TOKEN}" height="{TOKEN}" viewBox="0 0 {TOKEN} {TOKEN}">
<defs>
<linearGradient id="rb" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="96" y2="64" spreadMethod="repeat">{stops}
<animateTransform attributeName="gradientTransform" type="translate" values="0 0;96 64" dur="6s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="sh" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="168" y2="168">
<stop offset="0.38" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/>
<animateTransform attributeName="gradientTransform" type="translate" values="-170 -170;170 170;170 170" keyTimes="0;0.55;1" dur="4.5s" repeatCount="indefinite"/></linearGradient>
<pattern id="glit" width="23" height="19" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="0.9" fill="#fff"/><circle cx="15" cy="12" r="0.7" fill="#fff"/><circle cx="19" cy="3" r="0.5" fill="#fff"/><circle cx="9" cy="16" r="0.6" fill="#fff"/></pattern>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="{TOKEN}" height="{TOKEN}"><image href="{data_uri(mask, 'PNG', optimize=True)}" width="{TOKEN}" height="{TOKEN}"/></mask>
</defs>
<image href="{data_uri(base, 'WEBP', quality=90, method=6)}" width="{TOKEN}" height="{TOKEN}"/>
<rect width="{TOKEN}" height="{TOKEN}" fill="url(#rb)" mask="url(#m)" opacity="{rainbow_opacity}" style="mix-blend-mode:overlay"/>
<rect width="{TOKEN}" height="{TOKEN}" fill="url(#sh)" mask="url(#m)" opacity="0.45" style="mix-blend-mode:screen"/>
{glitter}
</svg>
'''


def build(name):
    ref = refs[name]
    c = circles[ref['slug']]
    card = Image.open(os.path.join(CARDS, ref['slug'] + '.png')).convert('RGBA')
    big, reverse_mask = (double_token if ref.get('double') else single_token)(card, c)
    base = big.resize((TOKEN, TOKEN), Image.LANCZOS)
    finish = ref.get('finish', 'none')
    if finish == 'none':
        return base, None
    mask = big.getchannel('A') if finish == 'holo' else reverse_mask
    mask = ImageChops.multiply(mask.resize((TOKEN, TOKEN), Image.LANCZOS), bright_areas(base))
    return base, foil_svg(base, mask, finish)


def bright_areas(img):
    """Foil lives on bright areas only, so dark ink stays dark (the board's card foil uses the
    card image as the same kind of luminance mask)."""
    return img.convert('L').point(lambda v: max(0, min(255, (v - 70) * 255 // 110)))


def font(size, bold=False):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()


os.makedirs(OUT, exist_ok=True)
names = list(refs)
built = {name: build(name) for name in names}

if WRITE_CLIENT:
    shutil.rmtree(ASSET_DIR, ignore_errors=True)
    os.makedirs(ASSET_DIR)
    entries = []
    for name in names:
        ref = refs[name]
        base, svg = built[name]
        if svg:
            file = ref['slug'] + '.svg'
            with open(os.path.join(ASSET_DIR, file), 'w') as f:
                f.write(svg)
        else:
            file = ref['slug'] + '.webp'
            base.save(os.path.join(ASSET_DIR, file), 'WEBP', quality=90, method=6)
        entries.append(
            f"  {{ name: {json.dumps(name, ensure_ascii=False)}, src: '{ASSET_URL}/{file}', "
            f"double: {'true' if ref.get('double') else 'false'}, finish: '{ref.get('finish', 'none')}' }},"
        )
    with open(MODULE, 'w') as f:
        f.write(
            '// Generated by scripts/special-energy-tokens/make-tokens.py — do not edit by hand.\n'
            '// One token per Special Energy name in out/pkmn-special-energy-cards.json, cut from the\n'
            "// card's own art (TCGdex printing in card-refs.json). `double`: drawn as two orbs.\n"
            '// `finish`: the printing\'s foil (holo / reverse) baked into the SVG as an animation.\n'
            'export const SPECIAL_ENERGY_TOKENS = [\n' + '\n'.join(entries) + '\n];\n'
        )

# Review sheet: token beside the card it was cut from.
cols, cw, ch = 7, 300, 236
thumb_w = 112
rows = (len(names) + cols - 1) // cols
head = 70
sheet = Image.new('RGB', (cols * cw + 20, head + rows * ch + 10), (22, 24, 29))
d = ImageDraw.Draw(sheet)
d.text((20, 16), f"Special Energy tokens - {len(names)}, cut from each card's energy orb", fill=(236, 235, 231), font=font(26, True))
d.text((20, 48), 'Token (left) next to its card. Tag = finish baked in (animated on the board); 2x = two-orb token.', fill=(150, 156, 166), font=font(14))
TAG = {'holo': ((255, 214, 102), 'HOLO'), 'reverse': ((120, 200, 255), 'REVERSE HOLO'), 'none': ((120, 126, 136), 'PLAIN')}
for i, name in enumerate(names):
    x = 10 + (i % cols) * cw
    y = head + (i // cols) * ch
    d.rounded_rectangle([x, y, x + cw - 10, y + ch - 10], 12, fill=(30, 33, 40), outline=(44, 48, 57))
    tk = built[name][0].resize((150, 150), Image.LANCZOS)
    sheet.paste(tk, (x + 12, y + 14), tk)
    card = Image.open(os.path.join(CARDS, refs[name]['slug'] + '.png')).convert('RGB')
    card = card.resize((thumb_w, round(card.height * thumb_w / card.width)), Image.LANCZOS)
    sheet.paste(card, (x + cw - 10 - thumb_w - 12, y + 12))
    label = name.replace('{', '').replace('}', '')
    words, line, lines = label.split(), '', []
    for w in words:
        if len(line + ' ' + w) > 30:
            lines.append(line)
            line = w
        else:
            line = (line + ' ' + w).strip()
    lines.append(line)
    for j, ln in enumerate(lines[:2]):
        d.text((x + 12, y + 168 + j * 17), ln, fill=(236, 235, 231), font=font(14, True))
    color, tag = TAG[refs[name].get('finish', 'none')]
    if refs[name].get('double'):
        tag += '  ·  2x'
    ty = y + 168 + len(lines[:2]) * 17 + 3
    d.text((x + 12, ty), tag, fill=color, font=font(11, True))
    d.text((x + cw - 10 - thumb_w - 12, ty), refs[name]['id'], fill=(110, 116, 126), font=font(11))
sheet.save(os.path.join(OUT, 'sheet.png'))
print('built', len(names), 'tokens', '(client assets written)' if WRITE_CLIENT else '')
