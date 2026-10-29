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
// Ice is light on the board: everything is additive (the player's `lighter`) except a crystal's
// ice fill and the aurora rings, which cover what is under them (`source-over`, inside their own
// save/restore) so pale ice over a bright card face keeps its hue instead of adding up to white.
//
// Design 075 slice 10: crystals, flakes and aurora rings name the GPU crystal style
// (`ctx.fxStyle`, ignored by Canvas2D). A crystal's ice fill is a one-stop gradient laid base to
// tip — the same flat colour on Canvas2D — so the style cuts it into facets across its width and
// sweeps a glint down it; edges, spokes and rings carry short running glints; a flake's heart
// twinkles. The lit facet and the mist stay flat.
//
// Design 076: the GPU modifiers (`ctx.fxMod`, ignored by Canvas2D). Ice holds still: a crystal's
// ice fill takes a fine, barely drifting second noise layer (detail) as frost, never a warp; only
// the cold mist drifts and wavers (distort + detail). A drawer's dissolve burns at a thin pale-cyan
// frost edge.
//
// Design 076 § Depth: a crystal is a lit glassy tube round its axis (`volume`: a sharp white glint,
// a strong rim) standing off the cloth with its facet and edge on it; a snowflake floats higher,
// its heart a lit bead and its spokes lit rods; aurora rings are lit tubes stacked outer-lowest.
// Heights (lane units) add to the drawer's lift (`withLiftZ`); the cast pass shades the cloth.
import { rgbCss } from '../../fx-colors.mjs';
import { moddedKit } from './_kit-mod.js';
import { withFxMod, withLiftZ } from './_mods.js';
import { grainPass, inShadow, shardOutline, sphere, traceOutline } from './_shared.js';

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
// Lit facet and edge are additive: kept under the ice fill's weight so 30 crystals meeting in a
// flare's heart do not stack to white.
const FACET_ALPHA = 0.45;
const EDGE_ALPHA = 0.7;
const TRAIL_SIDE = 0.55;
// A flying snowflake turns about two thirds of a turn a second (radians per second of scene clock).
const FLAKE_SPIN = 4;
const RING_ALPHA = 0.65;
const AURORA_RINGS = Object.freeze([
  ['body', 1],
  ['mint', 0.8],
  ['lilac', 0.6],
]);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

// Style params (gpu-canvas STYLE_PARAMS crystal): the ice body is cut finer than a gem; edges and
// spokes glint brighter than the faces; aurora rings shimmer slowly.
const CRYSTAL_BODY = Object.freeze({ id: 'crystal', facets: 6, sheen: 0.55, speed: 1.4 });
const CRYSTAL_EDGE = Object.freeze({ id: 'crystal', facets: 6, sheen: 0.7, speed: 1.2 });
const AURORA_SHIMMER = Object.freeze({ id: 'crystal', facets: 6, sheen: 0.45, speed: 0.6 });
// Modifier params (gpu-canvas FX_MODS), strengths in lane heights; light from up-left (120°).
const FROST_MOD = Object.freeze({
  detail: Object.freeze({ amount: 0.22, speed: 0.15, scale: 6, angle: -90 }),
  volume: Object.freeze({ amount: 0.7, spec: 0.9, rim: 0.7, light: 120, bump: 0, radius: 0.1, ambient: 0.5 }),
});
const MIST_MOD = Object.freeze({
  distort: Object.freeze({ strength: 0.06, speed: 0.4, scale: 2.5, angle: -90 }),
  detail: Object.freeze({ amount: 0.22, speed: 0.3, scale: 3, angle: -90 }),
});
const BEAD_MOD = Object.freeze({ volume: Object.freeze({ amount: 0.8, spec: 0.8, rim: 0.6, light: 120, bump: 0, ambient: 0.45 }) });
const ROD_MOD = Object.freeze({ volume: Object.freeze({ amount: 0.6, spec: 0.6, rim: 0.3, light: 120, bump: 0, ambient: 0.45 }) });
// Heights (lane units) over the drawer's lift: mist on the cloth, crystals above it, a snowflake
// higher, aurora rings from `ring` (outer) up by `ringStep` per ring inward.
const LIFT = Object.freeze({ crystal: 0.06, flake: 0.1, ring: 0.05, ringStep: 0.03 });
/** A thin frost rim in `pal`'s pale cyan: a drawer's dissolve burns it. */
const frostEdge = (pal) => Object.freeze({ dissolve: Object.freeze({ edge: pal.hot, width: 0.08, gain: 1.1 }) });

const ICE_PALETTE = Object.freeze({
  deep: Object.freeze([62, 143, 209]),
  body: Object.freeze([143, 211, 255]),
  hot: Object.freeze([214, 243, 255]),
  core: Object.freeze([236, 249, 255]),
  white: Object.freeze([255, 255, 255]),
});

const AURORA_PALETTE = Object.freeze({
  deep: ICE_PALETTE.deep,
  body: ICE_PALETTE.body,
  mint: Object.freeze([168, 240, 214]),
  lilac: Object.freeze([200, 180, 255]),
  hot: ICE_PALETTE.hot,
  core: ICE_PALETTE.core,
  white: ICE_PALETTE.white,
});

