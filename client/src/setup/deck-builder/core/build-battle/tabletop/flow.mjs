// The tabletop's view of an opening (design 073 § Pure modules): what is on the table for a saved
// `session.unboxing` plus the small cosmetic record the reducer does not keep (whether the contents
// were taken out, where the player set each thing down, which pack the player tore first). The reducer stays the only state that counts:
// every action that changes the pool picture is an `advanceUnboxing` event; the rest is cosmetic.

import { nextPackToTear, tornPackCount } from '../unboxing.mjs';

export const COSMETIC_VERSION = 1;
export const COSMETIC_STORAGE_KEY = 'ptcg-sim.tabletop.v1';

const OUT_STAGES = new Set(['deckShown', 'packs', 'done']);

/**
 * @typedef {{x: number, z: number, rotYDeg: number, y: number}} Spot where a thing was set down
 *   on the table by hand (`y` its resting height, which orders a stack).
 * @typedef {{v: 1, seed: number, itemsOut: boolean, packOrder: number[], spots: Object<string, Spot>}} Cosmetic
 *   `packOrder[k]` is the on-table pack (its index in the box, which fixes its wrapper art) that
 *   was torn k-th, so it holds logical pack k's cards (design 073 Options 8). `spots` is keyed
 *   'deck', 'leaflet', 'promo' and 'pack<visual>'; a box item without one lies where it always did,
 *   or is still in the box while `itemsOut` is false (design 073 iteration 14).
 */

/** @returns {Cosmetic} nothing taken out, nothing torn. */
export function createCosmetic(seed) {
  return { v: COSMETIC_VERSION, seed: Number(seed) >>> 0, itemsOut: false, packOrder: [], spots: {} };
}

const isVisualIndex = (value, packCount) =>
  Number.isInteger(value) && value >= 0 && value < packCount;

const NAMED_SPOTS = new Set(['deck', 'leaflet', 'promo']);
const SPOT_LIMIT_MM = 5000;
const isSpotKey = (key, packCount) =>
  NAMED_SPOTS.has(key) || (/^pack\d+$/.test(key) && isVisualIndex(Number(key.slice(4)), packCount));
const isSpot = (spot) =>
  !!spot &&
  typeof spot === 'object' &&
  ['x', 'z', 'rotYDeg', 'y'].every((k) => Number.isFinite(spot[k]) && Math.abs(spot[k]) < SPOT_LIMIT_MM);
const copySpot = ({ x, z, rotYDeg, y }) => ({ x, z, rotYDeg, y });

/** The well-formed spots of a stored record; a bad entry is dropped on its own. */
function parseSpots(value, packCount) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const spots = {};
  for (const [key, spot] of Object.entries(value)) {
    if (isSpotKey(key, packCount) && isSpot(spot)) spots[key] = copySpot(spot);
  }
  return spots;
}

/** @returns {string[]} the spot keys of what the box holds: the deck, the leaflet, each pack. */
export function boxItemKeys(packCount) {
  return ['deck', 'leaflet', ...Array.from({ length: Math.max(0, packCount | 0) }, (_, k) => `pack${k}`)];
}

/**
 * `key` set down at `spot`. The contents count as taken out once every box item has a spot.
 * @returns {Cosmetic}
 */
export function placeOnTable(cosmetic, key, spot, packCount) {
  const spots = { ...cosmetic.spots, [key]: copySpot(spot) };
  const itemsOut = cosmetic.itemsOut || boxItemKeys(packCount).every((k) => k in spots);
  return { ...cosmetic, itemsOut, spots };
}

/** @returns {boolean} whether box item `key` is out on the table. */
export function isOutOfBox(cosmetic, key) {
  return cosmetic.itemsOut || key in cosmetic.spots;
}

/**
 * @returns {Cosmetic} the stored record when it belongs to this box (`seed`) and is well formed,
 *   else a fresh one.
 */
export function parseCosmetic(value, { seed, packCount }) {
  const fresh = createCosmetic(seed);
  if (!value || typeof value !== 'object' || value.v !== COSMETIC_VERSION) return fresh;
  if (value.seed !== fresh.seed || typeof value.itemsOut !== 'boolean') return fresh;
  const order = value.packOrder;
  if (!Array.isArray(order) || order.length > packCount) return fresh;
  if (!order.every((index) => isVisualIndex(index, packCount))) return fresh;
  if (new Set(order).size !== order.length) return fresh;
  return {
    v: COSMETIC_VERSION,
    seed: fresh.seed,
    itemsOut: value.itemsOut,
    packOrder: [...order],
    spots: parseSpots(value.spots, packCount),
  };
}

