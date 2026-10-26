// Design 077 (prototype): where Perilous Jungle's landmarks lie, from the board layout
// (board-layout.mjs flatLayout), so the jungle fits every mat profile and never moves or covers a
// card. The cards lie in a clearing; past its edge the jungle floor rises a little, dotted with
// clumps of broad leaves and ferns. Tall trees stand outside the columns the cards lie in, either
// side, their trunks leaning in over the clearing's edge. Two bogs of poison, each with a grassy
// island, lie in opposite corners away from the seam: the far end left of the cards and the near end
// right of them. stadium-env-forest.mjs draws all of it.
// Pure: no three.js, no DOM.
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const JUNGLE_KEY = 'perilous-jungle';
/**
 * The clearing reaches this far round every card footprint, and up to CLEARING_WOBBLE_PX further
 * where its edge wanders; past it the jungle floor rises. The gaps between the rows of cards stay
 * clearing; the corners round the block of cards fill with jungle.
 */
export const CLEARING_RADIUS_PX = 96;
export const CLEARING_WOBBLE_PX = 30;
/** How softly the clearing rounds into the corners between footprints, px. */
export const CLEARING_BLEND_PX = 40;
/** The jungle closes in this far past the table's near and far edges, px. */
export const TABLE_EDGE_HEDGE_PX = 4;
/** Card footprints the shader's clearing holds (a uniform array this long). */
export const MAX_CARD_RECTS = 32;
/** Gap kept between a bog's edge and any card footprint. */
export const BOG_CARD_GAP_PX = 24;
/** A bog's biggest lobe's radius, px: up to `max` where there's room; a corner with room for less than `min` has no bog. */
export const BOG_LOBE = Object.freeze({ min: 55, max: 115 });
/** Share of its radius a lobe may run past the table's edges. */
export const BOG_EDGE_OVERHANG = 0.3;
/** A bog's biggest lobe keeps its centre this far from the seam, px. */
export const BOG_SEAM_GAP_PX = 150;
/** How softly a bog's lobes merge, px (stadium-env-forest.mjs merges them the same way). */
export const BOG_BLEND_PX = 40;
/** Bogs a jungle holds and lobes a bog holds (stadium-env-forest.mjs keeps them in uniform arrays this long). */
export const MAX_BOGS = 2;
export const MAX_BOG_LOBES = 3;
const BOG_STEP_PX = 6;
/**
 * The corners the bogs lie in, `side` -1 left of the cards and 1 right, `end` 1 the far end and -1
 * the near: each player has one at the front right of their half of the table.
 */
const BOG_CORNERS = Object.freeze([
  { side: -1, end: 1 },
  { side: 1, end: -1 },
]);
/** The grassy island in a bog's middle: its radius as a share of the bog's biggest lobe's. */
export const ISLAND_SHARE = 0.26;
/** Leaf kinds stadium-env-forest.mjs draws. */
export const LEAF_KINDS = Object.freeze({ broad: 0, pointed: 1, frond: 2 });
/** The jungle floor's plants: a jittered grid this coarse, a plant in PLANT_SHARE of its cells. */
export const PLANT_SPACING_PX = 92;
const PLANT_SHARE = 0.62;
/** Plants root at least this far out past the clearing's edge, px. */
export const PLANT_CLEARING_GAP_PX = 8;
/** Leaf length of a plant at the clearing's edge, and how much longer deep in the jungle, px. */
const PLANT_LEAF_PX = { edge: 24, deep: 26 };
/** Share of the plants that are a flower spike in a rosette of broad leaves instead. */
const PLANT_SPIKE_SHARE = 0.14;
/** Shore leaves stand this clear of every card footprint, px. */
const SHORE_CARD_GAP_PX = 44;
/** Shore leaves grow only this far inside the clearing's edge, px. */
const SHORE_CLEARING_REACH_PX = 24;
/** Flowers stand this clear of every card footprint, px. */
const FLOWER_CARD_GAP_PX = 50;
/** Spacing of the bell clumps and of the flower spikes round the bogs' shores, px. */
const BELL_CLUMP_SPACING_PX = 105;
const SPIKE_SPACING_PX = 150;
/** Most trees a jungle holds (stadium-env-forest.mjs keeps their crowns and trunks in uniform arrays this long). */
export const MAX_TREES = 10;
/** Every part of a tree stays this far outside the columns the cards lie in, px. */
export const TREE_CARD_GAP_PX = 24;
/** A crown's radius, px: up to `max` where there's room; a side with room for less than `min` has no trees. */
export const TREE_CROWN = Object.freeze({ min: 85, max: 125 });
/** Least distance between two trunks, px. */
export const TREE_SPACING_PX = 300;
const TREE_STEP_PX = 30;
/** A trunk may stand this far inside the clearing's edge, px. */
export const TREE_CLEARING_REACH_PX = 24;
/** Crowns stand this far inside the scene's outer edges, px. */
const TREE_SCENE_INSET_PX = 12;
/** How far a crown may stand out past where it would touch TREE_CARD_GAP_PX, px. */
const TREE_CROWN_SLACK_PX = 24;

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
 * The middle of the block of cards: the box round every footprint shrunk by CLEARING_RADIUS_PX, so
 * the clearing fills every gap between the cards however far apart they lie. Null when the cards
 * lie too close together for one.
 * @param {{ x: number, y: number, w: number, h: number }[]} cards
 */
