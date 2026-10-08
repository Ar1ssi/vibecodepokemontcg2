// Design 063: the electric material (recipe in the design's § Materials). The elongated unit
// is a *jag*: a tapered polygon whose centre line is a polyline with joints thrown off the
// axis, re-rolled 22 times a second from a seeded generator so the arc flickers rather than
// slides. Three passes: a wide pale-blue glow (the one blurred fill), a yellow core at
// 0.45 w and a white centre at 0.15 w. The round unit is a crackling ball: a hot sphere with
// six short jags radiating; a projectile is the ball with jags streaming behind it. Bolts
// (the `bolt` drawer) stroke their polylines through `jagStroke` in the same three passes.
// Palette: #F7D21E #FFF27A #FFFFFF, deep #B98A00, the blue edge #9FD5FF. No grain, no smoke.
// Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { seededRandom } from '../../flow-pose.mjs';
import { grainPass, sphere } from './_shared.js';

const TAU = Math.PI * 2;
const REROLL_HZ = 22;
const BALL_JAGS = 6;
const GLOW_BLUR = 0.1;
const STROKE_BLUR = 0.12;
const CORE_WIDTH = 0.45;
const CENTRE_WIDTH = 0.15;
const BOLT_GLOW = 2.4;
const BOLT_CENTRE = 0.3;

const freezeAll = (palette) => Object.freeze(Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, Object.freeze(v)])));

const palette = freezeAll({
  deep: [185, 138, 0],
  body: [247, 210, 30],
  hot: [255, 242, 122],
  core: [255, 251, 222],
  white: [255, 255, 255],
  edge: [159, 213, 255],
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

/** A generator for one flicker frame: the same (seed, time bucket) always rolls the same jags. */
const flickerRandom = (seed, time) => seededRandom(Math.floor(seed * 1013) + Math.floor(time * REROLL_HZ) * 7919);

/**
 * One jag's centre line from its base (x, y) along `angleDeg`: `segments` joints thrown
 * ±amplitude across the axis (amplitude 0.35-0.7 w as `jag` goes 0-1, never more than
 * 0.18 of the length), both ends on the axis. Each point carries the joint normal (the mean
 * of its two segments') and the half-width, tapering from 0.5 w at the base to 0 at the tip.
 * @returns {{x: number, y: number, nx: number, ny: number, half: number}[]}
 */
export function jagOutline({ x, y, angleDeg, length, width, time, seed }, { jag = 0, segments } = {}) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const count = segments ?? Math.max(3, Math.min(10, Math.round(length / Math.max(width * 0.6, 1))));
  const amplitude = Math.min(width * (0.35 + 0.35 * clamp01(jag)), length * 0.18);
  const rand = flickerRandom(seed, time);
  const centre = [];
  for (let i = 0; i <= count; i += 1) {
    const f = i / count;
    const off = i === 0 || i === count ? 0 : (rand() * 2 - 1) * amplitude;
    centre.push([x + ux * f * length - uy * off, y + uy * f * length + ux * off]);
  }
  const segmentNormal = (i) => {
    const [x0, y0] = centre[i];
    const [x1, y1] = centre[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    return [-(y1 - y0) / d, (x1 - x0) / d];
  };
  return centre.map(([px, py], i) => {
    const before = segmentNormal(Math.max(0, i - 1));
    const after = segmentNormal(Math.min(count - 1, i));
    const mx = before[0] + after[0];
    const my = before[1] + after[1];
    const m = Math.hypot(mx, my) || 1;
    return { x: px, y: py, nx: mx / m, ny: my / m, half: 0.5 * width * (1 - i / count) ** 0.7 };
  });
}

/** Trace a jag outline as a closed polygon, its width scaled by `scale`. */
function traceJag(ctx, points, scale) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = p.x + p.nx * p.half * scale;
    const py = p.y + p.ny * p.half * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const p = points[i];
    ctx.lineTo(p.x - p.nx * p.half * scale, p.y - p.ny * p.half * scale);
  }
  ctx.closePath();
}

/** Static charge in the air: a pale core through yellow to a faint blue fringe. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.hot, alpha * 0.55));
  g.addColorStop(0.4, rgbCss(palette.body, alpha * 0.3));
  g.addColorStop(0.75, rgbCss(palette.edge, alpha * 0.18));
  g.addColorStop(1, rgbCss(palette.edge, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Six short two-kink jags radiating off a ball, all in one path, blue fringe then white. */
