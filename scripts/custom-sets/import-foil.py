#!/usr/bin/env python3
"""Imports cardback's foil exports into a custom set (I271): <set>/foil.json plus <set>/foil/<local>-<kind>.webp.

    python scripts/custom-sets/import-foil.py --set client/src/assets/custom-sets/customhb \
        --src ~/Downloads/all-projects.zip --src ~/Downloads/me02-002-modern-holofoil.zip

Each --src is a zip or a folder holding cardback's `<id>-modern-foil.json` + `<id>-modern-front.png` + mask PNGs
(read in place, never extracted). A later --src replaces an earlier one's card, so a fresh single-card zip wins
over an old all-projects zip. A card is matched to its set.json entry through `custom.source`; only entries with
`custom.foil` are imported. A card with a base printing wears it, else its reverse-holo printing.

Needs Pillow (WebP). Prints one line per problem; exit 1 if a foil-flagged card ended up without foil data.
"""
import argparse
import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

KINDS = ("front", "etch", "wp", "cf")
FRONT_QUALITY = 80  # lossy is invisible at 1024 px
MASK_QUALITY = 92  # white-plate masks: soft shader inputs, a third of the lossless size


def read_source(path):
    """-> {basename: bytes-reader} for a zip or a folder (flat)."""
    path = Path(path)
    if path.is_dir():
        return {p.name: p.read_bytes for p in path.iterdir() if p.is_file()}
    archive = zipfile.ZipFile(path)
    return {Path(n).name: (lambda n=n: archive.read(n)) for n in archive.namelist() if not n.endswith("/")}


def printing(foil):
    """The printing a set card wears: base when TCG Live foils it, else the reverse holo."""
    for key in ("base", "reverse"):
        if isinstance(foil.get(key), dict):
            return foil[key]
    return None


def webp_bytes(png, kind):
    image = Image.open(io.BytesIO(png))
    image.load()
    out = io.BytesIO()
    if kind == "front":
        image.convert("RGB").save(out, "WEBP", quality=FRONT_QUALITY, method=6)
    else:
        image.save(out, "WEBP", quality=MASK_QUALITY, method=6)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--set", required=True, help="custom set folder (holds set.json)")
    parser.add_argument("--src", required=True, action="append", help="zip or folder of cardback foil exports")
    args = parser.parse_args()

    set_dir = Path(args.set)
    cards = json.loads((set_dir / "set.json").read_text(encoding="utf-8"))["cards"]
    wanted = {c["custom"]["source"]: c["localId"] for c in cards if (c.get("custom") or {}).get("foil")}

    files = {}
    for src in args.src:
        files.update(read_source(src))

    foil_dir = set_dir / "foil"
    foil_dir.mkdir(exist_ok=True)
    foil_file = set_dir / "foil.json"
    existing = json.loads(foil_file.read_text(encoding="utf-8")).get("cards", {}) if foil_file.exists() else {}
    rows = dict(existing)
    problems = []

    for name in sorted(n for n in files if n.endswith("-foil.json")):
        data = json.loads(files[name]())
        local = wanted.get(data.get("id"))
        if local is None:
            continue
        chosen = printing(data)
        if chosen is None:
            problems.append(f"{data['id']}: foil.json has neither base nor reverse")
            continue
        row = {"tcgl": data.get("tcglive") or "", "shader": chosen["shader"], "material": chosen["material"]}
        sources = {"front": data.get("front"), **{k: chosen.get(k) for k in KINDS if k != "front"}}
        for kind in KINDS:
            png_name = sources.get(kind)
            if not png_name:
                continue
            if png_name not in files:
                problems.append(f"{data['id']}: {png_name} missing from the sources")
                break
            out_name = f"{local}-{kind}.webp"
            (foil_dir / out_name).write_bytes(webp_bytes(files[png_name](), kind))
            row[kind] = out_name
        else:
            if chosen.get("cc"):
                row["cc"] = chosen["cc"]
            rows[local] = row
            continue
        rows.pop(local, None)

    for source, local in sorted(wanted.items(), key=lambda kv: kv[1]):
        if local not in rows:
            problems.append(f"{source} ({local}): foil-flagged but no foil data")

    # drop textures no row references any more (a card that changed printing, or was removed)
    kept = {v for row in rows.values() for k, v in row.items() if k in KINDS}
    for stale in foil_dir.glob("*.webp"):
        if stale.name not in kept:
            stale.unlink()

    ordered = {local: rows[local] for local in sorted(rows)}
    foil_file.write_text(json.dumps({"v": 1, "cards": ordered}, indent=1) + "\n", encoding="utf-8")
    print(f"{len(ordered)} foil cards -> {foil_file}")
    for problem in problems:
        print(f"ERR {problem}", file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