export function clearingCore(cards) {
  if (!cards.length) return null;
  const x0 = Math.min(...cards.map((rect) => rect.x)) + CLEARING_RADIUS_PX;
  const y0 = Math.min(...cards.map((rect) => rect.y)) + CLEARING_RADIUS_PX;
  const x1 = Math.max(...cards.map((rect) => rect.x + rect.w)) - CLEARING_RADIUS_PX;
  const y1 = Math.max(...cards.map((rect) => rect.y + rect.h)) - CLEARING_RADIUS_PX;
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * Signed px from the clearing's edge at (x, y), negative inside: the card footprints `cards` and
 * their `core` (clearingCore), merged softly, grown by CLEARING_RADIUS_PX and the edge's wobble, and
 * cut off TABLE_EDGE_HEDGE_PX past the `table`'s near and far edges. Positive everywhere without
 * cards.
 * @param {{ cards: { x: number, y: number, w: number, h: number }[],
 *   core?: { x: number, y: number, w: number, h: number }|null,
 *   table: { x: number, y: number, w: number, h: number } }} spots
 */
export function clearingDistance({ cards, core, table }, x, y) {
  let near = 100000;
  for (const rect of core ? [...cards, core] : cards) near = smin(near, distanceToRect(x, y, rect), CLEARING_BLEND_PX);
  const reach = near - CLEARING_RADIUS_PX - CLEARING_WOBBLE_PX * clearingWobble(x, y);
  const pastTable = Math.max(table.y - y, y - (table.y + table.h)) - TABLE_EDGE_HEDGE_PX;
  return Math.max(reach, pastTable);
}

/**
 * Most radius a lobe centred at (x, y) may take before it runs past an edge of `bounds` by more than
 * BOG_EDGE_OVERHANG of it; negative off `bounds`.
 */
const edgeRoom = (bounds, x, y) =>
  Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y) / (1 - BOG_EDGE_OVERHANG);

/**
 * A bog's biggest lobe in the corner `side`, `end` of `bounds`: the largest circle with its centre
 * outside the cards' columns and BOG_SEAM_GAP_PX or more from the seam, clear of every card footprint
 * by BOG_CARD_GAP_PX, running at most BOG_EDGE_OVERHANG of its radius past an edge of `bounds`;
 * deeper in the corner wins ties. Null when no circle of BOG_LOBE.min fits.
 */
const cornerLobe = ({ side, end }, rects, bounds, seam) => {
  const column = side < 0 ? Math.min(...rects.map((rect) => rect.x)) : Math.max(...rects.map((rect) => rect.x + rect.w));
  const yFrom = end > 0 ? seam + BOG_SEAM_GAP_PX : bounds.y;
  const yTo = end > 0 ? bounds.y + bounds.h : seam - BOG_SEAM_GAP_PX;
  let best = null;
  for (let x = bounds.x; x <= bounds.x + bounds.w; x += BOG_STEP_PX) {
    if ((x - column) * side < 0) continue;
    for (let y = yFrom; y <= yTo; y += BOG_STEP_PX) {
      const r = Math.min(BOG_LOBE.max, clearanceAt(x, y, rects) - BOG_CARD_GAP_PX, edgeRoom(bounds, x, y));
      if (r < BOG_LOBE.min) continue;
      const score = r + 0.06 * Math.abs(y - seam) + 0.03 * Math.abs(x - column);
      if (!best || score > best.score) best = { x, y, r, score };
    }
  }
  return best && { x: best.x, y: best.y, r: best.r };
};

