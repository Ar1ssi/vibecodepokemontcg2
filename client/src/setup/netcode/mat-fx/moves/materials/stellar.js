// Design 065 § New pieces G: the stellar material, Tera Starstorm (EV: cyan crystal with a
// prismatic fringe). The round unit is the `'facet'` unit (a hexagon-faceted sphere); a tongue
// is the ice recipe's crystal tongue plus a fringe stroke (0.16 w, ≥ 1.5 px) just outside it in one of five
// accent hues (picked by the tongue's seed); a projectile is a faceted head in a cyan mist
// trailing fringed crystals. No grain. The accents live in the palette (`accent0`…`accent4`)
// so a tint can replace them like any other key.
//
// Design 075 slice 11: the mist, the faceted head and the prismatic fringe run the GPU `energy`
// style (`ctx.fxStyle`, ignored by Canvas2D): the fringe carries light running round each
// crystal, the head shimmers with fine veins. The crystal tongue itself is ice's, styled there.
//
// Design 076: modifiers (`ctx.fxMod`, ignored by Canvas2D). The cyan mist drifts like a nebula
// (a slow warp and a fine grain), the faceted head only glints (a faint grain, never a warp: a
// crystal is rigid), the prismatic fringe stays a clean line, and every fill names the cyan
// dissolve edge. The crystal tongue's own modifiers are ice's.
//
// Design 076 § Depth: the mist lies lowest, the faceted head above it, and the prismatic fringe is
// a lit tube riding just over its crystal (gpu-canvas `volume` on the stroke), so the fringe reads
// as an edge of light standing off the crystal rather than an outline printed on it.
import { rgbCss } from '../../fx-colors.mjs';
import { withFxMod, withLiftZ } from './_mods.js';
import { parseHex, traceOutline } from './_shared.js';
import { ice, icicleOutline } from './ice.js';
import { UNITS } from './_units.js';

const TAU = Math.PI * 2;
const hex = (h) => Object.freeze(parseHex(h));
export const STELLAR_ACCENTS = Object.freeze(['#FF6FB5', '#FFE07A', '#7CFFB2', '#7FD8FF', '#C59BFF']);
const ACCENT_KEYS = Object.freeze(STELLAR_ACCENTS.map((_, k) => `accent${k}`));
// Style params (gpu-canvas STYLE_PARAMS energy): starlight runs round the fringe.
const STARLIGHT = Object.freeze({ id: 'energy', streak: 0.55, speed: 2, gain: 0.6 });
const STAR_MIST = Object.freeze({ id: 'energy', streak: 0.3, speed: 1, gain: 0 });

const NEBULA = Object.freeze({
  distort: Object.freeze({ strength: 0.12, speed: 0.6, scale: 2.5, angle: 0 }),
  detail: Object.freeze({ amount: 0.45, speed: 0.5, scale: 6, angle: -90 }),
});
const FACET_GLINT = Object.freeze({ detail: Object.freeze({ amount: 0.2, speed: 0.4, scale: 5, angle: -90 }) });

// Heights (lane units) over the drawer's lift.
const Z_MIST = 0.01;
const Z_HEAD = 0.05;
const Z_FRINGE = 0.04;
const FRINGE_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.8, spec: 1, rim: 0.4, ambient: 0.45, light: 120, bump: 0 }) });
/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));

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
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.hot, width: 0.1, gain: 1.6 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.core, alpha * 0.5));
    g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.3));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.fxStyle = STAR_MIST;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_MIST, NEBULA, () => ctx.fill());
    ctx.fxStyle = null;
  }

  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.save();
    ctx.globalAlpha *= alpha * (0.7 + 0.3 * Math.max(0, Math.min(1, hot)));
    ctx.fxStyle = STARLIGHT;
    layered(ctx, Z_HEAD, FACET_GLINT, () => UNITS.facet(ctx, x, y, r, -90, 0, palette));
    ctx.fxStyle = null;
    ctx.restore();
  }

  function tongue(ctx, spec, opts = {}) {
    const alpha = opts.alpha ?? 1;
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    crystalTongue(ctx, spec, opts);
    // A 1 px fringe vanished at board scale (slice 15 review): it scales with the tongue.
    ctx.fxStyle = STARLIGHT;
    ctx.strokeStyle = rgbCss(palette[accentKeyFor(spec.seed ?? 0)], alpha);
    ctx.lineWidth = Math.max(1.5, spec.width * 0.16);
    traceOutline(ctx, icicleOutline({ ...spec, width: spec.width * 1.12 }));
    layered(ctx, Z_FRINGE, FRINGE_TUBE, () => ctx.stroke());
    ctx.fxStyle = null;
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
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    // No grain: the crystal stays clean.
    grain: () => {},
    withPalette: (p) => stellarKit(p),
  });
}

export const stellar = stellarKit(STELLAR_PALETTE);
