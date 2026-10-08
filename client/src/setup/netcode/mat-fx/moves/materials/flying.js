// Design 063: the flying material (recipe in the design's § Materials). The elongated unit is
// a *wind blade*: long, thin and crescent-curved (its centre line bows 0.3 w toward its left
// normal; the blade is only 0.45 w thick, so both edges curve the same way and it reads as a
// crescent, not a lens), one translucent fill and a bright stroke along its outer edge, the bow
// breathing with the clock. `jag` makes it a *feather*: a bare quill, then a vane rounded to a
// soft tip, with a vein down its length (the fragments a wing strike knocks loose). The round
// unit is a wind orb: a pale air sphere wrapped by two swirl arcs (deviation from the recipe's
// feather body: coreCharge, helix beads and orbit bodies all draw `body`, and a feather reads
// wrong as a charging orb or a coil bead). A projectile is the recipe's cluster of wind blades,
// turning as a pinwheel round a small orb. Palette #CFE3F7 #EAF3FF #FFFFFF, deep #8FB3D9. No
// grain, no blur. Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const SAMPLES = 12;
const BOW = 0.3;
const THICKNESS = 0.45;
const BOW_BREATH = 0.15;
const BLADE_ALPHA = 0.45;
const EDGE_WIDTH = 0.06;
const QUILL = 0.12;
const RACHIS_BOW = 0.08;
const VANE_ALPHA = 0.75;
// Two open "C" arcs on opposite sides (an S-shaped swirl); full circles read as a bubble rim.
const SWIRL_ARC = (120 * Math.PI) / 180;
const SWIRL_RINGS = Object.freeze([
  [0.55, 0],
  [0.85, Math.PI],
]);
const PINWHEEL_HZ = 1.6;
const PINWHEEL_CORE = 0.35;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

const palette = Object.freeze({
  deep: Object.freeze([143, 179, 217]),
  body: Object.freeze([207, 227, 247]),
  hot: Object.freeze([234, 243, 255]),
  core: Object.freeze([245, 249, 255]),
  white: Object.freeze([255, 255, 255]),
});

const frame = (angleDeg) => {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return { ux, uy, nx: -uy, ny: ux };
};

/**
 * A wind blade's outline: from (x, y) along `angleDeg`, `length` long, its centre line bowed
 * toward the direction's left normal by `BOW` w at the middle (breathing by +/-15 % with
 * `time`), `THICKNESS` w thick at the middle and pointed at both ends. `left` is the outer
 * (convex) edge, base to tip; both edges start at the base and end at the tip.
 * @returns {{left: number[][], right: number[][]}}
 */
export function crescentOutline({ x, y, angleDeg, length, width, time = 0, seed = 0 }) {
  const { ux, uy, nx, ny } = frame(angleDeg);
  const bow = width * BOW * (1 + BOW_BREATH * Math.sin(time * 6 + seed));
  const left = [];
  const right = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const s = i / SAMPLES;
    const arch = Math.sin(Math.PI * s);
    const offset = bow * arch;
    const half = i === 0 || i === SAMPLES ? 0 : width * THICKNESS * 0.5 * arch ** 0.8;
    const cx = x + ux * length * s;
    const cy = y + uy * length * s;
    left.push([cx + nx * (offset + half), cy + ny * (offset + half)]);
    right.push([cx + nx * (offset - half), cy + ny * (offset - half)]);
  }
  return { left, right };
}

/**
 * A feather's outline: a bare quill for the first `QUILL` of its length, then a vane up to
 * `width` wide, rounded to a soft tip; the rachis (its spine) bows a little toward the left
 * normal. `rachis` runs base to tip; both vane edges start where the quill ends and end at the tip.
 * @returns {{left: number[][], right: number[][], rachis: number[][]}}
 */
export function featherOutline({ x, y, angleDeg, length, width }) {
  const { ux, uy, nx, ny } = frame(angleDeg);
  const rachis = [];
  const left = [];
  const right = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const s = i / SAMPLES;
    const bend = width * RACHIS_BOW * Math.sin(Math.PI * s);
    const cx = x + ux * length * s + nx * bend;
    const cy = y + uy * length * s + ny * bend;
    rachis.push([cx, cy]);
    if (s < QUILL) continue;
    const v = (s - QUILL) / (1 - QUILL);
    const half = i === SAMPLES ? 0 : width * 0.5 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * v)) ** 0.6;
    left.push([cx + nx * half, cy + ny * half]);
    right.push([cx - nx * half, cy - ny * half]);
  }
  return { left, right, rachis };
}