const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * The smaller lobes bulging off a bog's biggest lobe `main`, so no bog is round: up to
 * MAX_BOG_LOBES - 1 of them, headed apart, clear of the cards and within `bounds` as the biggest
 * lobe is; the first heads toward the seam where there's room.
 */
const sideLobes = (main, rects, bounds, end) => {
  const toSeam = (-end * Math.PI) / 2;
  const options = [];
  for (let k = 0; k < 12; k += 1) {
    const roll = (j) => hash(main.x, main.y, 700 + k * 4 + j);
    const angle = ((k + (roll(1) - 0.5) * 0.4) / 12) * 2 * Math.PI;
    const reach = main.r * (0.85 + 0.15 * roll(2));
    const x = main.x + Math.cos(angle) * reach;
    const y = main.y + Math.sin(angle) * reach;
    const r = Math.min(main.r * (0.55 + 0.15 * roll(3)), clearanceAt(x, y, rects) - BOG_CARD_GAP_PX, edgeRoom(bounds, x, y));
    if (r < main.r * 0.35) continue;
    options.push({ x, y, r, angle, score: r + 6 * Math.cos(angle - toSeam) });
  }
  options.sort((a, b) => b.score - a.score);
  const lobes = [];
  for (const option of options) {
    if (lobes.length >= MAX_BOG_LOBES - 1) break;
    if (lobes.some((lobe) => angleBetween(lobe.angle, option.angle) < 1.5)) continue;
    lobes.push(option);
  }
  return lobes.map(({ x, y, r }) => ({ x, y, r }));
};

/**
 * The grassy island in a bog's middle (its lobes' centroid by area, which the smaller lobes can't
 * pull out of the biggest one), ISLAND_SHARE of the biggest lobe's radius.
 */
const islandOf = (lobes) => {
  const area = lobes.reduce((sum, lobe) => sum + lobe.r * lobe.r, 0);
  const x = lobes.reduce((sum, lobe) => sum + lobe.x * lobe.r * lobe.r, 0) / area;
  const y = lobes.reduce((sum, lobe) => sum + lobe.y * lobe.r * lobe.r, 0) / area;
  return { x, y, r: ISLAND_SHARE * lobes[0].r };
};

/**
 * One bog of poison: its lobes (circles, the first the biggest), merged softly, and the grassy
 * island in its biggest lobe.
 * @typedef {{ lobes: { x: number, y: number, r: number }[], island: { x: number, y: number, r: number } }} Bog
 */

/**
 * The poison bogs (the card art's pink swamp): one in each of BOG_CORNERS, in the table where there's
 * room for one there, else out in the scene round it. Deterministic for a layout.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {Bog[]}
 */
export function poisonBogs(layout) {
  const table = tableBounds(layout);
  const rects = layout?.self && layout?.opp ? cardRectsOf(layout) : [];
  if (!rects.length || !(table.w > 0 && table.h > 0)) return [];
  const scene = sceneBounds(layout, JUNGLE_KEY);
  const bogs = [];
  for (const corner of BOG_CORNERS) {
    let bounds = table;
    let main = cornerLobe(corner, rects, table, layout.depth);
    if (!main) {
      bounds = scene;
      main = cornerLobe(corner, rects, scene, layout.depth);
    }
    if (!main) continue;
    const lobes = [main, ...sideLobes(main, rects, bounds, corner.end)];
    bogs.push({ lobes, island: islandOf(lobes) });
  }
  return bogs;
}

/**
 * Signed px from the bogs' edge at (x, y), negative in them (their islands count as water): every
 * lobe merged softly, as stadium-env-forest.mjs bogDistance merges them. Infinity without bogs.
 * @param {{ bogs?: Bog[] }} spots
 */
export function waterDistance({ bogs = [] }, x, y) {
  let near = Infinity;
  for (const { lobes } of bogs) {
    for (const lobe of lobes) {
      const d = Math.hypot(x - lobe.x, y - lobe.y) - lobe.r;
      near = Number.isFinite(near) ? smin(near, d, BOG_BLEND_PX) : d;
    }
  }
  return near;
}

/**
 * Points every `spacing` px round the bogs' shores, `out` px past them, each with the centre of the
 * lobe it faces (`to`).
 */
