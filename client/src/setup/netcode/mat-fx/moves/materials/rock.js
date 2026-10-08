// Design 063: the rock material (recipe in the design's § Materials) and its two variants.
//   rock — the round unit is a *stone*: five sharp corners, two facet tones over the grey face
//     (a lit facet always up-left however it tumbles, a shadow sliver down-right) and a dark
//     outline, so it reads as solid against the board. The elongated unit is a *stone spire*: straight edges from a wide base
//     to a sharp, leaning tip, its right half in shadow and a lit edge down its left side;
//     `jag` makes it a thrown chip. A projectile is a tumbling boulder trailing dust.
//     Palette #8A8F99 #B8BEC9 #E8ECF2, deep #3E434C; grain 0.1.
//   ancient — Ancient Power's stones: the same stone (grey face, pale facet) wrapped in a violet
//     aura, its rim lit violet; hot is the violet so the aura, rings and flashes carry it.
//   gem — Power Gem's crystals: light, not matter (additive throughout): a faceted crystal with
//     a bright facet and a pale rim, crystal streaks, a crystal projectile trailing streaks.
// Stone is solid matter: rock and ancient fill their stones with `source-over` inside their
// own save/restore (as ground's clods do); halos, lit edges and dust stay additive.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** A stable pseudo-random value in [0, 1) for (seed, index). */
const hash = (seed, index) => {
  const v = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const STONE_CORNERS = 5;
// Flying stones share one outline: the drawers' projectile seed drifts with the flight path
// (volley adds the bow offset), and a seeded outline would boil every frame. The tumble varies.
const FLIGHT_SHAPE = 3;
// The light comes from the upper left (screen degrees); a corner within LIT_SPAN of it
// belongs to the lit facet.
const LIGHT_DEG = -135;
const LIT_SPAN = 95;
const SHADOW_SPAN = 70;
const FACET_ALPHA = 0.6;
const SHADOW_ALPHA = 0.45;
const SPIRE_SHOULDER = 0.55;
const CRYSTAL_WAIST = 0.32;

const ROCK_PALETTE = Object.freeze({
  deep: Object.freeze([62, 67, 76]),
  body: Object.freeze([138, 143, 153]),
  hot: Object.freeze([184, 190, 201]),
  core: Object.freeze([232, 236, 242]),
  white: Object.freeze([255, 255, 255]),
});

const ANCIENT_PALETTE = Object.freeze({
  deep: ROCK_PALETTE.deep,
  body: ROCK_PALETTE.body,
  // The stone's lit facet stays rock-pale; `hot` is the aura's violet.
  lit: ROCK_PALETTE.hot,
  hot: Object.freeze([196, 112, 232]),
  core: Object.freeze([240, 214, 255]),
  white: ROCK_PALETTE.white,
});

const GEM_PALETTE = Object.freeze({
  deep: Object.freeze([110, 100, 170]),
  body: Object.freeze([186, 180, 240]),
  hot: Object.freeze([226, 224, 255]),
  core: Object.freeze([248, 247, 255]),
  white: Object.freeze([255, 255, 255]),
});

/** Signed smallest difference a - b in degrees, in (-180, 180]. */
const angleDiff = (a, b) => {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
};

/**
 * A stone's outline about (x, y): five corners, each at r * (0.78 + 0.32 h) for a seeded h,
 * spaced round the circle with a seeded nudge and turned by `spin` radians, in screen order.
 * @returns {number[][]}
 */
export function stoneOutline(x, y, r, seed = 0, spin = 0) {
  const points = [];
  for (let i = 0; i < STONE_CORNERS; i += 1) {
    const theta = spin + ((i + 0.4 * (hash(seed, i) - 0.5)) / STONE_CORNERS) * TAU;
    const radius = r * (0.78 + 0.32 * hash(seed, i + 17));
    points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius]);
  }
  return points;
}

/**
 * The lit facet of a stone outline about (x, y): a ridge point down-right of the centre (seeded,
 * so stones do not all share one symmetric, cube-like ridge), then the run of corners facing the
 * upper-left light, in outline order. The light is fixed on screen, so the facet stays up-left
 * however the stone turns.
 * @returns {number[][]} the ridge point followed by the lit corners (empty when none face it)
 */
export function litFacet(points, x, y, r, seed = 0) {
  const run = cornersFacing(points, x, y, LIGHT_DEG, LIT_SPAN);
  return run.length === 0 ? [] : [ridgePoint(x, y, r, seed), ...run];
}

