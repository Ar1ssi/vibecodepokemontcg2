// Design 077 (prototype): where Perilous Jungle's landmarks lie, from the board layout
// (board-layout.mjs flatLayout), so the jungle fits every mat profile and never moves or covers a
// card. The cards lie in a clearing and the jungle's undergrowth rises round it. A poison pool lies
// past the left end of the cards; its stream winds from it along the seam, through the gaps between
// the cards, and out through the undergrowth past the scene's right edge. Leaves cover the
// undergrowth and lean out over the water. stadium-env-forest.mjs draws all of it.
// Pure: no three.js, no DOM.
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const JUNGLE_KEY = 'perilous-jungle';
/**
 * The clearing reaches this far round every card footprint, and up to CLEARING_WOBBLE_PX further
 * where its edge wanders; past it the undergrowth rises. The gaps between the rows of cards stay
 * clearing; the corners round the block of cards fill with jungle.
 */
export const CLEARING_RADIUS_PX = 96;
export const CLEARING_WOBBLE_PX = 30;
/** How softly the clearing rounds into the corners between footprints, px. */
export const CLEARING_BLEND_PX = 40;
/** The undergrowth closes in this far past the table's near and far edges, px. */
export const TABLE_EDGE_HEDGE_PX = 4;
/** Card footprints the shader's clearing holds (a uniform array this long). */
export const MAX_CARD_RECTS = 32;
/** Gap kept between the pool's edge and any card footprint. */
export const POOL_CARD_GAP_PX = 24;
export const POOL_MIN_RADIUS = 60;
export const POOL_MAX_RADIUS = 135;
/** Share of its radius the pool may run past the table's left edge. */
export const POOL_EDGE_OVERHANG = 0.25;
const POOL_SEAM_SPAN_PX = 160;
const POOL_STEP_PX = 6;
/** The grassy island in the pool: its centre off the pool's, and its radius, as shares of the pool's radius. */
export const ISLAND = Object.freeze({ x: -0.3, y: 0.18, r: 0.26 });
/** Points of the stream's course (stadium-env-forest.mjs holds them in a uniform array this long). */
export const STREAM_POINTS = 32;
/** Half width of the stream: never narrower than `min`, up to `max` where the cards leave room. */
export const STREAM_HALF_WIDTH = { min: 22, max: 44 };
/** How far either side of the seam the stream may wander while it finds its way between the cards. */
export const STREAM_SPAN_PX = 76;
const STREAM_COLUMN_PX = 20;
const STREAM_ROW_PX = 4;
/** Steepest turn the course takes: px across per column. */
const STREAM_MAX_STEP_PX = 12;
/** The meander the stream follows where no card is near: amplitude and wavelength, px. */
const STREAM_MEANDER = { amplitude: 34, wavelength: 560 };
/** Clearance from the cards past which they no longer pull the stream, px. */
const STREAM_FREE_PX = 90;
/** Leaf kinds stadium-env-forest.mjs draws. */
export const LEAF_KINDS = Object.freeze({ broad: 0, pointed: 1, frond: 2 });
/** Spacing of the undergrowth's leaves, px. */
const LEAF_SPACING_PX = 22;
/** Leaves start this far out past the clearing's edge, px. */
const LEAF_CLEARING_GAP_PX = 6;
/** Bank leaves stand this clear of every card footprint, px. */
const BANK_CARD_GAP_PX = 44;
/** Bank leaves grow only this far inside the clearing's edge, px. */
const BANK_CLEARING_REACH_PX = 24;
/** Flowers stand this clear of every card footprint, px. */
const FLOWER_CARD_GAP_PX = 50;
/** Spacing of the bell clumps and of the flower spikes along the banks, px. */
const BELL_CLUMP_SPACING_PX = 105;
const SPIKE_SPACING_PX = 150;

const distanceToRect = (x, y, rect) => {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
};

const smoothstep = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

const cardRectsOf = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

/** Least distance from (x, y) to any of `rects`, capped at `cap`. */
const clearanceAt = (x, y, rects, cap = Infinity) => {
  let clearance = cap;
  for (const rect of rects) clearance = Math.min(clearance, distanceToRect(x, y, rect));
  return clearance;
};

