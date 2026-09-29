import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { loadSetData } from '../../build-battle/box-data.mjs';
import { resolvePackModel } from '../../build-battle/pack-models.mjs';
import {
  COLLECTION_STORAGE_KEY,
  MAX_PRODUCTS,
  addProduct,
  clearCollection,
  collectionPool,
  collectionStats,
  createCollection,
  loadCollection,
  ownedCount,
  parseCollection,
  saveCollection,
  withFreshCollection,
} from '../collection.mjs';
import { getEtb } from '../etb-catalog.mjs';
import { etbContents, openEtb } from '../etb-opening.mjs';

const etb = getEtb('phantasmal-flames-etb');
const { setInfo, cards } = await loadSetData(etb.setId);
const packModel = resolvePackModel(etb.packModelKey, cards, setInfo);
const promo = { id: 'mep-022', name: 'Charcadet', supertype: 'Pokémon', localId: '022', qty: 1 };
const contents = etbContents(etb, { [etb.key]: promo });
const openSeed = (seed) =>
  openEtb({ etb, cards, packModel, rng: createRng(seed) });
const add = (collection, seed, now = 1000) =>
  addProduct(collection, { etb, seed, packs: openSeed(seed).packs, contents, now });

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

test('row 1: an empty collection owns nothing', () => {
  const empty = createCollection();
  assert.deepEqual(empty, { version: 1, cards: {}, energy: {}, sleeves: [], coins: [], products: [] });
  assert.equal(ownedCount(empty, 'me02-001'), 0);
  assert.deepEqual(collectionStats(empty), { cards: 0, unique: 0, products: 0 });
  assert.deepEqual(collectionPool(empty, new Map()), []);
  assert.deepEqual(loadCollection(memoryStorage()), empty, 'nothing stored yet');
});

test('row 15: one opening adds exactly the packs plus the promo, and addProduct is pure', () => {
  const before = createCollection();
  const snapshot = JSON.stringify(before);
  const { packs } = openSeed(42);
  const after = add(before, 42);
  assert.equal(JSON.stringify(before), snapshot, 'the input is untouched');

  const expected = {};
  for (const id of [...packs.flat(), 'mep-022']) expected[id] = (expected[id] || 0) + 1;
  assert.deepEqual(after.cards, expected);
  assert.equal(collectionStats(after).cards, 91, '9 × 10 pack cards + the promo');
  assert.equal(collectionStats(after).products, 1);
  assert.equal(Object.values(after.energy).reduce((sum, count) => sum + count, 0), 40);
  assert.deepEqual(after.sleeves, [etb.sleeveId]);
  assert.deepEqual(after.coins, [etb.coinId]);
  assert.deepEqual(after.products, [{ key: etb.key, seed: 42, openedAt: 1000 }]);

  const twice = add(after, 43, 2000);
  assert.deepEqual(twice.sleeves, [etb.sleeveId], 'a sleeve is owned once');
  assert.equal(twice.energy['Basic Fire Energy'], 10);
  assert.equal(collectionStats(twice).cards, 182);
});

test('an opening without a promo row still adds the packs', () => {
  const noPromo = addProduct(createCollection(), {
    etb,
    seed: 42,
    packs: openSeed(42).packs,
    contents: etbContents(etb),
    now: 1,
  });
  assert.equal(collectionStats(noPromo).cards, 90);
  assert.equal(ownedCount(noPromo, 'mep-022'), 0);
});