/**
 * The shadow facet: the same ridge point, then the corners facing away from the light
 * (within SHADOW_SPAN of down-right), in outline order; a sliver that gives a big stone volume.
 * @returns {number[][]} the ridge point followed by the shadowed corners (empty when none)
 */
export function shadowFacet(points, x, y, r, seed = 0) {
  const run = cornersFacing(points, x, y, LIGHT_DEG + 180, SHADOW_SPAN);
  return run.length === 0 ? [] : [ridgePoint(x, y, r, seed), ...run];
}

const ridgePoint = (x, y, r, seed) => [x + r * (0.06 + 0.26 * hash(seed, 31)), y + r * (0.04 + 0.26 * hash(seed, 37))];

/** The contiguous run of outline corners within `span` degrees of screen direction `deg`. */
function cornersFacing(points, x, y, deg, span) {
  const facing = points.map(([px, py]) => Math.abs(angleDiff((Math.atan2(py - y, px - x) * 180) / Math.PI, deg)) <= span);
  if (!facing.some(Boolean)) return [];
  // Start the run just after a corner that does not face `deg`, so it is contiguous.
  const afterOther = (on, i) => on && !facing[(i - 1 + facing.length) % facing.length];
  const start = facing.every(Boolean) ? 0 : facing.findIndex(afterOther);
  const run = [];
  for (let k = 0; k < points.length; k += 1) {
    const i = (start + k) % points.length;
    if (!facing[i]) break;
    run.push(points[i]);
  }
  return run;
}

/**
 * A stone spire from its base (x, y) along `angleDeg`: straight edges from a base `width`
 * wide to the shoulders at 55 %, then straight to a sharp tip that leans a little off the
 * axis (seeded). Both chains run base to tip, as `traceOutline` takes.
 * @returns {{left: number[][], right: number[][]}}
 */
export function spireOutline({ x, y, angleDeg, length, width, seed = 0 }) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const at = (f, side) => [x + ux * length * f + nx * width * side, y + uy * length * f + ny * width * side];
  const lean = (hash(seed, 1) - 0.5) * 0.14;
  const tip = at(1, lean);
  return {
    left: [at(0, 0.5), at(SPIRE_SHOULDER, 0.3 + 0.06 * hash(seed, 2)), tip],
    right: [at(0, -0.5), at(SPIRE_SHOULDER - 0.08, -0.32), tip],
  };
}

/**
 * A crystal about (x, y), long axis along `angleDeg`: six corners, pointed at both ends of the
 * axis (`r` from the centre) and squared at the waist (`CRYSTAL_WAIST` r off the axis).
 * @returns {number[][]}
 */
export function crystalOutline(x, y, r, angleDeg = -90) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const at = (f, side) => [x + ux * r * f + nx * r * side, y + uy * r * f + ny * r * side];
  const w = CRYSTAL_WAIST;
  return [at(1, 0), at(0.45, w), at(-0.45, w), at(-1, 0), at(-0.45, -w), at(0.45, -w)];
}

const tracePoints = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
};

const strokeLine = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
};