/** A deterministic 0..1 from a point and a salt, so the jungle grows the same on every bake. */
const hash = (x, y, salt) => {
  let h = Math.imul(Math.round(x * 7) | 0, 0x27d4eb2d) ^ Math.imul((Math.round(y * 7) | 0) + salt * 0x165667b1, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Polynomial smooth minimum (stadium-env-forest.mjs computes it the same way). */
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/**
 * How far the clearing's edge wanders out at (x, y), 0..1 of CLEARING_WOBBLE_PX: sines, so the
 * shader (stadium-env-forest.mjs clearingWobble) traces the very same edge.
 */
export function clearingWobble(x, y) {
  return 0.5 + 0.3 * Math.sin(x * 0.019 + 1.3) * Math.sin(y * 0.023 + 0.4) + 0.2 * Math.sin((x - y) * 0.011 + 2.2);
}

/**
 * Signed px from the clearing's edge at (x, y), negative inside: the card footprints `cards`, merged
 * softly, grown by CLEARING_RADIUS_PX and the edge's wobble, and cut off TABLE_EDGE_HEDGE_PX past
 * the `table`'s near and far edges. Positive everywhere without cards.
 * @param {{ cards: { x: number, y: number, w: number, h: number }[],
 *   table: { x: number, y: number, w: number, h: number } }} spots
 */
export function clearingDistance({ cards, table }, x, y) {
  let near = 100000;
  for (const rect of cards) near = smin(near, distanceToRect(x, y, rect), CLEARING_BLEND_PX);
  const reach = near - CLEARING_RADIUS_PX - CLEARING_WOBBLE_PX * clearingWobble(x, y);
  const pastTable = Math.max(table.y - y, y - (table.y + table.h)) - TABLE_EDGE_HEDGE_PX;
  return Math.max(reach, pastTable);
}

/**
 * The poison pool (the card art's pink pool): the largest circle left of the cards, near the seam,
 * clear of every card footprint by POOL_CARD_GAP_PX and running at most POOL_EDGE_OVERHANG of its
 * radius past the table's left edge; nearer the seam and the cards wins ties. Null when no circle of
 * POOL_MIN_RADIUS fits.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ x: number, y: number, r: number }|null}
 */
export function poisonPool(layout) {
  const bounds = tableBounds(layout);
  const rects = layout?.self && layout?.opp ? cardRectsOf(layout) : [];
  if (!rects.length || !(bounds.w > 0 && bounds.h > 0)) return null;
  const seam = layout.depth;
  const cardsLeft = Math.min(...rects.map((rect) => rect.x));
  let best = null;
  for (let x = bounds.x; x <= cardsLeft; x += POOL_STEP_PX) {
    for (let y = seam - POOL_SEAM_SPAN_PX; y <= seam + POOL_SEAM_SPAN_PX; y += POOL_STEP_PX) {
      const room = Math.min(
        POOL_MAX_RADIUS,
        clearanceAt(x, y, rects) - POOL_CARD_GAP_PX,
        (x - bounds.x) / (1 - POOL_EDGE_OVERHANG),
        y - bounds.y,
        bounds.y + bounds.h - y
      );
      if (room < POOL_MIN_RADIUS) continue;
      const score = room - 0.1 * Math.abs(y - seam) - 0.02 * (cardsLeft - x);
      if (!best || score > best.score) best = { x, y, r: room, score };
    }
  }
  return best && { x: best.x, y: best.y, r: best.r };
}

/**
 * The stream's course column by column, from `startX` to `endX`: the path through the band
 * STREAM_SPAN_PX either side of the seam that keeps farthest from the cards, turning at most
 * STREAM_MAX_STEP_PX a column, and where no card is near following a gentle meander. `pinned`
 * holds its first columns on the pool's centre. Best path by dynamic programming over the rows.
 */
const routeStream = ({ startX, endX, seam, rects, pinned }) => {
  const columns = [];
  for (let x = startX; x <= endX + 1e-9; x += STREAM_COLUMN_PX) columns.push(x);
  const rows = [];
  for (let y = seam - STREAM_SPAN_PX; y <= seam + STREAM_SPAN_PX + 1e-9; y += STREAM_ROW_PX) rows.push(y);
  const meander = (x) => seam + STREAM_MEANDER.amplitude * Math.sin(((x - startX) / STREAM_MEANDER.wavelength) * 2 * Math.PI);
  const gain = (x, y) => {
    if (pinned && x <= pinned.untilX) return -Math.abs(y - pinned.y);
    return clearanceAt(x, y, rects, STREAM_FREE_PX) - 0.15 * Math.abs(y - meander(x));
  };
  const reach = Math.round(STREAM_MAX_STEP_PX / STREAM_ROW_PX);
  let scores = rows.map((y) => gain(columns[0], y));
  const from = [];
  for (let c = 1; c < columns.length; c += 1) {
    const next = [];
    const back = [];
    for (let r = 0; r < rows.length; r += 1) {
      let best = -Infinity;
      let bestRow = r;
      for (let k = Math.max(0, r - reach); k <= Math.min(rows.length - 1, r + reach); k += 1) {
        const score = scores[k] - 0.8 * Math.abs(rows[r] - rows[k]);
        if (score > best) {
          best = score;
          bestRow = k;
        }
      }
      next.push(best + gain(columns[c], rows[r]));
      back.push(bestRow);
    }
    scores = next;
    from.push(back);
  }
  let row = scores.indexOf(Math.max(...scores));
  const path = [];
  for (let c = columns.length - 1; c >= 0; c -= 1) {
    path.push({ x: columns[c], y: rows[row] });
    if (c > 0) row = from[c - 1][row];
  }
  return path.reverse();
};

/** Moving average over `radius` neighbours either side, the ends held. */
const smoothed = (values, radius) =>
  values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k += 1) {
      sum += values[k];
      count += 1;
    }
    return sum / count;
  });

