// Design 077 (prototype): where Surfing Beach's pieces go, from the board layout: the bay (the mean
// waterline from the far edge to the left edge, the sea filling the far-left corner), rock clusters
// along the waterline and palms on the dry sand, all clear of the card footprints. Pure: no three.js.
import { TERRAIN_SPACING_PX } from './stadium-environment-glsl.mjs';
import { RISE_LEAN, clumpAround, patchy } from './stadium-env-spots.mjs';
import { measureAsset } from './stadium-kit-assets.mjs';
import { tableBounds } from './table-uv.mjs';

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;

/** Surfing Beach: the mean waterline meets the far edge this share of the width from the left... */
export const SHORE_FAR_EDGE_SHARE = 0.42;
/** ...and the left edge this share of the depth up from the near edge; the sea fills the corner. */
export const SHORE_LEFT_EDGE_SHARE = 0.3;
/** How far the bay bends into the land at its middle, as a share of the waterline's length. */
export const SHORE_BEND_SHARE = 0.07;
export const PALM_MAX = 6;
/** Palms stand at least this far up the beach from the mean waterline (dry sand, past the swash). */
export const PALM_DRY_PX = 150;
/** Free sand kept between a palm's trunk and any card footprint. */
export const PALM_CLEARANCE_PX = 34;
export const PALM_SPACING_PX = 110;
const PALM_STEP_PX = 10;
const PALM_EDGE_INSET_PX = 26;
/** Palms stand within this distance of a table edge. */
const PALM_EDGE_REACH_PX = 190;
/** Score a palm costs the spots around it (fading over ~220 px), so the grove spreads out. */
const PALM_SPREAD = 45;
const PALM_ROCK_GAP_PX = 60;
/** Clearance past which a palm leans toward the sea rather than away from the nearest card. */
const PALM_OPEN_PX = 150;
/**
 * Rock clusters along the shore: where along the waterline (share of its length), how far off it.
 * The last stands out in the surf; the field shader raises it off the sea floor to break the surface.
 */
const ROCK_BANDS = [
  { from: 0.78, to: 0.95, offshore: [-6, 14], r: 30, seed: 0.13 },
  { from: 0.3, to: 0.6, offshore: [-20, 8], r: 20, seed: 0.57 },
  { from: 0.35, to: 0.75, offshore: [110, 170], r: 17, seed: 0.91 },
];
const ROCK_STEP = 0.01;
const ROCK_OFFSHORE_STEP_PX = 6;
/** Rock edge to card footprint, at least. */
const ROCK_CLEARANCE_PX = 4;


/**
 * The Surfing Beach bay: the mean waterline from `a` on the far edge to `b` on the left edge, bent
 * `bend` px into the land at its middle; the sea fills the far-left corner (the sun's side, so it
 * glints).
 * @param {{ x: number, y: number, w: number, h: number }} bounds `tableBounds(layout)`
 * @returns {{ a: { x: number, y: number }, b: { x: number, y: number }, bend: number }}
 */
export function beachShore(bounds) {
  const a = { x: bounds.x + bounds.w * SHORE_FAR_EDGE_SHARE, y: bounds.y + bounds.h };
  const b = { x: bounds.x, y: bounds.y + bounds.h * SHORE_LEFT_EDGE_SHARE };
  return { a, b, bend: Math.hypot(b.x - a.x, b.y - a.y) * SHORE_BEND_SHARE };
}

const shoreAxes = (shore) => {
  const span = Math.max(Math.hypot(shore.b.x - shore.a.x, shore.b.y - shore.a.y), 1);
  const dir = { x: (shore.b.x - shore.a.x) / span, y: (shore.b.y - shore.a.y) / span };
  return { span, dir, seaward: { x: dir.y, y: -dir.x } };
};

/**
 * A table point in the shore's frame, as the shaders compute it (stadium-env-beach.mjs
 * `shoreFrame`) without the waterline's wander: `along` px from `a` toward `b`, `offshore` signed
 * px from the mean waterline, positive out to sea.
 */