/** A soft additive halo: hot -> body -> 0. */
const haloOf = (pal, strength = 0.45) =>
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(pal.hot, alpha * strength));
    g.addColorStop(0.5, rgbCss(pal.body, alpha * strength * 0.55));
    g.addColorStop(1, rgbCss(pal.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };

/** Puffs trailing behind a flying unit along `headingDeg`, one additive fill each, in `rgb`. */
const puffTrail = (ctx, rgb, deep, { x, y, r, headingDeg, time, seed, alpha, count }) => {
  const back = rad(headingDeg + 180);
  for (let k = 0; k < count; k += 1) {
    const d = r * (1 + 0.7 * k);
    const sway = r * 0.18 * Math.sin(time * 4 + seed + k * 1.9);
    const px = x + Math.cos(back) * d - Math.sin(back) * sway;
    const py = y + Math.sin(back) * d + Math.cos(back) * sway;
    const pr = r * (0.5 + 0.15 * k);
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, rgbCss(rgb, 0.38 * alpha * (1 - k / (count + 1))));
    g.addColorStop(1, rgbCss(deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
  }
};

// ---- stone (rock, ancient) -------------------------------------------------------------

/**
 * One stone: the grey face, the lit facet up-left and a dark outline, covering what is under
 * it; then, when hot, its lit corners traced in `rim` (additive).
 */
function stone(ctx, pal, rim, x, y, r, alpha, hot, seed, spin) {
  const points = stoneOutline(x, y, r, seed, spin);
  const facet = litFacet(points, x, y, r, seed);
  const shade = shadowFacet(points, x, y, r, seed);
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(pal.body, alpha);
    tracePoints(ctx, points);
    ctx.fill();
    if (facet.length > 2) {
      ctx.fillStyle = rgbCss(pal.lit ?? pal.hot, FACET_ALPHA * alpha);
      tracePoints(ctx, facet);
      ctx.fill();
    }
    if (shade.length > 2) {
      ctx.fillStyle = rgbCss(pal.deep, SHADOW_ALPHA * alpha);
      tracePoints(ctx, shade);
      ctx.fill();
    }
    ctx.strokeStyle = rgbCss(pal.deep, 0.85 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.lineJoin = 'round';
    tracePoints(ctx, points);
    ctx.stroke();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0) || facet.length < 3) return;
  ctx.strokeStyle = rgbCss(rim, 0.7 * lit);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineJoin = 'round';
  strokeLine(ctx, facet.slice(1));
}

/**
 * A stone spire (or with `jag`, a thrown chip): the solid fill, its right half in shadow,
 * then a lit edge down its left side in `rim` (dropped at `hot` 0).
 */
function spire(ctx, pal, rim, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const outline = jag ? shardOutline(spec) : spireOutline(spec);
  const tip = outline.left.at(-1);
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(pal.body, 0.95 * alpha);
    traceOutline(ctx, outline);
    ctx.fill();
    ctx.fillStyle = rgbCss(pal.deep, FACET_ALPHA * alpha);
    traceOutline(ctx, { left: [[spec.x, spec.y], tip], right: outline.right });
    ctx.fill();
  });
  const lit = alpha * clamp01(hot);
  if (!(lit > 0)) return;
  ctx.strokeStyle = rgbCss(rim, 0.75 * lit);
  ctx.lineWidth = Math.max(1, spec.width * 0.06);
  ctx.lineJoin = 'round';
  strokeLine(ctx, outline.left);
}

/** The rock material drawn in `palette` (any palette with the same keys). */
function rockKit(palette) {
  // The interface's `body` carries no seed, so every lone stone has the one stable shape (a
  // position-derived seed would boil the outline as it moves).
  function rockBody(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    stone(ctx, palette, palette.core, x, y, r, alpha, hot, 0, 0);
  }

  function rockTongue(ctx, spec, opts) {
    spire(ctx, palette, palette.core, spec, opts);
  }

  /** A boulder tumbling along `headingDeg` with the scene clock, trailing `tongues` dust puffs. */
  function rockProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    puffTrail(ctx, palette.body, palette.deep, { x, y, r, headingDeg, time, seed, alpha, count: tongues });
    stone(ctx, palette, palette.core, x, y, r, alpha, hot, FLIGHT_SHAPE, time * 4 + seed);
  }

  return Object.freeze({
    key: 'rock',
    palette,
    // The vignette's tint: a slate-black kept local to a card.
    shade: Object.freeze([22, 24, 30]),
    // Stone dust: the recipe's "smoke = dust", greyed to the stone.
    smoke: Object.freeze([150, 146, 138]),
    particle: Object.freeze({ className: 'fx-particle--shard', color: rgbCss(palette.hot), aspect: 0.6 }),
    glow: haloOf(palette),
    body: rockBody,
    tongue: rockTongue,
    projectile: rockProjectile,
    grain: grainPass,
    withPalette: (p) => rockKit(p),
  });
}

export const rock = rockKit(ROCK_PALETTE);

// ---- ancient ---------------------------------------------------------------------------
/** The ancient material drawn in `palette` (any palette with the same keys). */
function ancientKit(palette) {
  const glow = haloOf(palette, 0.5);

  /** A stone in its violet aura: the halo behind (additive), the stone, a violet rim. */
  function ancientBody(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 1.7, alpha);
    stone(ctx, palette, palette.hot, x, y, r, alpha, hot, 0, 0);
  }

  function ancientTongue(ctx, spec, opts) {
    spire(ctx, palette, palette.hot, spec, opts);
  }

  /** A stone in its aura tumbling along `headingDeg`, trailing `tongues` violet wisps of aura. */
  function ancientProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 2, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    puffTrail(ctx, palette.hot, palette.deep, { x, y, r, headingDeg, time, seed, alpha, count: tongues });
    glow(ctx, x, y, r * 1.7, alpha);
    stone(ctx, palette, palette.hot, x, y, r, alpha, hot, FLIGHT_SHAPE, time * 2.5 + seed);
  }

  return Object.freeze({
    key: 'ancient',
    palette,
    shade: Object.freeze([26, 16, 34]),
    smoke: rock.smoke,
    particle: Object.freeze({ className: 'fx-particle--shard', color: rgbCss(palette.hot), aspect: 0.6 }),
    glow,
    body: ancientBody,
    tongue: ancientTongue,
    projectile: ancientProjectile,
    grain: grainPass,
    withPalette: (p) => ancientKit(p),
  });
}

