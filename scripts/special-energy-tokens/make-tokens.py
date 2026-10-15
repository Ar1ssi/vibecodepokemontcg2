"""Special Energy tokens cut from each card's own art: a circle around the card's energy orb,
plus a ring of the surrounding art (capped so it never reaches the title bar or text box).

  python3 make-tokens.py <cardImagesDir> orb-circles.json card-refs.json <outDir>

<cardImagesDir> holds TCGdex high.png renders (600x825) named <slug>.png; fetch-card-refs.py
downloads them. orb-circles.json gives each orb's centre/radius in those pixels (auto-detected,
hand-checked; an optional `box` overrides the art window for older frames).
Writes <outDir>/png/<slug>.png (168x168, transparent corners) and sheet.png."""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

CARDS, CIRCLES, REFS, OUT = sys.argv[1:5]
TOKEN = 168
RING = 1.3  # crop radius / orb radius
ART_BOX = (28, 100, 572, 545)  # x0, y0, x1, y1 shared by every frame layout at 600x825

circles = json.load(open(CIRCLES))
refs = json.load(open(REFS))


def crop_radius(c):
    x0, y0, x1, y1 = c.get('box', ART_BOX)
    room = min(c['cx'] - x0, x1 - c['cx'], c['cy'] - y0, y1 - c['cy'])
    return max(c['r'], min(c['r'] * RING, room))


def token(slug):
    c = circles[slug]
    card = Image.open(os.path.join(CARDS, slug + '.png')).convert('RGBA')
    rr = crop_radius(c)
    box = (round(c['cx'] - rr), round(c['cy'] - rr), round(c['cx'] + rr), round(c['cy'] + rr))
    big = card.crop(box).resize((TOKEN * 4, TOKEN * 4), Image.LANCZOS)
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, big.size[0] - 1, big.size[1] - 1], fill=255)
    big.putalpha(mask)
    return big.resize((TOKEN, TOKEN), Image.LANCZOS)


def font(size, bold=False):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


os.makedirs(os.path.join(OUT, 'png'), exist_ok=True)
names = list(refs)
tokens = {}
for name in names:
    slug = refs[name]['slug']
    tokens[name] = token(slug)
    tokens[name].save(os.path.join(OUT, 'png', slug + '.png'))

# Review sheet: token beside the card it was cut from.
cols, cw, ch = 7, 300, 236
thumb_w = 112
rows = (len(names) + cols - 1) // cols
head = 70
sheet = Image.new('RGB', (cols * cw + 20, head + rows * ch + 10), (22, 24, 29))
d = ImageDraw.Draw(sheet)
d.text((20, 16), f'Special Energy tokens - {len(names)}, cut from each card\'s energy orb', fill=(236, 235, 231), font=font(26, True))
d.text((20, 48), 'Token (left) next to the card art it was taken from (TCGdex id under the name).', fill=(150, 156, 166), font=font(14))
for i, name in enumerate(names):
    x = 10 + (i % cols) * cw
    y = head + (i // cols) * ch
    d.rounded_rectangle([x, y, x + cw - 10, y + ch - 10], 12, fill=(30, 33, 40), outline=(44, 48, 57))
    tk = tokens[name].resize((150, 150), Image.LANCZOS)
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
        d.text((x + 12, y + 172 + j * 17), ln, fill=(236, 235, 231), font=font(14, True))
    d.text((x + 12, y + 172 + len(lines[:2]) * 17 + 2), refs[name]['id'], fill=(110, 116, 126), font=font(11))
sheet.save(os.path.join(OUT, 'sheet.png'))
print('wrote', len(names), 'tokens')
