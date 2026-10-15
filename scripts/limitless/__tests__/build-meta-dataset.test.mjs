import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleDataset,
  joinEvent,
  resolvePrintOnTcgdex,
  selectRotationEvents,
} from '../build-meta-dataset.mjs';

test('selectRotationEvents keeps the newest contiguous run sharing the rotation code', () => {
  const events = [
    { id: 1, date: '2026-04-04', formatCode: 'SVI-ASC' },
    { id: 2, date: '2026-10-10', formatCode: 'TEF-30C' },
    { id: 3, date: '2026-04-25', formatCode: 'TEF-POR' },
    { id: 4, date: '2025-10-01', formatCode: 'TEF-OLD' },
    { id: 5, date: '2026-09-01', formatCode: '' },
  ];
  const { rotation, events: kept } = selectRotationEvents(events);
  assert.equal(rotation, 'TEF');
  // The old TEF event sits behind an SVI event, so the run stops before it.
  assert.deepEqual(kept.map((event) => event.id), [2, 3]);
  assert.deepEqual(selectRotationEvents([]), { rotation: null, events: [] });
});

test('joinEvent joins on placing + player and counts both kinds of mismatch', () => {
  const page = {
    standings: [
      { placing: 1, player: 'Riley McKay', archetypeId: 284, archetypeName: 'Dragapult', listId: 10 },
      { placing: 2, player: 'Austin Charles', archetypeId: 284, archetypeName: 'Dragapult Blaziken', listId: 11 },
      { placing: 3, player: 'No List', archetypeId: null, archetypeName: '', listId: null },
    ],
  };
  const cards = [{ count: 4, name: 'Dreepy', set: 'TWM', number: '128', priceUsd: 0.92 }];
  const { rows, dropped, missing } = joinEvent(page, [
    { placing: 1, player: 'Riley McKay', cards },
    { placing: 7, player: 'Stranger', cards },
  ]);
  assert.deepEqual(rows, [{ placing: 1, archetypeId: 284, archetypeName: 'Dragapult', cards }]);
  assert.equal(dropped, 1);
  assert.equal(missing, 1);
});

// TCGdex records named by real ids (sv06-128 Dreepy, sv02-185 / sv04.5-080 Iono, mee-010 Fire Energy).
const RECORDS = {
  'TWM 128': { id: 'sv06-128', name: 'Dreepy', category: 'Pokemon', attacks: [{ name: 'Petty Grudge' }, { name: 'Bite' }] },
  'PAL 185': { id: 'sv02-185', name: 'Iono', category: 'Trainer', image: 'https://assets.tcgdex.net/en/sv/sv02/185', effect: 'Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining Prize cards.' },
  'PAF 80': { id: 'sv04.5-080', name: 'Iono', category: 'Trainer', effect: 'Each player shuffles their hand.' },
  'MEE 10': { id: 'mee-010', name: 'Fire Energy', category: 'Energy' },
};
const resolvePrint = async ({ set, number }) => RECORDS[`${set} ${number}`] || null;
const line = (count, name, set, number, priceUsd = null) => ({ count, name, set, number, priceUsd });

test('assembleDataset merges reprints into one card and builds compact lists', async () => {
  const events = [
    {
      id: 581,
      name: 'Regional Louisville, KY',
      date: '2026-10-10',
      players: 2927,
      rows: [
        { placing: 1, archetypeId: 284, archetypeName: 'Dragapult', cards: [line(4, 'Dreepy', 'TWM', '128', 0.92), line(3, 'Iono', 'PAL', '185', 1.5), line(1, 'Iono', 'PAF', '80', 0.4)] },
        { placing: 2, archetypeId: 284, archetypeName: 'Dragapult Blaziken', cards: [line(2, 'Iono', 'PAL', '185', 1.7), line(8, 'Fire Energy', 'MEE', '10')] },
      ],
    },
    {
      id: 580,
      name: 'Regional Recife',
      date: '2026-10-03',
      players: 1074,
      rows: [{ placing: 5, archetypeId: 284, archetypeName: 'Dragapult', cards: [line(4, 'Dreepy', 'TWM', '128', 1)] }],
    },
  ];
  const dataset = await assembleDataset({ events, resolvePrint, generatedAt: '2026-10-15T00:00:00.000Z', rotation: 'TEF' });

  assert.equal(dataset.version, 1);
  assert.deepEqual(dataset.window, { from: '2026-10-03', to: '2026-10-10' });
  assert.deepEqual(dataset.archetypes, [{ id: 284, name: 'Dragapult' }]);
  assert.deepEqual(dataset.cards.map((card) => card.key), [
    'e:fire energy',
    'p:dreepy|bite;petty grudge|',
    't:iono',
  ]);
  const iono = dataset.cards[2];
  // PAL is played 5 copies vs PAF 1, so PAL is the print; price = cheapest per-print median (PAF 0.4).
  assert.deepEqual(
    { print: iono.print, set: iono.set, number: iono.number, price: iono.price, tags: iono.tags, kind: iono.kind },
    { print: 'sv02-185', set: 'PAL', number: '185', price: 0.4, tags: ['draw', 'disruption'], kind: 'trainer' }
  );
  assert.equal(iono.image, 'https://assets.tcgdex.net/en/sv/sv02/185');
  assert.equal(dataset.cards[0].image, null);
  assert.equal(dataset.cards[0].price, null);
  assert.deepEqual(dataset.printIndex, { 'mee-010': 0, 'sv06-128': 1, 'sv02-185': 2, 'sv04.5-080': 2 });
  assert.deepEqual(dataset.lists, [
    { e: 0, p: 1, a: 0, c: [1, 4, 2, 4] },
    { e: 0, p: 2, a: 0, c: [0, 8, 2, 2] },
    { e: 1, p: 5, a: 0, c: [1, 4] },
  ]);
});