/** `count` points spaced evenly along the polyline `points` ({ x, y, w }), its ends included. */
const resampled = (points, count) => {
  const runs = [0];
  for (let i = 1; i < points.length; i += 1) {
    runs.push(runs[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = runs[runs.length - 1];
  const out = [];
  let segment = 1;
  for (let k = 0; k < count; k += 1) {
    const at = (total * k) / (count - 1);
    while (segment < points.length - 1 && runs[segment] < at) segment += 1;
    const span = runs[segment] - runs[segment - 1] || 1;
    const t = Math.min(1, Math.max(0, (at - runs[segment - 1]) / span));
    const a = points[segment - 1];
    const b = points[segment];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
  }
  return out;
};

/**
 * The poison stream's course: STREAM_POINTS points `{ x, y, w }` (centre line and half width, px)
 * from the pool's centre (from past the scene's left edge without a pool) along the seam to past
 * the scene's right edge. It winds through the gaps between the cards, as wide as they leave room
 * for (STREAM_HALF_WIDTH), and meanders where no card is near. Empty without a table or cards.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {ReturnType<typeof poisonPool>} pool
 * @returns {{ x: number, y: number, w: number }[]}
 */
export function streamCourse(layout, pool) {
  const scene = sceneBounds(layout, JUNGLE_KEY);
  const rects = layout?.self && layout?.opp ? cardRectsOf(layout) : [];
  if (!rects.length || !(scene.w > 0 && scene.h > 0)) return [];
  const seam = layout.depth;
  const startX = pool ? pool.x : scene.x - 2 * STREAM_COLUMN_PX;
  const pinned = pool ? { untilX: pool.x + pool.r * 0.5, y: pool.y } : null;
  const path = routeStream({ startX, endX: scene.x + scene.w + 2 * STREAM_COLUMN_PX, seam, rects, pinned });
  const ys = smoothed(smoothed(path.map((point) => point.y), 2), 2);
  const widths = smoothed(
    path.map(({ x }, i) => {
      const room = clearanceAt(x, ys[i], rects, STREAM_FREE_PX);
      return Math.min(STREAM_HALF_WIDTH.max, Math.max(STREAM_HALF_WIDTH.min, STREAM_HALF_WIDTH.min + (room - 10) * 0.5));
    }),
    3
  );
  return resampled(
    path.map(({ x }, i) => ({ x, y: ys[i], w: widths[i] })),
    STREAM_POINTS
  );
}

/** Signed px from the water's edge at (x, y): the stream's capsules and the pool's circle. */
export function waterDistance({ pool, stream }, x, y) {
  let best = pool ? Math.hypot(x - pool.x, y - pool.y) - pool.r : Infinity;
  for (let i = 1; i < stream.length; i += 1) {
    const a = stream[i - 1];
    const b = stream[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const span = abx * abx + aby * aby;
    const t = span > 0 ? Math.min(1, Math.max(0, ((x - a.x) * abx + (y - a.y) * aby) / span)) : 0;
    const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t)) - (a.w + (b.w - a.w) * t);
    best = Math.min(best, d);
  }
  return best;
}

/** The nearest point of the water's centre (the pool's centre or the stream's centre line) to (x, y). */
const waterCentreNear = ({ pool, stream }, x, y) => {
  let best = pool ? { x: pool.x, y: pool.y, d: Math.hypot(x - pool.x, y - pool.y) - pool.r } : null;
  for (let i = 1; i < stream.length; i += 1) {
    const a = stream[i - 1];
    const b = stream[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const span = abx * abx + aby * aby;
    const t = span > 0 ? Math.min(1, Math.max(0, ((x - a.x) * abx + (y - a.y) * aby) / span)) : 0;
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const d = Math.hypot(x - cx, y - cy) - (a.w + (b.w - a.w) * t);
    if (!best || d < best.d) best = { x: cx, y: cy, d };
  }
  return best;
};

/**
 * The grassy island in the pool (stadium-env-forest.mjs poolIsland raises it there): centre and
 * radius, null without a pool.
 * @param {ReturnType<typeof poisonPool>} pool
 * @returns {{ x: number, y: number, r: number }|null}
 */
export function poolIsland(pool) {
  return pool ? { x: pool.x + ISLAND.x * pool.r, y: pool.y + ISLAND.y * pool.r, r: ISLAND.r * pool.r } : null;
}

/** Points every `spacing` px round the pool's shore, `out` px past it, then along both banks of the stream. */
const bankPoints = ({ pool, stream }, spacing, out, salt) => {
  const points = [];
  if (pool) {
    const steps = Math.max(4, Math.round((2 * Math.PI * pool.r) / spacing));
    for (let k = 0; k < steps; k += 1) {
      const angle = ((k + 0.5 * hash(k, pool.r, salt)) / steps) * 2 * Math.PI;
      points.push({ x: pool.x + Math.cos(angle) * (pool.r + out), y: pool.y + Math.sin(angle) * (pool.r + out) });
    }
  }
  let carried = spacing / 2;
  for (let i = 1; i < stream.length; i += 1) {
    const a = stream[i - 1];
    const b = stream[i];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(span > 0)) continue;
    const across = { x: -(b.y - a.y) / span, y: (b.x - a.x) / span };
    let s = carried;
    for (; s < span; s += spacing) {
      const t = s / span;
      const w = a.w + (b.w - a.w) * t;
      for (const side of [-1, 1]) {
        points.push({
          x: a.x + (b.x - a.x) * t + across.x * (w + out) * side,
          y: a.y + (b.y - a.y) * t + across.y * (w + out) * side,
        });
      }
    }
    carried = s - span;
  }
  return points;
};

/** Whether a flower may stand at (x, y): out in the jungle, clear of the cards, on dry ground by the water. */
const flowerSpot = (spots, x, y) =>
  clearanceAt(x, y, spots.cards) >= FLOWER_CARD_GAP_PX &&
  clearingDistance(spots, x, y) >= -10 &&
  waterDistance(spots, x, y) >= 2;

/**
 * One drooping bell flower (the card art's): root (x, y), `yaw` the heading its stem arches over to,
 * `height` and `reach` of the stem's tip px, the bell's `radius` px, `seed` 0..1.
 * @typedef {{ x: number, y: number, yaw: number, height: number, reach: number, radius: number, seed: number }} Bell
 */

/**
 * The drooping bell flowers: clumps of three to five on the banks out in the jungle, round the pool
 * and along the stream, each stem arching out over the water so its bell hangs above the poison.
 * @param {{ pool: ReturnType<typeof poisonPool>, stream: ReturnType<typeof streamCourse>, cards: object[] }} spots
 * @returns {Bell[]}
 */
export function jungleBells(spots) {
  const bells = [];
  for (const point of bankPoints(spots, BELL_CLUMP_SPACING_PX, 12, 5)) {
    if (!flowerSpot(spots, point.x, point.y)) continue;
    const centre = waterCentreNear(spots, point.x, point.y);
    if (!centre) continue;
    const heading = Math.atan2(centre.y - point.y, centre.x - point.x);
    const count = 3 + Math.floor(hash(point.x, point.y, 1) * 3);
    for (let k = 0; k < count; k += 1) {
      const roll = (j) => hash(point.x, point.y, 10 + k * 8 + j);
      bells.push({
        x: point.x + (roll(1) - 0.5) * 16,
        y: point.y + (roll(2) - 0.5) * 16,
        yaw: heading + (roll(3) - 0.5) * 1.3,
        height: 38 + 28 * roll(4),
        reach: 20 + Math.min(30 * roll(5), Math.max(centre.d, 0) + 14),
        radius: 9 + 5 * roll(6),
        seed: roll(7),
      });
    }
  }
  return bells;
}

/**
 * One flower spike (the card art's pink spires): root (x, y), `height` and base `radius` px, `lean`
 * (rad) toward `leanYaw`, `seed` 0..1.
 * @typedef {{ x: number, y: number, height: number, radius: number, lean: number, leanYaw: number, seed: number }} Spike
 */

const spikeAt = (x, y, salt, scale = 1) => {
  const roll = (j) => hash(x, y, 40 + salt * 8 + j);
  return {
    x,
    y,
    height: (40 + 26 * roll(1)) * scale,
    radius: (7 + 3 * roll(2)) * scale,
    lean: 0.12 * roll(3),
    leanYaw: roll(4) * 2 * Math.PI,
    seed: roll(5),
  };
};

/**
 * The flower spikes: two or three on the pool's island, the rest in pairs along the banks out in
 * the jungle.
 * @param {{ pool: ReturnType<typeof poisonPool>, stream: ReturnType<typeof streamCourse>, cards: object[] }} spots
 * @returns {Spike[]}
 */
export function jungleSpikes(spots) {
  const spikes = [];
  const island = poolIsland(spots.pool);
  if (island) {
    const count = 2 + Math.floor(hash(island.x, island.y, 3) * 2);
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * 2 * Math.PI + hash(island.x, k, 4);
      const out = island.r * 0.35 * hash(island.y, k, 5);
      spikes.push(spikeAt(island.x + Math.cos(angle) * out, island.y + Math.sin(angle) * out, k, 1.1));
    }
  }
  for (const point of bankPoints(spots, SPIKE_SPACING_PX, 26, 7)) {
    if (!flowerSpot(spots, point.x, point.y)) continue;
    spikes.push(spikeAt(point.x, point.y, 0));
    const offset = { x: point.x + 12 + 8 * hash(point.x, point.y, 6), y: point.y - 10 + 20 * hash(point.x, point.y, 7) };
    if (flowerSpot(spots, offset.x, offset.y)) spikes.push(spikeAt(offset.x, offset.y, 1, 0.8));
  }
  return spikes;
}

/** Fronds and small leaves sprouting round the island's flower spikes. */
const islandLeaves = (spots) => {
  const island = poolIsland(spots.pool);
  if (!island) return [];
  const leaves = [];
  const count = 9;
  for (let k = 0; k < count; k += 1) {
    const angle = (k / count) * 2 * Math.PI + hash(island.x, k, 60);
    const out = island.r * (0.15 + 0.45 * hash(island.y, k, 61));
    const x = island.x + Math.cos(angle) * out;
    const y = island.y + Math.sin(angle) * out;
    const kind = k % 3 === 0 ? LEAF_KINDS.frond : LEAF_KINDS.pointed;
    const length = 22 + 16 * hash(x, y, 62);
    leaves.push(
      leafOf(x, y, 5, {
        yaw: angle + (hash(x, y, 63) - 0.5) * 0.6,
        follow: 0,
        kind,
        length,
        width: widthFor(kind, length, 0.5),
        tint: k % 2,
      })
    );
  }
  return leaves;
};

/** A rosette of broad leaves round the foot of every flower spike off the island. */
const rosetteLeaves = (spots) => {
  const island = poolIsland(spots.pool);
  const leaves = [];
  for (const spike of spots.spikes ?? []) {
    if (island && Math.hypot(spike.x - island.x, spike.y - island.y) < island.r) continue;
    const count = 4 + Math.floor(spike.seed * 3);
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * 2 * Math.PI + spike.seed * 9;
      const length = spike.height * (0.55 + 0.2 * hash(spike.x, k, 70));
      leaves.push(
        leafOf(spike.x, spike.y, 6 + k, {
          yaw: angle,
          follow: 0,
          kind: LEAF_KINDS.broad,
          length,
          width: widthFor(LEAF_KINDS.broad, length, 0.4),
          tint: hash(spike.x, spike.y, 71) < 0.6 ? 2 : 0,
          lift: 0.45 + 0.3 * hash(spike.x, k, 72),
        })
      );
    }
  }
  return leaves;
};

