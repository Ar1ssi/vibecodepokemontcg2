// Design 063: the fighting materials (recipe in the design's § Materials). Fighting has no
// elongated element: its tongue is a *shock streak*, a short straight spindle thrown in fans
// at contact (one blurred body fill, a crisp mid, a white centre); its round unit is an
// *impact disc*, a hot disc ringed by three concentric strokes. The weight of a fighting move
// is in the card motion, not the material. Palette #D9643A #F2A66B #FFE6C2, deep #8C3A1F.
//
// `aura` is the same streak in the recipe's blue-white (#7FB7FF #E6F2FF) for the three ki
// specials (Vacuum Wave, Aura Sphere, Focus Blast), so each of those plays one palette from
// charge to payoff; its round unit is the ki sphere: a white core in a blue rim with a
// swirling inner ring. `fighting.sigil` is the barrage of impact stamps the `glyph` drawer
// lays over a defender (Close Combat). Every call draws on the context it is handed and is
// otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere } from './_shared.js';

const TAU = Math.PI * 2;
const STREAK_BLUR = 0.08;
const STREAK_MID = 0.55;
const STREAK_CENTRE = 0.22;
const STREAK_SHOULDER = 0.3;
const DISC_RINGS = Object.freeze([
  [0.55, 'hot', 0.8],
  [0.8, 'body', 0.6],
  [1.05, 'deep', 0.4],
]);
const SWIRL_RADIUS = 0.62;
const SWIRL_SPAN = (200 * Math.PI) / 180;
const SWIRL_HZ = 1.6;
const BARRAGE_STAMPS = 8;
const STAMP_FIRST = 0.15;
const STAMP_LAST = 0.62;
const STAMP_LIFE = 0.18;
const GOLDEN_ANGLE = 2.399963;

const freezeAll = (palette) => Object.freeze(Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, Object.freeze(v)])));

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const fract = (v) => v - Math.floor(v);

const fightingPalette = freezeAll({
  deep: [140, 58, 31],
  body: [217, 100, 58],
  hot: [242, 166, 107],
  core: [255, 230, 194],
  white: [255, 255, 255],
});

const auraPalette = freezeAll({
  deep: [47, 95, 184],
  body: [127, 183, 255],
  hot: [184, 216, 255],
  core: [230, 242, 255],
  white: [255, 255, 255],
});

/**
 * One shock streak from its base (x, y) along `angleDeg`: a straight spindle, pointed at
 * both ends and widest at 30 % of its length. `scale` narrows it about its centre line and
 * pulls the tip in a little, for the inner passes. No wobble: a shock line is rigid.
 * @returns {number[][]} the four corners: base, left shoulder, tip, right shoulder
 */
export function streakOutline({ x, y, angleDeg, length, width }, scale = 1) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const len = length * (0.8 + 0.2 * scale);
  const half = width * 0.5 * scale;
  const sx = x + ux * len * STREAK_SHOULDER;
  const sy = y + uy * len * STREAK_SHOULDER;
  return [
    [x, y],
    [sx - uy * half, sy + ux * half],
    [x + ux * len, y + uy * len],
    [sx + uy * half, sy - ux * half],
  ];
}

const tracePolygon = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
};

/**
 * The barrage the fighting sigil lays over a defender as the glyph beat runs (`s` 0-1):
 * `count` impact stamps landing one after another at jittered offsets within 0.42 r of the
 * centre (golden-angle spiral, so no two land on the same spot), each popping in and fading
 * over 18 % of the beat; they cool from white-hot to orange and the last lands biggest.
 * @returns {{dx: number, dy: number, r: number, alpha: number, hot: number}[]}
 */
export function barrageStamps(s, r, count = BARRAGE_STAMPS) {
  const c = clamp01(s);
  const stamps = [];
  for (let i = 0; i < count; i += 1) {
    const order = count > 1 ? i / (count - 1) : 1;
    const local = (c - (STAMP_FIRST + (STAMP_LAST - STAMP_FIRST) * order)) / STAMP_LIFE;
    if (!(local >= 0 && local < 1)) continue;
    const angle = i * GOLDEN_ANGLE;
    const reach = r * 0.42 * (0.35 + 0.65 * fract(i * 0.618));
    const size = i === count - 1 ? 0.5 : 0.34;
    stamps.push({
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach,
      r: r * size * (0.7 + 0.3 * easeOutCubic(local)),
      alpha: (1 - local) ** 1.3,
      hot: 1 - 0.6 * order,
    });
  }
  return stamps;
}

function makeGlow(palette) {
  /** A soft halo: pale core through the hot tone to the body colour, then clear. */
  return function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.core, alpha * 0.6));
    g.addColorStop(0.4, rgbCss(palette.hot, alpha * 0.4));
    g.addColorStop(0.75, rgbCss(palette.body, alpha * 0.18));
    g.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
}

function makeTongue(palette) {
  /** A shock streak: blurred body, crisp hot mid, white centre (`hot` 0 drops the centre). */
  return function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    ctx.filter = `blur(${Math.max(1, spec.width * STREAK_BLUR).toFixed(1)}px)`;
    ctx.fillStyle = rgbCss(palette.body, 0.55 * alpha);
    tracePolygon(ctx, streakOutline(spec, 1));
    ctx.fill();
    ctx.filter = 'none';
    ctx.fillStyle = rgbCss(palette.hot, 0.85 * alpha);
    tracePolygon(ctx, streakOutline(spec, STREAK_MID));
    ctx.fill();
    const centre = 0.9 * alpha * clamp01(hot);
    if (centre > 0) {
      ctx.fillStyle = rgbCss(palette.white, centre);
      tracePolygon(ctx, streakOutline(spec, STREAK_CENTRE));
      ctx.fill();
    }
  };
}

