// Design 063: the grass materials (recipe in the design's § Materials). The elongated unit
// is a *leaf*: pointed at both ends (widest at 45 % of its length), one flat fill, a lighter
// half on its sunlit (screen-up) side and a deep mid-vein with two side veins; no blur, no
// grain. The round unit is a seed: a sphere with a leaf-green rim. A projectile is a tight
// cluster of leaves spinning about its centre at 360 deg/s around a seed core.
//   grass  #3FA34D #7ED957 #C9F27A #FFFFFF (the recipe's palette)
//   petal  the same leaf unit, rounder, in Petal Dance's own pink (its Appendix A palette)
//   solar  Energy Ball / Solar Beam's light override #F2E96B #FFF8B0 drawn with fire's
//          three-pass tongue (one blurred pass) and a hot sphere, as the recipe names
// Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, sphere, tonguePath, wobble } from './_shared.js';

const TAU = Math.PI * 2;
const LEAF_SAMPLES = 12;
const SPIN_DEG_PER_S = 360;
const VEIN_MIN_PX = 10;

const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const freezeAll = (palette) => Object.freeze(Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, Object.freeze(v)])));

const GRASS_PALETTE = freezeAll({
  deep: [63, 163, 77],
  body: [126, 217, 87],
  hot: [201, 242, 122],
  core: [233, 250, 196],
  white: [255, 255, 255],
});

const PETAL_PALETTE = freezeAll({
  deep: [196, 46, 150],
  body: [247, 112, 208],
  hot: [231, 184, 247],
  core: [247, 208, 0],
  white: [255, 255, 255],
});

const SOLAR_PALETTE = freezeAll({
  deep: [63, 163, 77],
  body: [242, 233, 107],
  hot: [255, 248, 176],
  core: [255, 252, 228],
  white: [255, 255, 255],
});

/** Leaf silhouettes: where the blade is widest (fraction of its length) and how full it is. */
const LEAF_SHAPE = Object.freeze({ peak: 0.45, fullness: 0.9, curl: 0.18 });
const PETAL_SHAPE = Object.freeze({ peak: 0.6, fullness: 0.6, curl: 0.1 });

/**
 * One leaf's outline from its base (x, y) to its tip, pointed at both ends. The centre line
 * curls a little (fixed per seed) and flutters with time. `left` / `right` are the edges on
 * the direction's left / right normal, base to tip; `mid` is the centre line.
 */
export function leafOutline({ x, y, angleDeg, length, width, time, seed }, shape = LEAF_SHAPE) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const bend = width * shape.curl * Math.sin(seed * 1.7);
  const flutter = width * 0.06 * wobble(0.3, time, seed);
  const left = [];
  const right = [];
  const mid = [];
  for (let i = 0; i <= LEAF_SAMPLES; i += 1) {
    const s = i / LEAF_SAMPLES;
    const envelope =
      s <= shape.peak ? Math.sin((Math.PI / 2) * (s / shape.peak)) : Math.cos((Math.PI / 2) * ((s - shape.peak) / (1 - shape.peak)));
    const half = i === 0 || i === LEAF_SAMPLES ? 0 : width * 0.5 * Math.max(0, envelope) ** shape.fullness;
    const off = (bend + flutter * s) * Math.sin(Math.PI * s);
    const cx = x + ux * s * length + nx * off;
    const cy = y + uy * s * length + ny * off;
    mid.push([cx, cy]);
    left.push([cx + nx * half, cy + ny * half]);
    right.push([cx - nx * half, cy - ny * half]);
  }
  return { left, right, mid, sunlitLeft: ny < 0 };
}

const tracePolyline = (ctx, points, start = 0, end = points.length - 1) => {
  ctx.moveTo(points[start][0], points[start][1]);
  for (let i = start + 1; i <= end; i += 1) ctx.lineTo(points[i][0], points[i][1]);
};

