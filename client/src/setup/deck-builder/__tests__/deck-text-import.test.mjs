import test from 'node:test';
import assert from 'node:assert/strict';

import {
  basicEnergyLabel,
  chooseCandidate,
  importDeckEntries,
  parseDeckText,
  resolveEntry,
} from '../core/deck-text-import.mjs';
import { addCard } from '../core/deck-state.mjs';

const card = (id, name, setId, number, extra = {}) => ({
  id,
  name,
  supertype: 'Pokémon',
  number,
  image: `https://img/${id}.webp`,
  set: { id: setId, name: setId, releaseDate: extra.releaseDate || '2024-01-01' },
  legal: { standard: extra.standard ?? true },
});

test('parseDeckText reads quantity, name, set code and number; ignores headers and totals', () => {
  const { entries, skipped } = parseDeckText(
    ['Pokémon: 6', '4 Pikachu ex SVI 57', '2x Charcadet (PFL) 019', '', 'Trainer: 4', '4 Ultra Ball', 'Total Cards: 60'].join('\n')
  );

  assert.deepEqual(
    entries.map(({ qty, name, setCode, number }) => ({ qty, name, setCode, number })),
    [
      { qty: 4, name: 'Pikachu ex', setCode: 'SVI', number: '57' },
      { qty: 2, name: 'Charcadet', setCode: 'PFL', number: '019' },
      { qty: 4, name: 'Ultra Ball', setCode: '', number: '' },
    ]
  );
  assert.deepEqual(skipped, []);
});

test('parseDeckText merges repeated printings, tolerates CRLF, and reports unparseable lines', () => {
  const { entries, skipped } = parseDeckText('2 Iono PAF 80\r\n1 Iono PAF 080\r\nnot a card line\r\n0 Nothing');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].qty, 3);
  assert.deepEqual(skipped, ['not a card line', '0 Nothing']);
});

test('parseDeckText handles empty and non-string input', () => {
  assert.deepEqual(parseDeckText(''), { entries: [], skipped: [] });
  assert.deepEqual(parseDeckText(undefined), { entries: [], skipped: [] });
});

test('basic Energy lines keep their name and are not split into a set code', () => {
  const { entries } = parseDeckText('8 Basic {G} Energy\n4 Basic Fire Energy 2');

  assert.equal(entries[0].name, 'Basic {G} Energy');
  assert.equal(entries[0].setCode, '');
  assert.equal(basicEnergyLabel('Basic {G} Energy'), 'Basic Grass Energy');
  assert.equal(basicEnergyLabel('Basic {D} Energy'), 'Basic Darkness Energy');
  assert.equal(basicEnergyLabel('Basic Fire Energy'), 'Basic Fire Energy');
  assert.equal(basicEnergyLabel('Double Turbo Energy'), null);
});

test('chooseCandidate requires an exact name and prefers matching set, number, then newest legal print', () => {
  const older = card('a', 'Ultra Ball', 'sv01', '196', { releaseDate: '2023-03-31' });
  const newer = card('b', 'Ultra Ball', 'me01', '131', { releaseDate: '2025-09-26' });
  const other = card('c', 'Ultra Ball Pikachu', 'sv01', '1');

  assert.equal(chooseCandidate([older, newer, other], { name: 'ultra ball' }).id, 'b');
  assert.equal(chooseCandidate([older, newer], { name: 'Ultra Ball', setCode: 'SVI', number: '196' }).id, 'a');
  assert.equal(chooseCandidate([other], { name: 'Ultra Ball' }), null);
  assert.equal(chooseCandidate([], { name: 'Ultra Ball' }), null);
  assert.equal(
    chooseCandidate([card('d', 'Poké Pad', 'me03', '81')], { name: 'Poke Pad' }).id,
    'd'
  );
});

