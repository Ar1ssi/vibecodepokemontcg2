// Design 065 § New pieces G: the normal material, "pressure light" sampled from Judgment,
// Crush Grip and Multi-Attack (EV). Light, not flame: a body is a sphere from a white core
// (out to 0.35 r) through hot and body to nothing; a tongue is 063's shared tongue drawn in two
// passes, a hot body pass blurred 0.08 w and a crisp core pass at 0.6 scale (no orange pass);
// a projectile is the body inside two thin hot rings at 1.3 r, tilted 60° and turning.
// Spec grain for this material is 0.12 (the recipe's strength; the spec sets it).
//
// Design 075 slice 11: every fill and stroke runs the GPU `energy` style slowly (`ctx.fxStyle`,
// ignored by Canvas2D): pressure light breathes with slow veins and the rings carry pulses round
// them. Gain stays off the body so its white core never blooms into a slab.
//
// Design 078: modifiers (`ctx.fxMod`, ignored by Canvas2D). Pressure light breathes: a slow warp
// and grain through the body and the tongue's hot pass, a slow waver in the glow; the white core
// pass and the rings stay clean, and every fill names the gold dissolve edge.
//
// Design 078 § Depth: the body is a softly lit sphere of light (gpu-canvas `volume`, high ambient
// so it stays light, not stone), the tongue's hot pass a soft tube, the rings lit tubes orbiting
// above the body; every pass stands at its own height over the drawer's lift.
import { rgbCss } from '../../fx-colors.mjs';
import { mergeFxMods, withFxMod, withLiftZ } from './_mods.js';
import { rootFaded } from './_root-fade.js';
import { grainPass, parseHex, sphere, tonguePath } from './_shared.js';

const TAU = Math.PI * 2;
const hex = (h) => Object.freeze(parseHex(h));
// Style params (gpu-canvas STYLE_PARAMS energy): light under pressure, not a current.
const PRESSURE = Object.freeze({ id: 'energy', streak: 0.35, speed: 1.2, gain: 0.5 });
const PRESSURE_BODY = Object.freeze({ id: 'energy', streak: 0.3, speed: 1, gain: 0 });

const PRESSURE_HALO = Object.freeze({ distort: Object.freeze({ strength: 0.12, speed: 0.8, scale: 2.5, angle: -90 }) });
const PRESSURE_SWELL = Object.freeze({
  distort: Object.freeze({ strength: 0.08, speed: 1, scale: 3, angle: -90 }),
  detail: Object.freeze({ amount: 0.35, speed: 0.8, scale: 3.5, angle: -90 }),
});
// Heights (lane units) over the drawer's lift.
const Z_HALO = 0.01;
const Z_HOT = 0.03;
const Z_CORE = 0.05;
const Z_BODY = 0.05;
const Z_RING = 0.08;
const LIGHT_ORB = Object.freeze({ volume: Object.freeze({ amount: 0.7, spec: 0.8, rim: 0.5, ambient: 0.45, light: 120, bump: 0.15 }) });
const LIGHT_TUBE = Object.freeze({ amount: 0.4, spec: 0.5, rim: 0.4, ambient: 0.5, light: 120, bump: 0.2, radius: 0.05 });
const RING_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.7, spec: 0.9, rim: 0.3, ambient: 0.4, light: 120, bump: 0 }) });
/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));
const tongueSwell = (angleDeg) => ({
  distort: { strength: 0.1, speed: 1.2, scale: 3, angle: -90 },
  detail: { amount: 0.35, speed: 1.5, scale: 4, angle: angleDeg },
});

const NORMAL_PALETTE = Object.freeze({
  deep: hex('#E8552B'),
  body: hex('#F2C230'),
  hot: hex('#FFF5B0'),
  core: hex('#FFFFFF'),
});

/** The normal material drawn in `palette` (any palette with the same keys). */
function normalKit(palette) {
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.body, width: 0.12, gain: 1.4 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha));
    g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.4));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.fxStyle = PRESSURE_BODY;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_HALO, PRESSURE_HALO, () => ctx.fill());
    ctx.fxStyle = null;
  }

  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.fxStyle = PRESSURE_BODY;
    layered(ctx, Z_BODY, mergeFxMods(PRESSURE_SWELL, LIGHT_ORB), () =>
      sphere(ctx, x, y, r, [
        [0, palette.core, alpha],
        [0.35, palette.core, alpha * (0.6 + 0.4 * hot)],
        [0.6, palette.hot, alpha * 0.9],
        [0.85, palette.body, alpha * 0.5],
        [1, palette.body, 0],
      ])
    );
    ctx.fxStyle = null;
  }

  function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    ctx.filter = `blur(${Math.max(1, spec.width * 0.08).toFixed(1)}px)`;
    ctx.fxStyle = PRESSURE;
    ctx.fillStyle = rootFaded(ctx, spec, palette.hot, 0.75 * alpha);
    tonguePath(ctx, spec, 1);
    layered(ctx, Z_HOT, { ...tongueSwell(spec.angleDeg), volume: LIGHT_TUBE }, () => ctx.fill());
    ctx.filter = 'none';
    if (hot > 0) {
      ctx.fillStyle = rootFaded(ctx, spec, palette.core, 0.9 * alpha * hot);
      tonguePath(ctx, spec, 0.6);
      withLiftZ(ctx, Z_CORE, () => ctx.fill());
    }
    ctx.fxStyle = null;
  }

  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.35 * alpha);
    body(ctx, x, y, r, alpha, hot);
    ctx.fxStyle = PRESSURE;
    ctx.strokeStyle = rgbCss(palette.hot, 0.85 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.06);
    const spin = time * 3 + seed;
    for (const k of [0, 1]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.3, r * 1.3 * Math.abs(Math.cos((60 * Math.PI) / 180)), spin + k * (Math.PI / 2) + (headingDeg * Math.PI) / 180, 0, TAU);
      layered(ctx, Z_RING, RING_TUBE, () => ctx.stroke());
    }
    ctx.fxStyle = null;
  }

  return Object.freeze({
    key: 'normal',
    palette,
    shade: Object.freeze([40, 30, 10]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss([255, 224, 102]), aspect: 0.3 }),
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    grain: grainPass,
    withPalette: (p) => normalKit(p),
  });
}

export const normal = normalKit(NORMAL_PALETTE);
