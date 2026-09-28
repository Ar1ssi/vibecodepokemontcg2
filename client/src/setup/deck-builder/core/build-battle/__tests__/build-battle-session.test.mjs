import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { getBuildBattleBox } from '../box-catalog.mjs';
import {
  BUILD_BATTLE_DECKS,
  BUILD_BATTLE_SET_CARDS,
} from '../build-battle.generated.mjs';
import { openBox, poolFromBox } from '../pack-opening.mjs';
import {
  BUILD_BATTLE_STORAGE_KEY,
  canAddFromPool,
  clearSession,
  createSession,
  loadSession,
  parseSeed,
  parseSession,
  randomSeed,
  saveSession,
  validatePoolDeck,
} from '../build-battle-session.mjs';
import { advanceUnboxing, createUnboxing, finishedUnboxing } from '../unboxing.mjs';

const box = getBuildBattleBox('phantasmal-flames');
const setCards = BUILD_BATTLE_SET_CARDS.me02;
const decks = BUILD_BATTLE_DECKS['phantasmal-flames'];
const opened = openBox({ box, cards: setCards, rng: createRng(42) });

function freshSession() {
  return createSession({ boxKey: box.key, seed: 42, ...opened, now: 1000 });
}

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

test('createSession starts with the box sealed and no library deck', () => {
  assert.deepEqual(freshSession(), {
    version: 1,
    boxKey: 'phantasmal-flames',
    seed: 42,
    deckKey: opened.deckKey,
    packs: opened.packs,
    unboxing: createUnboxing(),
    deckId: null,
    createdAt: 1000,
  });
});

test('a session round-trips through storage and clears', () => {
  const storage = memoryStorage();
  const unboxing = [
    { type: 'tearWrap' },
    { type: 'openLid' },
    { type: 'unwrapDeck' },
    { type: 'tearPack', packIndex: 1 },
    { type: 'revealCard', packIndex: 1 },
  ].reduce(advanceUnboxing, createUnboxing());
  const session = { ...freshSession(), unboxing, deckId: 'abc12345' };
  assert.equal(saveSession(storage, session), true);
  assert.deepEqual(loadSession(storage), session);
  assert.equal(clearSession(storage), true);
  assert.equal(loadSession(storage), null);
});

test('a throwing or missing storage means memory only, never a crash', () => {
  assert.equal(saveSession(throwingStorage, freshSession()), false);
  assert.equal(loadSession(throwingStorage), null);
  assert.equal(clearSession(throwingStorage), false);
  assert.equal(saveSession(undefined, freshSession()), false);
  assert.equal(loadSession(null), null);
  assert.equal(clearSession({}), false);
});

test('parseSession refuses anything it cannot trust', () => {
  const good = freshSession();
  const bad = (patch) => parseSession(JSON.stringify({ ...good, ...patch }));
  assert.deepEqual(parseSession(JSON.stringify(good)), good);
  assert.equal(parseSession('not json'), null);
  assert.equal(parseSession('null'), null);
  assert.equal(parseSession(''), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ boxKey: 'surging-sparks' }), null);
  assert.equal(bad({ deckKey: 'charizard' }), null);
  assert.equal(
    bad({ packs: [['me02-001', 'sv01-001'], ...good.packs.slice(1)] }),
    null
  );
  assert.equal(bad({ packs: good.packs.slice(1) }), null);
  assert.equal(bad({ packs: [[], ...good.packs.slice(1)] }), null);
  assert.equal(bad({ unboxing: null }), null);
  assert.equal(bad({ unboxing: { ...createUnboxing(), stage: 'lidless' } }), null);
  assert.equal(
    bad({ unboxing: { ...createUnboxing(), revealed: [3, 0, 0, 0] } }),
    null,
    'cards revealed from an untorn pack'
  );
  assert.equal(bad({ seed: -1 }), null);
  assert.equal(bad({ seed: 2 ** 31 }), null);
  assert.equal(bad({ deckId: 7 }), null);
  assert.equal(bad({ createdAt: 'yesterday' }), null);

  const storage = memoryStorage();
  storage.setItem(
    BUILD_BATTLE_STORAGE_KEY,
    JSON.stringify({ ...good, deckKey: 'charizard' })
  );
  assert.equal(loadSession(storage), null);
});

