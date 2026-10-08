// Design 063: the fairy material (recipe in the design's § Materials). The round unit is a
// *twinkle*: a four-point star (with a smaller one crossed at 45 deg, so it reads as a sparkle)
// over a soft sphere, its scale pulsing at 3 Hz. The elongated unit is a *sparkle trail*: a
// soft pink ribbon (one blurred pass, a calm edge) with gold twinkles strung along it; `jag`
// makes it a sparkle shard, a four-point star stretched along its heading. A projectile is the
// Moonblast moon: a pale sphere with a crescent highlight and a twinkle on its rim, trailing
// sparkle trails. `sigil` (the `glyph` drawer) is a five-point star outline in gold that turns
// a fifth of a turn over the beat, so it starts and ends upright, with twinkles on its tips.
// Palette #F48FB1 #FFC2DA #FFF0F7, deep #B83A72, accent #FFE066 (gold); grain 0. Every call
// draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, tongueOutline, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const TWINKLE_HZ = 3;
const TWINKLE_PULSE = 0.18;
const TWINKLE_WAIST = 0.16;
const CROSS_SCALE = 0.55;
const RIBBON_AMP = 0.3;
const TRAIL_TWINKLES = Object.freeze([0.3, 0.55, 0.8]);
const STAR_POINTS = 5;
const STAR_INNER = 0.42;
const CRESCENT_SHIFT = 0.3;
const TRAIL_SPREAD = 40;

const PALETTE = Object.freeze({
  deep: Object.freeze([184, 58, 114]),
  body: Object.freeze([244, 143, 177]),
  hot: Object.freeze([255, 194, 218]),
  core: Object.freeze([255, 240, 247]),
  white: Object.freeze([255, 255, 255]),
  gold: Object.freeze([255, 224, 102]),
});

/**
 * A four-point star around (x, y): four tips `r` out along `angleDeg` + k x 90 deg, pinched
 * to `waist` x r between them. Eight points, tip first, going round.
 * @returns {number[][]}
 */
export function twinkleOutline(x, y, r, angleDeg = 0, waist = TWINKLE_WAIST) {
  const points = [];
  for (let k = 0; k < 8; k += 1) {
    const a = rad(angleDeg + k * 45);
    const reach = k % 2 === 0 ? r : r * waist;
    points.push([x + Math.cos(a) * reach, y + Math.sin(a) * reach]);
  }
  return points;
}

/**
 * A five-point star around (x, y): tips `r` out, the first at `rotationDeg` (-90 = straight
 * up), inner corners at `inner` x r. Ten points, tip first.
 * @returns {number[][]}
 */
export function starOutline(x, y, r, rotationDeg = -90, inner = STAR_INNER) {
  const points = [];
  for (let k = 0; k < STAR_POINTS * 2; k += 1) {
    const a = rad(rotationDeg + k * (180 / STAR_POINTS));
    const reach = k % 2 === 0 ? r : r * inner;
    points.push([x + Math.cos(a) * reach, y + Math.sin(a) * reach]);
  }
  return points;
}

/** A twinkle's scale at `time` (s): 1 +- TWINKLE_PULSE at TWINKLE_HZ, offset by `phase` (rad). */
export const twinklePulse = (time, phase = 0) => 1 + TWINKLE_PULSE * Math.sin(TAU * TWINKLE_HZ * time + phase);

/** The sigil's turn at beat progress `s`: a fifth of a turn, so the star starts and ends upright. */
export const sigilRotation = (s) => -90 + (360 / STAR_POINTS) * clamp01(s);

/** Add a closed polygon to the current path (no beginPath, so several share one fill). */
const addPolygon = (ctx, points) => {
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
};