export function shoreFrame(shore, x, y) {
  const { span, dir, seaward } = shoreAxes(shore);
  const along = (x - shore.a.x) * dir.x + (y - shore.a.y) * dir.y;
  const t = Math.min(1, Math.max(0, along / span));
  const offshore = (x - shore.a.x) * seaward.x + (y - shore.a.y) * seaward.y + shore.bend * 4 * t * (1 - t);
  return { along, offshore };
}

/** px the waterline wanders toward the sea at most (stadium-env-beach.mjs shoreWobble: 24 × 0.5 + 4). */
const SHORE_WANDER_PX = 16;
const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The highest the sand can stand at (x, y), px: the field bake's beachHeight (stadium-env-beach.mjs
 * BEACH_FIELD_FRAGMENT) with its dunes and hummocks at their tallest, the waterline wandered its
 * furthest out, and a little further up the beach for the ground's smoothing (groundAt) and a bake
 * texel. The kit's pieces stand on the sand, so they keep off the cards by this rise too.
 */
export function sandCeiling(shore, x, y) {
  const up = Math.max(0, -shoreFrame(shore, x, y).offshore + SHORE_WANDER_PX + TERRAIN_SPACING_PX / 2 + 2);
  const face = 15 * (1 - Math.exp(-up / 70)) + 0.035 * up;
  return face + 0.55 * 22 * smoothstep(110, 260, up) + 2 * smoothstep(60, 140, up);
}

/** The table point at `t` (share of the waterline's length from `a`) and `offshore` px. */
const shorePoint = (shore, t, offshore) => {
  const { span, dir, seaward } = shoreAxes(shore);
  const across = offshore - shore.bend * 4 * t * (1 - t);
  return {
    x: shore.a.x + dir.x * t * span + seaward.x * across,
    y: shore.a.y + dir.y * t * span + seaward.y * across,
  };
};

/** A repeatable 0..1 value for a table point: picks and tie-breaks never change between loads. */
const spotHash = (x, y, salt = 0) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

const insideBounds = (bounds, x, y, inset) =>
  x >= bounds.x + inset && x <= bounds.x + bounds.w - inset && y >= bounds.y + inset && y <= bounds.y + bounds.h - inset;

/** The nearest footprint to a point: its distance and the unit direction from it to the point. */
const nearestFootprint = (rects, x, y) => {
  let best = { distance: Infinity, away: { x: 0, y: 0 } };
  for (const rect of rects) {
    const cx = Math.min(Math.max(x, rect.x), rect.x + rect.w);
    const cy = Math.min(Math.max(y, rect.y), rect.y + rect.h);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < best.distance) {
      best = { distance, away: distance > 0 ? { x: (x - cx) / distance, y: (y - cy) / distance } : { x: 0, y: 0 } };
    }
  }
  return best;
};

/** One rock cluster per band: the spot along the shore with the most free sand around it. */
const pickRocks = (shore, bounds, rects) => {
  const rocks = [];
  for (const band of ROCK_BANDS) {
    let best = null;
    for (let t = band.from; t <= band.to + 1e-9; t += ROCK_STEP) {
      for (let offshore = band.offshore[0]; offshore <= band.offshore[1]; offshore += ROCK_OFFSHORE_STEP_PX) {
        const { x, y } = shorePoint(shore, t, offshore);
        if (!insideBounds(bounds, x, y, band.r + 6)) continue;
        const clearance = nearestFootprint(rects, x, y).distance - band.r * 1.4;
        if (clearance < ROCK_CLEARANCE_PX) continue;
        if (!best || clearance > best.clearance) best = { x, y, clearance };
      }
    }
    if (best) rocks.push({ x: best.x, y: best.y, r: band.r, seed: band.seed });
  }
  return rocks;
};

/**
 * Palms on the dry sand near the table's edges (they frame the board, never stand between card
 * rows), the freest spots first, spread out. Each leans away from the nearest card (its crown over
 * open sand), or toward the sea when nothing is near.
 */