/** `rgb` at `alpha` as a one-stop gradient from the crystal's base toward its tip (flat on Canvas2D). */
const alongCrystal = (ctx, { x, y, angleDeg, length }, rgb, alpha) => {
  const g = ctx.createLinearGradient(x, y, x + Math.cos(rad(angleDeg)) * length, y + Math.sin(rad(angleDeg)) * length);
  g.addColorStop(0, rgbCss(rgb, alpha));
  return g;
};

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
    withFxMod(ctx, MIST_MOD, () => ctx.fill());
  };

// The interface's `body` carries no clock, so a lone flake or ring turns with where it is and how
// big it has grown (it turns as it swells or travels and holds still at rest), as flying's orb does.
const restingPhase = (x, y, r) => x * 0.02 + y * 0.03 + r * 0.15;

/** A snowflake: a bright centre, a wide ice-blue pass of every stroke, a thin white pass. */
function snowflake(ctx, pal, x, y, r, alpha, hot, phase) {
  withLiftZ(ctx, LIFT.flake, () => litFlake(ctx, pal, x, y, r, alpha, hot, phase));
}

/** The snowflake's bead and rods at the current lift. */
function litFlake(ctx, pal, x, y, r, alpha, hot, phase) {
  ctx.fxStyle = CRYSTAL_EDGE;
  withFxMod(ctx, BEAD_MOD, () => sphere(
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
  ));
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
    withFxMod(ctx, ROD_MOD, () => ctx.stroke());
  }
  ctx.fxStyle = null;
}

/**
 * One crystal (or with `jag`, a splinter): the translucent ice fill, the lit facet down its left
 * side, then a 1 px white edge. `hot` scales the facet.
 */
function crystal(ctx, pal, spec, options = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !((options.alpha ?? 1) > 0)) return;
  withLiftZ(ctx, LIFT.crystal, () => litCrystal(ctx, pal, spec, options));
}

/** The crystal's ice fill, facet and edge at the current lift. */
function litCrystal(ctx, pal, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  const outline = jag ? shardOutline(spec) : icicleOutline(spec);
  inShadow(ctx, () => {
    ctx.fxStyle = CRYSTAL_BODY;
    ctx.fillStyle = alongCrystal(ctx, spec, pal.body, CRYSTAL_ALPHA * alpha);
    traceOutline(ctx, outline);
    withFxMod(ctx, FROST_MOD, () => ctx.fill());
    ctx.fxStyle = null;
  });
  const lit = FACET_ALPHA * alpha * clamp01(hot);
  if (lit > 0) {
    ctx.fillStyle = rgbCss(pal.hot, lit);
    tracePoints(ctx, jag ? [...outline.left] : icicleFacet(spec));
    ctx.fill();
  }
  ctx.strokeStyle = rgbCss(pal.white, EDGE_ALPHA * alpha);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.fxStyle = CRYSTAL_EDGE;
  traceOutline(ctx, outline);
  withFxMod(ctx, ROD_MOD, () => ctx.stroke());
  ctx.fxStyle = null;
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
/** The ice material drawn in `palette` (any palette with the same keys). */
function iceKit(palette) {

  const iceGlow = mistOf(palette);
  const edge = frostEdge(palette);

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

  return moddedKit(
    {
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
      withPalette: (p) => iceKit(p),
    },
    edge
  );
}

export const ice = iceKit(ICE_PALETTE);

// ---- aurora ----------------------------------------------------------------------------
/** The aurora material drawn in `palette` (any palette with the same keys). */
function auroraKit(palette) {

  const auroraGlow = mistOf({ core: palette.core, body: palette.lilac, deep: palette.deep });
  const edge = frostEdge(palette);

  /** Three concentric rings, cyan outside to lilac inside, in a faint mist, breathing with `phase`. */
  function auroraRing(ctx, x, y, r, alpha, hot, phase) {
    // Faint and thin, and the rings cover (source-over) rather than add: a train of them overlaps,
    // and additive pastels over a card face stack to white, losing the aurora's hues.
    auroraGlow(ctx, x, y, r * 1.15, 0.3 * alpha);
    const alphas = auroraAlphas(phase);
    inShadow(ctx, () => {
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.fxStyle = AURORA_SHIMMER;
      AURORA_RINGS.forEach(([key, scale], k) => {
        ctx.strokeStyle = rgbCss(palette[key], RING_ALPHA * alpha * alphas[k] * (0.6 + 0.4 * clamp01(hot)));
        ctx.beginPath();
        ctx.arc(x, y, r * scale, 0, TAU);
        withLiftZ(ctx, LIFT.ring + k * LIFT.ringStep, () => withFxMod(ctx, ROD_MOD, () => ctx.stroke()));
      });
      ctx.fxStyle = null;
    });
  }

  function auroraBody(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    auroraRing(ctx, x, y, r, alpha, hot, restingPhase(x, y, r));
  }

  function auroraTongue(ctx, spec, opts) {
    crystal(ctx, palette, spec, opts);
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

  return moddedKit(
    {
      key: 'aurora',
      palette,
      shade: Object.freeze([10, 18, 46]),
      smoke: null,
      particle: Object.freeze({ className: 'fx-particle--twinkle', color: rgbCss(palette.lilac), aspect: 1 }),
      glow: auroraGlow,
      body: auroraBody,
      tongue: auroraTongue,
      projectile: auroraProjectile,
      grain: grainPass,
      withPalette: (p) => auroraKit(p),
    },
    edge
  );
}

export const aurora = auroraKit(AURORA_PALETTE);
