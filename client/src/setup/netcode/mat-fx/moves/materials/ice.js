// Design 063: the ice material (recipe in the design's § Materials) and its aurora variant.
//   ice — the elongated unit is a *crystal*: a straight-edged icicle (five corners, no wobble)
//     from a squared base to a sharp tip, its hexagonal cross-section suggested by a lit facet
//     (hot, alpha 0.6) down its left side and a 1 px white edge; `jag` makes it a splinter
//     (`shards`). The round unit is a snowflake: six thin spokes with three V branches each,
//     two stroke passes round a bright centre, turning slowly as it moves. A projectile is a
//     crystal head trailing `tongues` crystals in a faint mist; at 0 tongues it is a snowflake
//     in its mist (orbit charges, snow gusts). Palette #8FD3FF #D6F3FF #FFFFFF, deep #3E8FD1;
//     grain 0.1. No blur.
//   aurora — Aurora Beam's light: the same crystals, but the round unit is a ring of three
//     pastel hues (cyan, mint, lilac) breathing out of phase, so a pulse-train of them reads as
//     the sprite's train of rainbow rings in one soft palette.
// Ice is light on the board: everything is additive (the player's `lighter`).
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, shardOutline, sphere, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const SPOKES = 6;
// Where each spoke branches (fraction of r) and how long the V arms are (fraction of r).
const BRANCHES = Object.freeze([
  [0.38, 0.3],
  [0.6, 0.24],
  [0.8, 0.15],
]);
const BRANCH_DEG = 45;
const SHOULDER = 0.66;
const SHOULDER_WIDTH = 0.82;
const FACET_SPLIT = 0.12;
const CRYSTAL_ALPHA = 0.55;
const FACET_ALPHA = 0.6;
const EDGE_ALPHA = 0.85;
const TRAIL_SIDE = 0.55;
// A flying snowflake turns about two thirds of a turn a second (radians per second of scene clock).
const FLAKE_SPIN = 4;
const AURORA_RINGS = Object.freeze([
  ['body', 1],
  ['mint', 0.8],
  ['lilac', 0.6],
]);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

const palette = Object.freeze({
  deep: Object.freeze([62, 143, 209]),
  body: Object.freeze([143, 211, 255]),
  hot: Object.freeze([214, 243, 255]),
  core: Object.freeze([236, 249, 255]),
  white: Object.freeze([255, 255, 255]),
});

const AURORA_PALETTE = Object.freeze({
  deep: palette.deep,
  body: palette.body,
  mint: Object.freeze([168, 240, 214]),
  lilac: Object.freeze([200, 180, 255]),
  hot: palette.hot,
  core: palette.core,
  white: palette.white,
});

/** Map (f along, side across) in units of `length` / `width` from the base (x, y) along `angleDeg`. */
const framer = ({ x, y, angleDeg, length, width }) => {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return (f, side) => [x + ux * length * f - uy * width * side, y + uy * length * f + ux * width * side];
};

/**
 * An icicle from its base (x, y) along `angleDeg`: a squared base `width` wide, straight sides
 * narrowing a little to the shoulders at 66 % of `length`, then straight to a sharp tip on the
 * axis. Five corners. Both chains run base to tip, as `traceOutline` takes; `left` is the side
 * on the normal (-uy, ux), as in `tongueOutline`.
 * @returns {{left: number[][], right: number[][]}}
 */
export function icicleOutline(spec) {
  const at = framer(spec);
  const shoulder = 0.5 * SHOULDER_WIDTH;
  return {
    left: [at(0, 0.5), at(SHOULDER, shoulder), at(1, 0)],
    right: [at(0, -0.5), at(SHOULDER, -shoulder), at(1, 0)],
  };
}

/**
 * The icicle's lit facet: the strip between its left edge and a ridge from just inside the base
 * centre to the tip (one face of a hexagonal prism catching the light).
 * @returns {number[][]}
 */
export function icicleFacet(spec) {
  const at = framer(spec);
  const { left } = icicleOutline(spec);
  return [...left, at(0, FACET_SPLIT)];
}

