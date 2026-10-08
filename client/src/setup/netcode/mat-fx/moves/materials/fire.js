// Design 063: the fire material, the accepted Fire Blast look (user, 2026-10-05) as a
// material. A flame is a tapered tongue whose edges wobble with time, filled in three
// passes — a blurred orange body, a yellow mid, a near-white core — composited additively;
// the scene's grain pass eats speckles out of the layer so gradients stop reading as flat
// discs. Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, tonguePath, wobble } from './_shared.js';

const TAU = Math.PI * 2;

const PALETTE = Object.freeze({
  deep: Object.freeze([210, 41, 8]),
  body: Object.freeze([235, 108, 6]),
  hot: Object.freeze([241, 175, 13]),
  core: Object.freeze([255, 246, 214]),
  white: Object.freeze([255, 255, 255]),
});

/** The fire material drawn in `palette` (any palette with the same keys). */
function fireKit(palette) {
  /** A soft radial glow, red at the rim. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.body, alpha));
    g.addColorStop(0.55, rgbCss(palette.deep, alpha * 0.45));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /** A hot sphere: white core, yellow, orange, falling to nothing. `hot` dims the white. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    sphere(ctx, x, y, r, [
      [0, palette.white, alpha * hot],
      [0.3, palette.core, alpha],
      [0.62, palette.hot, alpha * 0.9],
      [0.86, palette.body, alpha * 0.5],
      [1, palette.deep, 0],
    ]);
  }

  /** Three-pass flame tongue: blurred body, mid, hot core. `hot` dims the core. */
  function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    // One blurred pass only: canvas blur is the costly part of this material.
    ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
    ctx.fillStyle = rgbCss(palette.body, 0.6 * alpha);
    tonguePath(ctx, spec, 1);
    ctx.fill();
    ctx.filter = 'none';
    ctx.fillStyle = rgbCss(palette.hot, 0.8 * alpha);
    tonguePath(ctx, spec, 0.66);
    ctx.fill();
    if (hot > 0) {
      ctx.fillStyle = rgbCss(palette.core, 0.9 * alpha * hot);
      tonguePath(ctx, { ...spec, seed: spec.seed + 0.5 }, 0.4);
      ctx.fill();
    }
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
    glow,
    body,
    tongue,
    projectile,
    grain: grainPass,
    withPalette: (p) => fireKit(p),
  });
}

export const fire = fireKit(PALETTE);