/** The fairy material drawn in `palette` (any palette with the same keys). */
function fairyKit(palette) {
  /** Add a sparkle at (x, y): a four-point star with a smaller one crossed at 45 deg. */
  const addSparkle = (ctx, x, y, r, angleDeg = 0) => {
    addPolygon(ctx, twinkleOutline(x, y, r, angleDeg));
    addPolygon(ctx, twinkleOutline(x, y, r * CROSS_SCALE, angleDeg + 45));
  };

  /** Soft fairy light: a pale core through pink to clear. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.core, alpha * 0.5));
    g.addColorStop(0.45, rgbCss(palette.hot, alpha * 0.45));
    g.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /**
   * A twinkle of radius `r`: a soft sphere behind a sparkle whose scale pulses at 3 Hz on
   * `time` (the scene clock, s; a body drawn without one pulses with where it is, as the
   * psychic lens turns). `hot` whitens the sparkle's heart.
   */
  function body(ctx, x, y, r, alpha, hot = 1, time = 0) {
    if (!(r > 0) || !(alpha > 0)) return;
    sphere(
      ctx,
      x,
      y,
      r * 0.7,
      [
        [0, palette.core, alpha * 0.7],
        [0.5, palette.hot, alpha * 0.5],
        [1, palette.body, 0],
      ],
      0
    );
    const size = r * twinklePulse(time, x * 0.013 + y * 0.017 + r * 0.05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, rgbCss(palette.white, alpha * clamp01(hot)));
    g.addColorStop(0.3, rgbCss(palette.core, alpha));
    g.addColorStop(1, rgbCss(palette.hot, alpha * 0.6));
    ctx.fillStyle = g;
    ctx.beginPath();
    addSparkle(ctx, x, y, size);
    ctx.fill();
  }

  /** A sparkle shard: a four-point star stretched along the tongue's heading, pink then core. */
  function sparkleShard(ctx, spec, alpha, hot) {
    const half = spec.length / 2;
    const a = rad(spec.angleDeg);
    const cx = spec.x + Math.cos(a) * half;
    const cy = spec.y + Math.sin(a) * half;
    const waist = clamp01((spec.width * 0.5) / half) * 0.6;
    ctx.fillStyle = rgbCss(palette.hot, 0.85 * alpha);
    ctx.beginPath();
    addPolygon(ctx, stretchedTwinkle(cx, cy, half, spec.width * 0.5, spec.angleDeg, waist));
    ctx.fill();
    if (!(hot > 0)) return;
    ctx.fillStyle = rgbCss(palette.core, 0.95 * alpha * Math.min(1, hot));
    ctx.beginPath();
    addPolygon(ctx, stretchedTwinkle(cx, cy, half * 0.55, spec.width * 0.3, spec.angleDeg, waist));
    ctx.fill();
  }

  /** A four-point star with a long axis `long` along `angleDeg` and a short axis `short`. */
  const stretchedTwinkle = (x, y, long, short, angleDeg, waist) => {
    const a = rad(angleDeg);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const at = (along, across) => [x + ux * along - uy * across, y + uy * along + ux * across];
    const pinch = Math.max(waist, 0.1) * Math.min(long, short);
    const d = pinch * Math.SQRT1_2;
    return [at(long, 0), at(d, d), at(0, short), at(-d, d), at(-long, 0), at(-d, -d), at(0, -short), at(d, -d)];
  };

  /**
   * A sparkle trail: a soft blurred pink ribbon, a narrower pale-pink pass, and gold twinkles
   * strung along its centre that pulse with the clock (`hot` 0 drops the twinkles).
   */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    if (jag) {
      sparkleShard(ctx, spec, alpha, hot);
      return;
    }
    const calm = { ...spec, amp: RIBBON_AMP };
    // One blurred pass only: canvas blur is the costly call (design § Constraints).
    ctx.filter = `blur(${Math.max(1, spec.width * 0.1).toFixed(1)}px)`;
    ctx.fillStyle = rgbCss(palette.body, 0.5 * alpha);
    traceOutline(ctx, tongueOutline(calm, 1));
    ctx.fill();
    ctx.filter = 'none';
    const inner = tongueOutline(calm, 0.55);
    ctx.fillStyle = rgbCss(palette.hot, 0.7 * alpha);
    traceOutline(ctx, inner);
    ctx.fill();
    const sparkle = alpha * clamp01(hot);
    if (!(sparkle > 0)) return;
    const last = inner.left.length - 1;
    ctx.fillStyle = rgbCss(palette.gold, 0.9 * sparkle);
    ctx.beginPath();
    TRAIL_TWINKLES.forEach((f, k) => {
      const i = Math.round(f * last);
      const x = (inner.left[i][0] + inner.right[i][0]) / 2;
      const y = (inner.left[i][1] + inner.right[i][1]) / 2;
      const size = spec.width * 0.32 * (1 - 0.4 * f) * twinklePulse(spec.time ?? 0, (spec.seed ?? 0) + k * 2.1);
      addPolygon(ctx, twinkleOutline(x, y, size));
    });
    ctx.fill();
  }

  /**
   * The moon in flight along `headingDeg`: a pink haze, `tongues` sparkle trails streaming
   * behind it, a pale sphere, a crescent of light on its up-left rim and a twinkle there.
   * 0 tongues = a bare moon.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.35 * alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      const spread = tongues > 1 ? -TRAIL_SPREAD / 2 + (TRAIL_SPREAD * k) / (tongues - 1) : 0;
      const sway = 6 * Math.sin(time * 3 + k * 2.3 + seed);
      const length = r * (2.2 + 0.7 * Math.abs(Math.sin(seed * 1.3 + k * 2.1)));
      tongue(
        ctx,
        { x, y, angleDeg: back + spread + sway, length, width: r * 0.8, time, seed: seed + k * 1.9 },
        { alpha: alpha * 0.8, hot }
      );
    }
    sphere(ctx, x, y, r, [
      [0, palette.white, alpha * 0.6 * clamp01(hot)],
      [0.35, palette.core, alpha * 0.7],
      [0.75, palette.hot, alpha * 0.6],
      [1, palette.body, alpha * 0.3],
    ]);
    // The crescent: the disc minus the same disc pushed down-right, so the lit rim is up-left.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, 0, TAU);
    ctx.clip();
    ctx.fillStyle = rgbCss(palette.core, 0.6 * alpha);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, 0, TAU);
    const ix = x + r * CRESCENT_SHIFT;
    const iy = y + r * CRESCENT_SHIFT;
    ctx.moveTo(ix + r * 0.94, iy);
    ctx.arc(ix, iy, r * 0.94, 0, TAU, true);
    ctx.fill();
    ctx.restore();
    const tx = x - r * 0.5;
    const ty = y - r * 0.5;
    ctx.fillStyle = rgbCss(palette.white, 0.9 * alpha * clamp01(hot + 0.3));
    ctx.beginPath();
    addSparkle(ctx, tx, ty, r * 0.5 * twinklePulse(time, seed));
    ctx.fill();
  }

  /** The fairy star over (x, y) as the glyph beat runs: a gold outline with twinkling tips. */
  function sigil(ctx, x, y, r, s) {
    if (!(r > 0)) return;
    const rotation = sigilRotation(s);
    const outline = starOutline(x, y, r, rotation);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgbCss(palette.hot, 0.35);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    addPolygon(ctx, outline);
    ctx.stroke();
    ctx.strokeStyle = rgbCss(palette.gold, 0.75);
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.beginPath();
    addPolygon(ctx, outline);
    ctx.stroke();
    const pulse = twinklePulse(clamp01(s), 0);
    ctx.fillStyle = rgbCss(palette.core, 0.9);
    ctx.beginPath();
    addSparkle(ctx, x, y, r * 0.3 * pulse);
    for (let k = 0; k < outline.length; k += 2) addPolygon(ctx, twinkleOutline(outline[k][0], outline[k][1], r * 0.12 * pulse));
    ctx.fill();
  }

  return Object.freeze({
    key: 'fairy',
    palette,
    // A plum dusk, kept local to a card (the references' night sky and violet tints).
    shade: Object.freeze([58, 14, 40]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--twinkle', color: rgbCss(palette.hot), aspect: 1 }),
    glow,
    body,
    tongue,
    projectile,
    sigil,
    grain: grainPass,
    withPalette: (p) => fairyKit(p),
  });
}

export const fairy = fairyKit(PALETTE);
