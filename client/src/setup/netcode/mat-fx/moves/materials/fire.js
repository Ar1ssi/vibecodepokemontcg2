// Design 063: the fire material, the accepted Fire Blast look (user, 2026-10-05) as a
// material. A flame is a tapered tongue whose edges wobble with time, filled in three
// passes — a blurred orange body, a yellow mid, a near-white core — composited additively;
// the scene's grain pass eats speckles out of the layer so gradients stop reading as flat
// discs. Every call draws on the context it is handed and is otherwise pure.
//
// Design 075 slice 9: each fill names its GPU style (`ctx.fxStyle`, ignored by Canvas2D).
// Tongues paint a single-colour gradient laid along their axis — identical on Canvas2D — so
// the flame style knows base from tip and flows its noise that way.
//
// Design 078: modifiers (`ctx.fxMod`, ignored by Canvas2D). Heat haze warps the flame body and
// its halo, a grain streams base to tip through the outer passes so a big tongue never reads
// flat, the white-hot filament stays clean, and every fill names the orange dissolve edge.
//
// Design 078 § Depth: the flame is lit as a billowing solid (gpu-canvas `volume`): a tongue's
// outer passes are tubes round their axis with a lumpy bump, so the edges fall to deep red and
// the crest catches the light; the hot sphere is a lumpy lit ball. The core stays emissive. The
// passes stand at rising heights over the drawer's lift, so the white-hot core rides above the
// body and the cast pass pools the flame's light on the cloth beside it.
import { rgbCss } from '../../fx-colors.mjs';
import { mergeFxMods, withFxMod, withLiftZ } from './_mods.js';
import { grainPass, sphere, tonguePath, wobble } from './_shared.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/** `rgb` at `alpha` as a gradient from the tongue's base to its tip: one colour, one axis. */
function alongTongue(ctx, spec, rgb, alpha) {
  const a = rad(spec.angleDeg);
  const g = ctx.createLinearGradient(spec.x, spec.y, spec.x + Math.cos(a) * spec.length, spec.y + Math.sin(a) * spec.length);
  const colour = rgbCss(rgb, alpha);
  g.addColorStop(0, colour);
  g.addColorStop(1, colour);
  return g;
}

// Style params (gpu-canvas STYLE_PARAMS): the outer pass erodes least, the core most, so the
// three passes nest — solid body, licking mid, a torn white-hot filament.
const FLAME_BODY = Object.freeze({ id: 'flame', erode: 0.3 });
const FLAME_MID = Object.freeze({ id: 'flame', erode: 0.42 });
const FLAME_CORE = Object.freeze({ id: 'flame', erode: 0.55 });
const ORB_BODY = Object.freeze({ id: 'orb' });
const ORB_GLOW = Object.freeze({ id: 'orb', boil: 0.5, limb: 0, gain: 0 });

// Haze rises up the stage; the grain streams along each tongue (its angle is set per tongue).
const HAZE_BODY = Object.freeze({ strength: 0.15, speed: 1.4, scale: 3, angle: -90 });
const HAZE_MID = Object.freeze({ strength: 0.1, speed: 1.6, scale: 3.5, angle: -90 });
const HAZE_CORE = Object.freeze({ distort: Object.freeze({ strength: 0.05, speed: 1.8, scale: 4, angle: -90 }) });
const HAZE_HALO = Object.freeze({ distort: Object.freeze({ strength: 0.15, speed: 1, scale: 2.5, angle: -90 }) });
const SPHERE_CHURN = Object.freeze({
  distort: Object.freeze({ strength: 0.08, speed: 1.2, scale: 3, angle: -90 }),
  detail: Object.freeze({ amount: 0.35, speed: 0.8, scale: 4, angle: -90 }),
});
// Heights (lane units) over the drawer's lift: halo on the cloth, body, mid, core on top.
const Z_HALO = 0.01;
const Z_BODY = 0.03;
const Z_MID = 0.05;
const Z_CORE = 0.07;
const Z_SPHERE = 0.06;
// Flame is matte and lumpy: little glint, a strong bump, a warm rim.
const FLAME_TUBE = Object.freeze({ amount: 0.65, spec: 0.35, rim: 0.4, ambient: 0.32, light: 120, bump: 0.6, bumpScale: 5, radius: 0.06 });
const MID_TUBE = Object.freeze({ ...FLAME_TUBE, amount: 0.45, radius: 0.04 });
const FIREBALL = Object.freeze({ volume: Object.freeze({ amount: 0.7, spec: 0.5, rim: 0.5, ambient: 0.35, light: 120, bump: 0.55, bumpScale: 4 }) });
/** `draw` at `z` lane units over the current lift with `mod` merged over the current fxMod. */
const layered = (ctx, z, mod, draw) => withLiftZ(ctx, z, () => withFxMod(ctx, mod, draw));
const tongueHaze = (haze, grain, angleDeg) => ({ distort: haze, detail: { amount: grain, speed: 1.8, scale: 5, angle: angleDeg } });

