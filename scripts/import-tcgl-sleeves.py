#!/usr/bin/env python3
"""Imports TCG Live's card sleeves from the extract into the repo.

  E:/TCGLive_Extract/tools/venv/Scripts/python.exe -I scripts/import-tcgl-sleeves.py --src E:/TCGLive_Extract

Needs Pillow (the extract's tools/venv has it). Reads <src>/WebApp/assets/ui/cs_*/ (one 512x512 sleeve
texture each) and <src>/WebApp/web/data/ui/loc_en.json (names). Writes client/src/assets/sleeves/tcgl/
{full,thumb}/<id>.webp and the catalog client/src/setup/deck-builder/core/tcgl-sleeves.generated.mjs.

The game's card mesh samples only u 0.14211-0.85789 of a sleeve texture (assets/deckbox/card.mesh.json), so
the padding on both sides is cut: full images are the 366x512 face, which the customize stage and every card
back then use full-bleed.
"""
import argparse
import json
import os
import re
import shutil
import sys

from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSET_DIR = os.path.join(REPO, 'client', 'src', 'assets', 'sleeves', 'tcgl')
CATALOG = os.path.join(REPO, 'client', 'src', 'setup', 'deck-builder', 'core', 'tcgl-sleeves.generated.mjs')
URL_ROOT = '/src/assets/sleeves/tcgl'

FACE_BOX = (73, 0, 439, 512)
THUMB_HEIGHT = 256
FULL_QUALITY = 90
THUMB_QUALITY = 85

# First match wins; the table order is also the picker's group order.
CATEGORIES = [
    (r'^cs_tcgl-default_|_tcgl-default$', 'Default'),
    (r'_pc_etb$', 'Pokémon Center Elite Trainer Box'),
    (r'_etb$', 'Elite Trainer Box'),
    (r'_bnb$', 'Build & Battle Box'),
    (r'_deck$', 'Battle Deck'),
    (r'_prc$', 'Premium Collection'),
    (r'_spc$', 'Super-Premium Collection'),
    (r'_(upc|upr)$', 'Ultra-Premium Collection'),
    (r'_ptc$', "Premium Trainer's Box"),
    (r'_box$', 'Collection Box'),
    (r'_myth$', 'Mythical Collection'),
    (r'_rbc$', 'Generations'),
    (r'_(pc|pcen)$', 'Pokémon Center'),
    (r'^cs_tcgl-event_|_tcgl-event$', 'Event Reward'),
    (r'_tcgl-ranked$', 'Ladder Reward'),
    (r'_tcgl-bp$', 'Battle Pass'),
    (r'_tcgl-rm$', 'Mission Reward'),
    (r'^cs_tcgl-sc_|_tcgl-sc$', 'Pokémon TCG Live'),
    (r'^cs_trainerstoolkit', "Trainer's Toolkit"),
    (r'^cs_op_', 'Play! Pokémon'),
]
FALLBACK_CATEGORY = 'Promo'


def category_of(sleeve_id):
    for pattern, category in CATEGORIES:
        if re.search(pattern, sleeve_id):
            return category
    return FALLBACK_CATEGORY


def clean_name(text):
    """loc text is TextMeshPro rich text; the extract also lost some dashes to U+FFFD."""
    text = re.sub(r'<[^>]*>', '', text)
    text = text.replace('\ufeff', '').replace('\ufffd', '—').replace('&amp;', '&')
    return re.sub(r'\s+', ' ', text).strip()


def texture_in(directory):
    webps = [name for name in os.listdir(directory) if name.lower().endswith('.webp')]
    if len(webps) != 1:
        raise SystemExit(f'{directory}: expected one .webp, found {len(webps)}')
    return os.path.join(directory, webps[0])


def write_images(texture, full_path, thumb_path):
    source = Image.open(texture)
    if source.size != (512, 512):
        raise SystemExit(f'{texture}: expected 512x512, got {source.size[0]}x{source.size[1]}')
    mode = 'RGBA' if 'A' in source.getbands() else 'RGB'
    face = source.convert(mode).crop(FACE_BOX)
    face.save(full_path, 'WEBP', quality=FULL_QUALITY, method=6)
    width = round(face.width * THUMB_HEIGHT / face.height)
    face.resize((width, THUMB_HEIGHT), Image.LANCZOS).save(thumb_path, 'WEBP', quality=THUMB_QUALITY, method=6)


def build(src, staging):
    ui_dir = os.path.join(src, 'WebApp', 'assets', 'ui')
    with open(os.path.join(src, 'WebApp', 'web', 'data', 'ui', 'loc_en.json'), encoding='utf-8') as handle:
        names = json.load(handle)
    ids = sorted(
        name.lower() for name in os.listdir(ui_dir) if name.lower().startswith('cs_') and not name.endswith('-t')
    )
    if not ids:
        raise SystemExit(f'no cs_* sleeves under {ui_dir}')

    os.makedirs(os.path.join(staging, 'full'))
    os.makedirs(os.path.join(staging, 'thumb'))
    sleeves = []
    for sleeve_id in ids:
        name = clean_name(names.get(sleeve_id, ''))
        if not name:
            raise SystemExit(f'{sleeve_id}: no name in loc_en.json')
        directory = next(entry for entry in os.listdir(ui_dir) if entry.lower() == sleeve_id)
        write_images(
            texture_in(os.path.join(ui_dir, directory)),
            os.path.join(staging, 'full', f'{sleeve_id}.webp'),
            os.path.join(staging, 'thumb', f'{sleeve_id}.webp'),
        )
        sleeves.append(
            {
                'id': sleeve_id,
                'name': name,
                'image': f'{URL_ROOT}/full/{sleeve_id}.webp',
                'thumb': f'{URL_ROOT}/thumb/{sleeve_id}.webp',
                'category': category_of(sleeve_id),
            }
        )
    order = [category for _, category in CATEGORIES] + [FALLBACK_CATEGORY]
    rank = {category: index for index, category in enumerate(dict.fromkeys(order))}
    sleeves.sort(key=lambda sleeve: (rank[sleeve['category']], sleeve['name'].lower(), sleeve['id']))
    return sleeves


def write_catalog(sleeves):
    body = json.dumps(sleeves, ensure_ascii=False, indent=2)
    with open(CATALOG, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('// Generated by scripts/import-tcgl-sleeves.py from the TCG Live extract. Do not edit.\n')
        handle.write(f'export const TCGL_SLEEVES = {body};\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--src', required=True, help='the TCGLive_Extract directory')
    args = parser.parse_args()

    staging = f'{ASSET_DIR}.tmp-{os.getpid()}'
    shutil.rmtree(staging, ignore_errors=True)
    try:
        sleeves = build(os.path.abspath(args.src), staging)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    shutil.rmtree(ASSET_DIR, ignore_errors=True)
    os.replace(staging, ASSET_DIR)
    write_catalog(sleeves)

    counts = {}
    for sleeve in sleeves:
        counts[sleeve['category']] = counts.get(sleeve['category'], 0) + 1
    print(f'sleeves: {len(sleeves)} written to {os.path.relpath(ASSET_DIR, REPO)}')
    for category, count in counts.items():
        print(f'  {count:4d}  {category}')


if __name__ == '__main__':
    sys.exit(main())
