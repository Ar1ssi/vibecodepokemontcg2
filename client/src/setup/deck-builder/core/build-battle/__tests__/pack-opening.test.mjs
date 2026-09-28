import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { getBuildBattleBox } from '../box-catalog.mjs';
import {
  BUILD_BATTLE_DECKS,
  BUILD_BATTLE_SET_CARDS,
} from '../build-battle.generated.mjs';
import { openBox, openPack, poolFromBox } from '../pack-opening.mjs';

const box = getBuildBattleBox('phantasmal-flames');
const setCards = BUILD_BATTLE_SET_CARDS.me02;
const decks = BUILD_BATTLE_DECKS['phantasmal-flames'];
const rarityById = new Map(setCards.map((card) => [card.id, card.rarity]));

// An rng whose next() replays fixed rolls; int(n) uses the same stream as createRng does.
function scriptedRng(rolls) {
  let index = 0;
  const next = () => rolls[index++ % rolls.length];
  return { next, int: (n) => (n <= 1 ? 0 : Math.floor(next() * n)) };
}

const card = (id, rarity) => ({
  id,
  name: id,
  supertype: 'Pokémon',
  localId: id,
  rarity,
});

test('the same seed opens the same box, bit for bit', () => {
  for (const seed of [0, 1, 42, 2147483647]) {
    const first = openBox({ box, cards: setCards, rng: createRng(seed) });
    const second = openBox({ box, cards: setCards, rng: createRng(seed) });
    assert.deepEqual(first, second);
  }
  assert.notDeepEqual(
    openBox({ box, cards: setCards, rng: createRng(1) }),
    openBox({ box, cards: setCards, rng: createRng(2) })
  );
});

test('me02 packs follow the slot model: 4 C, 3 U, reverse, IR/SIR/reverse, DR/UR/MHR/R', () => {
  const reverse = ['Common', 'Uncommon', 'Rare'];
  for (let seed = 0; seed < 250; seed += 1) {
    const { deckKey, packs } = openBox({
      box,
      cards: setCards,
      rng: createRng(seed),
    });
    assert.ok(box.decks.some((deck) => deck.key === deckKey));
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      const rarities = pack.map((id) => rarityById.get(id));
      assert.equal(pack.length, 10);
      assert.equal(
        new Set(pack).size,
        10,
        `seed ${seed}: duplicate in ${pack}`
      );
      assert.deepEqual(rarities.slice(0, 4), [
        'Common',
        'Common',
        'Common',
        'Common',
      ]);
      assert.deepEqual(rarities.slice(4, 7), [
        'Uncommon',
        'Uncommon',
        'Uncommon',
      ]);
      assert.ok(reverse.includes(rarities[7]), rarities[7]);
      assert.ok(
        ['Illustration rare', 'Special illustration rare', ...reverse].includes(
          rarities[8]
        ),
        rarities[8]
      );
      assert.ok(
        ['Double rare', 'Ultra Rare', 'Mega Hyper Rare', 'Rare'].includes(
          rarities[9]
        ),
        rarities[9]
      );
    }
  }
});

test('each of the four decks comes up about a quarter of the time over 4000 seeds', () => {
  const tally = {};
  for (let seed = 0; seed < 4000; seed += 1) {
    const { deckKey } = openBox({ box, cards: setCards, rng: createRng(seed) });
    tally[deckKey] = (tally[deckKey] || 0) + 1;
  }
  assert.deepEqual(Object.keys(tally).sort(), [
    'ceruledge',
    'flygon',
    'toxtricity',
    'zacian',
  ]);
  for (const [deckKey, count] of Object.entries(tally)) {
    assert.ok(count >= 880 && count <= 1120, `${deckKey}: ${count} of 4000`);
  }
});