/**
 * A snowflake's strokes about (x, y), turned `phase` radians: six spokes from the centre to `r`,
 * each with three V branches (45 degrees off the spoke) that shorten toward the tip.
 * @returns {number[][][]} segments, each [[x0, y0], [x1, y1]]
 */
export function snowflakeSegments(x, y, r, phase = 0) {
  const segments = [];
  for (let k = 0; k < SPOKES; k += 1) {
    const theta = phase + (k * TAU) / SPOKES;
    const point = (d, angle) => [x + Math.cos(angle) * d, y + Math.sin(angle) * d];
    segments.push([[x, y], point(r, theta)]);
    for (const [at, arm] of BRANCHES) {
      const root = point(r * at, theta);
      for (const side of [-1, 1]) {
        const angle = theta + side * rad(BRANCH_DEG);
        segments.push([root, [root[0] + Math.cos(angle) * r * arm, root[1] + Math.sin(angle) * r * arm]]);
      }
    }
  }
  return segments;
}

/** The three aurora rings' alphas for `phase`: each breathes between 0.35 and 1, a third of a cycle apart. */
export function auroraAlphas(phase) {
  return AURORA_RINGS.map((_, k) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase + (k * TAU) / AURORA_RINGS.length)));
}

const tracePoints = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
};

/** Cold mist: the pale core fading through the ice blue to nothing. */
const mistOf = (pal) =>
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(pal.core, alpha * 0.45));
    g.addColorStop(0.5, rgbCss(pal.body, alpha * 0.25));
    g.addColorStop(1, rgbCss(pal.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };

// The interface's `body` carries no clock, so a lone flake or ring turns with where it is and how
// big it has grown (it turns as it swells or travels and holds still at rest), as flying's orb does.
const restingPhase = (x, y, r) => x * 0.02 + y * 0.03 + r * 0.15;

/** A snowflake: a bright centre, a wide ice-blue pass of every stroke, a thin white pass. */
function snowflake(ctx, pal, x, y, r, alpha, hot, phase) {
  sphere(
    ctx,
    x,
    y,
    r * 0.22,
    [
      [0, pal.white, alpha * 0.9],
      [0.6, pal.hot, alpha * 0.6],
      [1, pal.body, 0],
    ],
    0
  );
  const segments = snowflakeSegments(x, y, r, phase);
  ctx.lineCap = 'round';
  const passes = [
    [pal.body, 0.55 * alpha, Math.max(1, r * 0.14)],
    [pal.white, 0.95 * alpha * (0.5 + 0.5 * clamp01(hot)), Math.max(1, r * 0.05)],
  ];
  for (const [rgb, a, lineWidth] of passes) {
    ctx.strokeStyle = rgbCss(rgb, a);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (const [[x0, y0], [x1, y1]] of segments) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }
}

/**
 * One crystal (or with `jag`, a splinter): the translucent ice fill, the lit facet down its left
 * side, then a 1 px white edge. `hot` scales the facet.
 */
function crystal(ctx, pal, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const outline = jag ? shardOutline(spec) : icicleOutline(spec);
  ctx.fillStyle = rgbCss(pal.body, CRYSTAL_ALPHA * alpha);
  traceOutline(ctx, outline);
  ctx.fill();
  const lit = FACET_ALPHA * alpha * clamp01(hot);
  if (lit > 0) {
    ctx.fillStyle = rgbCss(pal.hot, lit);
    tracePoints(ctx, jag ? [...outline.left] : icicleFacet(spec));
    ctx.fill();
  }
  ctx.strokeStyle = rgbCss(pal.white, EDGE_ALPHA * alpha);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  traceOutline(ctx, outline);
  ctx.stroke();
}

/**
 * A crystal head flying along `headingDeg` (its tip leads, `r` past the centre) in a faint mist,
 * trailing `tongues` smaller crystals in a staggered file behind it.
 */
function crystalVolley(ctx, pal, { x, y, r, headingDeg, seed, alpha, tongues, hot }) {
  const a = rad(headingDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  for (let k = tongues; k >= 1; k -= 1) {
    const back = r * (1.2 + 0.75 * k);
    const side = r * TRAIL_SIDE * (k % 2 ? 1 : -1);
    const length = r * 1.4 * (1 - 0.1 * k);
    crystal(
      ctx,
      pal,
      { x: x - ux * back - uy * side, y: y - uy * back + ux * side, angleDeg: headingDeg, length, width: length * 0.38, seed: seed + k },
      { alpha: alpha * (0.85 - 0.1 * k), hot: hot * 0.7 }
    );
  }
  crystal(ctx, pal, { x: x - ux * r * 1.1, y: y - uy * r * 1.1, angleDeg: headingDeg, length: r * 2.2, width: r * 0.85, seed }, { alpha, hot });
}

// ---- ice -------------------------------------------------------------------------------

const iceGlow = mistOf(palette);

function iceBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  snowflake(ctx, palette, x, y, r, alpha, hot, restingPhase(x, y, r));
}

function iceTongue(ctx, spec, opts) {
  crystal(ctx, palette, spec, opts);
}

function iceProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 4, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  iceGlow(ctx, x, y, r * 2.2, 0.45 * alpha);
  if (!(tongues > 0)) {
    snowflake(ctx, palette, x, y, r, alpha, hot, time * FLAKE_SPIN + seed);
    return;
  }
  crystalVolley(ctx, palette, { x, y, r, headingDeg, seed, alpha, tongues, hot });
}