const shorePoints = (spots, spacing, out, salt) => {
  const points = [];
  for (const { lobes } of spots.bogs ?? []) {
    for (const lobe of lobes) {
      const steps = Math.max(4, Math.round((2 * Math.PI * lobe.r) / spacing));
      for (let k = 0; k < steps; k += 1) {
        const angle = ((k + 0.5 * hash(k, lobe.r, salt)) / steps) * 2 * Math.PI;
        const point = { x: lobe.x + Math.cos(angle) * (lobe.r + out), y: lobe.y + Math.sin(angle) * (lobe.r + out), to: lobe };
        // Skip points another lobe swallows or crowds.
        if (waterDistance(spots, point.x, point.y) >= out * 0.75) points.push(point);
      }
    }
  }
  return points;
};

/** Whether (x, y) lies on one of the bogs' islands. */
const onIsland = (spots, x, y) => (spots.bogs ?? []).some(({ island }) => Math.hypot(x - island.x, y - island.y) < island.r);

/** Whether a flower may stand at (x, y): out in the jungle, clear of the cards, on dry ground. */
const flowerSpot = (spots, x, y) =>
  clearanceAt(x, y, spots.cards) >= FLOWER_CARD_GAP_PX &&
  clearingDistance(spots, x, y) >= -10 &&
  waterDistance(spots, x, y) >= 2;

/**
 * One limb: a tapering tube along the quadratic curve from `from` through the control point `via`
 * to `to` ([x, y, z], z px above the ground at the tree's root), radius `r0` to `r1` px; `flare` 1
 * swells its foot into buttress roots (the trunk).
 * @typedef {{ from: number[], via: number[], to: number[], r0: number, r1: number, flare: number }} Limb
 */

/**
 * One clump of a crown's foliage: centre (x, y, z), radius `r` px, `shade` 0..1 (0 low and deep in
 * the crown).
 * @typedef {{ x: number, y: number, z: number, r: number, shade: number }} Puff
 */

/**
 * One vine hanging from the crown: its anchor (x, y, z), `length` and `width` px, `seed` 0..1.
 * @typedef {{ x: number, y: number, z: number, length: number, width: number, seed: number }} Vine
 */

/**
 * A tree: root (x, y) px, `trunk` the trunk's radius over its flared foot px, `side` -1 left of the
 * cards and 1 right, its crown's centre (cx, cy, cz) and radius `crown` px, `palette` 0 for a teal
 * crown and 1 a violet one, `seed` 0..1; its limbs, the clumps of its foliage and its vines, every
 * one of them inside the crown's circle seen from above.
 * @typedef {{ x: number, y: number, trunk: number, side: number, cx: number, cy: number, cz: number,
 *   crown: number, palette: number, seed: number, limbs: Limb[], puffs: Puff[], vines: Vine[] }} Tree
 */

/** How far a clump of foliage reaches past its centre, lumps and all, as a share of its radius. */
export const PUFF_REACH = 1.15;

