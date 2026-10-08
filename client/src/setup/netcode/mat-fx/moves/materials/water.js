// Design 063: the water material (recipe in the design's § Materials). A drop is a
// translucent sphere with a specular dot up-left and a darker rim; the elongated unit is a
// *sheet*: the fire tongue's outline with a calm edge (wobble x 0.4), one unblurred fill,
// a white line along its leading edge and a few droplets shed off the tip. Palette is the
// B2W2 water sheets': #2E7CE6 #52B4FF #B9E8FF #FFFFFF. Every call draws on the context it
// is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, tongueOutline, traceOutline, wobble } from './_shared.js';

const TAU = Math.PI * 2;
const SHEET_AMP = 0.4;
const EDGE_PX = 1.5;
const PROJECTILE_SHEETS = 5;
const PROJECTILE_DROPLETS = 8;

const palette = Object.freeze({
  deep: Object.freeze([46, 124, 230]),
  body: Object.freeze([82, 180, 255]),
  hot: Object.freeze([185, 232, 255]),
  core: Object.freeze([228, 247, 255]),
  white: Object.freeze([255, 255, 255]),
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Soft spray: pale core fading through cyan to clear (mist, halos, splash puffs). */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.core, alpha * 0.7));
  g.addColorStop(0.45, rgbCss(palette.hot, alpha * 0.45));
  g.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A droplet: translucent sphere lit from 30 % up-left, a deep rim, a white specular dot. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  sphere(
    ctx,
    x,
    y,
    r,
    [
      [0, palette.core, alpha * 0.85],
      [0.55, palette.hot, alpha * 0.6],
      [0.85, palette.body, alpha * 0.55],
      [1, palette.deep, alpha * 0.35],
    ],
    0.3
  );
  const rim = Math.min(2, Math.max(0.75, r * 0.12));
  ctx.strokeStyle = rgbCss(palette.deep, 0.5 * alpha);
  ctx.lineWidth = rim;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r - rim / 2, rim / 2), 0, TAU);
  ctx.stroke();
  const shine = clamp01(hot);
  if (shine > 0) {
    ctx.fillStyle = rgbCss(palette.white, 0.9 * alpha * shine);
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.18, 0, TAU);
    ctx.fill();
  }
}

/** Small round drops in one path, one fill: `drops` = [[x, y, r]...]. */
function fillDrops(ctx, drops, alpha) {
  if (drops.length === 0 || !(alpha > 0)) return;
  ctx.fillStyle = rgbCss(palette.hot, alpha);
  ctx.beginPath();
  for (const [x, y, r] of drops) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
}

/** 3-5 drops flung just past a sheet's tip, scattered across its axis. */
function shedDrops({ tip, angleDeg, length, width, time, seed }) {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const count = 3 + (Math.floor(Math.abs(seed) * 7) % 3);
  const radius = Math.max(1, Math.min(width * 0.35, length * 0.06));
  const drops = [];
  for (let k = 0; k < count; k += 1) {
    const ahead = width * (0.25 + 0.35 * k) + radius;
    const side = width * 0.3 * Math.sin(seed * 2.3 + k * 1.7 + time * 3);
    drops.push([tip[0] + ux * ahead - uy * side, tip[1] + uy * ahead + ux * side, radius * (1 - 0.15 * k)]);
  }
  return drops;
}

/** A water sheet: calm-edged tongue, one fill, a white leading edge, drops off the tip. */
function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const sheet = { ...spec, amp: SHEET_AMP };
  const outline = tongueOutline(sheet, 1);
  ctx.fillStyle = rgbCss(palette.body, 0.55 * alpha);
  traceOutline(ctx, outline);
  ctx.fill();
  const edge = 0.85 * alpha * clamp01(hot);
  if (edge > 0) {
    ctx.strokeStyle = rgbCss(palette.white, edge);
    ctx.lineWidth = EDGE_PX;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    outline.left.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }
  const tip = outline.left[outline.left.length - 1];
  fillDrops(ctx, shedDrops({ ...sheet, tip }), 0.8 * alpha);
}

/**
 * A water projectile travelling along `headingDeg`: a spray halo, sheets streaming behind
 * it, the bulging droplet head, and drops thrown off its flanks. `tongues` sets the sheets
 * (0 = a clean drop or bubble); the thrown drops scale with it.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = PROJECTILE_SHEETS, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  glow(ctx, x, y, r * 2, 0.3 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -32 + (64 * k) / (tongues - 1) : 0;
    const jitter = 5 * wobble(k * 0.37, time, seed + k);
    const len = r * (1.6 + 0.8 * Math.abs(Math.sin(seed * 3.1 + k * 1.9)) * (1 - Math.abs(spread) / 45));
    tongue(
      ctx,
      { x, y, angleDeg: back + spread + jitter, length: len, width: r * 0.85, time, seed: seed + k * 2.1 },
      { alpha: alpha * 0.85, hot: hot * 0.7 }
    );
  }
  body(ctx, x, y, r, alpha, hot);
  const count = Math.round(PROJECTILE_DROPLETS * Math.min(1, tongues / PROJECTILE_SHEETS));
  const drops = [];
  for (let k = 0; k < count; k += 1) {
    const a = ((back + (k / Math.max(1, count - 1) - 0.5) * 150) * Math.PI) / 180 + 0.3 * Math.sin(time * 2 + k);
    const d = r * (1.2 + 0.8 * Math.abs(Math.sin(seed * 1.3 + k * 2.7)));
    drops.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.1]);
  }
  fillDrops(ctx, drops, 0.85 * alpha);
}

export const water = Object.freeze({
  key: 'water',
  palette,
  shade: Object.freeze([8, 30, 74]),
  smoke: Object.freeze([190, 215, 235]),
  particle: Object.freeze({ className: 'fx-particle--droplet', color: rgbCss(palette.hot), aspect: 1 }),
  glow,
  body,
  tongue,
  projectile,
  grain: grainPass,
});