const pickPalms = (shore, bounds, rects, rocks) => {
  const candidates = [];
  for (let x = bounds.x + PALM_EDGE_INSET_PX; x <= bounds.x + bounds.w - PALM_EDGE_INSET_PX; x += PALM_STEP_PX) {
    for (let y = bounds.y + PALM_EDGE_INSET_PX; y <= bounds.y + bounds.h - PALM_EDGE_INSET_PX; y += PALM_STEP_PX) {
      const toEdge = Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y);
      if (toEdge > PALM_EDGE_REACH_PX) continue;
      const { offshore } = shoreFrame(shore, x, y);
      if (offshore > -PALM_DRY_PX) continue;
      const nearest = nearestFootprint(rects, x, y);
      if (nearest.distance < PALM_CLEARANCE_PX) continue;
      if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < rock.r + PALM_ROCK_GAP_PX)) continue;
      const nearBeach = 20 * Math.exp(-(((offshore + 230) / 140) ** 2));
      const score = Math.min(nearest.distance, 120) + nearBeach + 8 * spotHash(x, y);
      candidates.push({ x, y, score, nearest });
    }
  }
  const { seaward } = shoreAxes(shore);
  const palms = [];
  const crowding = (spot) =>
    palms.reduce((sum, palm) => sum + PALM_SPREAD * Math.exp(-Math.hypot(palm.x - spot.x, palm.y - spot.y) / 220), 0);
  while (palms.length < PALM_MAX) {
    let spot = null;
    for (const candidate of candidates) {
      if (palms.some((palm) => Math.hypot(palm.x - candidate.x, palm.y - candidate.y) < PALM_SPACING_PX)) continue;
      const value = candidate.score - crowding(candidate);
      if (!spot || value > spot.value) spot = { ...candidate, value };
    }
    if (!spot) break;
    const away = spot.nearest.distance < PALM_OPEN_PX ? spot.nearest.away : seaward;
    palms.push({
      x: spot.x,
      y: spot.y,
      height: 150 + 50 * spotHash(spot.x, spot.y, 1),
      lean: 0.25 + 0.3 * spotHash(spot.x, spot.y, 2),
      leanAngle: Math.atan2(away.y, away.x) + (spotHash(spot.x, spot.y, 3) - 0.5) * 0.8,
      seed: spotHash(spot.x, spot.y, 4),
    });
  }
  return palms;
};

/** How far a palm's fronds reach from its crown (the kit's palm: up to 0.62 of its height). */
export const PALM_FROND_REACH = 0.64;

/**
 * Every palm's crown clear of the cards seen from above: the fronds' circle round the crown (the
 * trunk's top, leant over) keeps PALM_CLEARANCE_PX off every card, and more by RISE_LEAN of the
 * sand's rise under the palm; a palm too close shrinks, to 0.6 of its height at most, or goes.
 */
const fitPalms = (palms, rects, shore) =>
  palms
    .map((palm) => {
      const rise = RISE_LEAN * sandCeiling(shore, palm.x, palm.y);
      for (let scale = 1; scale >= 0.6 - 1e-9; scale -= 0.05) {
        const height = palm.height * scale;
        const out = Math.sin(palm.lean) * height;
        const crown = { x: palm.x + Math.cos(palm.leanAngle) * out, y: palm.y + Math.sin(palm.leanAngle) * out };
        if (nearestFootprint(rects, crown.x, crown.y).distance >= height * PALM_FROND_REACH + PALM_CLEARANCE_PX + rise) return { ...palm, height };
      }
      return null;
    })
    .filter(Boolean);

/** Least gap between a piece of the beach's dressing, seen from above, and a card footprint. */
export const DRESSING_CARD_GAP_PX = 14;

/**
 * The beach's kit dressing (design 081), all clear of every card footprint, the rocks, the palms and
 * one another: starfish and shells washed up just above the swash, parasols each with a towel (one
 * with a beach ball, one with a surfboard) on the dry sand, clumps of dune grass at the back of the
 * beach by the table's edges. Sizes in table px, `u` a card's width over 100.
 */
