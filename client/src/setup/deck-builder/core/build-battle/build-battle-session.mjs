// The opened Build & Battle box, kept across reloads (design 051 § Session). Pure apart from
// the storage object passed in; every storage call is guarded, and a storage that throws
// means the session lives in memory only.

import { isBasicEnergy } from '../../../../../../shared/engine/rules/card-classify.mjs';
import { getBuildBattleBox } from './box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS } from './build-battle.generated.mjs';
import { createUnboxing, finishedUnboxing, parseUnboxing } from './unboxing.mjs';

export const BUILD_BATTLE_STORAGE_KEY = 'ptcg-sim.build-battle.v1';
const SESSION_VERSION = 1;
const MAX_SEED = 2 ** 31 - 1;
const MAX_ID_LENGTH = 128;

/**
 * @typedef {{version: 1, boxKey: string, seed: number, deckKey: string, packs: string[][],
 *   unboxing: import('./unboxing.mjs').Unboxing, deckId: string|null,
 *   unsavedDeck: [string, number][]|null, createdAt: number}} Session
 * `unboxing` is the scene's progress (design 052); it never changes `packs`.
 * `unsavedDeck` holds the editor deck as [cardId, count] pairs while no My Decks record is bound
 * (the library was full), so a reload rebuilds the player's edits instead of the box deck (I207).
 */

/** @returns {Session} a freshly opened box: still sealed, no library deck bound. */
export function createSession({
  boxKey,
  seed,
  deckKey,
  packs,
  now = Date.now(),
}) {
  return {
    version: SESSION_VERSION,
    boxKey,
    seed,
    deckKey,
    packs: packs.map((pack) => [...pack]),
    unboxing: createUnboxing(),
    deckId: null,
    unsavedDeck: null,
    createdAt: now,
  };
}

const MAX_UNSAVED_ENTRIES = 80;
const MAX_COPIES = 60;

/** @returns {[string, number][]|null} the stored pairs, or null when absent or untrustworthy. */
function parseUnsavedDeck(value) {
  if (!Array.isArray(value) || value.length > MAX_UNSAVED_ENTRIES) return null;
  const valid = value.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      entry[0].length > 0 &&
      entry[0].length <= MAX_ID_LENGTH &&
      Number.isInteger(entry[1]) &&
      entry[1] > 0 &&
      entry[1] <= MAX_COPIES
  );
  return valid ? value.map(([id, count]) => [id, count]) : null;
}

/**
 * The editor deck as [cardId, count] pairs, merged by id; cards without an id are skipped.
 * @param {object} deck `{ [name]: { cards: [{ data, count }] } }`
 * @returns {[string, number][]}
 */
export function deckCardCounts(deck = {}) {
  const counts = new Map();
  for (const group of Object.values(deck || {})) {
    for (const entry of group?.cards || []) {
      const id = entry?.data?.id;
      const count = Number(entry?.count) || 0;
      if (!id || count <= 0) continue;
      counts.set(id, (counts.get(id) || 0) + count);
    }
  }
  return [...counts.entries()];
}

const isSeed = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_SEED;

const isDeckId = (value) =>
  value === null ||
  (typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH);

function arePacksInSet(packs, box) {
  if (!Array.isArray(packs) || packs.length !== box.packCount) return false;
  const setIds = new Set(
    (BUILD_BATTLE_SET_CARDS[box.setId] || []).map((card) => card.id)
  );
  return packs.every(
    (pack) =>
      Array.isArray(pack) &&
      pack.length > 0 &&
      pack.length <= box.packModel.size &&
      pack.every((id) => setIds.has(id))
  );
}

/** @returns {Session|null} the stored session, or null for anything this version cannot trust. */
export function parseSession(json) {
  let value;
  try {
    value = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== SESSION_VERSION)
    return null;
  const box = getBuildBattleBox(value.boxKey);
  if (!box || !box.decks.some((deck) => deck.key === value.deckKey))
    return null;
  if (!isSeed(value.seed) || !arePacksInSet(value.packs, box)) return null;
  // A session saved before the unboxing scene existed (design 051) has no `unboxing`: every
  // pack was already shown to that player, so it resumes at the end of the scene.
  const unboxing =
    value.unboxing === undefined
      ? finishedUnboxing()
      : parseUnboxing(value.unboxing);
  if (!unboxing) return null;
  if (!isDeckId(value.deckId) || !Number.isFinite(value.createdAt)) return null;
  return {
    version: SESSION_VERSION,
    boxKey: value.boxKey,
    seed: value.seed,
    deckKey: value.deckKey,
    packs: value.packs.map((pack) => [...pack]),
    unboxing,
    deckId: value.deckId,
    unsavedDeck: value.deckId === null ? parseUnsavedDeck(value.unsavedDeck) : null,
    createdAt: value.createdAt,
  };
}

/** @returns {boolean} false when the session could not be stored (memory only). */
export function saveSession(storage, session) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(BUILD_BATTLE_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Session|null} */
export function loadSession(storage) {
  try {
    const json = storage?.getItem?.(BUILD_BATTLE_STORAGE_KEY);
    return json ? parseSession(json) : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} false when the storage refused the removal. */
export function clearSession(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(BUILD_BATTLE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** @returns {number|null} the `?seed=` value when it is an integer 0..2^31-1, else null. */
export function parseSeed(value) {
  if (typeof value === 'number') return isSeed(value) ? value : null;
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) return null;
  const seed = Number(value);
  return isSeed(seed) ? seed : null;
}

/** @returns {number} a random 31-bit seed from Web Crypto. */
export function randomSeed(cryptoImpl = globalThis.crypto) {
  const [value] = cryptoImpl.getRandomValues(new Uint32Array(1));
  return value & MAX_SEED;
}

function countDeckById(deck) {
  const counts = new Map();
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      const card = variant?.data || {};
      if (isBasicEnergy(card)) continue;
      const entry = counts.get(card.id) || { name: card.name, count: 0 };
      entry.count += Number(variant?.count || 0);
      counts.set(card.id, entry);
    }
  }
  return counts;
}

function poolCountById(pool) {
  return new Map((pool || []).map((entry) => [entry.card?.id, entry.count]));
}

/**
 * @param {object} deck the builder's `{ [name]: { cards: [{ data, count }], totalCount } }` map
 * @param {{card: object, count: number}[]} pool from `poolFromBox`
 * @returns {string[]} one error per card the pool cannot back; Basic Energy is never checked.
 */
export function validatePoolDeck(deck, pool) {
  const available = poolCountById(pool);
  const errors = [];
  for (const [id, { name, count }] of countDeckById(deck)) {
    if (!available.has(id)) {
      errors.push(`${name} is not in your pool`);
    } else if (count > available.get(id)) {
      errors.push(
        `${name}: ${count} in deck, ${available.get(id)} in your pool`
      );
    }
  }
  return errors;
}

/** @returns {boolean} whether one more copy of `card` still fits the pool. */
export function canAddFromPool(deck, pool, card) {
  if (isBasicEnergy(card)) return true;
  const available = poolCountById(pool).get(card?.id) || 0;
  const inDeck = countDeckById(deck).get(card?.id)?.count || 0;
  return inDeck + 1 <= available;
}
