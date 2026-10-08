// Design 063: the ground material (recipe in the design's § Materials) and its wet twin, mud.
// Earth is solid matter, not light: the clods, spikes and chips draw with `source-over` inside
// their own save/restore (as poison's rims and dark's shadows do) so they cover the board; only
// the lit edges, the dust and the fissure's glow stay on the caller's additive pass.
//   ground — the round unit is a *clod*: a seven-cornered lump, flat-shaded with a darker
//     bottom half. The elongated unit is a *spike* of earth: straight edges from a wide base to
//     a jagged top, a shaded facet on one side and a lit edge on the other; `jag` makes it a
//     thrown chip. A projectile is a tumbling clod trailing dust. `sigil` (the `glyph` drawer)
//     is the ground splitting under a card: a glowing pool with jagged seams (Earth Power).
//     Palette #B5793C #D9A066 #F0D9B5, deep #5C3A17; grain 0.2.
//   mud — the same browns one step darker and wet (Mud-Slap, Mud Shot, Mud Bomb, and Sand
//     Tomb's sand, which the grain pass breaks into grains): a glossy glob, a stream with a lit
//     centre and a sheen, a glob trailing drips.
// Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, tongueOutline, traceOutline } from './_shared.js';
import { streamGlobs } from './poison.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** A stable pseudo-random value in [0, 1) for (seed, index). */
const hash = (seed, index) => {
  const v = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const CLOD_CORNERS = 7;
const SPIKE_SHOULDER = 0.68;
const FACET_ALPHA = 0.55;
const EDGE_ALPHA = 0.8;
const SEAMS = 6;
const SEAM_JOINTS = 4;
const SEAM_GROW = 0.35;
const POOL_DROP = 0.32;
const POOL_SQUASH = 0.42;

const palette = Object.freeze({
  deep: Object.freeze([92, 58, 23]),
  body: Object.freeze([181, 121, 60]),
  hot: Object.freeze([217, 160, 102]),
  core: Object.freeze([240, 217, 181]),
  white: Object.freeze([255, 255, 255]),
});

const MUD_PALETTE = Object.freeze({
  deep: Object.freeze([72, 46, 20]),
  body: Object.freeze([138, 96, 52]),
  hot: Object.freeze([181, 121, 60]),
  core: Object.freeze([217, 160, 102]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * A clod's outline about (x, y): seven corners, each at r * (0.8 + 0.4 h) for a seeded h,
 * spaced round the circle with a seeded nudge and turned by `spin` radians.
 * @returns {number[][]}
 */
export function clodOutline(x, y, r, seed = 0, spin = 0) {
  const points = [];
  for (let i = 0; i < CLOD_CORNERS; i += 1) {
    const theta = spin + ((i + 0.5 * (hash(seed, i) - 0.5)) / CLOD_CORNERS) * TAU;
    const radius = r * (0.8 + 0.4 * hash(seed, i + 11));
    points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius]);
  }
  return points;
}

/**
 * A spike of earth from its base (x, y) along `angleDeg`: straight edges from a base `width`
 * wide to the shoulders at 68 %, then a jagged top (a notch and a tooth a side, seeded) up to
 * a tip that leans a little off the axis. Both chains run base to tip, as `traceOutline` takes.
 * @returns {{left: number[][], right: number[][]}}
 */
export function spikeOutline({ x, y, angleDeg, length, width, seed = 0 }) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const at = (f, side) => [x + ux * length * f + nx * width * side, y + uy * length * f + ny * width * side];
  const lean = (hash(seed, 1) - 0.5) * 0.16;
  const tooth = (k) => 0.12 + 0.08 * hash(seed, k);
  const tip = at(1, lean);
  return {
    left: [at(0, 0.5), at(SPIKE_SHOULDER, 0.24), at(0.8, 0.07), at(0.88, tooth(2)), tip],
    right: [at(0, -0.5), at(SPIKE_SHOULDER, -0.26), at(0.78, -0.1), at(0.9, -tooth(3)), tip],
  };
}

/**
 * The seams of the ground splitting at sigil progress `s` around a pool of radius `r`:
 * `SEAMS` jagged polylines (offsets from the pool centre, screen y squashed to the floor)
 * growing out over the first 35 %; `spread` is that growth (0 -> 1).
 * @returns {{spread: number, seams: number[][][]}}
 */
export function fissureSeams(s, r) {
  const spread = easeOutCubic(clamp01(clamp01(s) / SEAM_GROW));
  if (!(spread > 0) || !(r > 0)) return { spread: 0, seams: [] };
  const seams = [];
  for (let i = 0; i < SEAMS; i += 1) {
    const angle = ((i + 0.6 * (hash(5, i) - 0.5)) / SEAMS) * TAU;
    const reach = r * (0.6 + 0.4 * hash(9, i)) * spread;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const line = [];
    for (let j = 0; j <= SEAM_JOINTS; j += 1) {
      const d = (j / SEAM_JOINTS) * reach;
      const jag = j === 0 ? 0 : (hash(13 + i, j) - 0.5) * 0.16 * r * spread;
      line.push([ca * d - sa * jag, (sa * d + ca * jag) * POOL_SQUASH]);
    }
    seams.push(line);
  }
  return { spread, seams };
}

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

const strokeLine = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
};

