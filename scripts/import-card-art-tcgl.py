"""Writes card fronts from a TCG Live extract into client/src/assets/card-art (the layout shared/tcgdex/card-art.mjs
serves): <series>/<tcgdex set>/<localId>/{high,low}.webp.

A TCG Live front is the 733x1024 card plus 145 px of print bleed left and right, so the card is the 733-wide crop
at x 145 (the same crop cardback's svrestyle.tcg uses). These are the pictures the TCG Live foil masks are drawn
on, so a foil laid over them lines up. Cards the extract lacks keep the pokemontcg.io file that
scripts/vendor-card-art-ptcgio.mjs wrote.

Usage: python scripts/import-card-art-tcgl.py <extract dir> [--force] [tcgdexSetId ...]
Needs Pillow. Existing files are kept unless --force.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "client/src/assets/card-art"
BLEED_X, CARD_W, CARD_H = 145, 733, 1024
SIZES = {"high": (600, 839), "low": (245, 343)}

# TCGdex set -> (series folder, TCG Live set, TCGdex local id -> TCG Live number, TCGdex local ids)
SETS = {
    "sm3.5": ("sm", "sm3-5", lambda n: n, [str(n) for n in range(1, 79)]),
    # Shiny Vault cards follow the 73 Shining Fates cards: TCG Live swsh4-5_74 is SV001 (Rowlet), _195 is SV122.
    "swsh4.5sv": ("swsh", "swsh4-5", lambda n: n + 73, [f"SV{n:03d}" for n in range(1, 123)]),
}


def number_of(local_id):
    return int("".join(c for c in local_id if c.isdigit()))


def import_set(extract, tcgdex_id, force):
    series, live_set, live_number, local_ids = SETS[tcgdex_id]
    written = skipped = missing = 0
    for local_id in local_ids:
        out = ROOT / series / tcgdex_id / local_id
        if (out / "high.webp").exists() and not force:
            skipped += 1
            continue
        source = Path(extract, "WebApp", "assets", "cards", f"{live_set}_{live_number(number_of(local_id))}.webp")
        if not source.exists():
            print(f"missing in extract: {source.name} ({tcgdex_id}-{local_id})")
            missing += 1
            continue
        card = Image.open(source).convert("RGB")
        if card.size != (1024, 1024):
            card = card.resize((1024, 1024), Image.LANCZOS)
        card = card.crop((BLEED_X, 0, BLEED_X + CARD_W, CARD_H))
        out.mkdir(parents=True, exist_ok=True)
        for name, size in SIZES.items():
            card.resize(size, Image.LANCZOS).save(out / f"{name}.webp", quality=82)
        written += 1
    print(f"{tcgdex_id}: {written} written, {skipped} kept, {missing} missing in the extract")


def main(argv):
    force = "--force" in argv
    args = [a for a in argv if a != "--force"]
    if not args:
        raise SystemExit(__doc__)
    extract, wanted = args[0], args[1:] or list(SETS)
    for set_id in wanted:
        if set_id not in SETS:
            raise SystemExit(f"unknown set {set_id}; known: {', '.join(SETS)}")
        import_set(extract, set_id, force)


main(sys.argv[1:])