test('weighted tables are normalized by their total; zero-weight rows are never picked', () => {
  const cards = [
    card('c1', 'Common'),
    card('r1', 'Rare'),
    card('u1', 'Uncommon'),
  ];
  const packModel = {
    size: 1,
    slots: [
      {
        count: 1,
        table: [
          ['Rare', 0],
          ['Common', 2],
          ['Uncommon', 2],
        ],
      },
    ],
  };
  // total 4: roll 0.49 → 1.96 < 2 → Common; roll 0.5 → 2 → Uncommon; roll 0 never lands on Rare.
  assert.equal(
    openPack({ cards, packModel, rng: scriptedRng([0.49, 0]) })[0].id,
    'c1'
  );
  assert.equal(
    openPack({ cards, packModel, rng: scriptedRng([0.5, 0]) })[0].id,
    'u1'
  );
  assert.equal(
    openPack({ cards, packModel, rng: scriptedRng([0, 0]) })[0].id,
    'c1'
  );
  for (let seed = 0; seed < 200; seed += 1) {
    assert.notEqual(
      openPack({ cards, packModel, rng: createRng(seed) })[0].id,
      'r1'
    );
  }
});

test('an exhausted rarity falls back to Rare, then to the whole set, never repeating an id', () => {
  const cards = [
    card('c1', 'Common'),
    card('r1', 'Rare'),
    card('u1', 'Uncommon'),
  ];
  const packModel = { size: 3, slots: [{ pools: ['Common'], count: 3 }] };
  const pack = openPack({ cards, packModel, rng: createRng(7) });
  assert.deepEqual(
    pack.map((entry) => entry.id),
    ['c1', 'r1', 'u1']
  );

  const tooSmall = openPack({
    cards,
    packModel: box.packModel,
    rng: createRng(7),
  });
  assert.equal(tooSmall.length, 3);
  assert.equal(new Set(tooSmall.map((entry) => entry.id)).size, 3);

  assert.deepEqual(
    openPack({ cards: [], packModel: box.packModel, rng: createRng(7) }),
    []
  );
  assert.deepEqual(
    openPack({ cards, packModel: undefined, rng: createRng(7) }),
    []
  );
});

test('the pool is the box deck plus every pack card, merged by id, without Basic Energy', () => {
  const opened = {
    deckKey: 'ceruledge',
    packs: [['me02-020', 'me02-001'], ['me02-001']],
  };
  const pool = poolFromBox({ box, decks, cards: setCards, opened });
  const countOf = (id) => pool.find((entry) => entry.card.id === id)?.count;

  assert.equal(countOf('mep-014'), 1);
  assert.equal(countOf('me02-020'), 4, 'deck Ceruledge ×3 + one pulled');
  assert.equal(countOf('me02-001'), 2);
  assert.equal(countOf('me02-089'), 3);
  assert.equal(
    countOf('sve-002'),
    undefined,
    'Basic Fire Energy is unlimited, not pooled'
  );
  assert.equal(
    pool.reduce((sum, entry) => sum + entry.count, 0),
    24 + 3
  );
  assert.ok(pool.every((entry) => !('qty' in entry.card)));

  const types = pool.map((entry) => entry.card.supertype);
  assert.equal(
    types.lastIndexOf('Pokémon') < types.indexOf('Trainer'),
    true,
    'Pokémon before Trainers'
  );
  assert.deepEqual(
    pool
      .filter((entry) => entry.card.supertype === 'Pokémon')
      .map((entry) => entry.card.id),
    ['me02-001', 'me02-014', 'mep-014', 'me02-019', 'me02-020']
  );
});

test('a pool from an unknown deck key or unknown pack ids keeps only what is known', () => {
  const pool = poolFromBox({
    box,
    decks,
    cards: setCards,
    opened: { deckKey: 'nope', packs: [['x-1', 'me02-001']] },
  });
  assert.deepEqual(
    pool.map((entry) => [entry.card.id, entry.count]),
    [['me02-001', 1]]
  );
  assert.deepEqual(
    poolFromBox({ box, decks, cards: setCards, opened: undefined }),
    []
  );
});
