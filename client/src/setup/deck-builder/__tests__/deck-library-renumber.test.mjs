import test from 'node:test';
import assert from 'node:assert/strict';

import { LIBRARY_STORAGE_KEY } from '../core/deck-library.mjs';
import {
  RENUMBER_BACKUP_KEY,
  RENUMBER_DONE_KEY,
  remapRenumberedCards,
  repairRenumberedDecks,
} from '../core/deck-library-renumber.mjs';

// The set as it is now: Switch moved from 430 to 419, the Water Greninja ex sits at 082, the Dark one at 325.
const SET_CARDS = [
  { localId: '082', name: 'Greninja ex', hp: 320, types: ['Water'] },
  { localId: '325', name: 'Greninja ex', hp: 330, types: ['Darkness'] },
  { localId: '419', name: 'Switch' },
  { localId: '430', name: 'Xerneas ex', hp: 340, types: ['Fairy'] },
  { localId: '436', name: 'Mega Greninja ex', hp: 380, types: ['Water'] },
];

const entry = (name, number, extra = {}) => ({
  [name]: {
    cards: [
      {
        data: {
          id: `customhb-${number}`,
          name,
          localId: number,
          number,
          image: `/src/assets/custom-sets/customhb/${number}/high.webp`,
          ...extra,
        },
        count: 2,
      },
    ],
    totalCount: 2,
  },
});

const libraryOf = (cards) => ({
  decks: { d1: { id: 'd1', name: 'Greninja', cards } },
  order: ['d1'],
});

test('a card whose id now belongs to another card follows its name to the right id', () => {
  const library = libraryOf({ ...entry('Switch', '430'), ...entry('Mega Greninja ex', '448') });
  const { library: fixed, changed, unplaced } = remapRenumberedCards(library, SET_CARDS);
  assert.deepEqual([changed, unplaced], [2, 0]);
  const data = fixed.decks.d1.cards.Switch.cards[0].data;
  assert.equal(data.id, 'customhb-419');
  assert.equal(data.localId, '419');
  assert.equal(data.number, '419');
  assert.equal(data.image, '/src/assets/custom-sets/customhb/419/high.webp');
  assert.equal(fixed.decks.d1.cards.Switch.cards[0].count, 2);
  assert.equal(library.decks.d1.cards.Switch.cards[0].data.id, 'customhb-430', 'the input is not changed');
});

test('a card still on the right id is left alone', () => {
  const library = libraryOf(entry('Greninja ex', '082'));
  const { library: fixed, changed } = remapRenumberedCards(library, SET_CARDS);
  assert.equal(changed, 0);
  assert.deepEqual(fixed, library);
});

test('cards sharing a name are told apart by hp and types', () => {
  const library = libraryOf(entry('Greninja ex', '999', { hp: 330, types: ['Darkness'] }));
  const { library: fixed } = remapRenumberedCards(library, SET_CARDS);
  assert.equal(fixed.decks.d1.cards['Greninja ex'].cards[0].data.id, 'customhb-325');
});

test('a card that is gone, or cannot be told from its namesakes, is left as saved and counted', () => {
  const library = libraryOf({
    ...entry('Nest Ball', '308'),
    ...entry('Greninja ex', '999'),
  });
  const { library: fixed, changed, unplaced } = remapRenumberedCards(library, SET_CARDS);
  assert.deepEqual([changed, unplaced], [0, 2]);
  assert.deepEqual(fixed, library);
});

test('cards of other sets are not touched', () => {
  const library = libraryOf({
    Switch: { cards: [{ data: { id: 'sv1-5', name: 'Switch', image: 'x' }, count: 1 }], totalCount: 1 },
  });
  assert.deepEqual(remapRenumberedCards(library, SET_CARDS).library, library);
});

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

test('the repair rewrites the library once, keeps a backup, and does not run again', async () => {
  const raw = JSON.stringify(libraryOf(entry('Switch', '430')));
  const storage = makeStorage({ [LIBRARY_STORAGE_KEY]: raw });
  let fetches = 0;
  const fetchSet = async () => {
    fetches += 1;
    return { cards: SET_CARDS };
  };

  const first = await repairRenumberedDecks(storage, fetchSet);
  assert.deepEqual(first, { ran: true, changed: 1, unplaced: 0 });
  assert.equal(storage.store.get(RENUMBER_BACKUP_KEY), raw);
  assert.equal(
    JSON.parse(storage.store.get(LIBRARY_STORAGE_KEY)).decks.d1.cards.Switch.cards[0].data.id,
    'customhb-419'
  );
  assert.ok(storage.store.has(RENUMBER_DONE_KEY));

  const second = await repairRenumberedDecks(storage, fetchSet);
  assert.equal(second.ran, false);
  assert.equal(fetches, 1);
});

test('a failed set fetch leaves the library and the done flag alone so the next load retries', async () => {
  const raw = JSON.stringify(libraryOf(entry('Switch', '430')));
  const storage = makeStorage({ [LIBRARY_STORAGE_KEY]: raw });
  await assert.rejects(
    repairRenumberedDecks(storage, async () => {
      throw new Error('offline');
    }),
    /offline/
  );
  await assert.rejects(repairRenumberedDecks(storage, async () => ({ nope: true })), /no cards/);
  assert.equal(storage.store.get(LIBRARY_STORAGE_KEY), raw);
  assert.equal(storage.store.has(RENUMBER_DONE_KEY), false);
});

test('a browser with no saved decks is marked done without a backup', async () => {
  const storage = makeStorage();
  const result = await repairRenumberedDecks(storage, async () => ({ cards: SET_CARDS }));
  assert.deepEqual(result, { ran: true, changed: 0, unplaced: 0 });
  assert.ok(storage.store.has(RENUMBER_DONE_KEY));
  assert.equal(storage.store.has(RENUMBER_BACKUP_KEY), false);
});
