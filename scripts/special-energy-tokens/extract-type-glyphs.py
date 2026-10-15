"""Cut the black type glyph out of each basic token: pixels much darker than the disc body
near them become an opaque black mask (alpha = darkness), everything else transparent."""
import sys, os
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    im = np.asarray(Image.open(os.path.join(SRC, f)).convert('RGBA')).astype(float)
    h, w = im.shape[:2]
    lum = 0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - w / 2, yy - h / 2) / (w / 2)
    inner = r < 0.78
    # body reference: median luminance on a ring just inside the rim
    ring = (r > 0.80) & (r < 0.86) & (im[..., 3] > 200)
    body = np.median(lum[ring])
    glyph_level = np.percentile(lum[inner], 3)
    lo, hi = glyph_level + 6, glyph_level + 0.45 * (body - glyph_level)
    a = np.clip((hi - lum) / (hi - lo), 0, 1) * inner
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(OUT, f))
    print(f, round(body), round(glyph_level))
