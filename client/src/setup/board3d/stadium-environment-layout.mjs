// Design 077: which Stadium has a board, where that board keeps flat ground and where its volcano
// stands, from the board layout (board-layout.mjs flatLayout) and the board's own card poses
// (card-poses.mjs, pile-poses.mjs), so the environment fits every mat profile and never moves or
// covers a card. Pure: no three.js, no DOM.
import { CARD_UNITS } from './card-geometry.mjs';
import { benchSlotRect } from './board-layout.mjs';
import { PILE_ZONES, pilePose, prizeSlotPose } from './pile-poses.mjs';
import { tableBounds } from './table-uv.mjs';

/** Homebrew Stadiums that have a board, by card id (customhb set.json). */
const ENVIRONMENT_BY_CARD = { 'customhb-299': 'scorched-earth' };
export const ENVIRONMENT_KEYS = Object.freeze([...new Set(Object.values(ENVIRONMENT_BY_CARD))]);
/** Dev check on the real board: `?stadiumEnv=` or `localStorage[ENVIRONMENT_OVERRIDE_KEY]` forces one on. */
export const ENVIRONMENT_OVERRIDE_KEY = 'ptcg-stadium-env';

export const VOLCANO_MAX_RADIUS = 210;
export const VOLCANO_MIN_RADIUS = 48;
/** Free ground kept between the volcano's foot and any card footprint. */
export const VOLCANO_MARGIN_PX = 18;
/** Share of its radius the volcano may run past a table edge (its foot is cut off there). */
export const VOLCANO_EDGE_OVERHANG = 0.2;
const VOLCANO_STEP_PX = 6;
const VOLCANO_SEAM_SPAN_PX = 230;
const PRIZE_SLOTS = 6;

const CARD_ASPECT = CARD_UNITS.h / CARD_UNITS.w;

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;

const centreOf = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/** The upright card a pose draws (yaw 0 or 180) as a rect: `widthPx` wide, card-shaped. */
const cardRect = (centre, widthPx) => {
  const h = widthPx * CARD_ASPECT;
  return { x: centre.x - widthPx / 2, y: centre.y - h / 2, w: widthPx, h };
};

const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

/**
 * The environment key for the Stadium in play: its card id (`customhb-299`), or the same card
 * named by set and number when the id is missing. Null for any other Stadium or none.
 * @param {{ id?: string, set?: string, number?: string|number }|null|undefined} card
 * @returns {string|null}
 */
export function environmentKeyFor(card) {
  if (!card) return null;
  if (typeof card.id === 'string' && ENVIRONMENT_BY_CARD[card.id]) return ENVIRONMENT_BY_CARD[card.id];
  const number = Number.parseInt(card.number, 10);
  if (card.set !== 'customhb' || !Number.isInteger(number)) return null;
  return ENVIRONMENT_BY_CARD[`customhb-${String(number).padStart(3, '0')}`] ?? null;
}

/**
 * The forced environment of the dev check, from the URL (`?stadiumEnv=scorched-earth`) or local
 * storage; null when neither names a known board. Storage may be absent or throw.
 * @param {{ getItem?: (key: string) => string|null }|null|undefined} storage
 * @param {string} [search] `location.search`
 * @returns {string|null}
 */
export function environmentOverride(storage, search = '') {
  let value = null;
  try {
    value = new URLSearchParams(search).get('stadiumEnv') || storage?.getItem?.(ENVIRONMENT_OVERRIDE_KEY) || null;
  } catch {
    value = null;
  }
  return ENVIRONMENT_KEYS.includes(value) ? value : null;
}

/**
 * The card rects the ground keeps flat, exactly where the board's poses draw cards (card-poses.mjs
 * `slotFor`, pile-poses.mjs): `slabs` (Active, each Bench slot, the Prize block, deck, discard,
 * Lost Zone, Stadium) and `flats` (the Trainer-board rows, where a card can land anywhere along
 * the row).
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ slabs: { x: number, y: number, w: number, h: number }[], flats: { x: number, y: number, w: number, h: number }[] }}
 */
export function environmentFootprints(layout) {
  if (!layout?.self || !layout?.opp) return { slabs: [], flats: [] };
  const slabs = [];
  const flats = [];
  for (const side of ['self', 'opp']) {
    const seat = layout[side];
    if (isRect(seat.active)) slabs.push(cardRect(centreOf(seat.active), seat.cardBox.active.w));
    seat.bench.forEach((_, index) =>
      slabs.push(cardRect(centreOf(benchSlotRect(layout, side, index)), seat.cardBox.bench.w))
    );
    const prizes = [];
    for (let index = 0; index < PRIZE_SLOTS; index += 1) {
      const pose = prizeSlotPose(side, index, layout);
      if (pose) prizes.push(cardRect(pose, pose.widthPx));
    }
    if (prizes.length) slabs.push(union(prizes));
    for (const zone of PILE_ZONES) {
      const pose = pilePose(side, zone, layout);
      if (pose) slabs.push(cardRect(pose, pose.widthPx));
    }
    if (isRect(seat.board)) flats.push(seat.board);
  }
  if (isRect(layout.stadium)) slabs.push(cardRect(centreOf(layout.stadium), layout.stadium.w));
  return { slabs: slabs.filter(isRect), flats };
}

const distanceToRect = (x, y, rect) => {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
};

/**
 * Where the volcano stands: the largest circle with no footprint within its radius plus
 * VOLCANO_MARGIN_PX, running at most VOLCANO_EDGE_OVERHANG of its radius past a table edge, in the
 * band left of the Stadium around the seam, preferring spots near the seam and the Stadium. Null
 * when no circle of VOLCANO_MIN_RADIUS fits.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ slabs: object[], flats: object[] }} footprints `environmentFootprints(layout)`
 * @returns {{ x: number, y: number, r: number }|null}
 */
export function volcanoSpot(layout, { slabs = [], flats = [] } = {}) {
  const stadium = layout?.stadium;
  const bounds = tableBounds(layout);
  if (!isRect(stadium) || !(bounds.w > 0)) return null;
  const seam = layout.depth;
  const rects = [...slabs, ...flats];
  let best = null;
  for (let x = bounds.x; x <= stadium.x; x += VOLCANO_STEP_PX) {
    for (let y = seam - VOLCANO_SEAM_SPAN_PX; y <= seam + VOLCANO_SEAM_SPAN_PX; y += VOLCANO_STEP_PX) {
      const edge = Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y);
      let clearance = Infinity;
      for (const rect of rects) clearance = Math.min(clearance, distanceToRect(x, y, rect));
      const r = Math.min(VOLCANO_MAX_RADIUS, clearance - VOLCANO_MARGIN_PX, edge / (1 - VOLCANO_EDGE_OVERHANG));
      if (r < VOLCANO_MIN_RADIUS) continue;
      const score = r - 0.05 * Math.abs(y - seam) - 0.02 * Math.abs(stadium.x - r - x);
      if (!best || score > best.score) best = { x, y, r, score };
    }
  }
  return best && { x: best.x, y: best.y, r: best.r };
}
