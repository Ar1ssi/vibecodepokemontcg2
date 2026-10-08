// Design 063: the poison material (recipe in the design's § Materials). Poison is venom: lit
// violet goo on the caller's additive pass, given its gooey edge by a dark rim that draws with
// `source-over` inside its own save/restore (as dark and ghost draw their shadows). The round
// unit is a *glob*: a sphere whose outline wobbles, ringed just inside its edge in deep, with a
// small drip hanging under it. The elongated unit is a *stream*: a translucent ooze band with
// 5-7 globs riding it, shrinking toward the tip; `jag` makes it a violet barb. A projectile is
// a big glob in a violet haze trailing `tongues` drips. `sigil` (the `glyph` drawer) is the
// sprite games' poisoned foe: a pool of venom on the lower card with hollow bubbles rising out
// of it and popping. Palette #9B4DCA #C77DFF #F0D6FF, deep #4B1E6B; grain 0.15. Every call
// draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, tongueOutline, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutQuad = (t) => 1 - (1 - t) ** 2;

const GLOB_POINTS = 24;
const GLOB_AMP = 0.08;
const RIM_INSET = 0.88;
const RIM_ALPHA = 0.5;
const DRIP_R = 0.26;
const DRIP_DROP = 1.02;
const STREAM_MIN = 5;
const STREAM_MAX = 7;
const STREAM_TAPER = 0.6;
const OOZE_ALPHA = 0.35;
const GLOB_ALPHA = 0.8;
const GLINT_ALPHA = 0.85;
const DRIP_SPACING = 0.8;
const POOL_RISE = 0.25;
const POOL_SQUASH = 0.42;
const POOL_DROP = 0.3;
const BUBBLES = 7;
const BUBBLE_LIFE = 0.4;
const BUBBLE_SPAWN = 0.55;
const BUBBLE_POP = 0.15;
const BUBBLE_RISE = 1.15;

const PALETTE = Object.freeze({
  deep: Object.freeze([75, 30, 107]),
  body: Object.freeze([155, 77, 202]),
  hot: Object.freeze([199, 125, 255]),
  core: Object.freeze([240, 214, 255]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * A closed wobbling circle about (x, y): `GLOB_POINTS` + 1 points (the last repeats the first),
 * each at r * (1 + amp * w(theta)) where w is two periodic sines in [-1, 1] turned by `phase`.
 * @returns {number[][]}
 */
export function globOutline(x, y, r, phase, amp = GLOB_AMP) {
  const points = [];
  for (let i = 0; i <= GLOB_POINTS; i += 1) {
    const theta = ((i % GLOB_POINTS) / GLOB_POINTS) * TAU;
    const w = 0.6 * Math.sin(3 * theta + phase) + 0.4 * Math.sin(5 * theta - 1.3 * phase);
    const radius = r * (1 + amp * w);
    points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius]);
  }
  return points;
}

/**
 * The globs riding one stream: 5-7 of them (more for a longer stream) from its base to near its
 * tip, each `r` shrinking toward the tip and swaying off the axis with the scene clock.
 * @returns {{x: number, y: number, r: number}[]}
 */
export function streamGlobs({ x, y, angleDeg, length, width, time, seed }) {
  if (!(length > 0) || !(width > 0)) return [];
  const count = Math.max(STREAM_MIN, Math.min(STREAM_MAX, Math.round((1.5 * length) / width)));
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const globs = [];
  for (let i = 0; i < count; i += 1) {
    const f = (i + 0.5) / count;
    const sway = width * 0.18 * f * Math.sin(time * 6 + seed + i * 1.7);
    globs.push({
      x: x + ux * length * f - uy * sway,
      y: y + uy * length * f + ux * sway,
      r: width * 0.5 * (1 - STREAM_TAPER * f),
    });
  }
  return globs;
}

/** How far the venom pool has spread at glyph progress `s` (0 -> 1 over the first quarter). */
export function poolSpread(s) {
  return easeOutCubic(clamp01(clamp01(s) / POOL_RISE));
}

/**
 * The bubbles out of a pool of radius `r` at glyph progress `s`: `BUBBLES` bubbles born one
 * after another, each rising up to 1.15 r over its life with a sway, growing, and popping at
 * the end. Offsets are from the pool's centre, up = negative y (screen).
 * @returns {{dx: number, dy: number, radius: number, alpha: number}[]}
 */
export function bubbleRise(s, r) {
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < BUBBLES; i += 1) {
    const born = 0.08 + (BUBBLE_SPAWN * i) / BUBBLES;
    const local = (c - born) / BUBBLE_LIFE;
    if (!(local > 0 && local < 1)) continue;
    const lane = (((i * 0.618) % 1) - 0.5) * 1.4;
    const size = 0.05 + 0.05 * ((i * 0.37) % 1);
    let alpha = 1;
    if (local < BUBBLE_POP) alpha = local / BUBBLE_POP;
    else if (local > 1 - BUBBLE_POP) alpha = (1 - local) / BUBBLE_POP;
    out.push({
      dx: r * (lane * 0.7 + 0.08 * Math.sin(local * TAU * 1.5 + i)),
      dy: -r * (0.1 + BUBBLE_RISE * easeOutQuad(local)),
      radius: r * size * (0.6 + 0.6 * local),
      alpha,
    });
  }
  return out;
}