/** A soft halo of lit dust: hot -> body -> 0 (additive). */
const haloOf = (pal) =>
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(pal.hot, alpha * 0.45));
    g.addColorStop(0.5, rgbCss(pal.body, alpha * 0.25));
    g.addColorStop(1, rgbCss(pal.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };

/** Dust puffs trailing behind a flying unit along `headingDeg`, one fill each (additive). */
const dustTrail = (ctx, pal, { x, y, r, headingDeg, time, seed, alpha, count }) => {
  const back = rad(headingDeg + 180);
  for (let k = 0; k < count; k += 1) {
    const d = r * (0.9 + 0.75 * k);
    const sway = r * 0.2 * Math.sin(time * 4 + seed + k * 1.9);
    const px = x + Math.cos(back) * d - Math.sin(back) * sway;
    const py = y + Math.sin(back) * d + Math.cos(back) * sway;
    const pr = r * (0.55 + 0.18 * k);
    const a = 0.4 * alpha * (1 - k / (count + 1));
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, rgbCss(pal.body, a));
    g.addColorStop(1, rgbCss(pal.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
  }
};

// ---- ground ------------------------------------------------------------------------

/**
 * One clod: the lump flat-shaded (body above, deep below, a hard terminator through the
 * centre, so the light stays overhead however it tumbles), then a lit chip up-left when hot.
 */
function clod(ctx, x, y, r, alpha, hot, seed, spin) {
  inShadow(ctx, () => {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, rgbCss(palette.body, alpha));
    g.addColorStop(0.5, rgbCss(palette.body, alpha));
    g.addColorStop(0.5, rgbCss(palette.deep, alpha));
    g.addColorStop(1, rgbCss(palette.deep, alpha));
    ctx.fillStyle = g;
    tracePoints(ctx, clodOutline(x, y, r, seed, spin));
    ctx.fill();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0)) return;
  ctx.fillStyle = rgbCss(palette.core, 0.5 * lit);
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.32, r * 0.16, 0, TAU);
  ctx.fill();
}

// The interface's `body` carries no seed, so every lone clod has the one stable shape (a
// position-derived seed would boil the outline as the clod moves).
/** A clod of radius `r`; `hot` lights its chip. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  clod(ctx, x, y, r, alpha, hot, 0, 0);
}

/**
 * A spike of earth (or with `jag`, a thrown chip): the solid fill, the shaded facet on its
 * right side, then a lit edge down its left side (dropped at `hot` 0).
 */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const outline = jag ? shardOutline(spec) : spikeOutline(spec);
  const tip = outline.left.at(-1);
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(palette.body, 0.95 * alpha);
    traceOutline(ctx, outline);
    ctx.fill();
    ctx.fillStyle = rgbCss(palette.deep, FACET_ALPHA * alpha);
    traceOutline(ctx, { left: [[spec.x, spec.y], tip], right: outline.right });
    ctx.fill();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0)) return;
  ctx.strokeStyle = rgbCss(palette.hot, EDGE_ALPHA * lit);
  ctx.lineWidth = Math.max(1, spec.width * 0.06);
  ctx.lineJoin = 'round';
  strokeLine(ctx, outline.left);
}

/** A clod tumbling along `headingDeg` with the scene clock, trailing `tongues` dust puffs. */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  dustTrail(ctx, palette, { x, y, r, headingDeg, time, seed, alpha, count: tongues });
  clod(ctx, x, y, r, alpha, hot, seed, time * 5 + seed);
}

/**
 * The ground splitting under a card at glyph progress `s`: a glowing pool low on the card and
 * jagged seams growing out of it, the glow breathing at 3 beats over the sigil.
 */
function sigil(ctx, x, y, r, s) {
  const { spread, seams } = fissureSeams(s, r);
  if (!(spread > 0)) return;
  const px = x;
  const py = y + r * POOL_DROP;
  const rx = r * 0.85 * spread;
  const pulse = 0.75 + 0.25 * Math.sin(clamp01(s) * TAU * 3);
  const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
  g.addColorStop(0, rgbCss(palette.core, 0.55 * pulse));
  g.addColorStop(0.45, rgbCss(palette.hot, 0.35 * pulse));
  g.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(px, py, rx, rx * POOL_SQUASH, 0, 0, TAU);
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    [palette.hot, 0.7, 0.05],
    [palette.core, 0.6 * pulse, 0.02],
  ];
  for (const [rgb, a, w] of passes) {
    ctx.strokeStyle = rgbCss(rgb, a);
    ctx.lineWidth = Math.max(1, r * w);
    ctx.beginPath();
    for (const line of seams) {
      line.forEach(([dx, dy], i) => (i === 0 ? ctx.moveTo(px + dx, py + dy) : ctx.lineTo(px + dx, py + dy)));
    }
    ctx.stroke();
  }
}