function crackle(ctx, x, y, r, alpha, rand) {
  ctx.beginPath();
  const turn = rand() * TAU;
  for (let k = 0; k < BALL_JAGS; k += 1) {
    const a = turn + (k / BALL_JAGS) * TAU + (rand() - 0.5) * 0.6;
    const reach = r * (1.3 + 0.45 * rand());
    const start = r * 0.75;
    ctx.moveTo(x + Math.cos(a) * start, y + Math.sin(a) * start);
    for (const f of [0.45, 1]) {
      const d = start + (reach - start) * f;
      const kink = f < 1 ? (rand() - 0.5) * 0.7 : (rand() - 0.5) * 0.3;
      ctx.lineTo(x + Math.cos(a + kink) * d, y + Math.sin(a + kink) * d);
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbCss(palette.edge, 0.55 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.strokeStyle = rgbCss(palette.white, 0.9 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
}

/** The crackling ball: a white-hot sphere fading through yellow to amber, jags round it. */
function crackleBall(ctx, x, y, r, alpha, hot, rand) {
  sphere(ctx, x, y, r, [
    [0, palette.white, alpha * (0.55 + 0.45 * clamp01(hot))],
    [0.35, palette.hot, alpha * 0.9],
    [0.75, palette.body, alpha * 0.6],
    [1, palette.deep, 0],
  ]);
  crackle(ctx, x, y, r, alpha, rand);
}

// The interface's `body` carries no clock, so its jags are rolled from where the ball is
// and how big it is: a growing or travelling ball crackles, a resting one holds its jags.
/** A crackling ball of radius `r`; `hot` whitens its core. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  crackleBall(ctx, x, y, r, alpha, hot, seededRandom(Math.floor(x / 3) * 92821 + Math.floor(y / 3) * 68917 + Math.floor(r / 2) * 4111));
}

/** One jag from its base along `angleDeg`: blurred blue glow, yellow core, white centre. */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const points = jagOutline(spec, { jag });
  ctx.filter = `blur(${Math.max(1, spec.width * GLOW_BLUR).toFixed(1)}px)`;
  ctx.fillStyle = rgbCss(palette.edge, 0.45 * alpha);
  traceJag(ctx, points, 1);
  ctx.fill();
  ctx.filter = 'none';
  ctx.fillStyle = rgbCss(palette.body, 0.95 * alpha);
  traceJag(ctx, points, CORE_WIDTH);
  ctx.fill();
  const centre = alpha * clamp01(hot);
  if (centre > 0) {
    ctx.fillStyle = rgbCss(palette.white, centre);
    traceJag(ctx, points, CENTRE_WIDTH);
    ctx.fill();
  }
}

/**
 * A spark in flight along `headingDeg`: a halo, `tongues` jags streaming behind it (0 = a
 * bare ball), and the crackling ball itself, re-rolled on the material's flicker clock.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const rand = flickerRandom(seed, time);
  glow(ctx, x, y, r * 2.2, 0.4 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -28 + (56 * k) / (tongues - 1) : 0;
    const jitter = (rand() - 0.5) * 16;
    tongue(
      ctx,
      { x, y, angleDeg: back + spread + jitter, length: r * (1.8 + 0.8 * rand()), width: r * 0.55, time, seed: seed + k * 2.1 },
      { alpha: alpha * 0.85, hot: hot * 0.8, jag: 0.5 }
    );
  }
  crackleBall(ctx, x, y, r, alpha, hot, rand);
}

/**
 * Stroke jagged polylines (`lines` = [[x, y]...][]) as lightning: one blurred pale-blue
 * glow at `width` x 2.4, the saturated yellow core at `width`, a white centre at `width` x 0.3.
 * Under the additive pass the three sum toward white, so the glow stays faint (0.35) and the
 * core is the deep yellow, not the pale one, or the bolt reads as a white ribbon.
 */
function jagStroke(ctx, lines, { width, alpha = 1 }) {
  if (!(width > 0) || !(alpha > 0) || !lines?.length) return;
  const trace = () => {
    ctx.beginPath();
    for (const line of lines) line.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const glowWidth = width * BOLT_GLOW;
  ctx.filter = `blur(${Math.max(1, glowWidth * STROKE_BLUR).toFixed(1)}px)`;
  ctx.strokeStyle = rgbCss(palette.edge, 0.35 * alpha);
  ctx.lineWidth = glowWidth;
  trace();
  ctx.stroke();
  ctx.filter = 'none';
  ctx.strokeStyle = rgbCss(palette.body, 0.95 * alpha);
  ctx.lineWidth = Math.max(1, width);
  ctx.stroke();
  ctx.strokeStyle = rgbCss(palette.white, alpha);
  ctx.lineWidth = Math.max(1, width * BOLT_CENTRE);
  ctx.stroke();
}

export const electric = Object.freeze({
  key: 'electric',
  palette,
  // A storm-slate darkening: the bolts read against it without tinting the board yellow.
  shade: Object.freeze([18, 20, 38]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(palette.hot), aspect: 0.2 }),
  glow,
  body,
  tongue,
  projectile,
  jagStroke,
  grain: grainPass,
});