/**
 * The record made to agree with the saved reducer state: exactly one entry per torn pack (missing
 * ones filled with the lowest untouched packs, extra ones dropped), and the contents out once the
 * deck has been unwrapped — never while the lid is still shut (a record left by an earlier opening
 * of the same box number must not lay its contents, or any of them, beside a sealed box).
 *
 * @returns {Cosmetic}
 */
export function reconcileCosmetic(cosmetic, u) {
  const packCount = u.packsTorn.length;
  const torn = tornPackCount(u);
  const order = cosmetic.packOrder.filter((index) => isVisualIndex(index, packCount)).slice(0, torn);
  for (let index = 0; order.length < torn && index < packCount; index += 1) {
    if (!order.includes(index)) order.push(index);
  }
  const sealed = u.stage === 'sealed';
  const itemsOut = !sealed && (cosmetic.itemsOut || OUT_STAGES.has(u.stage));
  return { ...cosmetic, itemsOut, packOrder: order, spots: sealed ? {} : { ...(cosmetic.spots || {}) } };
}

/**
 * @returns {{wrapOn: boolean, lidOpen: boolean, itemsOut: boolean, someOut: boolean, deckUnwrapped: boolean,
 *   tornVisual: number[], untornVisual: number[], currentLogical: number, currentVisual: number,
 *   revealed: number, done: boolean}} what the table shows for `u` and its reconciled record.
 */
export function tableView(u, cosmetic) {
  const record = reconcileCosmetic(cosmetic, u);
  const packCount = u.packsTorn.length;
  const currentLogical = u.packsTorn.findIndex(
    (torn, index) => torn && u.revealed[index] < u.cardsPerPack
  );
  const untornVisual = [];
  for (let index = 0; index < packCount; index += 1) {
    if (!record.packOrder.includes(index)) untornVisual.push(index);
  }
  return {
    wrapOn: !u.wrapTorn,
    lidOpen: u.stage !== 'sealed',
    itemsOut: record.itemsOut,
    someOut: record.itemsOut || boxItemKeys(packCount).some((key) => key in record.spots),
    deckUnwrapped: OUT_STAGES.has(u.stage),
    tornVisual: [...record.packOrder],
    untornVisual,
    currentLogical,
    currentVisual: currentLogical >= 0 ? record.packOrder[currentLogical] ?? -1 : -1,
    revealed: currentLogical >= 0 ? u.revealed[currentLogical] : 0,
    done: u.stage === 'done',
  };
}

/**
 * The one "next step" the dock button and Space/Enter take for this view.
 * @returns {'tearWrap'|'openLid'|'takeOut'|'unwrapDeck'|'revealCard'|'openPack'|'done'}
 */
export function nextStep(view) {
  if (view.wrapOn) return 'tearWrap';
  if (!view.lidOpen) return 'openLid';
  if (!view.itemsOut) return 'takeOut';
  if (!view.deckUnwrapped) return 'unwrapDeck';
  if (view.currentLogical >= 0) return 'revealCard';
  if (view.untornVisual.length) return 'openPack';
  return 'done';
}

/**
 * Tearing the on-table pack `visual`: it takes the next logical pack's cards.
 * @returns {{event: {type: 'tearPack', packIndex: number}, cosmetic: Cosmetic}|null} null when the
 *   pack is already torn or no pack may be torn now (a pack is mid-reveal, the deck is still wrapped).
 */
export function tearPackAction(u, cosmetic, visual) {
  const record = reconcileCosmetic(cosmetic, u);
  if (!isVisualIndex(visual, u.packsTorn.length) || record.packOrder.includes(visual)) return null;
  const logical = nextPackToTear(u);
  if (logical < 0 || logical !== record.packOrder.length) return null;
  return {
    event: { type: 'tearPack', packIndex: logical },
    cosmetic: { ...record, packOrder: [...record.packOrder, visual] },
  };
}

/**
 * Skipping to the end: every untorn pack is torn in on-table order.
 * @returns {Cosmetic}
 */
export function finishCosmetic(cosmetic, packCount) {
  const order = cosmetic.packOrder.filter((index) => isVisualIndex(index, packCount));
  for (let index = 0; index < packCount; index += 1) if (!order.includes(index)) order.push(index);
  return { ...cosmetic, itemsOut: true, packOrder: order };
}

/** @returns {number} the logical pack an on-table pack holds, or -1 while it is still sealed. */
export function logicalOfVisual(cosmetic, visual) {
  return cosmetic.packOrder.indexOf(visual);
}
