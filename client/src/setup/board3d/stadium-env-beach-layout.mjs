// Design 077 (prototype): where Surfing Beach's pieces go, from the board layout: the bay (the mean
// waterline from the far edge to the left edge, the sea filling the far-left corner), rock clusters
// along the waterline and palms on the dry sand, all clear of the card footprints. Pure: no three.js.
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

/**
 * Where the Surfing Beach's pieces go: the bay (`beachShore`), the sandbar's distance offshore,
 * rock clusters along the waterline and palms on the dry sand, all clear of the card footprints.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ slabs: object[], flats: object[] }} footprints `environmentFootprints(layout)`
 * @returns {{ shore: ReturnType<typeof beachShore>, barAt: number,
 *   rocks: { x: number, y: number, r: number, seed: number }[],
 *   palms: { x: number, y: number, height: number, lean: number, leanAngle: number, seed: number }[] }|null}
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
  return { shore, barAt, rocks, palms: pickPalms(shore, bounds, rects, rocks) };
}