export const ground = Object.freeze({
  key: 'ground',
  palette,
  // The vignette's tint: an umber-black kept local to a card.
  shade: Object.freeze([38, 22, 8]),
  // Dust (the recipe's "smoke = dust", fighting's dust tone).
  smoke: Object.freeze([150, 130, 110]),
  particle: Object.freeze({ className: 'fx-particle--shard', color: rgbCss(palette.hot), aspect: 0.6 }),
  glow: haloOf(palette),
  body,
  tongue,
  projectile,
  sigil,
  grain: grainPass,
});

// ---- mud ---------------------------------------------------------------------------

/** A wet glob: a glossy sphere (hot up-left through body to deep) and a sheen dot when hot. */
function mudGlob(ctx, x, y, r, alpha, hot) {
  inShadow(ctx, () => {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, rgbCss(MUD_PALETTE.hot, alpha));
    g.addColorStop(0.55, rgbCss(MUD_PALETTE.body, alpha));
    g.addColorStop(1, rgbCss(MUD_PALETTE.deep, alpha));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0)) return;
  ctx.fillStyle = rgbCss(MUD_PALETTE.core, 0.7 * lit);
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU);
  ctx.fill();
}

function mudBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  mudGlob(ctx, x, y, r, alpha, hot);
}

/**
 * A stream of mud: a dark smooth band (wobble x 0.4) with globs riding it, shrinking toward
 * the tip (poison's stream geometry), and a wet glint on each glob (dropped at `hot` 0). Globs,
 * not a smooth streak: a fan of smooth streaks off a hit reads as rays of light. `jag` makes
 * it a chunk: two straight-edged fills.
 */
function mudTongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  if (jag) {
    inShadow(ctx, () => {
      ctx.fillStyle = rgbCss(MUD_PALETTE.deep, 0.9 * alpha);
      traceOutline(ctx, shardOutline(spec));
      ctx.fill();
      ctx.fillStyle = rgbCss(MUD_PALETTE.body, 0.9 * alpha);
      traceOutline(ctx, shardOutline({ ...spec, width: spec.width * 0.5 }));
      ctx.fill();
    });
    return;
  }
  const globs = streamGlobs(spec);
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(MUD_PALETTE.deep, 0.6 * alpha);
    traceOutline(ctx, tongueOutline({ ...spec, amp: 0.4 }, 0.7));
    ctx.fill();
    ctx.fillStyle = rgbCss(MUD_PALETTE.body, 0.95 * alpha);
    ctx.beginPath();
    for (const g of globs) addCircle(ctx, g.x, g.y, g.r);
    ctx.fill();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0)) return;
  ctx.fillStyle = rgbCss(MUD_PALETTE.core, 0.7 * lit);
  ctx.beginPath();
  for (const g of globs) addCircle(ctx, g.x - g.r * 0.3, g.y - g.r * 0.3, g.r * 0.28);
  ctx.fill();
}

/** A glob of mud along `headingDeg` trailing `tongues` drips (one covering fill), quivering. */
function mudProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  if (tongues > 0) {
    const back = rad(headingDeg + 180);
    inShadow(ctx, () => {
      ctx.fillStyle = rgbCss(MUD_PALETTE.body, 0.9 * alpha);
      ctx.beginPath();
      for (let k = 0; k < tongues; k += 1) {
        const d = r * (1.1 + 0.7 * k);
        const sway = r * 0.22 * Math.sin(time * 5 + seed + k * 2.1);
        const dr = r * Math.max(0.14, 0.45 - 0.1 * k);
        const dx = x + Math.cos(back) * d - Math.sin(back) * sway;
        const dy = y + Math.sin(back) * d + Math.cos(back) * sway;
        ctx.moveTo(dx + dr, dy);
        ctx.arc(dx, dy, dr, 0, TAU);
      }
      ctx.fill();
    });
  }
  const squish = 1 + 0.06 * Math.sin(time * 9 + seed);
  mudGlob(ctx, x, y, r * squish, alpha, hot);
}

export const mud = Object.freeze({
  key: 'mud',
  palette: MUD_PALETTE,
  shade: Object.freeze([30, 18, 6]),
  // A grey-brown dust (Mud Bomb's lingering cloud).
  smoke: Object.freeze([128, 108, 88]),
  particle: Object.freeze({ className: 'fx-particle--glob', color: rgbCss(MUD_PALETTE.body), aspect: 1 }),
  glow: haloOf(MUD_PALETTE),
  body: mudBody,
  tongue: mudTongue,
  projectile: mudProjectile,
  grain: grainPass,
});