/**
 * One leaf: root (x, y) in table px; `yaw` its heading (rad) or, with `follow` 1, its turn off the
 * ground's downhill; `length`, `width` px; `kind` (LEAF_KINDS); `tint` 0..3 (stadium-env-forest.mjs's
 * palette); `lift` the angle it leaves the ground at, `droop` how far it curls over to its tip,
 * `fold` the angle its halves rise from the midrib (rad); `seed` 0..1.
 * @typedef {{ x: number, y: number, yaw: number, follow: number, length: number, width: number,
 *   kind: number, tint: number, lift: number, droop: number, fold: number, seed: number }} Leaf
 */

const leafOf = (x, y, salt, overrides) => {
  const roll = (k) => hash(x, y, salt * 16 + k);
  const kindRoll = roll(1);
  const kind = kindRoll < 0.5 ? LEAF_KINDS.pointed : kindRoll < 0.8 ? LEAF_KINDS.broad : LEAF_KINDS.frond;
  return {
    x,
    y,
    yaw: roll(2) * 2 * Math.PI,
    follow: 1,
    length: 30,
    width: 12,
    kind,
    // Bushes keep one colour: the tint follows a coarse cell, with one leaf in four off it.
    tint: Math.floor((roll(3) < 0.75 ? hash(Math.floor(x / 110), Math.floor(y / 110), 77) : roll(4)) * 4),
    lift: 0.5 + 0.5 * roll(5),
    droop: 0.8 + 0.8 * roll(6),
    fold: 0.25 + 0.25 * roll(7),
    seed: roll(8),
    ...overrides,
  };
};

