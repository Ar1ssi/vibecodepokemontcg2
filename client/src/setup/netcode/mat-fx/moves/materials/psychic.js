// Design 063: the psychic material (recipe in the design's § Materials). The elongated unit
// is a *ribbon*: the fire tongue's outline with a calm edge (wobble x 0.3), one unblurred
// semi-transparent fill and a brighter centre line. The round unit is a *lens*: a soft disc
// ringed by three broken concentric strokes (hot, deep, hot) that turn, so the rotation
// reads. A projectile is a lens trailing swaying ribbons. `sigil` (the `glyph` drawer) is
// the psychic wave: three wavy rings rippling out from a lens, standing in for the sprite
// games' full-screen wave pattern while staying on the card. Palette #C85CDB #F0A5FF
// #FFE1FF, deep #5B1E7A. Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, tongueOutline, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const RIBBON_AMP = 0.3;
const RIBBON_ALPHA = 0.45;
const CENTRE_LINE = 0.1;
// Each lens ring: radius (x r), tone, strength, turn direction. Broken arcs so a turn shows.
const LENS_RINGS = Object.freeze([
  [0.45, 'hot', 0.85, 1],
  [0.7, 'deep', 0.6, -1],
  [0.95, 'hot', 0.7, 1],
]);
const LENS_ARC = (290 * Math.PI) / 180;
const LENS_HZ = 0.8;
const RIPPLE_RINGS = 3;
const RIPPLE_CYCLES = 1.5;
const RIPPLE_INNER = 0.35;
const WAVE_LOBES = 8;
const WAVE_AMP = 0.05;
const WAVE_SAMPLES = 48;
const SIGIL_LENS = 0.28;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fract = (v) => v - Math.floor(v);

const palette = Object.freeze({
  deep: Object.freeze([91, 30, 122]),
  body: Object.freeze([200, 92, 219]),
  hot: Object.freeze([240, 165, 255]),
  core: Object.freeze([255, 225, 255]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * The psychic wave's rings at beat progress `s`: `RIPPLE_RINGS` rings born at 0.35 r and
 * rippling out to r, a third of a cycle apart, each fading in and out over its own cycle;
 * neighbours turn in opposite directions. `phase` (radians) turns the ring's wave pattern.
 * @returns {{radius: number, alpha: number, phase: number, tone: 'hot'|'body'}[]}
 */
export function rippleRings(s, r) {
  const c = clamp01(s);
  const rings = [];
  for (let i = 0; i < RIPPLE_RINGS; i += 1) {
    const u = fract(c * RIPPLE_CYCLES + i / RIPPLE_RINGS);
    rings.push({
      radius: r * (RIPPLE_INNER + (1 - RIPPLE_INNER) * u),
      alpha: Math.sin(Math.PI * u),
      phase: (i % 2 ? -1 : 1) * c * TAU * 0.6 + i * 1.3,
      tone: i % 2 ? 'body' : 'hot',
    });
  }
  return rings;
}

/**
 * A closed wavy ring around (x, y): the circle of `radius` with its radius modulated by
 * `amp` x sin(lobes x angle + phase). The last point repeats the first.
 * @returns {number[][]}
 */
export function wavyRing(x, y, radius, phase, lobes = WAVE_LOBES, amp = WAVE_AMP, samples = WAVE_SAMPLES) {
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const a = (i / samples) * TAU;
    const rr = radius * (1 + amp * Math.sin(lobes * a + phase));
    points.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return points;
}

/** Soft psychic haze: pale core through lilac to clear. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.core, alpha * 0.6));
  g.addColorStop(0.45, rgbCss(palette.hot, alpha * 0.4));
  g.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** The lens: a soft disc, then three broken rings turned `phase` radians (alternating). */
function lens(ctx, x, y, r, alpha, hot, phase) {
  sphere(
    ctx,
    x,
    y,
    r,
    [
      [0, palette.white, alpha * 0.9 * clamp01(hot)],
      [0.3, palette.core, alpha * 0.8],
      [0.65, palette.hot, alpha * 0.45],
      [1, palette.body, 0],
    ],
    0
  );
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, r * 0.07);
  for (const [scale, tone, strength, turn] of LENS_RINGS) {
    const start = phase * turn + scale * 2.1;
    ctx.strokeStyle = rgbCss(palette[tone], strength * alpha);
    ctx.beginPath();
    ctx.arc(x, y, r * scale, start, start + LENS_ARC);
    ctx.stroke();
  }
}

// The interface's `body` carries no clock, so a lens turns with where it is and how big it
// has grown (it turns as it swells or travels, and holds still at rest), as aura's ki does.
/** A lens of radius `r`; `hot` whitens its centre. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  lens(ctx, x, y, r, alpha, hot, x * 0.02 + y * 0.03 + r * 0.15);
}

/** A ribbon: calm-edged tongue, one translucent fill, a bright centre line (`hot` 0 drops it). */
function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const outline = tongueOutline({ ...spec, amp: RIBBON_AMP }, 1);
  ctx.fillStyle = rgbCss(palette.body, RIBBON_ALPHA * alpha);
  traceOutline(ctx, outline);
  ctx.fill();
  const line = 0.85 * alpha * clamp01(hot);
  if (!(line > 0)) return;
  ctx.strokeStyle = rgbCss(palette.core, line);
  ctx.lineWidth = Math.max(1, spec.width * CENTRE_LINE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  outline.left.forEach(([lx, ly], i) => {
    const [rx, ry] = outline.right[i];
    const mx = (lx + rx) / 2;
    const my = (ly + ry) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  });
  ctx.stroke();
}

/**
 * A lens in flight along `headingDeg`: a lilac haze, `tongues` ribbons streaming behind it
 * and swaying out of step (so two read as interleaved), and the lens turning on the scene
 * clock. 0 tongues = a bare lens.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  glow(ctx, x, y, r * 2.2, 0.4 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -18 + (36 * k) / (tongues - 1) : 0;
    const sway = 8 * Math.sin(time * 3 + k * 2.1 + seed);
    const length = r * (2 + 0.6 * Math.abs(Math.sin(seed * 1.7 + k * 2.3)));
    tongue(
      ctx,
      { x, y, angleDeg: back + spread + sway, length, width: r * 0.7, time, seed: seed + k * 2.1 },
      { alpha: alpha * 0.75, hot: hot * 0.8 }
    );
  }
  lens(ctx, x, y, r, alpha, hot, time * TAU * LENS_HZ + seed);
}

/** The psychic wave over (x, y) as the glyph beat runs: rippling wavy rings round a lens. */
function sigil(ctx, x, y, r, s) {
  if (!(r > 0)) return;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.04);
  for (const ring of rippleRings(s, r)) {
    if (!(ring.alpha > 0)) continue;
    ctx.strokeStyle = rgbCss(palette[ring.tone], 0.8 * ring.alpha);
    ctx.beginPath();
    wavyRing(x, y, ring.radius, ring.phase).forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  }
  lens(ctx, x, y, r * SIGIL_LENS, 0.9, 1, clamp01(s) * TAU);
}

export const psychic = Object.freeze({
  key: 'psychic',
  palette,
  // The sprite games' near-black violet, kept local to a card.
  shade: Object.freeze([42, 24, 64]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--mote', color: rgbCss(palette.hot), aspect: 1 }),
  glow,
  body,
  tongue,
  projectile,
  sigil,
  grain: grainPass,
});