/** Clear air: a pale core fading through the sky blue to nothing. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.core, alpha * 0.5));
  g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.28));
  g.addColorStop(1, rgbCss(palette.deep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * A wind orb: a faint air sphere (a white centre when hot, no hard edge) wrapped by two open
 * swirl arcs turned `phase`.
 */
function orb(ctx, x, y, r, alpha, hot, phase) {
  sphere(
    ctx,
    x,
    y,
    r,
    [
      [0, palette.white, alpha * 0.6 * clamp01(hot)],
      [0.3, palette.hot, alpha * 0.35],
      [0.7, palette.body, alpha * 0.12],
      [1, palette.deep, 0],
    ],
    0
  );
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = rgbCss(palette.hot, 0.7 * alpha);
  for (const [scale, offset] of SWIRL_RINGS) {
    const start = phase + offset;
    ctx.beginPath();
    ctx.arc(x, y, r * scale, start, start + SWIRL_ARC);
    ctx.stroke();
  }
}

// The interface's `body` carries no clock, so an orb's swirl turns with where it is and how big
// it has grown (it turns as it swells or travels and holds still at rest), as psychic's lens does.
/** A wind orb of radius `r`; `hot` whitens its centre. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  orb(ctx, x, y, r, alpha, hot, x * 0.02 + y * 0.03 + r * 0.15);
}

/** A feather: one vane fill and its vein in the deep sky blue. */
function feather(ctx, spec, alpha) {
  const { left, right, rachis } = featherOutline(spec);
  ctx.fillStyle = rgbCss(palette.body, VANE_ALPHA * alpha);
  traceOutline(ctx, { left, right });
  ctx.fill();
  ctx.strokeStyle = rgbCss(palette.deep, 0.8 * alpha);
  ctx.lineWidth = Math.max(1, spec.width * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  rachis.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
}

/**
 * A wind blade: one translucent fill, then a bright stroke along its outer edge (`hot` 0 drops
 * the stroke). `jag` draws a feather instead.
 */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  if (jag) {
    feather(ctx, spec, alpha);
    return;
  }
  const outline = crescentOutline(spec);
  ctx.fillStyle = rgbCss(palette.body, BLADE_ALPHA * alpha);
  traceOutline(ctx, outline);
  ctx.fill();
  const edge = 0.9 * alpha * clamp01(hot);
  if (!(edge > 0)) return;
  ctx.strokeStyle = rgbCss(palette.white, edge);
  ctx.lineWidth = Math.max(1, spec.width * EDGE_WIDTH);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  outline.left.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
}

/**
 * A gust in flight: a halo of clear air, then `tongues` wind blades turning as a pinwheel on
 * the scene clock round a small orb. 0 tongues = a bare wind orb in its halo.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  glow(ctx, x, y, r * 2, 0.4 * alpha);
  if (!(tongues > 0)) {
    orb(ctx, x, y, r, alpha, hot, time * TAU * PINWHEEL_HZ + seed);
    return;
  }
  const spin = headingDeg + time * 360 * PINWHEEL_HZ + seed * 40;
  for (let k = 0; k < tongues; k += 1) {
    const angleDeg = spin + (k * 360) / tongues;
    const a = rad(angleDeg);
    tongue(
      ctx,
      { x: x + Math.cos(a) * r * 0.15, y: y + Math.sin(a) * r * 0.15, angleDeg, length: r * 1.5, width: r * 0.9, time, seed: seed + k * 1.7 },
      { alpha: alpha * 0.9, hot }
    );
  }
  orb(ctx, x, y, r * PINWHEEL_CORE, alpha, hot, time * TAU * PINWHEEL_HZ + seed);
}

export const flying = Object.freeze({
  key: 'flying',
  palette,
  // A deep night-sky navy, kept local to a card, so pale wind reads against it.
  shade: Object.freeze([10, 22, 44]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--feather', color: rgbCss(palette.hot), aspect: 0.35 }),
  glow,
  body,
  tongue,
  projectile,
  grain: grainPass,
});