export const ice = Object.freeze({
  key: 'ice',
  palette,
  // A deep winter navy, kept local to a card, so pale ice reads against it.
  shade: Object.freeze([6, 24, 50]),
  // Cold mist (the recipe's smoke).
  smoke: Object.freeze([200, 230, 245]),
  particle: Object.freeze({ className: 'fx-particle--shard', color: rgbCss(palette.hot), aspect: 0.6 }),
  glow: iceGlow,
  body: iceBody,
  tongue: iceTongue,
  projectile: iceProjectile,
  grain: grainPass,
});

// ---- aurora ----------------------------------------------------------------------------

const auroraGlow = mistOf({ core: AURORA_PALETTE.core, body: AURORA_PALETTE.lilac, deep: AURORA_PALETTE.deep });

/** Three concentric rings, cyan outside to lilac inside, in a faint mist, breathing with `phase`. */
function auroraRing(ctx, x, y, r, alpha, hot, phase) {
  auroraGlow(ctx, x, y, r * 1.15, 0.5 * alpha);
  const alphas = auroraAlphas(phase);
  ctx.lineWidth = Math.max(1, r * 0.12);
  AURORA_RINGS.forEach(([key, scale], k) => {
    ctx.strokeStyle = rgbCss(AURORA_PALETTE[key], alpha * alphas[k] * (0.6 + 0.4 * clamp01(hot)));
    ctx.beginPath();
    ctx.arc(x, y, r * scale, 0, TAU);
    ctx.stroke();
  });
}

function auroraBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  auroraRing(ctx, x, y, r, alpha, hot, restingPhase(x, y, r));
}

function auroraTongue(ctx, spec, opts) {
  crystal(ctx, AURORA_PALETTE, spec, opts);
}

/** A ring flying along `headingDeg`, trailing `tongues` fainter, smaller rings. */
function auroraProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 2, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const a = rad(headingDeg);
  for (let k = tongues; k >= 1; k -= 1) {
    const back = r * 0.9 * k;
    auroraRing(ctx, x - Math.cos(a) * back, y - Math.sin(a) * back, r * (1 - 0.15 * k), alpha * (0.8 - 0.15 * k), hot * 0.6, time * 4 + seed + k);
  }
  auroraRing(ctx, x, y, r, alpha, hot, time * 4 + seed);
}

export const aurora = Object.freeze({
  key: 'aurora',
  palette: AURORA_PALETTE,
  shade: Object.freeze([10, 18, 46]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--twinkle', color: rgbCss(AURORA_PALETTE.lilac), aspect: 1 }),
  glow: auroraGlow,
  body: auroraBody,
  tongue: auroraTongue,
  projectile: auroraProjectile,
  grain: grainPass,
});