test('resolveEntry fetches by set id and number first, then falls back to a name search', async () => {
  const fetched = [];
  const deps = {
    fetchCardDetail: async (id) => {
      fetched.push(id);
      if (id === 'sv01-057') return card(id, 'Pikachu ex', 'sv01', '057');
      throw new Error('404');
    },
    searchByName: async () => [card('sv09-001', 'Charcadet', 'sv09', '001')],
  };

  const direct = await resolveEntry({ qty: 1, name: 'Pikachu ex', setCode: 'SVI', number: '57' }, deps);
  assert.equal(direct.card.id, 'sv01-057');
  assert.deepEqual(fetched, ['sv01-057']);

  const fallback = await resolveEntry({ qty: 1, name: 'Charcadet', setCode: 'PFL', number: '19' }, deps);
  assert.equal(fallback.card.id, 'sv09-001');
});

test('resolveEntry rejects an id whose card is a different name', async () => {
  const deps = {
    fetchCardDetail: async (id) => card(id, 'Something Else', 'sv01', '057'),
    searchByName: async () => [],
  };

  const result = await resolveEntry({ qty: 1, name: 'Pikachu ex', setCode: 'SVI', number: '57' }, deps);
  assert.equal(result.error, 'No card with that name');
});

test('resolveEntry reports a failed lookup instead of throwing', async () => {
  const deps = {
    fetchCardDetail: async () => {
      throw new Error('boom');
    },
    searchByName: async () => {
      throw new Error('offline');
    },
  };

  const result = await resolveEntry({ qty: 1, name: 'Iono', setCode: '', number: '' }, deps);
  assert.match(result.error, /offline/);
});

test('resolveEntry builds basic Energy without any lookup', async () => {
  const deps = {
    fetchCardDetail: async () => assert.fail('no fetch for basic Energy'),
    searchByName: async () => assert.fail('no search for basic Energy'),
  };

  const { card: energy } = await resolveEntry({ qty: 8, name: 'Basic {G} Energy', setCode: '', number: '' }, deps);
  assert.equal(energy.name, 'Basic Grass Energy');
  assert.equal(energy.supertype, 'Energy');
  assert.equal(energy.energyType, 'Normal');
  assert.ok(energy.image);
});

test('importDeckEntries adds every copy to the deck and lists lines that failed', async () => {
  const { entries } = parseDeckText('3 Iono\n2 Missing Card\n4 Basic {W} Energy');
  const deps = {
    fetchCardDetail: async () => {
      throw new Error('404');
    },
    searchByName: async (name) => (name === 'Iono' ? [card('sv04.5-080', 'Iono', 'sv04.5', '080')] : []),
  };
  const progress = [];

  const { deck, imported, failed } = await importDeckEntries(entries, {
    deck: {},
    addCard,
    deps,
    onProgress: (done, total) => progress.push([done, total]),
  });

  assert.equal(imported, 7);
  assert.equal(deck.Iono.totalCount, 3);
  assert.equal(deck['Basic Water Energy'].totalCount, 4);
  assert.deepEqual(failed, [{ line: '2 Missing Card', reason: 'No card with that name' }]);
  assert.equal(progress.length, 3);
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('importDeckEntries keeps the incoming deck when adding to an existing one', async () => {
  const existing = addCard({}, card('x', 'Iono', 'sv04.5', '080'));
  const { entries } = parseDeckText('1 Iono');
  const deps = {
    fetchCardDetail: async () => {
      throw new Error('404');
    },
    searchByName: async () => [card('x', 'Iono', 'sv04.5', '080')],
  };

  const { deck } = await importDeckEntries(entries, { deck: existing, addCard, deps });
  assert.equal(deck.Iono.totalCount, 2);
});

test('importDeckEntries with no entries returns the deck untouched', async () => {
  const { deck, imported, failed } = await importDeckEntries([], { deck: {}, addCard, deps: {} });
  assert.deepEqual({ deck, imported, failed }, { deck: {}, imported: 0, failed: [] });
});