test('assembleDataset throws listing every unresolved line', async () => {
  const events = [
    { id: 1, name: 'E', date: '2026-10-10', players: 10, rows: [{ placing: 1, archetypeId: null, archetypeName: '', cards: [line(1, 'Mystery', 'XYZ', '1'), line(1, 'Other', 'XYZ', '2')] }] },
  ];
  await assert.rejects(
    assembleDataset({ events, resolvePrint, generatedAt: 'now', rotation: 'TEF' }),
    /could not resolve 2 card line\(s\):\n {2}XYZ 1 Mystery\n {2}XYZ 2 Other/
  );
});

test('resolvePrintOnTcgdex tries padded ids, skips 404s and refuses a name mismatch', async () => {
  const seen = [];
  const fetchRecord = async (id) => {
    seen.push(id);
    if (id === 'me01-012') return { id, name: 'Psychic Energy' };
    throw new Error(`TCGdex has no x/${id} (404)`);
  };
  const fetchSetRecord = async () => ({ cards: [] });
  const deps = { fetchRecord, fetchSetRecord };
  assert.deepEqual(await resolvePrintOnTcgdex({ set: 'MEG', number: '12', name: 'Psychic Energy' }, deps), {
    id: 'me01-012',
    name: 'Psychic Energy',
  });
  assert.deepEqual(seen, ['me01-12', 'me01-012']);
  assert.equal(await resolvePrintOnTcgdex({ set: 'MEG', number: '12', name: 'Dreepy' }, deps), null);
  await assert.rejects(
    resolvePrintOnTcgdex(
      { set: 'MEG', number: '1', name: 'X' },
      {
        fetchRecord: async () => {
          throw new Error('TCGdex fetch failed (500)');
        },
        fetchSetRecord,
      }
    ),
    /500/
  );
});

test('resolvePrintOnTcgdex falls back to a unique same-name card in the set (Limitless MEE 10 = TCGdex mee-002)', async () => {
  // TCGdex /sets/mee (read 2026-10-15) lists mee-001 Grass Energy … mee-008 Metal Energy.
  const fetchRecord = async (id) => {
    if (id === 'mee-002') return { id, name: 'Fire Energy', category: 'Energy' };
    throw new Error(`TCGdex has no x/${id} (404)`);
  };
  const fetchSetRecord = async (setId) => {
    assert.equal(setId, 'mee');
    return {
      cards: [
        { id: 'mee-001', name: 'Grass Energy' },
        { id: 'mee-002', name: 'Fire Energy' },
      ],
    };
  };
  const deps = { fetchRecord, fetchSetRecord };
  assert.deepEqual(await resolvePrintOnTcgdex({ set: 'MEE', number: '10', name: 'Fire Energy' }, deps), {
    id: 'mee-002',
    name: 'Fire Energy',
    category: 'Energy',
  });
  assert.equal(await resolvePrintOnTcgdex({ set: 'MEE', number: '17', name: 'Water Energy' }, deps), null);
  const twoSameName = { fetchRecord, fetchSetRecord: async () => ({ cards: [{ id: 'a', name: 'Fire Energy' }, { id: 'b', name: 'Fire Energy' }] }) };
  assert.equal(await resolvePrintOnTcgdex({ set: 'MEE', number: '10', name: 'Fire Energy' }, twoSameName), null);
});

test('review #7: only events at least 14 days old are cached; retries honour Retry-After', async () => {
  const { isSettled, retryDelayMs } = await import('../build-meta-dataset.mjs');
  const now = Date.parse('2026-10-15T00:00:00Z');
  assert.equal(isSettled('2026-10-10', now), false);
  assert.equal(isSettled('2026-10-01', now), true);
  assert.equal(isSettled('garbage', now), false);
  assert.equal(retryDelayMs(0), 2000);
  assert.equal(retryDelayMs(2), 8000);
  assert.equal(retryDelayMs(0, '30'), 30000);
  assert.equal(retryDelayMs(0, '9999'), 120000);
  assert.equal(retryDelayMs(1, 'Wed, 21 Oct 2026 07:28:00 GMT'), 4000);
});