test('parseSeed takes only integers 0..2^31-1', () => {
  assert.equal(parseSeed('42'), 42);
  assert.equal(parseSeed('0'), 0);
  assert.equal(parseSeed('2147483647'), 2147483647);
  assert.equal(parseSeed(7), 7);
  for (const value of [
    'abc',
    '-1',
    '2147483648',
    '',
    ' 42',
    '4.2',
    '1e3',
    null,
    undefined,
    1.5,
    -1,
    NaN,
  ]) {
    assert.equal(parseSeed(value), null, String(value));
  }
});

test('randomSeed is a 31-bit integer from Web Crypto', () => {
  const fakeCrypto = {
    getRandomValues: (array) => ((array[0] = 0xffffffff), array),
  };
  assert.equal(randomSeed(fakeCrypto), 2 ** 31 - 1);
  const seed = randomSeed();
  assert.equal(parseSeed(seed), seed);
});

// The builder's deck map: `{ [name]: { cards: [{ data, count }], totalCount } }`.
function deckOf(entries) {
  const deck = {};
  for (const [data, count] of entries) {
    deck[data.name] ??= { cards: [], totalCount: 0 };
    deck[data.name].cards.push({ data, count });
    deck[data.name].totalCount += count;
  }
  return deck;
}

const pfOpened = { deckKey: 'toxtricity', packs: [['me02-064'], ['me02-001']] };
const pool = poolFromBox({ box, decks, cards: setCards, opened: pfOpened });
const byId = (id) => pool.find((entry) => entry.card.id === id).card;
const sandile = byId('me02-064');
const darkness = decks.toxtricity.find(
  (row) => row.name === 'Basic Darkness Energy'
);

test('the box deck plus pulls is exactly what the pool backs', () => {
  assert.equal(
    pool.find((entry) => entry.card.id === 'me02-064').count,
    4,
    '3 in the deck + 1 pulled'
  );
  assert.deepEqual(validatePoolDeck(deckOf([[sandile, 4]]), pool), []);
  assert.equal(canAddFromPool(deckOf([[sandile, 3]]), pool, sandile), true);
});

test('going past the pool is refused and named', () => {
  const deck = deckOf([[sandile, 4]]);
  assert.equal(canAddFromPool(deck, pool, sandile), false);
  assert.deepEqual(validatePoolDeck(deckOf([[sandile, 5]]), pool), [
    'Sandile: 5 in deck, 4 in your pool',
  ]);
});

test('a card outside the pool is named; a card with no id is outside it too', () => {
  const charizard = {
    id: 'sv03-125',
    name: 'Charizard ex',
    supertype: 'Pokémon',
  };
  assert.deepEqual(validatePoolDeck(deckOf([[charizard, 1]]), pool), [
    'Charizard ex is not in your pool',
  ]);
  assert.equal(canAddFromPool({}, pool, charizard), false);
  assert.deepEqual(
    validatePoolDeck(
      deckOf([[{ name: 'Mystery', supertype: 'Trainer' }, 1]]),
      pool
    ),
    ['Mystery is not in your pool']
  );
});

test('Basic Energy is unlimited: never checked against the pool', () => {
  const deck = deckOf([
    [sandile, 1],
    [{ ...darkness, qty: undefined }, 16],
  ]);
  assert.deepEqual(validatePoolDeck(deck, pool), []);
  assert.equal(canAddFromPool(deck, pool, darkness), true);
  assert.deepEqual(validatePoolDeck({}, []), []);
  assert.deepEqual(validatePoolDeck(undefined, undefined), []);
});

test('a design 051 session without `unboxing` resumes at the end of the scene', () => {
  const { unboxing: _unboxing, ...legacy } = freshSession();
  const parsed = parseSession(JSON.stringify({ ...legacy, openedPacks: 2 }));
  assert.deepEqual(parsed.unboxing, finishedUnboxing());
  assert.equal('openedPacks' in parsed, false);
  assert.deepEqual(parsed.packs, opened.packs);
});