const PALETTE = Object.freeze({
  deep: Object.freeze([210, 41, 8]),
  body: Object.freeze([235, 108, 6]),
  hot: Object.freeze([241, 175, 13]),
  core: Object.freeze([255, 246, 214]),
  white: Object.freeze([255, 255, 255]),
});

/** The fire material drawn in `palette` (any palette with the same keys). */
function fireKit(palette) {
  const edge = Object.freeze({ dissolve: Object.freeze({ edge: palette.body, width: 0.14, gain: 1.8 }) });
  /** `draw` with this kit's dissolve edge named for every fill it makes. */
  const edged = (draw) => (ctx, ...args) =>
    ctx && typeof ctx === 'object' ? withFxMod(ctx, edge, () => draw(ctx, ...args)) : draw(ctx, ...args);

  /** A soft radial glow, red at the rim. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.body, alpha));
    g.addColorStop(0.55, rgbCss(palette.deep, alpha * 0.45));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.fxStyle = ORB_GLOW;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    layered(ctx, Z_HALO, HAZE_HALO, () => ctx.fill());
    ctx.fxStyle = null;
  }

  /** A hot sphere: white core, yellow, orange, falling to nothing. `hot` dims the white. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.fxStyle = ORB_BODY;
    layered(ctx, Z_SPHERE, mergeFxMods(SPHERE_CHURN, FIREBALL), () =>
      sphere(ctx, x, y, r, [
        [0, palette.white, alpha * hot],
        [0.3, palette.core, alpha],
        [0.62, palette.hot, alpha * 0.9],
        [0.86, palette.body, alpha * 0.5],
        [1, palette.deep, 0],
      ])
    );
    ctx.fxStyle = null;
  }

  /** Three-pass flame tongue: blurred body, mid, hot core. `hot` dims the core. */
  function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    // One blurred pass only: canvas blur is the costly part of this material.
    ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
    ctx.fxStyle = FLAME_BODY;
    ctx.fillStyle = alongTongue(ctx, spec, palette.body, 0.6 * alpha);
    tonguePath(ctx, spec, 1);
    layered(ctx, Z_BODY, { ...tongueHaze(HAZE_BODY, 0.5, spec.angleDeg), volume: FLAME_TUBE }, () => ctx.fill());
    ctx.filter = 'none';
    ctx.fxStyle = FLAME_MID;
    ctx.fillStyle = alongTongue(ctx, spec, palette.hot, 0.8 * alpha);
    tonguePath(ctx, spec, 0.66);
    layered(ctx, Z_MID, { ...tongueHaze(HAZE_MID, 0.35, spec.angleDeg), volume: MID_TUBE }, () => ctx.fill());
    if (hot > 0) {
      ctx.fxStyle = FLAME_CORE;
      ctx.fillStyle = alongTongue(ctx, spec, palette.core, 0.9 * alpha * hot);
      tonguePath(ctx, { ...spec, seed: spec.seed + 0.5 }, 0.4);
      layered(ctx, Z_CORE, HAZE_CORE, () => ctx.fill());
    }
    ctx.fxStyle = null;
  }

  /**
   * A fireball of radius `r` travelling along `headingDeg`: a glow halo, a fan of tongues
   * streaming behind it, the hot sphere, and a few sparks shed off it.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 7, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.4, 0.35 * alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      const spread = tongues > 1 ? -50 + (100 * k) / (tongues - 1) : 0;
      const jitter = 8 * wobble(k * 0.37, time, seed + k);
      const len = r * (1.4 + 0.9 * Math.abs(Math.sin(seed * 3.1 + k * 1.9)) * (1 - Math.abs(spread) / 70));
      tongue(
        ctx,
        { x, y, angleDeg: back + spread + jitter, length: len, width: r * 0.9, time, seed: seed + k * 2.1 },
        { alpha: alpha * 0.9, hot: hot * 0.6 }
      );
    }
    body(ctx, x, y, r, alpha, hot);
    ctx.fillStyle = rgbCss(palette.core, 0.9 * alpha);
    for (let k = 0; k < 6; k += 1) {
      const a = seed * 1.3 + k * 1.05 + time * 2;
      const d = r * (1.1 + 0.9 * Math.abs(Math.sin(a * 2.7 + k)));
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.06, 0, TAU);
      ctx.fill();
    }
  }

  return Object.freeze({
    key: 'fire',
    palette,
    shade: Object.freeze([70, 6, 0]),
    smoke: Object.freeze([120, 96, 84]),
    particle: Object.freeze({ className: 'fx-particle--ember', color: rgbCss(palette.hot), aspect: 0.3 }),
    glow: edged(glow),
    body: edged(body),
    tongue: edged(tongue),
    projectile: edged(projectile),
    grain: grainPass,
    withPalette: (p) => fireKit(p),
  });
}

export const fire = fireKit(PALETTE);
