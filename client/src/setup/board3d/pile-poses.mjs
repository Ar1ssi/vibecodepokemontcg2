// Where the deck, discard and Lost Zone piles, the prize slots and the Stadium sit on the flat
// table (design 074 §D3 "Piles", "Stadium"). Pure: pile-mesh.js and card-mesh.js draw them, in
// the same flat table px as card-poses.mjs (x right, y up the table, z off the cloth).
import { CARD_UNITS, cardScaleFor } from './card-geometry.mjs';

export const PILE_ZONES = ['deck', 'discard', 'lostZone'];

/**
 * Draw order of the overlapping prize slots, bottom first (board-layout.mjs `prizeSlots`): the
 * back column (slots 0, 2, 4, z-index 1) under the front column (1, 3, 5, z-index 2), and within
 * a column the DOM-later slot on top. The reverse of board-layout's PRIZE_HIT_ORDER.
 */
const PRIZE_DRAW_RANK = Object.freeze({ 0: 0, 2: 1, 4: 2, 1: 3, 3: 4, 5: 5 });

const centreOf = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

const seatYaw = (side) => (side === 'opp' ? 180 : 0);

/**
 * Centre and card width of a pile on `side` (the zone rect's centre; the far seat turned 180°
 * like its cards).
 * @param {'self'|'opp'} side
 * @param {'deck'|'discard'|'lostZone'} zone
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ x:number, y:number, yawDeg:number, widthPx:number }|null} null for an unknown side or zone
 */
export function pilePose(side, zone, layout) {
  if (!PILE_ZONES.includes(zone)) return null;
  const seat = layout?.[side];
  const rect = seat?.[zone];
  if (!rect) return null;
  return { ...centreOf(rect), yawDeg: seatYaw(side), widthPx: seat.cardBox[zone].w };
}

/**
 * Height of `layers` stacked cards drawn at `scale` (card-geometry.mjs `cardScaleFor`).
 * @param {number} layers
 * @param {number} scale flat px per card unit
 * @returns {number} 0 for no layers or an invalid input
 */
export function pileThicknessPx(layers, scale) {
  if (!Number.isFinite(layers) || layers <= 0) return 0;
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  return Math.floor(layers) * CARD_UNITS.t * scale;
}

/**
 * Prize slot `index` (0–5, DOM order) of `side`: the slot rect's centre (`object-fit: contain`
 * centres the card), the prize card width, and a height that stacks the overlapping slots in
 * the stylesheet's paint order one card thickness apart.
 * @returns {{ x:number, y:number, z:number, yawDeg:number, widthPx:number }|null}
 */
export function prizeSlotPose(side, index, layout) {
  const seat = layout?.[side];
  const rect = Number.isInteger(index) ? seat?.prizes?.[index] : null;
  if (!rect || !(index in PRIZE_DRAW_RANK)) return null;
  const widthPx = seat.cardBox.prizes.w;
  return {
    ...centreOf(rect),
    z: pileThicknessPx(PRIZE_DRAW_RANK[index], cardScaleFor(widthPx)),
    yawDeg: seatYaw(side),
    widthPx,
  };
}

/**
 * The Stadium card at the layout's stadium rect, upright for whoever played it
 * (stadium-facing.mjs): yaw 0 when `facing === 'self'`, 180 when `'opp'`.
 * @param {import('./board-model.mjs').StadiumPlacement|null} stadium
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {string} [_nearSeat] the model's near seat. Unread: `stadium.facing` is already relative
 *   to the near player (board-model.mjs `stadiumOf`), so the pose needs no seat of its own.
 * @returns {{ x:number, y:number, z:number, yawDeg:number, widthPx:number }|null}
 */
export function stadiumPose(stadium, layout, _nearSeat) {
  const rect = layout?.stadium;
  if (!stadium || !rect) return null;
  return {
    ...centreOf(rect),
    z: 0,
    yawDeg: stadium.facing === 'opp' ? 180 : 0,
    widthPx: rect.w,
  };
}