/** The limbs, foliage and vines of a tree planted at `tree`. */
const growTree = (tree) => {
  const { x, y, cx, cy, cz, crown, trunk, seed } = tree;
  const roll = (k) => hash(x, y, 400 + k);
  // Every clump moved in, if need be, so it stays inside the crown's circle.
  const fit = (clump) => {
    const off = Math.hypot(clump.x - cx, clump.y - cy);
    const room = Math.max(crown - clump.r * PUFF_REACH, 0);
    if (off <= room || off === 0) return clump;
    return { ...clump, x: cx + ((clump.x - cx) * room) / off, y: cy + ((clump.y - cy) * room) / off };
  };
  const fork = [x + (cx - x) * 0.7, y + (cy - y) * 0.7, cz - crown * 0.4];
  const limbs = [
    {
      from: [x, y, -10],
      via: [x + (cx - x) * 0.15, y + (cy - y) * 0.15, fork[2] * 0.5],
      to: fork,
      r0: trunk,
      r1: trunk * 0.72,
      flare: 1,
    },
  ];
  const clumps = [];
  const clusters = 4 + Math.floor(roll(1) * 2);
  const turn = roll(2) * 2 * Math.PI;
  for (let c = 0; c < clusters; c += 1) {
    const angle = turn + (c / clusters) * 2 * Math.PI + (roll(3 + c) - 0.5) * 0.7;
    const out = crown * (0.38 + 0.14 * roll(8 + c));
    const core = fit({
      x: cx + Math.cos(angle) * out,
      y: cy + Math.sin(angle) * out,
      z: cz + crown * (roll(13 + c) - 0.5) * 0.24,
      r: crown * (0.32 + 0.08 * roll(18 + c)),
    });
    clumps.push(core);
    limbs.push({
      from: fork,
      via: [(fork[0] + core.x) / 2, (fork[1] + core.y) / 2, Math.max(fork[2], core.z - core.r * 0.6)],
      to: [core.x, core.y, core.z - core.r * 0.3],
      r0: trunk * 0.5,
      r1: trunk * 0.22,
      flare: 0,
    });
    for (let s = 0; s < 3; s += 1) {
      const k = 30 + c * 10 + s;
      const around = angle + (s / 3) * 2 * Math.PI + (roll(k) - 0.5) * 0.8;
      const rise = 0.15 + 0.55 * roll(k + 100);
      const reach = core.r * 0.85;
      clumps.push(
        fit({
          x: core.x + Math.cos(around) * Math.cos(rise) * reach,
          y: core.y + Math.sin(around) * Math.cos(rise) * reach,
          z: core.z + Math.sin(rise) * reach * 0.7,
          r: core.r * (0.55 + 0.2 * roll(k + 200)),
        })
      );
    }
  }
  clumps.push(fit({ x: cx, y: cy, z: cz + crown * 0.15, r: crown * 0.38 }));
  const puffs = clumps.map((clump) => {
    const up = (clump.z + clump.r * 0.5 - (cz - crown * 0.5)) / (crown * 1.2);
    const out = Math.hypot(clump.x - cx, clump.y - cy) / crown;
    return { ...clump, shade: Math.min(1, Math.max(0, 0.3 + 0.5 * up + 0.3 * out)) };
  });
  const vines = [];
  const low = puffs.filter((puff) => puff.z < cz);
  const count = Math.min(low.length, 4 + Math.floor(roll(5) * 4));
  for (let k = 0; k < count; k += 1) {
    const puff = low[Math.floor(roll(500 + k) * low.length)];
    const z = puff.z - puff.r * 0.5;
    const length = Math.min(60 + 90 * roll(510 + k), z - 40);
    if (length < 20) continue;
    vines.push({
      x: puff.x + (roll(520 + k) - 0.5) * puff.r,
      y: puff.y + (roll(530 + k) - 0.5) * puff.r,
      z,
      length,
      width: 16 + 8 * roll(540 + k),
      seed: roll(550 + k),
    });
  }
  return { ...tree, palette: seed < 0.6 ? 0 : 1, limbs, puffs, vines };
};

/**
 * The jungle's trees, outside the columns the cards lie in: each crown's circle (which holds every
 * part of its tree) ends TREE_CARD_GAP_PX or a little more past the outermost card on its side, and
 * its trunk leans out to it from a root nearer the cards, on dry ground at the clearing's edge or
 * past it. Every board camera stands over the table's centre line, so it leans a tree outward on
 * screen, away from the cards, and the trunk shows under the crown. Trunks stand TREE_SPACING_PX
 * apart or more, crowns off most of every bog's lobes; at most MAX_TREES, and none on a side without
 * room for a crown of TREE_CROWN.min. Deterministic for a layout.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ bogs: Bog[], cards: object[], core?: object|null, table: object }} spots
 * @returns {Tree[]}
 */