const pickDressing = (shore, bounds, rects, rocks, palms, u) => {
  const taken = [
    ...rocks.map((rock) => ({ x: rock.x, y: rock.y, r: rock.r * 2 })),
    ...palms.flatMap((palm) => {
      const out = Math.sin(palm.lean) * palm.height;
      return [
        { x: palm.x, y: palm.y, r: 26 },
        { x: palm.x + Math.cos(palm.leanAngle) * out, y: palm.y + Math.sin(palm.leanAngle) * out, r: palm.height * 0.5 },
      ];
    }),
  ];
  // A piece `top` px tall keeps off the cards by RISE_LEAN of its top's height, on the sand's rise.
  const fits = (x, y, r, top = 0) =>
    insideBounds(bounds, x, y, r + 8) &&
    nearestFootprint(rects, x, y).distance >= r + DRESSING_CARD_GAP_PX + RISE_LEAN * (sandCeiling(shore, x, y) + top) &&
    taken.every((spot) => Math.hypot(spot.x - x, spot.y - y) >= spot.r + r);
  const claim = (x, y, r) => taken.push({ x, y, r });
  const finds = [];
  for (let t = 0.04; t <= 0.96; t += 0.035) {
    const up = 50 + 55 * spotHash(t, 1, 11);
    const { x, y } = shorePoint(shore, t, -up);
    // Design 083: the tide leaves its finds in drifts along the shore, not one every few steps.
    if (spotHash(t, 2, 12) > 0.55 * patchy(x, y, { scale: 220, salt: 19 })) continue;
    const star = spotHash(t, 3, 13) < 0.4;
    const size = (star ? 7 + 2 * spotHash(t, 4, 14) : 5 + 1.5 * spotHash(t, 4, 14)) * u;
    const kind = star ? 'starfish' : 'shell';
    if (!fits(x, y, size + 6, measureAsset(kind, { size }).height)) continue;
    finds.push({ kind, x, y, size, seed: spotHash(t, 5, 15), warm: spotHash(t, 6, 16) < 0.5 });
    claim(x, y, size + 22);
  }
  // Parasol sets on the dry sand: the freest spots first, far apart.
  const sets = [];
  const setReach = 64 * u;
  const parasol = { size: 34 * u, height: 34 * u * 1.55, table: false };
  const setTop = measureAsset('parasol', parasol).height;
  const candidates = [];
  for (let x = bounds.x + setReach; x <= bounds.x + bounds.w - setReach; x += 18) {
    for (let y = bounds.y + setReach; y <= bounds.y + bounds.h - setReach; y += 18) {
      const { offshore } = shoreFrame(shore, x, y);
      if (offshore > -170 || !fits(x, y, setReach, setTop)) continue;
      candidates.push({ x, y, score: Math.min(nearestFootprint(rects, x, y).distance, 160) + 10 * spotHash(x, y, 21) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const spot of candidates) {
    if (sets.length >= 2) break;
    if (!fits(spot.x, spot.y, setReach, setTop) || sets.some((set) => Math.hypot(set.x - spot.x, set.y - spot.y) < 320)) continue;
    const k = sets.length;
    const away = nearestFootprint(rects, spot.x, spot.y).away;
    const yaw = Math.atan2(away.y, away.x) + Math.PI / 2;
    sets.push({
      x: spot.x,
      y: spot.y,
      size: parasol.size,
      height: parasol.height,
      stripes: k === 0 ? ['#ff6b6b', '#fff6ea'] : ['#3fa2ff', '#fff6ea'],
      towel: { x: spot.x + away.x * 8 * u, y: spot.y + away.y * 8 * u, size: 46 * u, yaw, stripes: k === 0 ? ['#ffd84a', '#fff6ea', '#ffd84a'] : ['#57c785', '#fff6ea', '#57c785'] },
      extra:
        k === 0
          ? { kind: 'beachBall', x: spot.x + away.x * 40 * u - away.y * 26 * u, y: spot.y + away.y * 40 * u + away.x * 26 * u, size: 8 * u }
          : { kind: 'surfboard', x: spot.x - away.y * 44 * u, y: spot.y + away.x * 44 * u, size: 62 * u, yaw: yaw + 0.4 },
    });
    claim(spot.x, spot.y, setReach);
  }
  // Dune grass at the back of the beach, in clumps by the table's edges (design 083: more of it,
  // gathered in tussocks by patchy(), every size its own).
  const grass = [];
  for (let x = bounds.x + 30; x <= bounds.x + bounds.w - 30; x += 22) {
    for (let y = bounds.y + 30; y <= bounds.y + bounds.h - 30; y += 22) {
      if (grass.length >= 18) break;
      const toEdge = Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y);
      const size = (14 + 12 * spotHash(x, y, 31)) * u;
      const blade = (14 + 6 * spotHash(x, y, 34)) * u;
      if (toEdge > 140 || spotHash(x, y, 32) > 0.12 * patchy(x, y, { scale: 180, salt: 23 })) continue;
      if (shoreFrame(shore, x, y).offshore > -260 || !fits(x, y, size + 10, measureAsset('tallGrass', { size, blade }).height)) continue;
      grass.push({ x, y, size, blade, seed: spotHash(x, y, 33) });
      claim(x, y, size * 2.2);
    }
  }
  // Design 083: little scatters of rounded pebbles on the dry sand, a few stones each, out past the
  // cards' block (the open sand between the rows stays clear: D232).
  const block = rects.length ? { x0: Math.min(...rects.map((r) => r.x)), y0: Math.min(...rects.map((r) => r.y)), x1: Math.max(...rects.map((r) => r.x + r.w)), y1: Math.max(...rects.map((r) => r.y + r.h)) } : null;
  const pastBlock = (x, y, gap) => !block || Math.hypot(Math.max(block.x0 - x, 0, x - block.x1), Math.max(block.y0 - y, 0, y - block.y1)) >= gap;
  const pebbles = [];
  for (let k = 0; k < 120 && pebbles.length < 18; k += 1) {
    const x = bounds.x + 40 + spotHash(k, 7, 41) * (bounds.w - 80);
    const y = bounds.y + 40 + spotHash(k, 8, 42) * (bounds.h - 80);
    if (shoreFrame(shore, x, y).offshore > -110 || !pastBlock(x, y, 40)) continue;
    const heart = (6 + 3 * spotHash(k, 9, 43)) * u;
    if (!fits(x, y, heart + 4, heart * 0.8)) continue;
    pebbles.push({ x, y, size: heart, seed: spotHash(k, 10, 44) });
    // Its own stone only (its reach): the satellites gather close round it, a scatter of three to five.
    claim(x, y, heart);
    for (const spot of clumpAround({ x, y }, { count: 2 + Math.floor(spotHash(k, 11, 45) * 3), reach: [heart * 2.2, heart * 3.6], salt: k })) {
      const size = heart * spot.share;
      if (!fits(spot.x, spot.y, size + 2, size * 0.8) || !pastBlock(spot.x, spot.y, 30)) continue;
      pebbles.push({ x: spot.x, y: spot.y, size, seed: spot.seed });
      claim(spot.x, spot.y, size + 2);
    }
    // The scatter as a whole keeps the next one off it.
    claim(x, y, heart * 4.2);
  }
  return { finds, sets, grass, pebbles };
};

/**
 * Where the Surfing Beach's pieces go: the bay (`beachShore`), the sandbar's distance offshore,
 * rock clusters along the waterline and palms on the dry sand, all clear of the card footprints.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ slabs: object[], flats: object[] }} footprints `environmentFootprints(layout)`
 * @returns {{ shore: ReturnType<typeof beachShore>, barAt: number,
 *   rocks: { x: number, y: number, r: number, seed: number }[],
 *   palms: { x: number, y: number, height: number, lean: number, leanAngle: number, seed: number }[],
 *   u: number, dressing: ReturnType<typeof pickDressing> }|null}
 *   Null without a table.
 */
export function beachSpots(layout, { slabs = [], flats = [] } = {}) {
  const bounds = tableBounds(layout);
  if (!(bounds.w > 0 && bounds.h > 0)) return null;
  const shore = beachShore(bounds);
  const rects = [...slabs, ...flats].filter(isRect);
  const corner = shoreFrame(shore, bounds.x, bounds.y + bounds.h).offshore;
  const barAt = Math.min(220, Math.max(110, corner * 0.4));
  const rocks = pickRocks(shore, bounds, rects);
  const palms = fitPalms(pickPalms(shore, bounds, rects, rocks), rects, shore);
  const u = (layout?.self?.cardBox?.active?.w ?? 100) / 100;
  return { shore, barAt, rocks, palms, u, dressing: pickDressing(shore, bounds, rects, rocks, palms, u) };
}
