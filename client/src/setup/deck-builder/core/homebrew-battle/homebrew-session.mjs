// The opened Homebrew box, kept across reloads (design 078 § Session). Pure apart from the storage
// object passed in; every storage call is guarded, and a storage that throws means the session
// lives in memory only.

import { createUnboxing, parseUnboxing } from '../build-battle/unboxing.mjs';
import { parseSeed, parseUnsavedDeck } from '../build-battle/build-battle-session.mjs';
import { HOMEBREW_PACK_COUNT, HOMEBREW_PACK_SIZE } from './homebrew-pack.mjs';

export const HOMEBREW_STORAGE_KEY = 'ptcg-sim.homebrew-battle.v1';
// A deck named like this belongs to the box: saving the editor deck under it binds the session.
export const HOMEBREW_DECK_PREFIX = 'Homebrew B&B #';

const SESSION_VERSION = 1;
const MAX_ID_LENGTH = 128;

/**
 * @typedef {{version: 1, seed: number, packs: string[][],
 *   unboxing: import('../build-battle/unboxing.mjs').Unboxing, deckId: string|null,
 *   unsavedDeck: [string, number][]|null, createdAt: number}} HomebrewSession
 * `unsavedDeck` holds the editor deck as [cardId, count] pairs while no My Decks record is bound
 * (the library was full), so a reload rebuilds the player's edits.
 */

/** @returns {string} the My Decks name of the deck built from one box. */
export const homebrewDeckName = (seed) => `${HOMEBREW_DECK_PREFIX}${seed}`;

/** @returns {HomebrewSession} a freshly opened box: still sealed, no library deck bound. */
export function createHomebrewSession({ seed, packs, now = Date.now() }) {
  return {
    version: SESSION_VERSION,
    seed,
    packs: packs.map((pack) => [...pack]),
    unboxing: createUnboxing({ packCount: packs.length, cardsPerPack: HOMEBREW_PACK_SIZE }),
    deckId: null,
    unsavedDeck: null,
    createdAt: now,
  };
}

const isBoundedId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

const arePacksWellFormed = (packs) =>
  Array.isArray(packs) &&
  packs.length === HOMEBREW_PACK_COUNT &&
  packs.every(
    (pack) => Array.isArray(pack) && pack.length > 0 && pack.length <= HOMEBREW_PACK_SIZE && pack.every(isBoundedId)
  );

/** @returns {HomebrewSession|null} the stored session, or null for anything this version cannot trust. */
export function parseHomebrewSession(json) {
  let value;
  try {
    value = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== SESSION_VERSION) return null;
  const seed = parseSeed(value.seed);
  if (seed === null || !arePacksWellFormed(value.packs)) return null;
  const unboxing = parseUnboxing(value.unboxing);
  if (
    !unboxing ||
    unboxing.packsTorn.length !== HOMEBREW_PACK_COUNT ||
    unboxing.cardsPerPack !== HOMEBREW_PACK_SIZE
  ) {
    return null;
  }
  if (value.deckId !== null && !isBoundedId(value.deckId)) return null;
  if (!Number.isFinite(value.createdAt)) return null;
  return {
    version: SESSION_VERSION,
    seed,
    packs: value.packs.map((pack) => [...pack]),
    unboxing,
    deckId: value.deckId,
    unsavedDeck: value.deckId === null ? parseUnsavedDeck(value.unsavedDeck) : null,
    createdAt: value.createdAt,
  };
}

/** Whether every pack card exists in the loaded set: false means the set changed under the session. */
export function verifyHomebrewSession(session, cards = []) {
  if (!session) return false;
  const known = new Set(cards.map((card) => card.id));
  return session.packs.every((pack) => pack.every((id) => known.has(id)));
}

/** @returns {boolean} false when the session could not be stored (memory only). */
export function saveHomebrewSession(storage, session) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(HOMEBREW_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** @returns {HomebrewSession|null} */
export function loadHomebrewSession(storage) {
  try {
    const json = storage?.getItem?.(HOMEBREW_STORAGE_KEY);
    return json ? parseHomebrewSession(json) : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} false when the storage refused the removal. */
export function clearHomebrewSession(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(HOMEBREW_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