const widthFor = (kind, length, roll) =>
  length * (kind === LEAF_KINDS.broad ? 0.5 + 0.1 * roll : kind === LEAF_KINDS.frond ? 0.36 : 0.3 + 0.08 * roll);

/**
 * The undergrowth's leaves: a jittered grid over the scene past the clearing's edge, none in the
 * water; bigger farther out, and each bush (a coarse cell) of its own size.
 */
const undergrowthLeaves = (spots, bounds) => {
  const leaves = [];
  for (let gy = bounds.y; gy < bounds.y + bounds.h; gy += LEAF_SPACING_PX) {
    for (let gx = bounds.x; gx < bounds.x + bounds.w; gx += LEAF_SPACING_PX) {
      const x = gx + hash(gx, gy, 1) * LEAF_SPACING_PX;
      const y = gy + hash(gx, gy, 2) * LEAF_SPACING_PX;
      const outside = clearingDistance(spots, x, y) - LEAF_CLEARING_GAP_PX;
      if (outside < 0 || waterDistance(spots, x, y) < 2) continue;
      const leaf = leafOf(x, y, 1);
      const bush = 0.75 + 0.6 * hash(Math.floor(x / 90), Math.floor(y / 90), 41);
      const length = (30 + 60 * smoothstep(0, 260, outside)) * bush * (0.8 + 0.4 * hash(gx, gy, 4));
      leaves.push({ ...leaf, length, width: widthFor(leaf.kind, length, hash(gx, gy, 5)) });
    }
  }
  return leaves;
};

