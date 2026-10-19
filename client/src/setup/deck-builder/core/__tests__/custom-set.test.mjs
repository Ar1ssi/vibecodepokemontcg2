import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOM_SET_FILE_FORMAT,
  CUSTOM_SET_STORAGE_KEY,
  DEFAULT_CUSTOM_SET_NAME,
  addCardToCustomSet,
  createEmptyCustomSet,
  customSetFileName,
  customSetHasCard,
  loadCustomSetFromStorage,
  mergeCardsIntoCustomSet,
  parseCustomSetFile,
  removeCardFromCustomSet,
  renameCustomSet,
  saveCustomSetToStorage,
  serializeCustomSet,
} from '../custom-set.mjs';

const card = (id, name = id) => ({ id, name, set: { id: 'cust', name: 'Custom' }, images: { small: `https://img/${id}.webp` } });

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: data,
  };
}

test('a new set is empty and named by default', () => {
  assert.deepEqual(createEmptyCustomSet(), { name: DEFAULT_CUSTOM_SET_NAME, cards: [] });
});

test('adding any number of distinct cards keeps them all, in order', () => {
  let set = createEmptyCustomSet('Set');
  for (let i = 0; i < 120; i += 1) set = addCardToCustomSet(set, card(`c-${i}`));
  assert.equal(set.cards.length, 120);
  assert.equal(set.cards[0].id, 'c-0');
  assert.equal(set.cards[119].id, 'c-119');
});

test('adding a card already in the set does not duplicate it', () => {
  const set = addCardToCustomSet(addCardToCustomSet(createEmptyCustomSet(), card('a')), card('a'));
  assert.equal(set.cards.length, 1);
  assert.equal(customSetHasCard(set, 'a'), true);
});

test('adding an unusable card (no id or no name) leaves the set unchanged', () => {
  const start = createEmptyCustomSet();
  assert.deepEqual(addCardToCustomSet(start, { name: 'No id' }), start);
  assert.deepEqual(addCardToCustomSet(start, { id: 'x' }), start);
  assert.deepEqual(addCardToCustomSet(start, null), start);
});

test('adding returns a copy and never mutates the input set', () => {
  const start = createEmptyCustomSet();
  const next = addCardToCustomSet(start, card('a'));
  assert.equal(start.cards.length, 0);
  assert.notEqual(next, start);
});

test('removing a card by id drops only that card', () => {
  const set = [card('a'), card('b')].reduce(addCardToCustomSet, createEmptyCustomSet());
  const next = removeCardFromCustomSet(set, 'a');
  assert.deepEqual(next.cards.map((c) => c.id), ['b']);
  assert.equal(set.cards.length, 2);
});

test('rename trims and falls back to the default name when blank', () => {
  assert.equal(renameCustomSet(createEmptyCustomSet(), '  Dragon Pack  ').name, 'Dragon Pack');
  assert.equal(renameCustomSet(createEmptyCustomSet(), '   ').name, DEFAULT_CUSTOM_SET_NAME);
  assert.equal(renameCustomSet(createEmptyCustomSet(), 'x'.repeat(200)).name.length, 60);
});

test('merging skips cards already present and reports how many were added', () => {
  const start = addCardToCustomSet(createEmptyCustomSet(), card('a'));
  const { customSet, addedCount } = mergeCardsIntoCustomSet(start, [card('a'), card('b'), { id: '' }, card('c')]);
  assert.equal(addedCount, 2);
  assert.deepEqual(customSet.cards.map((c) => c.id), ['a', 'b', 'c']);
});

test('export writes a versioned file that parses back to the same cards', () => {
  const set = renameCustomSet([card('a'), card('b')].reduce(addCardToCustomSet, createEmptyCustomSet()), 'Fire Pack');
  const json = serializeCustomSet(set, Date.UTC(2026, 9, 20));
  const parsed = parseCustomSetFile(json);
  assert.equal(JSON.parse(json).format, CUSTOM_SET_FILE_FORMAT);
  assert.equal(JSON.parse(json).exportedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.name, 'Fire Pack');
  assert.deepEqual(parsed.cards, set.cards);
  assert.equal(parsed.skippedCount, 0);
});

test('import rejects text that is not JSON, not a set export, or a newer version', () => {
  assert.equal(parseCustomSetFile('{not json').ok, false);
  assert.equal(parseCustomSetFile(JSON.stringify({ cards: [] })).ok, false);
  assert.equal(parseCustomSetFile(JSON.stringify({ format: CUSTOM_SET_FILE_FORMAT, version: 99, cards: [] })).ok, false);
  assert.equal(parseCustomSetFile(JSON.stringify({ format: CUSTOM_SET_FILE_FORMAT, version: 1 })).ok, false);
  assert.equal(parseCustomSetFile('null').ok, false);
});

test('import drops unusable and duplicate cards and counts them', () => {
  const json = JSON.stringify({
    format: CUSTOM_SET_FILE_FORMAT,
    version: 1,
    name: 'Mixed',
    cards: [card('a'), { id: 'b' }, card('a'), 42, card('c')],
  });
  const parsed = parseCustomSetFile(json);
  assert.deepEqual(parsed.cards.map((c) => c.id), ['a', 'c']);
  assert.equal(parsed.skippedCount, 3);
});

test('file names are safe slugs with a fallback', () => {
  assert.equal(customSetFileName('Dragon Pack!'), 'dragon-pack.ptcg-set.json');
  assert.equal(customSetFileName('   '), 'my-custom-set.ptcg-set.json');
  assert.equal(customSetFileName('../../evil'), 'evil.ptcg-set.json');
  assert.equal(customSetFileName('!!!'), 'custom-set.ptcg-set.json');
});

test('the set survives a save and reload through storage', () => {
  const storage = memoryStorage();
  const set = renameCustomSet(addCardToCustomSet(createEmptyCustomSet(), card('a')), 'Kept');
  assert.equal(saveCustomSetToStorage(storage, set), true);
  assert.ok(storage.raw.has(CUSTOM_SET_STORAGE_KEY));
  assert.deepEqual(loadCustomSetFromStorage(storage), set);
});

test('a corrupt stored set loads as an empty set instead of throwing', () => {
  assert.deepEqual(loadCustomSetFromStorage(memoryStorage({ [CUSTOM_SET_STORAGE_KEY]: '{oops' })), createEmptyCustomSet());
  assert.deepEqual(loadCustomSetFromStorage(undefined), createEmptyCustomSet());
});

test('a failing write reports false so the panel can ask for an export', () => {
  const full = {
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(saveCustomSetToStorage(full, createEmptyCustomSet()), false);
  assert.equal(saveCustomSetToStorage(null, createEmptyCustomSet()), false);
});
