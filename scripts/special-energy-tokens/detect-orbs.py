"""Find the dominant energy orb in each card's art (gradient-directed Hough vote); a first pass
for orb-circles.json, which is then hand-checked. Writes {slug: {cx, cy, r, w, h}} in card pixels."""
import json, os, sys
import numpy as np
from PIL import Image

CARDS, OUT = sys.argv[1], sys.argv[2]
SCALE_W = 300


def sobel(a):
    p = np.pad(a, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    return gx, gy


def detect(path):
    im = Image.open(path).convert('L')
    W0, H0 = im.size
    k = SCALE_W / W0
    small = im.resize((SCALE_W, round(H0 * k)), Image.LANCZOS)
    a = np.asarray(small).astype(float)
    h, w = a.shape
    gx, gy = sobel(a)
    mag = np.hypot(gx, gy)
    ys, xs = np.nonzero(mag > np.percentile(mag, 88))
    keep = (ys > h * 0.06) & (ys < h * 0.62)
    ys, xs = ys[keep], xs[keep]
    m = mag[ys, xs]
    ux, uy = gx[ys, xs] / m, gy[ys, xs] / m
    radii = np.arange(28, 125)
    acc = np.zeros((len(radii), h, w))
    for ri, r in enumerate(radii):
        for sgn in (1, -1):
            cx = np.round(xs + sgn * ux * r).astype(int)
            cy = np.round(ys + sgn * uy * r).astype(int)
            ok = (cx >= 0) & (cx < w) & (cy >= 0) & (cy < h)
            np.add.at(acc[ri], (cy[ok], cx[ok]), 1)
    # smooth 3x3 spatially, normalise by circumference^0.8 so big circles aren't favoured
    acc = (acc + np.roll(acc, 1, 1) + np.roll(acc, -1, 1) + np.roll(acc, 1, 2) + np.roll(acc, -1, 2)) / 5
    acc /= (radii[:, None, None] ** 0.8)
    # centre must sit inside the art window
    acc[:, : int(h * 0.1), :] = 0
    acc[:, int(h * 0.55):, :] = 0
    acc[:, :, : int(w * 0.12)] = 0
    acc[:, :, int(w * 0.88):] = 0
    ri, cy, cx = np.unravel_index(np.argmax(acc), acc.shape)
    return {'cx': round(cx / k), 'cy': round(cy / k), 'r': round(radii[ri] / k), 'w': W0, 'h': H0}


out = {}
for f in sorted(os.listdir(CARDS)):
    if not f.endswith('.png'):
        continue
    out[f[:-4]] = detect(os.path.join(CARDS, f))
    print(f[:-4], out[f[:-4]], flush=True)
json.dump(out, open(OUT, 'w'), indent=1)
