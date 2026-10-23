"""Score a rendered full-card image against the spec's tone targets (spec sections 4 and 8).

Run with system Python (needs numpy and Pillow; Blender's Python has no Pillow):
    python3 tools/blender-card-art/qa_check.py render.png --subline mega [--json]
Exit code 0 = every metric inside its 10th-90th percentile range, 1 = something outside, 2 = bad input.
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardart.spec import QA_CROP, SUBLINES, TONE_RANGES  # noqa: E402


def tone_metrics(image):
    """The spec's metric definitions, unchanged, on a PIL image of the whole card face."""
    im = image.convert('RGB').resize((245, 337))  # same scale as the measured cards
    w, h = im.size
    box = (int(QA_CROP[0] * w), int(QA_CROP[1] * h), int(QA_CROP[2] * w), int(QA_CROP[3] * h))
    a = np.asarray(im.crop(box), dtype=np.float32)
    hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert('HSV'), dtype=np.float32) / 255
    lum = a @ np.array([.2126, .7152, .0722])
    rg = a[..., 0] - a[..., 1]
    yb = .5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    gy, gx = np.gradient(lum)
    sat = (hsv[..., 1] > .35) & (hsv[..., 2] > .35)
    p = np.histogram((hsv[..., 0][sat] * 360 + 15) % 360, bins=12, range=(0, 360))[0].astype(float)
    p = p[p > 0] / max(p.sum(), 1)
    return {
        'sat': float(hsv[..., 1].mean()), 'val': float(hsv[..., 2].mean()),
        'contrast': float(lum.std()),
        'colorful': float(np.hypot(rg.std(), yb.std()) + .3 * np.hypot(rg.mean(), yb.mean())),
        'edge': float((np.hypot(gx, gy) > 20).mean()), 'hi': float((lum > 235).mean()),
        'lo': float((lum < 25).mean()), 'hue_entropy': float(-(p * np.log2(p)).sum()),
    }


def evaluate(metrics, subline):
    """Compare metrics to the sub-line's ranges; returns rows of (metric, value, low, median, high, ok)."""
    ranges = TONE_RANGES[subline]
    rows = []
    for name, (low, median, high) in ranges.items():
        value = metrics[name]
        rows.append((name, value, low, median, high, low <= value <= high))
    return rows


def aspect_ok(image, tolerance=0.01):
    w, h = image.size
    return abs(w / h - 63 / 88) <= tolerance


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('image')
    parser.add_argument('--subline', choices=SUBLINES, required=True)
    parser.add_argument('--json', action='store_true', help='print machine-readable results')
    args = parser.parse_args(argv)
    try:
        image = Image.open(args.image)
        image.load()
    except (OSError, ValueError) as err:
        print(f'cannot read {args.image}: {err}', file=sys.stderr)
        return 2
    rows = evaluate(tone_metrics(image), args.subline)
    ratio_ok = aspect_ok(image)
    passed = ratio_ok and all(ok for *_, ok in rows)
    if args.json:
        print(json.dumps({'passed': passed, 'aspect_ok': ratio_ok, 'subline': args.subline,
                          'metrics': {r[0]: {'value': r[1], 'range': [r[2], r[4]], 'median': r[3], 'ok': r[5]}
                                      for r in rows}}, indent=2))
    else:
        print(f'{"aspect 63:88":13s} {"ok" if ratio_ok else "FAIL"} ({image.size[0]}x{image.size[1]})')
        for name, value, low, median, high, ok in rows:
            print(f'{name:13s} {"ok  " if ok else "FAIL"} {value:8.3f}   range {low:g}..{high:g} (median {median:g})')
        print('PASS' if passed else 'FAIL')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