const traceLeaf = (ctx, { left, right }) => {
  ctx.beginPath();
  tracePolyline(ctx, left);
  for (let i = right.length - 2; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
};

/** The sunlit half: the lit edge out and the centre line back. */
const traceHalf = (ctx, edge, mid) => {
  ctx.beginPath();
  tracePolyline(ctx, edge);
  for (let i = mid.length - 2; i >= 0; i -= 1) ctx.lineTo(mid[i][0], mid[i][1]);
  ctx.closePath();
};

/** Mid-vein plus one side vein each way, all in one path. */
const traceVeins = (ctx, { left, right, mid }) => {
  ctx.beginPath();
  tracePolyline(ctx, mid, 1, mid.length - 2);
  const root = Math.round(LEAF_SAMPLES * 0.35);
  const reach = Math.round(LEAF_SAMPLES * 0.6);
  for (const edge of [left, right]) {
    ctx.moveTo(mid[root][0], mid[root][1]);
    const [ex, ey] = edge[reach];
    const [mx, my] = mid[reach];
    ctx.lineTo(mx + (ex - mx) * 0.7, my + (ey - my) * 0.7);
  }
};

/** A leaf material: leaf tongues, seed bodies and spinning leaf clusters in `palette`. */
function leafKit(palette, shape, { veins }) {
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha * 0.6));
    g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.35));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /** A seed / spore: a pale sphere lit up-left, ringed in leaf green. `hot` dims the core. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    sphere(
      ctx,
      x,
      y,
      r,
      [
        [0, palette.core, alpha * (0.4 + 0.6 * clamp01(hot))],
        [0.5, palette.hot, alpha * 0.85],
        [0.85, palette.body, alpha * 0.8],
        [1, palette.deep, alpha * 0.6],
      ],
      0.25
    );
    const rim = Math.min(2, Math.max(0.75, r * 0.1));
    ctx.strokeStyle = rgbCss(palette.deep, 0.75 * alpha);
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r - rim / 2, rim / 2), 0, TAU);
    ctx.stroke();
  }

  /** One leaf from its base along `angleDeg`: flat body, lit half (`hot`), veins. Never blurs. */
  function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const leaf = leafOutline(spec, shape);
    ctx.fillStyle = rgbCss(palette.body, 0.9 * alpha);
    traceLeaf(ctx, leaf);
    ctx.fill();
    const lit = 0.75 * alpha * clamp01(hot);
    if (lit > 0) {
      ctx.fillStyle = rgbCss(palette.hot, lit);
      traceHalf(ctx, leaf.sunlitLeft ? leaf.left : leaf.right, leaf.mid);
      ctx.fill();
    }
    if (veins && spec.length >= VEIN_MIN_PX) {
      ctx.strokeStyle = rgbCss(palette.deep, 0.85 * alpha);
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      traceVeins(ctx, leaf);
      ctx.stroke();
    }
  }

  /** A leaf spun about its own centre (its base trails half a length behind (x, y)). */
  const spunLeaf = (ctx, x, y, angleDeg, length, width, time, seed, opts) => {
    const a = rad(angleDeg);
    tongue(ctx, { x: x - (Math.cos(a) * length) / 2, y: y - (Math.sin(a) * length) / 2, angleDeg, length, width, time, seed }, opts);
  };

  /**
   * Leaves in flight along `headingDeg`. `tongues` 0 = a bare seed, 1 = one leaf tumbling
   * about its centre, more = a pinwheel of that many leaves around a seed core.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 5, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    const spin = headingDeg + ((time * SPIN_DEG_PER_S + seed * 57) % 360);
    glow(ctx, x, y, r * 1.8, 0.3 * alpha);
    if (tongues <= 0) {
      body(ctx, x, y, r, alpha, hot);
      return;
    }
    if (tongues === 1) {
      spunLeaf(ctx, x, y, spin, r * 2.2, r * 0.95, time, seed, { alpha, hot });
      return;
    }
    for (let k = 0; k < tongues; k += 1) {
      const a = spin + (k * 360) / tongues;
      const ar = rad(a);
      tongue(
        ctx,
        { x: x + Math.cos(ar) * r * 0.15, y: y + Math.sin(ar) * r * 0.15, angleDeg: a, length: r * 1.6, width: r * 0.7, time, seed: seed + k * 1.3 },
        { alpha: alpha * 0.95, hot }
      );
    }
    body(ctx, x, y, r * 0.45, alpha, hot);
  }

  return { glow, body, tongue, projectile };
}

const grassKit = leafKit(GRASS_PALETTE, LEAF_SHAPE, { veins: true });
const petalKit = leafKit(PETAL_PALETTE, PETAL_SHAPE, { veins: true });

export const grass = Object.freeze({
  key: 'grass',
  palette: GRASS_PALETTE,
  shade: Object.freeze([15, 42, 16]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--leaf', color: rgbCss(GRASS_PALETTE.body), aspect: 0.5 }),
  ...grassKit,
  grain: grainPass,
});

export const petal = Object.freeze({
  key: 'petal',
  palette: PETAL_PALETTE,
  shade: Object.freeze([42, 10, 36]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--leaf', color: rgbCss(PETAL_PALETTE.body), aspect: 0.6 }),
  ...petalKit,
  grain: grainPass,
});

// ---- solar: the light override (fire's tongue code path) ----------------------------------

function solarGlow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(SOLAR_PALETTE.hot, alpha * 0.55));
  g.addColorStop(0.5, rgbCss(SOLAR_PALETTE.body, alpha * 0.3));
  g.addColorStop(1, rgbCss(SOLAR_PALETTE.deep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// The light palette is near-white, so under the additive pass it washes a card out far
// sooner than fire does: the sphere keeps a small white point and a yellow body.
/** A sun sphere: a small white point through pale yellow to a green-gold rim. */
function solarBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  sphere(ctx, x, y, r, [
    [0, SOLAR_PALETTE.white, 0.7 * alpha * clamp01(hot)],
    [0.22, SOLAR_PALETTE.core, alpha * 0.8],
    [0.55, SOLAR_PALETTE.hot, alpha * 0.7],
    [0.85, SOLAR_PALETTE.body, alpha * 0.45],
    [1, SOLAR_PALETTE.deep, 0],
  ]);
}

