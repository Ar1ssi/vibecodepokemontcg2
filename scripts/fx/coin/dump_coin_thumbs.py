"""Dump TCG Live's coin thumbnails and English names (design 069) for the deck-builder picker.

Usage (Pillow lives in the extract's venv; -I keeps the extract folder off sys.path, -B stops
bytecode landing in scripts/fx/coin/):
  E:/TCGLive_Extract/tools/venv/Scripts/python.exe -I -B scripts/fx/coin/dump_coin_thumbs.py \
      "E:/TCGLive_Extract" "E:/TCGLive_Extract/vfx_dump/coin_raw"

<extract dir> holds cosmetics/png/coins/<coin id>-t/*.png (the game's own coin thumbnail, one per
coin) and WebApp/web/data/ui/loc_en.json (display names keyed by coin id). Writes
<out dir>/thumbs/<coin id>.webp and <out dir>/coin-names.json. Like dump_coin_vfx.py, this file only
extracts; scripts/fx/coin/import-tcgl-coins.mjs makes every choice.
"""
import glob
import json
import os
import sys

from PIL import Image

COIN_PREFIX = "cn_"
THUMBNAIL_SUFFIX = "-t"
WEBP_QUALITY = 90


def thumbnail_path(coins_dir, coin_id):
    """The one PNG in <coin id>-t/, or None when the game shipped no thumbnail."""
    found = glob.glob(os.path.join(coins_dir, coin_id + THUMBNAIL_SUFFIX, "*.png"))
    if len(found) > 1:
        raise RuntimeError("%s: %d thumbnails" % (coin_id, len(found)))
    return found[0] if found else None


def coin_ids(coins_dir):
    ids = []
    for path in glob.glob(os.path.join(coins_dir, COIN_PREFIX + "*")):
        name = os.path.basename(path)
        if os.path.isdir(path) and not name.endswith(THUMBNAIL_SUFFIX):
            ids.append(name)
    return sorted(ids)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    extract, out_dir = sys.argv[1], sys.argv[2]
    coins_dir = os.path.join(extract, "cosmetics", "png", "coins")
    thumb_dir = os.path.join(out_dir, "thumbs")
    os.makedirs(thumb_dir, exist_ok=True)

    with open(os.path.join(extract, "WebApp", "web", "data", "ui", "loc_en.json"), encoding="utf-8") as handle:
        strings = json.load(handle)

    names = {}
    missing_thumbs = []
    for coin_id in coin_ids(coins_dir):
        if isinstance(strings.get(coin_id), str):
            names[coin_id] = strings[coin_id]
        source = thumbnail_path(coins_dir, coin_id)
        if source is None:
            missing_thumbs.append(coin_id)
            continue
        with Image.open(source) as image:
            image.convert("RGBA").save(
                os.path.join(thumb_dir, coin_id + ".webp"), "WEBP", quality=WEBP_QUALITY, method=6
            )

    with open(os.path.join(out_dir, "coin-names.json"), "w", encoding="utf-8") as handle:
        json.dump(names, handle, ensure_ascii=False, indent=0, sort_keys=True)
    print("%d names, %d thumbnails (%d coins without one) -> %s" % (
        len(names), len(glob.glob(os.path.join(thumb_dir, "*.webp"))), len(missing_thumbs), out_dir))


if __name__ == "__main__":
    main()