/**
 * Big leaves reaching out over the water from its banks, out in the jungle (no deeper than
 * BANK_CLEARING_REACH_PX inside the clearing's edge) and clear of the cards by BANK_CARD_GAP_PX:
 * round the pool, and along both banks of the stream.
 */
const bankLeaves = (spots) => {
  const leaves = [];
  const place = (x, y, salt) => {
    if (clearanceAt(x, y, spots.cards) < BANK_CARD_GAP_PX) return;
    if (clearingDistance(spots, x, y) < -BANK_CLEARING_REACH_PX) return;
    const centre = waterCentreNear(spots, x, y);
    if (!centre || centre.d < 0) return;
    const roll = (k) => hash(x, y, 300 + salt * 16 + k);
    const length = 46 + 40 * roll(1);
    const kind = roll(2) < 0.6 ? LEAF_KINDS.broad : LEAF_KINDS.pointed;
    leaves.push(
      leafOf(x, y, 2 + salt, {
        yaw: Math.atan2(centre.y - y, centre.x - x) + (roll(3) - 0.5) * 1.0,
        follow: 0,
        length,
        width: widthFor(kind, length, roll(4)),
        kind,
        // Mostly the lit greens and teals, so they read against the poison.
        tint: roll(7) < 0.75 ? Math.floor(roll(8) * 2) : 2,
        lift: 0.3 + 0.3 * roll(5),
        droop: 0.5 + 0.5 * roll(6),
      })
    );
  };
  const { pool, stream } = spots;
  if (pool) {
    const steps = Math.max(8, Math.round((2 * Math.PI * pool.r) / 30));
    for (let k = 0; k < steps; k += 1) {
      const angle = ((k + hash(k, pool.r, 9) * 0.6) / steps) * 2 * Math.PI;
      const out = pool.r + 6 + 10 * hash(k, pool.r, 10);
      place(pool.x + Math.cos(angle) * out, pool.y + Math.sin(angle) * out, 0);
    }
  }
  for (let i = 1; i < stream.length; i += 1) {
    const a = stream[i - 1];
    const b = stream[i];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(span > 0)) continue;
    const across = { x: -(b.y - a.y) / span, y: (b.x - a.x) / span };
    for (let s = 0; s < span; s += 40) {
      const t = s / span;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const w = a.w + (b.w - a.w) * t;
      for (const side of [-1, 1]) {
        const out = w + 6 + 8 * hash(x, y, side + 20);
        place(x + across.x * out * side, y + across.y * out * side, side > 0 ? 1 : 2);
      }
    }
  }
  return leaves;
};

