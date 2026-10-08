// Design 063: the steel material (recipe in the design's § Materials). The elongated unit is a
// *blade*: straight-edged, no wobble, a flat heel widening to its shoulder, parallel edges and a
// needle point, brushed across its width from a bright edge to a dark one, a cool blue halo at its
// edges and one white specular line running its length; `jag` makes it an angular splinter of
// metal. The round unit is a metal sphere with a hard highlight and a cool blue rim. A
// projectile is the recipe's tight white-blue beam core: a hard sphere trailing one long streak
// and a few short spark blades. The sigil is a targeting reticle that turns and locks (Smart
// Strike). Palette #9AA7B8 #D5DEEA #FFFFFF, deep #4A5563, cool edge #9FC5F0. No grain. Every
// call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, shardOutline, sphere, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const HEEL = 0.22;
const SHOULDER_AT = 0.16;
const TIP_WIDTHS = 2.5;
const TIP_MAX = 0.35;
const HALO_WIDTH = 1.5;
const HALO_ALPHA = 0.45;
const HALO_BLUR = 0.1;
const SPECULAR_REACH = 0.88;
const TRAIL_LENGTH = 3.4;
const SPARK_SPREAD = 16;
const RETICLE_TICKS = 4;
const RETICLE_TURN = 90;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

