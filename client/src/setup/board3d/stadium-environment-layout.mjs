// Design 077: which Stadium has a board, and where that board keeps flat ground, from the board
// layout (board-layout.mjs flatLayout), so the environment fits every mat profile and never moves
// or covers a card. Pure: no three.js, no DOM.
import { benchSlotRect } from './board-layout.mjs';

/** Homebrew Stadiums that have a board, by card id (customhb set.json). */
const ENVIRONMENT_BY_CARD = { 'customhb-299': 'scorched-earth' };
export const ENVIRONMENT_KEYS = Object.freeze([...new Set(Object.values(ENVIRONMENT_BY_CARD))]);
/** Dev preview: `localStorage[ENVIRONMENT_OVERRIDE_KEY]` or `?stadiumEnv=` forces a board on. */
export const ENVIRONMENT_OVERRIDE_KEY = 'ptcg-stadium-env';

const centred = (rect, box) => ({ x: rect.x + (rect.w - box.w) / 2, y: rect.y + (rect.h - box.h) / 2, w: box.w, h: box.h });

const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;

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
 * The forced environment of the dev preview, from the URL (`?stadiumEnv=scorched-earth`) or local
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
 * Card footprints the ground keeps flat, where the board's own poses draw cards (card-poses.mjs,
 * pile-poses.mjs): `slabs` get a slab with a slot outline (Active, each Bench slot, the Prize
 * block, deck, discard, Lost Zone, Stadium); `flats` a slab without one (the Trainer-board rows,
 * where a card can land anywhere along the row).
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ slabs: { x: number, y: number, w: number, h: number }[], flats: { x: number, y: number, w: number, h: number }[] }}
 */
export function environmentFootprints(layout) {
  if (!layout?.self || !layout?.opp) return { slabs: [], flats: [] };
  const slabs = [];
  const flats = [];
  for (const side of ['self', 'opp']) {
    const seat = layout[side];
    if (isRect(seat.active)) slabs.push(centred(seat.active, seat.cardBox.active));
    seat.bench.forEach((_, index) => slabs.push(centred(benchSlotRect(layout, side, index), seat.cardBox.bench)));
    if (seat.prizes?.length) slabs.push(union(seat.prizes));
    for (const zone of ['deck', 'discard', 'lostZone']) {
      if (isRect(seat[zone])) slabs.push(centred(seat[zone], seat.cardBox[zone]));
    }
    if (isRect(seat.board)) flats.push(seat.board);
  }
  if (isRect(layout.stadium)) slabs.push(layout.stadium);
  return { slabs: slabs.filter(isRect), flats };
}
