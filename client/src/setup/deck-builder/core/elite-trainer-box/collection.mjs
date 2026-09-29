// What the player's opened Elite Trainer Boxes gave them (design 057 § Collection). Counts and
// ids only, never card bodies. Pure apart from the storage object passed in; every storage call is
// guarded, and a storage that throws means the collection lives in memory only.

import { BASIC_ENERGY_LABELS } from '../build-battle/box-catalog.mjs';
import { comparePoolEntries } from '../build-battle/pack-opening.mjs';

export const COLLECTION_STORAGE_KEY = 'ptcg-sim.collection.v1';
const COLLECTION_VERSION = 1;
export const MAX_PRODUCTS = 500;
export const MAX_COUNT = 9999;
const MAX_ID_LENGTH = 128;
const MAX_OWNED_IDS = 500;
const MAX_SEED = 2 ** 31 - 1;

/**
 * @typedef {{version: 1, cards: Record<string, number>, energy: Record<string, number>,
 *   sleeves: string[], coins: string[],
 *   products: {key: string, seed: number, openedAt: number}[]}} Collection
 * `products` is history only: the counts are the truth, since replaying a seed after the pack
 * tables change would draw different cards.
 */

/** @returns {Collection} an empty collection. */
export function createCollection() {
  return { version: COLLECTION_VERSION, cards: {}, energy: {}, sleeves: [], coins: [], products: [] };
}

const isId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

const addCount = (counts, key, amount) => {
  counts[key] = Math.min(MAX_COUNT, (counts[key] || 0) + amount);
};

const withId = (ids, id) => (isId(id) && !ids.includes(id) ? [...ids, id] : [...ids]);

/**
 * One opened box added to the collection. Pure: returns a new collection.
 * @param {Collection} collection
 * @param {{etb: {key: string}, seed: number, packs: string[][],
 *   contents: ReturnType<typeof import('./etb-opening.mjs').etbContents>, now?: number}} opened
 * @returns {Collection}
 */
export function addProduct(collection, { etb, seed, packs = [], contents, now = Date.now() }) {
  const cards = { ...collection.cards };
  const energy = { ...collection.energy };
  for (const pack of packs) {
    for (const id of pack) if (isId(id)) addCount(cards, id, 1);
  }
  if (isId(contents?.promo?.id)) addCount(cards, contents.promo.id, 1);
  for (const [label, count] of contents?.energy || []) {
    if (BASIC_ENERGY_LABELS.includes(label) && Number.isInteger(count) && count > 0) {
      addCount(energy, label, count);
    }
  }
  const products = [...collection.products, { key: etb.key, seed, openedAt: now }];
  return {
    version: COLLECTION_VERSION,
    cards,
    energy,
    sleeves: withId(collection.sleeves, contents?.sleeveId),
    coins: withId(collection.coins, contents?.coinId),
    products: products.slice(-MAX_PRODUCTS),
  };
}

const isCount = (value) => Number.isInteger(value) && value > 0 && value <= MAX_COUNT;

function parseCounts(value, isKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([key, count]) => isKey(key) && isCount(count))) return null;
  return Object.fromEntries(entries);
}

function parseIds(value) {
  if (!Array.isArray(value) || value.length > MAX_OWNED_IDS || !value.every(isId)) return null;
  return [...new Set(value)];
}

const isProduct = (product) =>
  product &&
  typeof product === 'object' &&
  isId(product.key) &&
  Number.isInteger(product.seed) &&
  product.seed >= 0 &&
  product.seed <= MAX_SEED &&
  Number.isFinite(product.openedAt);

/** @returns {Collection|null} the stored collection, or null for anything this version cannot trust. */
export function parseCollection(json) {
  let value;
  try {
    value = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== COLLECTION_VERSION) return null;
  const cards = parseCounts(value.cards, isId);
  const energy = parseCounts(value.energy, (label) => BASIC_ENERGY_LABELS.includes(label));
  const sleeves = parseIds(value.sleeves);
  const coins = parseIds(value.coins);
  if (!cards || !energy || !sleeves || !coins) return null;
  const { products } = value;
  if (!Array.isArray(products) || products.length > MAX_PRODUCTS || !products.every(isProduct)) {
    return null;
  }
  return {
    version: COLLECTION_VERSION,
    cards,
    energy,
    sleeves,
    coins,
    products: products.map(({ key, seed, openedAt }) => ({ key, seed, openedAt })),
  };
}

/** @returns {boolean} false when the collection could not be stored (memory only). */
export function saveCollection(storage, collection) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Collection} the stored collection; a missing, unreadable or unparsable one is empty. */
export function loadCollection(storage) {
  try {
    const json = storage?.getItem?.(COLLECTION_STORAGE_KEY);
    return (json && parseCollection(json)) || createCollection();
  } catch {
    return createCollection();
  }
}

/** @returns {boolean} false when the storage refused the removal. */
export function clearCollection(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(COLLECTION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load, change, save — re-reading storage first, so two builder tabs sharing it both keep their
 * boxes.
 * @param {(collection: Collection) => Collection} mutate
 * @returns {{collection: Collection, saved: boolean}}
 */
export function withFreshCollection(storage, mutate) {
  const collection = mutate(loadCollection(storage));
  return { collection, saved: saveCollection(storage, collection) };
}

function withoutQty(card) {
  const { qty: _qty, ...rest } = card;
  return rest;
}

/**
 * The owned cards as pool entries. Ids with no card in `cardsById` are skipped.
 * @param {Collection} collection
 * @param {Map<string, object>} cardsById
 * @returns {{card: object, count: number}[]} in pool order (Pokémon → Trainer → Energy, localId)
 */
export function collectionPool(collection, cardsById) {
  const entries = [];
  for (const [id, count] of Object.entries(collection?.cards || {})) {
    const card = cardsById?.get?.(id);
    if (card) entries.push({ card: withoutQty(card), count });
  }
  return entries.sort(comparePoolEntries);
}

/** @returns {number} how many copies of `cardId` the collection holds. */
export function ownedCount(collection, cardId) {
  return Object.hasOwn(collection?.cards || {}, cardId) ? collection.cards[cardId] : 0;
}

/** @returns {{cards: number, unique: number, products: number}} Basic Energy is not counted. */
export function collectionStats(collection) {
  const counts = Object.values(collection?.cards || {});
  return {
    cards: counts.reduce((sum, count) => sum + count, 0),
    unique: counts.length,
    products: (collection?.products || []).length,
  };
}