const palette = Object.freeze({
  deep: Object.freeze([74, 85, 99]),
  body: Object.freeze([154, 167, 184]),
  hot: Object.freeze([213, 222, 234]),
  edge: Object.freeze([159, 197, 240]),
  core: Object.freeze([236, 242, 250]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * A blade's outline: a flat heel `HEEL` w wide, full width (w) from `SHOULDER_AT` of its
 * length, parallel edges, then a needle point `TIP_WIDTHS` w long (at most `TIP_MAX` of the
 * length, so a long beam stays a bar and does not read as a cone). `left` is the edge on the
 * direction's left normal, heel to tip; both edges end at the tip.
 * @returns {{left: number[][], right: number[][]}}
 */
export function bladeOutline({ x, y, angleDeg, length, width }) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const at = (f, side) => [x + ux * length * f + nx * side, y + uy * length * f + ny * side];
  const taperFrom = Math.max(SHOULDER_AT, 1 - Math.min((TIP_WIDTHS * width) / length, TIP_MAX));
  const tip = at(1, 0);
  return {
    left: [at(0, width * HEEL), at(SHOULDER_AT, width * 0.5), at(taperFrom, width * 0.5), tip],
    right: [at(0, -width * HEEL), at(SHOULDER_AT, -width * 0.5), at(taperFrom, -width * 0.5), tip],
  };
}

/**
 * The reticle's four ticks at progress `s`: they turn `RETICLE_TURN` degrees and slow to a
 * stop square to the screen (locked on), closing from 1.2 r to their resting span.
 * @returns {{angleDeg: number, from: number, to: number}[]}
 */
export function reticleTicks(s, r) {
  const c = clamp01(s);
  const turn = RETICLE_TURN * (1 - c) ** 2;
  const close = 1 - c;
  const ticks = [];
  for (let i = 0; i < RETICLE_TICKS; i += 1) {
    ticks.push({ angleDeg: (i * 360) / RETICLE_TICKS + turn, from: r * (0.72 + 0.2 * close), to: r * (1.0 + 0.2 * close) });
  }
  return ticks;
}

/** A cool haze: the bright steel at the centre fading through the blue edge to clear. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.hot, alpha * 0.5));
  g.addColorStop(0.5, rgbCss(palette.edge, alpha * 0.2));
  g.addColorStop(1, rgbCss(palette.edge, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A metal sphere: a hard white highlight up-left, steel shading to deep, a cool blue rim. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  const shine = alpha * clamp01(hot);
  sphere(
    ctx,
    x,
    y,
    r,
    [
      [0, palette.white, shine],
      [0.16, palette.white, shine * 0.9],
      [0.22, palette.hot, alpha],
      [0.62, palette.body, alpha * 0.95],
      [1, palette.deep, alpha * 0.9],
    ],
    0.35
  );
  ctx.strokeStyle = rgbCss(palette.edge, 0.6 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.97, 0, TAU);
  ctx.stroke();
}

/**
 * A blade: a blurred cool halo, the brushed steel body (bright edge to dark edge across its
 * width), one white specular line along its axis. `jag` makes it an angular splinter; `hot` 0
 * drops the specular line.
 */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const shape = (widthScale) =>
    jag ? shardOutline({ ...spec, width: spec.width * widthScale }) : bladeOutline({ ...spec, width: spec.width * widthScale });
  ctx.filter = `blur(${Math.max(1, spec.width * HALO_BLUR).toFixed(2)}px)`;
  ctx.fillStyle = rgbCss(palette.edge, HALO_ALPHA * alpha);
  traceOutline(ctx, shape(HALO_WIDTH));
  ctx.fill();
  ctx.filter = 'none';

  const blade = shape(1);
  const a = rad(spec.angleDeg);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const half = spec.width * 0.5;
  const sx = spec.x + Math.cos(a) * spec.length * SHOULDER_AT;
  const sy = spec.y + Math.sin(a) * spec.length * SHOULDER_AT;
  const brush = ctx.createLinearGradient(sx + nx * half, sy + ny * half, sx - nx * half, sy - ny * half);
  brush.addColorStop(0, rgbCss(palette.hot, 0.95 * alpha));
  brush.addColorStop(0.5, rgbCss(palette.body, 0.9 * alpha));
  brush.addColorStop(1, rgbCss(palette.deep, 0.85 * alpha));
  ctx.fillStyle = brush;
  traceOutline(ctx, blade);
  ctx.fill();

  const shine = alpha * clamp01(hot);
  if (!(shine > 0)) return;
  const lift = spec.width * 0.08;
  ctx.strokeStyle = rgbCss(palette.white, 0.9 * shine);
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(spec.x + nx * lift, spec.y + ny * lift);
  ctx.lineTo(
    spec.x + Math.cos(a) * spec.length * SPECULAR_REACH + nx * lift * 0.3,
    spec.y + Math.sin(a) * spec.length * SPECULAR_REACH + ny * lift * 0.3
  );
  ctx.stroke();
}

/**
 * The beam core in flight along `headingDeg`: a cool haze, one long streak behind it, then
 * `tongues - 1` short spark blades flickering either side of the streak, and the hard sphere.
 * 0 tongues = a bare sphere in its haze.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  glow(ctx, x, y, r * 2.2, 0.5 * alpha);
  const back = headingDeg + 180;
  if (tongues > 0) {
    tongue(ctx, { x, y, angleDeg: back, length: r * TRAIL_LENGTH, width: r * 1.1, time, seed }, { alpha: alpha * 0.85, hot });
  }
  for (let k = 1; k < tongues; k += 1) {
    const side = k % 2 ? 1 : -1;
    const angleDeg = back + side * (SPARK_SPREAD + 6 * Math.ceil(k / 2)) + 5 * Math.sin(time * 9 + k * 1.7 + seed);
    const ar = rad(angleDeg);
    tongue(
      ctx,
      {
        x: x + Math.cos(ar) * r * 0.5,
        y: y + Math.sin(ar) * r * 0.5,
        angleDeg,
        length: r * (1.2 + 0.6 * Math.abs(Math.sin(seed * 1.3 + k * 2.1))),
        width: r * 0.3,
        time,
        seed: seed + k * 1.9,
      },
      { alpha: alpha * 0.8, hot, jag: k % 2 }
    );
  }
  body(ctx, x, y, r, alpha, hot);
}

/** A targeting reticle of radius `r` at progress `s`: a ring, four locking ticks, a pip. */
function sigil(ctx, x, y, r, s) {
  if (!(r > 0)) return;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = rgbCss(palette.hot, 0.85);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgbCss(palette.edge, 0.9);
  ctx.beginPath();
  for (const tick of reticleTicks(s, r)) {
    const a = rad(tick.angleDeg);
    ctx.moveTo(x + Math.cos(a) * tick.from, y + Math.sin(a) * tick.from);
    ctx.lineTo(x + Math.cos(a) * tick.to, y + Math.sin(a) * tick.to);
  }
  ctx.stroke();
  ctx.strokeStyle = rgbCss(palette.white, 0.9);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, TAU);
  ctx.stroke();
}

export const steel = Object.freeze({
  key: 'steel',
  palette,
  // A cool blue-black, kept local to a card.
  shade: Object.freeze([6, 10, 20]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(palette.white), aspect: 0.2 }),
  glow,
  body,
  tongue,
  projectile,
  sigil,
  grain: grainPass,
});