test('row 2: parseCollection refuses anything this version cannot trust', () => {
  const good = add(createCollection(), 42);
  const bad = (patch) => parseCollection(JSON.stringify({ ...good, ...patch }));
  assert.deepEqual(parseCollection(JSON.stringify(good)), good, 'round trip');
  assert.equal(parseCollection('not json'), null);
  assert.equal(parseCollection('null'), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ cards: { 'me02-001': 10000 } }), null, 'count over 9999');
  assert.equal(bad({ cards: { 'me02-001': 1.5 } }), null);
  assert.equal(bad({ cards: { 'me02-001': -1 } }), null);
  assert.equal(bad({ cards: { ['x'.repeat(200)]: 1 } }), null, 'id over 128 chars');
  assert.equal(bad({ cards: [] }), null);
  assert.equal(bad({ energy: { 'Basic Rainbow Energy': 3 } }), null, 'unknown label');
  assert.equal(bad({ sleeves: ['x'.repeat(200)] }), null);
  assert.equal(bad({ coins: 'PFLETB_Mega_Charizard_X_Coin' }), null);
  assert.equal(bad({ sleeves: Array.from({ length: 501 }, (_, i) => `s${i}`) }), null);
  assert.equal(bad({ products: Array(MAX_PRODUCTS + 1).fill(good.products[0]) }), null);
  assert.equal(bad({ products: [{ key: etb.key, seed: -1, openedAt: 1 }] }), null);
  assert.equal(bad({ products: [{ key: etb.key, seed: 1 }] }), null);

  const storage = memoryStorage();
  storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ ...good, version: 9 }));
  assert.deepEqual(loadCollection(storage), createCollection(), 'unparsable → a fresh collection');
});

test('row 3: 500 products are kept; the 501st drops the oldest and keeps the counts', () => {
  let collection = createCollection();
  const packs = [['me02-001']];
  for (let seed = 0; seed < MAX_PRODUCTS; seed += 1) {
    collection = addProduct(collection, { etb, seed, packs, contents: etbContents(etb), now: seed });
  }
  assert.equal(collection.products.length, MAX_PRODUCTS);
  const next = addProduct(collection, { etb, seed: 999, packs, contents: etbContents(etb), now: 999 });
  assert.equal(next.products.length, MAX_PRODUCTS);
  assert.equal(next.products[0].seed, 1, 'seed 0 dropped');
  assert.equal(next.products.at(-1).seed, 999);
  assert.equal(ownedCount(next, 'me02-001'), MAX_PRODUCTS + 1);
  assert.deepEqual(parseCollection(JSON.stringify(next)), next);
});

test('rows 4 + 5: writes re-read storage first; a throwing storage keeps the box in memory', () => {
  const storage = memoryStorage();
  // Two builder tabs open a box each from the same stored state.
  withFreshCollection(storage, (collection) => add(collection, 42, 1));
  const { collection, saved } = withFreshCollection(storage, (current) => add(current, 42, 2));
  assert.equal(saved, true);
  assert.equal(collection.products.length, 2, 'both openings are kept');
  assert.deepEqual(loadCollection(storage), collection);

  const memoryOnly = withFreshCollection(throwingStorage, (current) => add(current, 42));
  assert.equal(memoryOnly.saved, false);
  assert.equal(collectionStats(memoryOnly.collection).cards, 91);
  assert.equal(saveCollection(throwingStorage, memoryOnly.collection), false);
  assert.equal(saveCollection(null, memoryOnly.collection), false);
  assert.deepEqual(loadCollection(throwingStorage), createCollection());
  assert.equal(clearCollection(throwingStorage), false);

  assert.equal(clearCollection(storage), true);
  assert.equal(storage.items.has(COLLECTION_STORAGE_KEY), false);
  assert.deepEqual(loadCollection(storage), createCollection());
});

test('collectionPool lists owned cards in pool order and skips ids with no card', () => {
  const collection = add(createCollection(), 42);
  const cardsById = new Map([...cards, promo].map((card) => [card.id, card]));
  const pool = collectionPool(collection, cardsById);
  assert.equal(pool.reduce((sum, entry) => sum + entry.count, 0), 91);
  assert.equal(pool.length, collectionStats(collection).unique);
  const promoEntry = pool.find((entry) => entry.card.id === 'mep-022');
  assert.equal(promoEntry.count, 1);
  assert.equal('qty' in promoEntry.card, false, 'deck-row qty is not a pool count');
  const order = { Pokémon: 0, Trainer: 1, Energy: 2 };
  for (let index = 1; index < pool.length; index += 1) {
    assert.ok(order[pool[index - 1].card.supertype] <= order[pool[index].card.supertype]);
  }

  const withUnknown = { ...collection, cards: { ...collection.cards, 'zz-999': 3 } };
  assert.equal(collectionPool(withUnknown, cardsById).length, pool.length);
  assert.deepEqual(collectionPool(collection, new Map()), []);
});