export const ancient = ancientKit(ANCIENT_PALETTE);

// ---- gem -------------------------------------------------------------------------------
/** The gem material drawn in `palette` (any palette with the same keys). */
function gemKit(palette) {
  const glow = haloOf(palette, 0.55);

  /** A crystal of light: the body fill, a bright facet up-left when hot, a pale rim. */
  function crystal(ctx, x, y, r, alpha, hot, angleDeg) {
    const points = crystalOutline(x, y, r, angleDeg);
    ctx.fillStyle = rgbCss(palette.body, 0.75 * alpha);
    tracePoints(ctx, points);
    ctx.fill();
    const lit = alpha * clamp01(hot);
    if (lit > 0) {
      // The facet between the top point, the upper-left shoulder and the centre.
      ctx.fillStyle = rgbCss(palette.core, 0.8 * lit);
      tracePoints(ctx, [points[0], points[5], points[4], [x, y]]);
      ctx.fill();
    }
    ctx.strokeStyle = rgbCss(palette.hot, 0.85 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.lineJoin = 'miter';
    tracePoints(ctx, points);
    ctx.stroke();
  }

  function gemBody(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    crystal(ctx, x, y, r, alpha, hot, -90);
  }

  /**
   * A crystal streak: a straight spindle of light along the heading (its body, a narrower
   * bright core), then a white centre line (dropped at `hot` 0). `jag` makes it a crystal chip.
   */
  function gemTongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    if (jag) {
      ctx.fillStyle = rgbCss(palette.body, 0.8 * alpha);
      traceOutline(ctx, shardOutline(spec));
      ctx.fill();
      ctx.fillStyle = rgbCss(palette.core, 0.7 * alpha);
      traceOutline(ctx, shardOutline({ ...spec, width: spec.width * 0.45 }));
      ctx.fill();
      return;
    }
    const a = rad(spec.angleDeg);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const at = (f, side) => [spec.x + ux * spec.length * f - uy * spec.width * side, spec.y + uy * spec.length * f + ux * spec.width * side];
    const spindle = (scale) => [at(0, 0), at(0.3, 0.5 * scale), at(1, 0), at(0.3, -0.5 * scale)];
    ctx.fillStyle = rgbCss(palette.body, 0.6 * alpha);
    tracePoints(ctx, spindle(1));
    ctx.fill();
    ctx.fillStyle = rgbCss(palette.hot, 0.8 * alpha);
    tracePoints(ctx, spindle(0.45));
    ctx.fill();
    const lit = alpha * clamp01(hot);
    if (!(lit > 0)) return;
    ctx.strokeStyle = rgbCss(palette.white, 0.85 * lit);
    ctx.lineWidth = Math.max(1, spec.width * 0.08);
    strokeLine(ctx, [at(0.05, 0), at(0.95, 0)]);
  }

  /** A crystal turning slowly with the clock in its halo, trailing `tongues` crystal streaks. */
  function gemProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      const spread = (k - (tongues - 1) / 2) * 16;
      gemTongue(
        ctx,
        { x, y, angleDeg: back + spread, length: r * (2.4 - 0.3 * Math.abs(spread / 16)), width: r * 0.55, time, seed: seed + k },
        { alpha: alpha * 0.8, hot: hot * 0.6 }
      );
    }
    crystal(ctx, x, y, r, alpha, hot, headingDeg + 30 * Math.sin(time * 3 + seed));
  }

  return Object.freeze({
    key: 'gem',
    palette,
    shade: Object.freeze([18, 14, 36]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--twinkle', color: rgbCss(palette.hot), aspect: 1 }),
    glow,
    body: gemBody,
    tongue: gemTongue,
    projectile: gemProjectile,
    grain: grainPass,
    withPalette: (p) => gemKit(p),
  });
}

export const gem = gemKit(GEM_PALETTE);
