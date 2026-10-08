// Design 065 § New pieces G: the stellar material, Tera Starstorm (EV: cyan crystal with a
// prismatic fringe). The round unit is the `'facet'` unit (a hexagon-faceted sphere); a tongue
// is the ice recipe's crystal tongue plus a fringe stroke (0.16 w, ≥ 1.5 px) just outside it in one of five
// accent hues (picked by the tongue's seed); a projectile is a faceted head in a cyan mist
// trailing fringed crystals. No grain. The accents live in the palette (`accent0`…`accent4`)
// so a tint can replace them like any other key.
import { rgbCss } from '../../fx-colors.mjs';
import { parseHex, traceOutline } from './_shared.js';
import { ice, icicleOutline } from './ice.js';
import { UNITS } from './_units.js';

const TAU = Math.PI * 2;
const hex = (h) => Object.freeze(parseHex(h));
export const STELLAR_ACCENTS = Object.freeze(['#FF6FB5', '#FFE07A', '#7CFFB2', '#7FD8FF', '#C59BFF']);
const ACCENT_KEYS = Object.freeze(STELLAR_ACCENTS.map((_, k) => `accent${k}`));

const STELLAR_PALETTE = Object.freeze({
  deep: hex('#0F2A55'),
  body: hex('#2FB8FF'),
  hot: hex('#5FF2E0'),
  core: hex('#E6FFFF'),
  // The crystal tongue's edge colour (ice's `white` key): the core, so nothing outside the
  // palette is drawn.
  white: hex('#E6FFFF'),
  ...Object.fromEntries(STELLAR_ACCENTS.map((h, k) => [ACCENT_KEYS[k], hex(h)])),
});

/** The accent key a tongue of `seed` fringes in. */
export const accentKeyFor = (seed) => ACCENT_KEYS[((Math.floor(Math.abs(seed)) % 5) + 5) % 5];

/** The stellar material drawn in `palette` (any palette with the same keys). */
function stellarKit(palette) {
  const crystalTongue = ice.withPalette(palette).tongue;

  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.core, alpha * 0.5));
    g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.3));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.save();
    ctx.globalAlpha *= alpha * (0.7 + 0.3 * Math.max(0, Math.min(1, hot)));
    UNITS.facet(ctx, x, y, r, -90, 0, palette);
    ctx.restore();
  }

  function tongue(ctx, spec, opts = {}) {
    const alpha = opts.alpha ?? 1;
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    crystalTongue(ctx, spec, opts);
    // A 1 px fringe vanished at board scale (slice 15 review): it scales with the tongue.
    ctx.strokeStyle = rgbCss(palette[accentKeyFor(spec.seed ?? 0)], alpha);
    ctx.lineWidth = Math.max(1.5, spec.width * 0.16);
    traceOutline(ctx, icicleOutline({ ...spec, width: spec.width * 1.12 }));
    ctx.stroke();
  }

  function projectile(ctx, { x, y, r, headingDeg, seed = 0, alpha = 1, tongues = 4, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.45 * alpha);
    const a = (headingDeg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    for (let k = tongues; k >= 1; k -= 1) {
      const back = r * (1 + 0.7 * k);
      const side = r * 0.5 * (k % 2 ? 1 : -1);
      const length = r * 1.3 * (1 - 0.1 * k);
      tongue(
        ctx,
        { x: x - ux * back - uy * side, y: y - uy * back + ux * side, angleDeg: headingDeg, length, width: length * 0.38, seed: seed + k },
        { alpha: alpha * (0.85 - 0.1 * k), hot: hot * 0.7 }
      );
    }
    body(ctx, x, y, r, alpha, hot);
  }

  return Object.freeze({
    key: 'stellar',
    palette,
    shade: Object.freeze([6, 14, 40]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--twinkle', color: rgbCss(palette.hot), aspect: 1 }),
    glow,
    body,
    tongue,
    projectile,
    // No grain: the crystal stays clean.
    grain: () => {},
    withPalette: (p) => stellarKit(p),
  });
}

export const stellar = stellarKit(STELLAR_PALETTE);