export function jungleTrees(layout, spots) {
  const scene = sceneBounds(layout, JUNGLE_KEY);
  const rects = layout?.self && layout?.opp ? cardRectsOf(layout) : [];
  if (!rects.length || !(scene.w > 0 && scene.h > 0)) return [];
  const limits = new Map([
    [-1, Math.min(...rects.map((rect) => rect.x)) - TREE_CARD_GAP_PX],
    [1, Math.max(...rects.map((rect) => rect.x + rect.w)) + TREE_CARD_GAP_PX],
  ]);
  const candidates = [];
  for (const [side, limit] of limits) {
    const sceneEdge = side < 0 ? scene.x : scene.x + scene.w;
    const room = (Math.abs(sceneEdge - limit) - TREE_SCENE_INSET_PX - TREE_CROWN_SLACK_PX) / 2;
    if (room < TREE_CROWN.min) continue;
    for (let cy = scene.y + TREE_STEP_PX; cy < scene.y + scene.h - TREE_STEP_PX / 2; cy += TREE_STEP_PX) {
      const roll = (k) => hash(side * 977, cy, 90 + k);
      const crown = Math.min(TREE_CROWN.max, room) * (0.8 + 0.2 * roll(1));
      if (crown < TREE_CROWN.min) continue;
      const trunk = crown * (0.22 + 0.05 * roll(2));
      const cx = limit + side * (crown + TREE_CROWN_SLACK_PX * roll(3));
      const lean = crown * (0.25 + 0.2 * roll(4));
      candidates.push({
        x: cx - side * lean,
        y: cy + (roll(5) - 0.5) * lean * 0.8,
        trunk,
        side,
        cx,
        cy,
        cz: 165 + crown * (0.45 + 0.3 * roll(6)),
        crown,
        seed: roll(7),
        order: roll(8),
      });
    }
  }
  candidates.sort((a, b) => a.order - b.order);
  const trees = [];
  for (const { order, ...tree } of candidates) {
    if (trees.length >= MAX_TREES) break;
    if (tree.y < scene.y + TREE_SCENE_INSET_PX || tree.y > scene.y + scene.h - TREE_SCENE_INSET_PX) continue;
    if (tree.cy - tree.crown * 0.5 < scene.y || tree.cy + tree.crown * 0.5 > scene.y + scene.h) continue;
    if (clearingDistance(spots, tree.x, tree.y) < -TREE_CLEARING_REACH_PX) continue;
    if (waterDistance(spots, tree.x, tree.y) < tree.trunk * 2.2 + 8) continue;
    const lobes = (spots.bogs ?? []).flatMap((bog) => bog.lobes);
    if (lobes.some((lobe) => Math.hypot(tree.cx - lobe.x, tree.cy - lobe.y) < lobe.r * 0.8 + tree.crown * 0.55)) continue;
    if (trees.some((other) => Math.hypot(other.x - tree.x, other.y - tree.y) < TREE_SPACING_PX)) continue;
    trees.push(tree);
  }
  return trees.sort((a, b) => a.side - b.side || a.y - b.y).map(growTree);
}

/**
 * One plant of the jungle floor: root (x, y), leaf `size` px, `kind` (LEAF_KINDS), `tint`, `count`
 * leaves, `spike` (a flower spike in a rosette instead), `seed` 0..1.
 * @typedef {{ x: number, y: number, size: number, kind: number, tint: number, count: number,
 *   spike: boolean, seed: number }} Plant
 */

/**
 * The jungle floor's plants: a jittered grid over the `scene`, a plant in PLANT_SHARE of its cells,
 * each PLANT_CLEARING_GAP_PX or more past the clearing's edge, on dry ground and clear of the
 * trunks; bigger deeper in the jungle.
 * @param {{ bogs: Bog[], cards: object[], core?: object|null, table: object, trees: Tree[] }} spots
 * @param {{ x: number, y: number, w: number, h: number }} scene
 * @returns {Plant[]}
 */
export function junglePlants(spots, scene) {
  const plants = [];
  for (let gy = scene.y; gy < scene.y + scene.h; gy += PLANT_SPACING_PX) {
    for (let gx = scene.x; gx < scene.x + scene.w; gx += PLANT_SPACING_PX) {
      if (hash(gx, gy, 30) > PLANT_SHARE) continue;
      const x = gx + (0.15 + 0.7 * hash(gx, gy, 31)) * PLANT_SPACING_PX;
      const y = gy + (0.15 + 0.7 * hash(gx, gy, 32)) * PLANT_SPACING_PX;
      const outside = clearingDistance(spots, x, y) - PLANT_CLEARING_GAP_PX;
      if (outside < 0 || waterDistance(spots, x, y) < 24) continue;
      if (spots.trees.some((tree) => Math.hypot(x - tree.x, y - tree.y) < tree.trunk * 2.4 + 14)) continue;
      const roll = (k) => hash(x, y, 33 + k);
      const kindRoll = roll(2);
      plants.push({
        x,
        y,
        size: (PLANT_LEAF_PX.edge + PLANT_LEAF_PX.deep * smoothstep(0, 240, outside)) * (0.8 + 0.4 * roll(1)),
        kind: kindRoll < 0.45 ? LEAF_KINDS.pointed : kindRoll < 0.75 ? LEAF_KINDS.broad : LEAF_KINDS.frond,
        tint: Math.floor(roll(3) * 4),
        count: 5 + Math.floor(roll(4) * 4),
        spike: roll(5) < PLANT_SPIKE_SHARE && flowerSpot(spots, x, y),
        seed: roll(6),
      });
    }
  }
  return plants;
}

/**
 * One drooping bell flower (the card art's): root (x, y), `yaw` the heading its stem arches over to,
 * `height` and `reach` of the stem's tip px, the bell's `radius` px, `seed` 0..1.
 * @typedef {{ x: number, y: number, yaw: number, height: number, reach: number, radius: number, seed: number }} Bell
 */