/** Three-pass light tongue: one blurred yellow body, a pale mid, a near-white core. */
function solarTongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
  ctx.fillStyle = rgbCss(SOLAR_PALETTE.body, 0.6 * alpha);
  tonguePath(ctx, spec, 1);
  ctx.fill();
  ctx.filter = 'none';
  ctx.fillStyle = rgbCss(SOLAR_PALETTE.hot, 0.8 * alpha);
  tonguePath(ctx, spec, 0.66);
  ctx.fill();
  if (hot > 0) {
    ctx.fillStyle = rgbCss(SOLAR_PALETTE.core, 0.9 * alpha * hot);
    tonguePath(ctx, { ...spec, seed: spec.seed + 0.5 }, 0.4);
    ctx.fill();
  }
}

/** A ball of light along `headingDeg`: halo, a short fan of light tongues behind, the sphere. */
function solarProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 4, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  solarGlow(ctx, x, y, r * 2.2, 0.35 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -35 + (70 * k) / (tongues - 1) : 0;
    const jitter = 6 * wobble(k * 0.37, time, seed + k);
    const len = r * (1.2 + 0.6 * Math.abs(Math.sin(seed * 3.1 + k * 1.9)));
    solarTongue(
      ctx,
      { x, y, angleDeg: back + spread + jitter, length: len, width: r * 0.8, time, seed: seed + k * 2.1 },
      { alpha: alpha * 0.8, hot: hot * 0.6 }
    );
  }
  solarBody(ctx, x, y, r, alpha, hot);
}

export const solar = Object.freeze({
  key: 'solar',
  palette: SOLAR_PALETTE,
  shade: Object.freeze([30, 40, 8]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--mote', color: rgbCss(SOLAR_PALETTE.hot), aspect: 1 }),
  glow: solarGlow,
  body: solarBody,
  tongue: solarTongue,
  projectile: solarProjectile,
  grain: grainPass,
});