/**
 * Every leaf of the jungle for its landmarks (`spots`, jungleSpots) in the scene `bounds`: the
 * undergrowth's, growing bigger farther out from the clearing, and the bank leaves over the water.
 * Deterministic for a layout.
 * @param {ReturnType<typeof jungleSpots>} spots
 * @param {{ x: number, y: number, w: number, h: number }} bounds
 * @returns {Leaf[]}
 */
export function jungleLeaves(spots, bounds) {
  if (!spots?.cards || !(bounds?.w > 0 && bounds?.h > 0)) return [];
  return [...undergrowthLeaves(spots, bounds), ...bankLeaves(spots), ...islandLeaves(spots), ...rosetteLeaves(spots)];
}

/**
 * Perilous Jungle's landmarks for a layout, as its board builds them: the pool, the stream's course,
 * the card footprints the clearing forms round (at most MAX_CARD_RECTS), the table, the bell flowers
 * and the flower spikes.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ pool: ReturnType<typeof poisonPool>, stream: ReturnType<typeof streamCourse>,
 *   cards: { x: number, y: number, w: number, h: number }[], table: { x: number, y: number,
 *   w: number, h: number }, bells: Bell[], spikes: Spike[] }}
 */
export function jungleSpots(layout) {
  const pool = poisonPool(layout);
  const spots = {
    pool,
    stream: streamCourse(layout, pool),
    cards: layout?.self && layout?.opp ? cardRectsOf(layout).slice(0, MAX_CARD_RECTS) : [],
    table: tableBounds(layout),
  };
  return { ...spots, bells: jungleBells(spots), spikes: jungleSpikes(spots) };
}