/**
 * The drooping bell flowers: clumps of three to five round the bogs' shores out in the jungle, each
 * stem arching out over the water so its bell hangs above the poison.
 * @param {{ bogs: Bog[], cards: object[], core?: object|null, table: object }} spots
 * @returns {Bell[]}
 */
export function jungleBells(spots) {
  const bells = [];
  for (const point of shorePoints(spots, BELL_CLUMP_SPACING_PX, 12, 5)) {
    if (!flowerSpot(spots, point.x, point.y)) continue;
    const toWater = waterDistance(spots, point.x, point.y);
    const heading = Math.atan2(point.to.y - point.y, point.to.x - point.x);
    const count = 3 + Math.floor(hash(point.x, point.y, 1) * 3);
    for (let k = 0; k < count; k += 1) {
      const roll = (j) => hash(point.x, point.y, 10 + k * 8 + j);
      bells.push({
        x: point.x + (roll(1) - 0.5) * 16,
        y: point.y + (roll(2) - 0.5) * 16,
        yaw: heading + (roll(3) - 0.5) * 1.3,
        height: 38 + 28 * roll(4),
        reach: 20 + Math.min(30 * roll(5), Math.max(toWater, 0) + 14),
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
 * The flower spikes: two or three on each bog's island, pairs round the bogs' shores out in the
 * jungle, and one in each of the floor's spike plants.
 * @param {{ bogs: Bog[], cards: object[], core?: object|null, table: object, plants?: Plant[] }} spots
 * @returns {Spike[]}
 */
export function jungleSpikes(spots) {
  const spikes = [];
  for (const { island } of spots.bogs ?? []) {
    const count = 2 + Math.floor(hash(island.x, island.y, 3) * 2);
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * 2 * Math.PI + hash(island.x, k, 4);
      const out = island.r * 0.35 * hash(island.y, k, 5);
      spikes.push(spikeAt(island.x + Math.cos(angle) * out, island.y + Math.sin(angle) * out, k, 1.1));
    }
  }
  for (const point of shorePoints(spots, SPIKE_SPACING_PX, 26, 7)) {
    if (!flowerSpot(spots, point.x, point.y)) continue;
    spikes.push(spikeAt(point.x, point.y, 0));
    const offset = { x: point.x + 12 + 8 * hash(point.x, point.y, 6), y: point.y - 10 + 20 * hash(point.x, point.y, 7) };
    if (flowerSpot(spots, offset.x, offset.y)) spikes.push(spikeAt(offset.x, offset.y, 1, 0.8));
  }
  for (const plant of spots.plants ?? []) if (plant.spike) spikes.push(spikeAt(plant.x, plant.y, 2));
  return spikes;
}

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
    follow: 0,
    length: 30,
    width: 12,
    kind,
    tint: Math.floor(roll(3) * 4),
    lift: 0.5 + 0.5 * roll(5),
    droop: 0.8 + 0.8 * roll(6),
    fold: 0.25 + 0.25 * roll(7),
    seed: roll(8),
    ...overrides,
  };
};

const widthFor = (kind, length, roll) =>
  length * (kind === LEAF_KINDS.broad ? 0.5 + 0.1 * roll : kind === LEAF_KINDS.frond ? 0.36 : 0.3 + 0.08 * roll);

/** Each plant's leaves, fanned round its root and arching up and over (spike plants grow a rosette instead). */
const plantLeaves = (spots) => {
  const leaves = [];
  for (const plant of spots.plants ?? []) {
    if (plant.spike) continue;
    for (let k = 0; k < plant.count; k += 1) {
      const roll = (j) => hash(plant.x, plant.y, 600 + k * 8 + j);
      const length = plant.size * (0.75 + 0.35 * roll(1));
      leaves.push(
        leafOf(plant.x, plant.y, 20 + k, {
          yaw: plant.seed * 2 * Math.PI + (k / plant.count) * 2 * Math.PI + (roll(2) - 0.5) * 0.5,
          kind: plant.kind,
          length,
          width: widthFor(plant.kind, length, roll(3)),
          tint: roll(4) < 0.85 ? plant.tint : Math.floor(roll(5) * 4),
          lift: 0.65 + 0.45 * roll(6),
          droop: 1.0 + 0.8 * roll(7),
        })
      );
    }
  }
  return leaves;
};

/** Fronds and small leaves sprouting round the islands' flower spikes. */
const islandLeaves = (spots) => {
  const leaves = [];
  const count = 9;
  for (const { island } of spots.bogs ?? []) {
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
          kind,
          length,
          width: widthFor(kind, length, 0.5),
          tint: k % 2,
        })
      );
    }
  }
  return leaves;
};