/** The poison material drawn in `palette` (any palette with the same keys). */
function poisonKit(palette) {
  const tracePoints = (ctx, points) => {
    ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
  };

  /** Adds one circle to the current path as its own sub-path. */
  const addCircle = (ctx, x, y, r) => {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  };

  /** A soft violet halo: body -> deep -> 0 (additive). */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.body, alpha * 0.6));
    g.addColorStop(0.5, rgbCss(palette.deep, alpha * 0.35));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /** The glob's lit fill: lilac up-left through violet to deep at the edge. */
  const globFill = (ctx, x, y, r, alpha) => {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r * 1.1);
    g.addColorStop(0, rgbCss(palette.hot, 0.9 * alpha));
    g.addColorStop(0.55, rgbCss(palette.body, 0.85 * alpha));
    g.addColorStop(1, rgbCss(palette.deep, 0.7 * alpha));
    return g;
  };

  /**
   * One glob turned to `phase`: the wobbling lit sphere, a drip under it (screen-down) when
   * `drip`, the dark rim just inside the edge, and a glint up-left when hot.
   */
  function glob(ctx, x, y, r, alpha, hot, phase, { drip = true } = {}) {
    ctx.fillStyle = globFill(ctx, x, y, r, alpha);
    tracePoints(ctx, globOutline(x, y, r, phase));
    ctx.fill();
    if (drip) {
      const dr = r * DRIP_R;
      const dy = y + r * DRIP_DROP;
      ctx.fillStyle = globFill(ctx, x, dy, dr, alpha);
      ctx.beginPath();
      ctx.arc(x, dy, dr, 0, TAU);
      ctx.fill();
    }
    inShadow(ctx, () => {
      ctx.strokeStyle = rgbCss(palette.deep, RIM_ALPHA * alpha);
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.lineJoin = 'round';
      tracePoints(ctx, globOutline(x, y, r * RIM_INSET, phase));
      ctx.stroke();
    });
    const glint = alpha * clamp01(hot);
    if (!(glint > 0)) return;
    ctx.fillStyle = rgbCss(palette.core, GLINT_ALPHA * glint);
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.18, 0, TAU);
    ctx.fill();
  }

  // The interface's `body` carries no clock, so the wobble turns with where the glob is and how
  // big it has grown (it quivers as it swells or travels), as ghost's shadow ball does.
  /** A glob of radius `r` with a drip under it; `hot` lights its glint. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    glob(ctx, x, y, r, alpha, hot, x * 0.02 + y * 0.03 + r * 0.15);
  }

  /**
   * A stream: a translucent ooze band, the globs riding it in one fill, and their glints in one
   * fill (dropped at `hot` 0). `jag` makes it a barb: a violet spine with a lilac core.
   */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    if (jag) {
      ctx.fillStyle = rgbCss(palette.body, 0.85 * alpha);
      traceOutline(ctx, shardOutline(spec));
      ctx.fill();
      ctx.fillStyle = rgbCss(palette.hot, 0.8 * alpha);
      traceOutline(ctx, shardOutline({ ...spec, width: spec.width * 0.45 }));
      ctx.fill();
      return;
    }
    ctx.fillStyle = rgbCss(palette.body, OOZE_ALPHA * alpha);
    traceOutline(ctx, tongueOutline({ ...spec, amp: 0.5 }, 0.8));
    ctx.fill();
    const globs = streamGlobs(spec);
    ctx.fillStyle = rgbCss(palette.body, GLOB_ALPHA * alpha);
    ctx.beginPath();
    for (const g of globs) addCircle(ctx, g.x, g.y, g.r);
    ctx.fill();
    const lit = alpha * clamp01(hot);
    if (!(lit > 0)) return;
    ctx.fillStyle = rgbCss(palette.core, GLINT_ALPHA * lit);
    ctx.beginPath();
    for (const g of globs) addCircle(ctx, g.x - g.r * 0.3, g.y - g.r * 0.3, g.r * 0.28);
    ctx.fill();
  }

  /**
   * A big glob in flight along `headingDeg`: a violet haze, `tongues` drips trailing behind it
   * (shrinking, swaying out of step) in one fill, and the glob, its outline quivering on the
   * scene clock. 0 tongues = a bare glob.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.75 * alpha);
    if (tongues > 0) {
      const back = rad(headingDeg + 180);
      ctx.fillStyle = rgbCss(palette.body, GLOB_ALPHA * alpha);
      ctx.beginPath();
      for (let k = 0; k < tongues; k += 1) {
        const d = r * (1.15 + DRIP_SPACING * k * 0.9);
        const sway = r * 0.25 * Math.sin(time * 5 + seed + k * 2.1);
        const dr = r * Math.max(0.14, 0.42 - 0.09 * k);
        addCircle(ctx, x + Math.cos(back) * d - Math.sin(back) * sway, y + Math.sin(back) * d + Math.cos(back) * sway, dr);
      }
      ctx.fill();
    }
    glob(ctx, x, y, r, alpha, hot, time * 4 + seed, { drip: false });
  }

  /**
   * The poisoned foe at glyph progress `s`: a pool of venom spreading on the lower card (its
   * outline wobbling, a lilac rim) and hollow bubbles rising out of it and popping.
   */
  function sigil(ctx, x, y, r, s) {
    const spread = poolSpread(s);
    if (!(r > 0) || !(spread > 0)) return;
    const px = x;
    const py = y + r * POOL_DROP;
    const rx = r * spread;
    const outline = globOutline(0, 0, rx, s * 6, 0.1).map(([ox, oy]) => [px + ox, py + oy * POOL_SQUASH]);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
    g.addColorStop(0, rgbCss(palette.hot, 0.5));
    g.addColorStop(0.6, rgbCss(palette.body, 0.45));
    g.addColorStop(1, rgbCss(palette.deep, 0.3));
    ctx.fillStyle = g;
    tracePoints(ctx, outline);
    ctx.fill();
    ctx.strokeStyle = rgbCss(palette.hot, 0.7);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Hollow bubbles: a faint violet inside and a lilac skin, each fading as it pops.
    ctx.lineWidth = Math.max(1, r * 0.025);
    for (const b of bubbleRise(s, r)) {
      ctx.beginPath();
      ctx.arc(px + b.dx, py + b.dy, b.radius, 0, TAU);
      ctx.fillStyle = rgbCss(palette.body, 0.25 * b.alpha);
      ctx.fill();
      ctx.strokeStyle = rgbCss(palette.hot, 0.9 * b.alpha);
      ctx.stroke();
    }
  }

  return Object.freeze({
    key: 'poison',
    palette,
    // The vignette's tint: a violet-black kept local to a card.
    shade: Object.freeze([28, 8, 42]),
    // Toxic fumes (the recipe's [120, 70, 150]).
    smoke: Object.freeze([120, 70, 150]),
    particle: Object.freeze({ className: 'fx-particle--glob', color: rgbCss(palette.hot), aspect: 1 }),
    glow,
    body,
    tongue,
    projectile,
    sigil,
    grain: grainPass,
    withPalette: (p) => poisonKit(p),
  });
}

export const poison = poisonKit(PALETTE);
