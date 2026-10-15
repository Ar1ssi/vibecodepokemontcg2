import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createEmptyDeck } from '../../deck-state.mjs';
import { importDeckEntries } from '../../deck-text-import.mjs';
import { indexDataset } from '../dataset.mjs';
import { listToEntries, resolveDatasetCard, resolveListEntry } from '../resolve.mjs';
import { fixtureDataset } from './fixture-dataset.mjs';

const index = indexDataset(fixtureDataset());

function stubDeps({ details = {}, searches = {} } = {}) {
  const calls = { detail: [], search: [] };
  return {
    calls,
    fetchCardDetail: async (id) => {
      calls.detail.push(id);
      if (!details[id]) throw new Error('404');
      return details[id];
    },
    searchByName: async (name) => {
      calls.search.push(name);
      return searches[name] || [];
    },
  };
}

test('Basic Energy resolves to the builder Energy card without a network call', async () => {
  const deps = stubDeps();
  const { card } = await resolveDatasetCard(index.dataset.cards[5], deps);
  assert.equal(card.supertype, 'Energy');
  assert.match(card.name, /Darkness Energy/);
  assert.deepEqual(deps.calls, { detail: [], search: [] });
});

test('a Trainer resolves by its most-played print', async () => {
  const iono = { id: 'sv02-185', name: 'Iono', image: 'https://img/iono' };
  const deps = stubDeps({ details: { 'sv02-185': iono } });
  assert.deepEqual(await resolveDatasetCard(index.dataset.cards[3], deps), { card: iono });
});

test('print missing, renamed or artless → name search fallback; nothing found → error', async () => {
  const found = { id: 'me01-131', name: 'Ultra Ball', image: 'https://img/ub', set: { releaseDate: '2025' } };
  const deps = stubDeps({
    details: { 'me01-131': { id: 'me01-131', name: 'Ultra Ball' } },
    searches: { 'Ultra Ball': [found] },
  });
  assert.deepEqual(await resolveDatasetCard(index.dataset.cards[2], deps), { card: found });
  assert.deepEqual(deps.calls.search, ['Ultra Ball']);

  const nothing = await resolveDatasetCard(index.dataset.cards[6], stubDeps());
  assert.equal(nothing.error, 'No card with that name');
  assert.deepEqual(await resolveDatasetCard(null, stubDeps()), { error: 'Unknown card' });
});

test('listToEntries + importDeckEntries build a whole tournament list; failures are reported', async () => {
  const entries = listToEntries(index, 2);
  assert.deepEqual(
    entries.map((entry) => entry.line),
    ['4 Dreepy', '2 Dragapult ex', '4 Ultra Ball', '4 Iono', '1 Counter Catcher']
  );
  assert.deepEqual(listToEntries(index, 99), []);

  const details = {
    'sv06-128': { id: 'sv06-128', name: 'Dreepy', image: 'a' },
    'sv06-130': { id: 'sv06-130', name: 'Dragapult ex', image: 'b' },
    'me01-131': { id: 'me01-131', name: 'Ultra Ball', image: 'c' },
    'sv02-185': { id: 'sv02-185', name: 'Iono', image: 'd' },
  };
  const result = await importDeckEntries(entries, {
    deck: createEmptyDeck(),
    addCard,
    deps: stubDeps({ details }),
    resolve: resolveListEntry,
  });
  assert.equal(result.imported, 14);
  assert.deepEqual(result.failed, [{ line: '1 Counter Catcher', reason: 'No card with that name' }]);
  assert.equal(result.deck.Iono.totalCount, 4);
});

test('importDeckEntries turns a throwing resolver into a failed line', async () => {
  const result = await importDeckEntries([{ qty: 1, name: 'X', line: '1 X' }], {
    deck: createEmptyDeck(),
    addCard,
    deps: {},
    resolve: async () => {
      throw new Error('boom');
    },
  });
  assert.deepEqual(result.failed, [{ line: '1 X', reason: 'Lookup failed (boom)' }]);
});