/** A rosette of broad leaves round the foot of every flower spike off the islands. */
const rosetteLeaves = (spots) => {
  const leaves = [];
  for (const spike of spots.spikes ?? []) {
    if (onIsland(spots, spike.x, spike.y)) continue;
    const count = 4 + Math.floor(spike.seed * 3);
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * 2 * Math.PI + spike.seed * 9;
      const length = spike.height * (0.55 + 0.2 * hash(spike.x, k, 70));
      leaves.push(
        leafOf(spike.x, spike.y, 6 + k, {
          yaw: angle,
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
 * Big leaves reaching out over the bogs from their shores, out in the jungle (no deeper than
 * SHORE_CLEARING_REACH_PX inside the clearing's edge) and clear of the cards by SHORE_CARD_GAP_PX.
 */
const shoreLeaves = (spots) => {
  const leaves = [];
  for (const { lobes } of spots.bogs ?? []) {
    for (const lobe of lobes) {
      const steps = Math.max(8, Math.round((2 * Math.PI * lobe.r) / 30));
      for (let k = 0; k < steps; k += 1) {
        const angle = ((k + hash(k, lobe.r, 9) * 0.6) / steps) * 2 * Math.PI;
        const out = lobe.r + 6 + 10 * hash(k, lobe.r, 10);
        const x = lobe.x + Math.cos(angle) * out;
        const y = lobe.y + Math.sin(angle) * out;
        // On the shore: not in another lobe's water.
        if (waterDistance(spots, x, y) < 4) continue;
        if (clearanceAt(x, y, spots.cards) < SHORE_CARD_GAP_PX) continue;
        if (clearingDistance(spots, x, y) < -SHORE_CLEARING_REACH_PX) continue;
        const roll = (j) => hash(x, y, 300 + j);
        const length = 46 + 40 * roll(1);
        const kind = roll(2) < 0.6 ? LEAF_KINDS.broad : LEAF_KINDS.pointed;
        leaves.push(
          leafOf(x, y, 2, {
            yaw: Math.atan2(lobe.y - y, lobe.x - x) + (roll(3) - 0.5) * 1.0,
            length,
            width: widthFor(kind, length, roll(4)),
            kind,
            // Mostly the lit greens and teals, so they read against the poison.
            tint: roll(7) < 0.75 ? Math.floor(roll(8) * 2) : 2,
            lift: 0.3 + 0.3 * roll(5),
            droop: 0.5 + 0.5 * roll(6),
          })
        );
      }
    }
  }
  return leaves;
};

/**
 * Every leaf of the jungle for its landmarks (`spots`, jungleSpots): the floor's plants, the shore
 * leaves over the bogs, the islands' and the rosettes round the flower spikes. Deterministic for a
 * layout.
 * @param {ReturnType<typeof jungleSpots>|null} spots
 * @returns {Leaf[]}
 */
export function jungleLeaves(spots) {
  if (!spots?.cards) return [];
  return [...plantLeaves(spots), ...shoreLeaves(spots), ...islandLeaves(spots), ...rosetteLeaves(spots)];
}

/**
 * Perilous Jungle's landmarks for a layout, as its board builds them: the bogs, the card footprints
 * the clearing forms round (at most MAX_CARD_RECTS) and their core, the table, the trees, the
 * floor's plants, the bell flowers and the flower spikes.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ bogs: Bog[], cards: { x: number, y: number, w: number, h: number }[],
 *   core: { x: number, y: number, w: number, h: number }|null,
 *   table: { x: number, y: number, w: number, h: number }, trees: Tree[], plants: Plant[],
 *   bells: Bell[], spikes: Spike[] }}
 */
export function jungleSpots(layout) {
  const cards = layout?.self && layout?.opp ? cardRectsOf(layout).slice(0, MAX_CARD_RECTS) : [];
  const ground = {
    bogs: poisonBogs(layout),
    cards,
    core: clearingCore(cards),
    table: tableBounds(layout),
  };
  const wooded = { ...ground, trees: jungleTrees(layout, ground) };
  const scene = sceneBounds(layout, JUNGLE_KEY);
  const spots = { ...wooded, plants: scene.w > 0 && scene.h > 0 ? junglePlants(wooded, scene) : [] };
  return { ...spots, bells: jungleBells(spots), spikes: jungleSpikes(spots) };
}