// Kept narrow, thin and dim: a wide bright fan behind a sphere reads as a sunburst.
/** `tongues` shock streaks fanned ±14° behind a body travelling along `headingDeg`. */
function trailStreaks(tongue, ctx, { x, y, r, headingDeg, time, seed, alpha, tongues, hot }) {
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -14 + (28 * k) / (tongues - 1) : 0;
    const len = r * (1.3 + 0.5 * Math.abs(Math.sin(seed * 2.3 + k * 1.7)));
    tongue(
      ctx,
      { x, y, angleDeg: back + spread, length: len, width: r * 0.32, time, seed: seed + k * 2.1 },
      { alpha: alpha * 0.6, hot: hot * 0.35 }
    );
  }
}

// ---- fighting --------------------------------------------------------------------

/** An impact disc: a white-hot disc ringed by three concentric strokes (hot, body, deep). */
function impactDisc(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  const p = fightingPalette;
  sphere(
    ctx,
    x,
    y,
    r,
    [
      [0, p.white, alpha * clamp01(hot)],
      [0.35, p.core, alpha * 0.9],
      [0.7, p.hot, alpha * 0.6],
      [1, p.body, 0],
    ],
    0
  );
  ctx.lineWidth = Math.max(1, r * 0.07);
  for (const [scale, tone, strength] of DISC_RINGS) {
    ctx.strokeStyle = rgbCss(p[tone], strength * alpha);
    ctx.beginPath();
    ctx.arc(x, y, r * scale, 0, TAU);
    ctx.stroke();
  }
}

const fightingGlow = makeGlow(fightingPalette);
const fightingTongue = makeTongue(fightingPalette);

/** An impact disc in flight with shock streaks streaming behind it (0 tongues = a bare disc). */
function fightingProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  fightingGlow(ctx, x, y, r * 2, 0.35 * alpha);
  trailStreaks(fightingTongue, ctx, { x, y, r, headingDeg, time, seed, alpha, tongues, hot });
  impactDisc(ctx, x, y, r, alpha, hot);
}

/** The Close Combat barrage: impact stamps landing over (x, y) as the glyph beat runs. */
function barrageSigil(ctx, x, y, r, s) {
  for (const stamp of barrageStamps(s, r)) impactDisc(ctx, x + stamp.dx, y + stamp.dy, stamp.r, stamp.alpha, stamp.hot);
}

export const fighting = Object.freeze({
  key: 'fighting',
  palette: fightingPalette,
  // A dark umber: the strike reads against it without tinting the board.
  shade: Object.freeze([36, 16, 10]),
  smoke: Object.freeze([150, 130, 110]),
  particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(fightingPalette.white), aspect: 0.25 }),
  glow: fightingGlow,
  body: impactDisc,
  tongue: fightingTongue,
  projectile: fightingProjectile,
  sigil: barrageSigil,
  grain: grainPass,
});

// ---- aura (the ki specials) ------------------------------------------------------

/** Two arcs swirling inside a ki sphere, turned `phase` radians. */
function swirl(ctx, x, y, r, alpha, phase) {
  const p = auraPalette;
  const ring = r * SWIRL_RADIUS;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = rgbCss(p.body, 0.75 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, ring, phase, phase + SWIRL_SPAN);
  ctx.stroke();
  ctx.strokeStyle = rgbCss(p.hot, 0.6 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, ring * 0.8, phase + Math.PI, phase + Math.PI + SWIRL_SPAN * 0.8);
  ctx.stroke();
}

/** The ki sphere: white core, pale blue, the blue rim fading out, a swirl inside. */
function kiSphere(ctx, x, y, r, alpha, hot, phase) {
  const p = auraPalette;
  sphere(ctx, x, y, r, [
    [0, p.white, alpha * (0.6 + 0.4 * clamp01(hot))],
    [0.4, p.core, alpha * 0.95],
    [0.75, p.body, alpha * 0.7],
    [1, p.deep, 0],
  ]);
  swirl(ctx, x, y, r, alpha, phase);
}

// The interface's `body` carries no clock, so a charging sphere's swirl turns with where it
// is and how big it has grown: it spins as it swells, and holds still once it rests.
/** A ki sphere of radius `r`; `hot` whitens its core. */
function auraBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  kiSphere(ctx, x, y, r, alpha, hot, x * 0.02 + y * 0.03 + r * 0.15);
}

const auraGlow = makeGlow(auraPalette);
const auraTongue = makeTongue(auraPalette);

/** A ki sphere in flight: a blue halo, streaks behind it, its swirl turning on the scene clock. */
function auraProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  auraGlow(ctx, x, y, r * 2.2, 0.4 * alpha);
  trailStreaks(auraTongue, ctx, { x, y, r, headingDeg, time, seed, alpha, tongues, hot });
  kiSphere(ctx, x, y, r, alpha, hot, time * TAU * SWIRL_HZ + seed);
}

export const aura = Object.freeze({
  key: 'aura',
  palette: auraPalette,
  // A deep navy: the sprite games' dark backdrop, kept local to the struck card.
  shade: Object.freeze([8, 18, 52]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(auraPalette.hot), aspect: 0.25 }),
  glow: auraGlow,
  body: auraBody,
  tongue: auraTongue,
  projectile: auraProjectile,
  grain: grainPass,
});
