import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { BUILD_BATTLE_BOXES, getBuildBattleBox } from '../box-catalog.mjs';
import { hydrateBoxData, loadBoxData } from '../box-data.mjs';
import { resolvePackModel } from '../pack-models.mjs';
import {
  EVOLUTION_PACK_SIZE,
  boxPromoRow,
  drawEvolutionPack,
  evolutionEnergy,
  evolutionPairingProblems,
  openBox,
  openPack,
  poolFromBox,
  startingDeckRows,
} from '../pack-opening.mjs';

const { box, cards: setCards, setInfo, data } = await loadBoxData('phantasmal-flames');
const rarityById = new Map(setCards.map((card) => [card.id, card.rarity]));
const openMe02 = (seed) => openBox({ box, data, cards: setCards, setInfo, rng: createRng(seed) });

// An rng whose next() replays fixed rolls; int(n) uses the same stream as createRng does.
function scriptedRng(rolls) {
  let index = 0;
  const next = () => rolls[index++ % rolls.length];
  return { next, int: (n) => (n <= 1 ? 0 : Math.floor(next() * n)) };
}

const card = (id, rarity, supertype = 'Pokémon') => ({ id, name: id, supertype, localId: id, rarity });

// ── A synthetic Evolution box (design 054 D1): four groups, a Trainer pool, one common row ──────
const evoCards = [
  ...['a', 'b', 'c', 'd'].map((key) => card(`promo-${key}`, 'Promo')),
  ...['a', 'b', 'c', 'd'].flatMap((key) => [card(`${key}-basic`, 'Common'), card(`${key}-stage1`, 'Uncommon')]),
  card('range', 'Common'),
  card('print-1', 'Uncommon', 'Trainer'),
  card('print-2', 'Uncommon', 'Trainer'),
  card('common-row', 'Uncommon', 'Trainer'),
  card('swap-energy', 'Uncommon', 'Energy'),
  ...['s1', 's2', 's3', 'i1', 'i2', 'min1'].map((id) => card(id, 'Uncommon', 'Trainer')),
];
const evoSetCards = [
  ...Array.from({ length: 40 }, (_, index) => card(`set-c${index}`, 'Common')),
  ...Array.from({ length: 30 }, (_, index) => card(`set-u${index}`, 'Uncommon')),
  ...Array.from({ length: 20 }, (_, index) => card(`set-r${index}`, 'Rare')),
  ...Array.from({ length: 10 }, (_, index) => card(`set-gx${index}`, 'Ultra Rare')),
];
const evoSetInfo = { id: 'set', official: 200 };
// Groups of 8–9, so promo + common row + two groups leave 4–5 Trainers for a pool that holds 6.
const groups = {
  a: [{ id: 'a-basic', qty: 4 }, { id: 'a-stage1', qty: 3 }, { id: 'range', min: 1, max: 2 }],
  b: [{ id: 'b-basic', qty: 4 }, { id: 'b-stage1', qty: 3 }, { alts: ['print-1', 'print-2'], qty: 1 }],
  c: [{ id: 'c-basic', qty: 4 }, { id: 'c-stage1', qty: 4 }],
  d: [{ id: 'd-basic', qty: 5 }, { id: 'd-stage1', qty: 3 }],
};
const evoBox = (kind, extra = {}) => ({
  key: `test-${kind}`,
  name: 'Test Build & Battle Box',
  shortName: 'Test',
  era: 'sm',
  setId: 'set',
  kind,
  packCount: 4,
  packModelKey: 'sm',
  decks: ['a', 'b', 'c', 'd'].map((key) => ({ key, name: key.toUpperCase(), promoId: `promo-${key}`, energy: null, sprites: [] })),
  ...extra,
});
const evoRaw = (extra = {}) => ({
  cards: evoCards,
  promos: { a: 'promo-a', b: 'promo-b', c: 'promo-c', d: 'promo-d' },
  groups,
  common: [{ id: 'common-row', qty: 1 }],
  trainers: [{ name: 'Supporter cards', count: null, cards: ['s1', 's2', 's3'].map((id) => ({ id, min: 0, max: 2 })) }],
  ...extra,
});
const evoPackData = hydrateBoxData({ kind: 'evolution-pack', ...evoRaw() });
const evoDeckData = hydrateBoxData({
  kind: 'evolution-deck',
  ...evoRaw({
    energySwaps: [{ when: ['c', 'd'], rows: [{ id: 'swap-energy', qty: 1 }] }],
    energyNeeds: {
      a: [['Basic Fire Energy', 12]],
      b: [['Basic Water Energy', 9], ['Basic Lightning Energy', 3]],
      c: [],
      d: [['Basic Psychic Energy', 6]],
    },
  }),
});
const openEvo = (kind, seed, rawData = kind === 'evolution-deck' ? evoDeckData : evoPackData) =>
  openBox({ box: evoBox(kind), data: rawData, cards: evoSetCards, setInfo: evoSetInfo, rng: createRng(seed) });
const countOf = (ids, id) => ids.filter((entry) => entry === id).length;

test('row 7: the same seed opens the same box, bit for bit (fixed and Evolution boxes)', () => {
  for (const seed of [0, 1, 42, 2147483647]) {
    assert.deepEqual(openMe02(seed), openMe02(seed));
    assert.deepEqual(openEvo('evolution-pack', seed), openEvo('evolution-pack', seed));
    assert.deepEqual(openEvo('evolution-deck', seed), openEvo('evolution-deck', seed));
  }
  assert.notDeepEqual(openMe02(1), openMe02(2));
  assert.notDeepEqual(openEvo('evolution-pack', 1), openEvo('evolution-pack', 2));
});

test('row 7: every baked box opens bit for bit, packs of ten from its own set, its pool from its own data', async () => {
  for (const loaded of await Promise.all(BUILD_BATTLE_BOXES.map((entry) => loadBoxData(entry.key)))) {
    const setIds = new Set(loaded.cards.map((entry) => entry.id));
    for (const seed of [3, 99]) {
      const open = () => openBox({ ...loaded, rng: createRng(seed) });
      const opened = open();
      assert.deepEqual(open(), opened, `${loaded.box.key} seed ${seed}`);
      assert.equal(opened.packs.length, 4);
      for (const pack of opened.packs) {
        assert.equal(pack.length, 10, `${loaded.box.key}: ${pack}`);
        assert.equal(new Set(pack).size, 10);
        assert.ok(pack.every((id) => setIds.has(id)), `${loaded.box.key}: ${pack}`);
      }
      const rows = startingDeckRows({ box: loaded.box, data: loaded.data, opened });
      const expected = loaded.box.kind === 'evolution-pack' ? opened.evolutionPack.length : 40;
      assert.equal(rows.reduce((sum, row) => sum + row.qty, 0), expected, loaded.box.key);
      const pool = poolFromBox({ box: loaded.box, data: loaded.data, cards: loaded.cards, opened });
      assert.ok(pool.length > 0 && pool.every((entry) => entry.count > 0), loaded.box.key);
    }
  }
});

test('row 8: the same seed in another box draws that box, from its own set', () => {
  const me02 = openMe02(42);
  const evo = openEvo('evolution-pack', 42);
  const evoIds = new Set(evoSetCards.map((entry) => entry.id));
  assert.ok(me02.packs.flat().every((id) => rarityById.has(id)));
  assert.ok(evo.packs.flat().every((id) => evoIds.has(id)));
  assert.deepEqual([me02.groupKeys, me02.evolutionPack, me02.energy], [null, null, null]);
});

test('row 31: me02 packs follow the slot model: 4 C, 3 U, reverse, IR/SIR/reverse, DR/UR/MHR/R', () => {
  const reverse = ['Common', 'Uncommon', 'Rare'];
  for (let seed = 0; seed < 250; seed += 1) {
    const { deckKey, packs } = openMe02(seed);
    assert.ok(box.decks.some((deck) => deck.key === deckKey));
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      const rarities = pack.map((id) => rarityById.get(id));
      assert.equal(pack.length, 10);
      assert.equal(new Set(pack).size, 10, `seed ${seed}: duplicate in ${pack}`);
      assert.deepEqual(rarities.slice(0, 4), ['Common', 'Common', 'Common', 'Common']);
      assert.deepEqual(rarities.slice(4, 7), ['Uncommon', 'Uncommon', 'Uncommon']);
      assert.ok(reverse.includes(rarities[7]), rarities[7]);
      assert.ok(['Illustration rare', 'Special illustration rare', ...reverse].includes(rarities[8]), rarities[8]);
      assert.ok(['Double rare', 'Ultra Rare', 'Mega Hyper Rare', 'Rare'].includes(rarities[9]), rarities[9]);
    }
  }
});

test('each of the four decks comes up about a quarter of the time over 4000 seeds', () => {
  const tally = {};
  for (let seed = 0; seed < 4000; seed += 1) {
    const { deckKey } = openMe02(seed);
    tally[deckKey] = (tally[deckKey] || 0) + 1;
  }
  assert.deepEqual(Object.keys(tally).sort(), ['ceruledge', 'flygon', 'toxtricity', 'zacian']);
  for (const [deckKey, count] of Object.entries(tally)) {
    assert.ok(count >= 880 && count <= 1120, `${deckKey}: ${count} of 4000`);
  }
});

test('weighted tables are normalized by their total; zero-weight rows are never picked', () => {
  const cards = [card('c1', 'Common'), card('r1', 'Rare'), card('u1', 'Uncommon')];
  const packModel = resolvePackModel(
    {
      era: 'me',
      size: 1,
      slots: [
        {
          count: 1,
          table: [
            ['rare', 0],
            ['Common', 2],
            ['Uncommon', 2],
          ],
        },
      ],
    },
    cards,
    {}
  );
  // total 4: roll 0.49 → 1.96 < 2 → Common; roll 0.5 → 2 → Uncommon; roll 0 never lands on rare.
  assert.equal(openPack({ cards, packModel, rng: scriptedRng([0.49, 0]) })[0].id, 'c1');
  assert.equal(openPack({ cards, packModel, rng: scriptedRng([0.5, 0]) })[0].id, 'u1');
  assert.equal(openPack({ cards, packModel, rng: scriptedRng([0, 0]) })[0].id, 'c1');
  for (let seed = 0; seed < 200; seed += 1) {
    assert.notEqual(openPack({ cards, packModel, rng: createRng(seed) })[0].id, 'r1');
  }
});

test('an exhausted pool falls back to the filler, the plain rares, then the whole set, never repeating an id', () => {
  const cards = [card('c1', 'Common'), card('r1', 'Rare'), card('u1', 'Uncommon')];
  const commonsOnly = resolvePackModel({ era: 'me', size: 3, slots: [{ pools: ['Common'], count: 3 }] }, cards, {});
  assert.deepEqual(
    openPack({ cards, packModel: commonsOnly, rng: createRng(7) }).map((entry) => entry.id),
    ['c1', 'r1', 'u1']
  );
  const me = resolvePackModel('me', cards, {});
  const tooSmall = openPack({ cards, packModel: me, rng: createRng(7) });
  assert.equal(tooSmall.length, 3);
  assert.equal(new Set(tooSmall.map((entry) => entry.id)).size, 3);
  assert.deepEqual(openPack({ cards: [], packModel: resolvePackModel('me', [], {}), rng: createRng(7) }), []);
  assert.deepEqual(openPack({ cards, packModel: null, rng: createRng(7) }), []);
});

test('an Evolution pack is the promo, both groups, the common rows and Trainers to 23', () => {
  for (let seed = 0; seed < 300; seed += 1) {
    const opened = openEvo('evolution-pack', seed);
    const [deckKey, other] = opened.groupKeys;
    assert.equal(deckKey, opened.deckKey);
    assert.notEqual(other, deckKey);
    assert.equal(opened.evolutionPack[0], `promo-${deckKey}`);
    assert.equal(opened.evolutionPack.length, EVOLUTION_PACK_SIZE, `seed ${seed}`);
    assert.equal(countOf(opened.evolutionPack, 'common-row'), 1);
    assert.equal(opened.energy, null);
    for (const key of opened.groupKeys) {
      for (const entry of groups[key]) {
        if (entry.alts) {
          assert.equal(entry.alts.reduce((sum, id) => sum + countOf(opened.evolutionPack, id), 0), 1);
        } else if (entry.qty) {
          assert.equal(countOf(opened.evolutionPack, entry.id), entry.qty, `${key} ${entry.id}`);
        } else {
          const copies = countOf(opened.evolutionPack, entry.id);
          assert.ok(copies >= entry.min && copies <= entry.max, `${entry.id}: ${copies}`);
        }
      }
    }
    for (const id of ['s1', 's2', 's3']) assert.ok(countOf(opened.evolutionPack, id) <= 2, id);
  }
});

test('ranged rows and alternative prints both come up over many seeds', () => {
  const seen = { range1: 0, range2: 0, print1: 0, print2: 0 };
  for (let seed = 0; seed < 400; seed += 1) {
    const ids = openEvo('evolution-pack', seed).evolutionPack;
    if (ids.includes('range')) seen[countOf(ids, 'range') === 1 ? 'range1' : 'range2'] += 1;
    if (ids.includes('print-1')) seen.print1 += 1;
    if (ids.includes('print-2')) seen.print2 += 1;
  }
  assert.ok(Object.values(seen).every((count) => count > 10), JSON.stringify(seen));
});

test('row 3: a one-card Trainer pool gives two copies and stops', () => {
  const data = hydrateBoxData({
    kind: 'evolution-pack',
    cards: evoCards,
    promos: { a: 'promo-a', b: 'promo-b' },
    groups: { a: [{ id: 'a-basic', qty: 9 }], b: [{ id: 'b-basic', qty: 9 }] },
    trainers: [{ name: 'Supporter cards', count: null, cards: [{ id: 's1', min: 0, max: 2 }] }],
  });
  const ids = drawEvolutionPack({ data, groupKeys: ['a', 'b'], rng: createRng(3) });
  assert.equal(countOf(ids, 's1'), 2, 'n = 4 wanted, the pool holds two');
  assert.equal(ids.length, 1 + 18 + 2);
});

test('Trainer pools split their draws inside each count, minimums first', () => {
  const data = hydrateBoxData({
    kind: 'evolution-pack',
    cards: evoCards,
    promos: { a: 'promo-a', b: 'promo-b' },
    groups: { a: [{ id: 'a-basic', qty: 8 }], b: [{ id: 'b-basic', qty: 8 }] },
    trainers: [
      { name: 'Supporter cards', count: [2, 3], cards: [{ id: 's1', min: 1, max: 2 }, { id: 's2', min: 0, max: 2 }] },
      { name: 'Item cards', count: [3, 4], cards: [{ id: 'i1', min: 0, max: 2 }, { id: 'i2', min: 0, max: 2 }] },
    ],
  });
  const splits = new Set();
  for (let seed = 0; seed < 200; seed += 1) {
    const ids = drawEvolutionPack({ data, groupKeys: ['a', 'b'], rng: createRng(seed) });
    const supporters = countOf(ids, 's1') + countOf(ids, 's2');
    const items = countOf(ids, 'i1') + countOf(ids, 'i2');
    assert.equal(ids.length, 23);
    assert.ok(countOf(ids, 's1') >= 1, 'the minimum is always there');
    assert.ok(supporters >= 2 && supporters <= 3 && items >= 3 && items <= 4, `${supporters}/${items}`);
    splits.add(`${supporters}/${items}`);
  }
  assert.deepEqual([...splits].sort(), ['2/4', '3/3']);
});

test('an Evolution deck adds Basic Energy to 40; a triggered swap takes one Energy slot', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const opened = openEvo('evolution-deck', seed);
    const energyTotal = opened.energy.reduce((sum, [, qty]) => sum + qty, 0);
    const swapped = opened.groupKeys.some((key) => key === 'c' || key === 'd');
    assert.equal(countOf(opened.evolutionPack, 'swap-energy'), swapped ? 1 : 0);
    assert.equal(opened.evolutionPack.length, swapped ? 24 : 23);
    assert.equal(opened.evolutionPack.length + energyTotal, 40, `seed ${seed}`);
  }
});

test('A3: the promo group takes the larger Energy half, split by its attack costs', () => {
  const plan = (groupKeys, packSize = 23) => evolutionEnergy({ data: evoDeckData, groupKeys, packSize });
  assert.deepEqual(plan(['a', 'b']), [
    ['Basic Fire Energy', 9],
    ['Basic Water Energy', 6],
    ['Basic Lightning Energy', 2],
  ]);
  assert.deepEqual(plan(['b', 'a']), [
    ['Basic Fire Energy', 8],
    ['Basic Water Energy', 7],
    ['Basic Lightning Energy', 2],
  ]);
  assert.deepEqual(plan(['c', 'a']), [['Basic Fire Energy', 17]], 'a group with no typed cost gives its half away');
  assert.deepEqual(plan(['a', 'd'], 24), [
    ['Basic Fire Energy', 8],
    ['Basic Psychic Energy', 8],
  ]);
  const none = hydrateBoxData({ kind: 'evolution-deck', energyNeeds: { a: [], b: [] } });
  assert.deepEqual(evolutionEnergy({ data: none, groupKeys: ['a', 'b'], packSize: 23 }), []);
});

test('row 4: every pairing at both ends of every range must fill the pack, else the box is refused', () => {
  assert.deepEqual(evolutionPairingProblems({ box: evoBox('evolution-pack'), data: evoPackData }), []);
  assert.deepEqual(evolutionPairingProblems({ box: evoBox('evolution-deck'), data: evoDeckData }), []);
  assert.deepEqual(evolutionPairingProblems({ box, data }), [], 'a fixed-decks box has no pairings');

  const smallPool = hydrateBoxData({
    kind: 'evolution-pack',
    ...evoRaw({ trainers: [{ name: 'Supporter cards', count: null, cards: [{ id: 's1', min: 0, max: 2 }] }] }),
  });
  const problems = evolutionPairingProblems({ box: evoBox('evolution-pack'), data: smallPool });
  assert.ok(problems.includes('a + c (19 fixed cards): needs 4 Trainers, the pools give 0–2'), problems.join('\n'));
  assert.ok(problems.includes('a + c (18 fixed cards): needs 5 Trainers, the pools give 0–2'), problems.join('\n'));

  const oversized = hydrateBoxData({
    kind: 'evolution-pack',
    ...evoRaw({ groups: { ...groups, d: [{ id: 'd-basic', qty: 16 }] } }),
  });
  assert.ok(
    evolutionPairingProblems({ box: evoBox('evolution-pack'), data: oversized }).some((line) =>
      line.startsWith('d + c (26 fixed cards): needs -3 Trainers')
    )
  );

  const noEnergyType = hydrateBoxData({ kind: 'evolution-deck', ...evoRaw({ energyNeeds: {} }) });
  assert.ok(
    evolutionPairingProblems({ box: evoBox('evolution-deck'), data: noEnergyType }).includes(
      'a + b (18 fixed cards): no Energy type to fill 17 Basic Energy'
    )
  );
});

test('rows 14 + 15: the starting deck is the fixed deck, the 23-card pack, or the pack plus Energy (40)', () => {
  const fixed = openMe02(42);
  const fixedRows = startingDeckRows({ box, data, opened: fixed });
  assert.equal(fixedRows.reduce((sum, row) => sum + row.qty, 0), 40);
  assert.deepEqual(fixedRows, data.decks[fixed.deckKey]);

  const pack = openEvo('evolution-pack', 5);
  const packRows = startingDeckRows({ box: evoBox('evolution-pack'), data: evoPackData, opened: pack });
  assert.equal(packRows.reduce((sum, row) => sum + row.qty, 0), 23);
  assert.equal(packRows[0].id, pack.evolutionPack[0]);

  const deck = openEvo('evolution-deck', 5);
  const deckRows = startingDeckRows({ box: evoBox('evolution-deck'), data: evoDeckData, opened: deck });
  assert.equal(deckRows.reduce((sum, row) => sum + row.qty, 0), 40);
  const energyRows = deckRows.filter((row) => row.id?.startsWith('sve-'));
  assert.deepEqual(
    energyRows.map((row) => [row.name, row.qty]),
    deck.energy
  );
  assert.deepEqual(Object.keys(energyRows[0]).slice(-6), ['rarity', 'category', 'stage', 'types', 'hp', 'qty']);
  assert.deepEqual(startingDeckRows({ box, data, opened: { deckKey: 'nope' } }), []);
});

test('the promo row comes from the fixed deck or the box cards', () => {
  assert.equal(boxPromoRow({ box, data, deckKey: 'ceruledge' }).id, 'mep-014');
  assert.equal(boxPromoRow({ box: evoBox('evolution-pack'), data: evoPackData, deckKey: 'c' }).id, 'promo-c');
  assert.equal(boxPromoRow({ box, data, deckKey: 'nope' }), null);
});

test('the pool is the box deck plus every pack card, merged by id, without Basic Energy', () => {
  const opened = { deckKey: 'ceruledge', packs: [['me02-020', 'me02-001'], ['me02-001']] };
  const pool = poolFromBox({ box, data, cards: setCards, opened });
  const poolCount = (id) => pool.find((entry) => entry.card.id === id)?.count;

  assert.equal(poolCount('mep-014'), 1);
  assert.equal(poolCount('me02-020'), 4, 'deck Ceruledge ×3 + one pulled');
  assert.equal(poolCount('me02-001'), 2);
  assert.equal(poolCount('me02-089'), 3);
  assert.equal(poolCount('sve-002'), undefined, 'Basic Fire Energy is unlimited, not pooled');
  assert.equal(pool.reduce((sum, entry) => sum + entry.count, 0), 24 + 3);
  assert.ok(pool.every((entry) => !('qty' in entry.card)));

  const types = pool.map((entry) => entry.card.supertype);
  assert.equal(types.lastIndexOf('Pokémon') < types.indexOf('Trainer'), true, 'Pokémon before Trainers');
  assert.deepEqual(
    pool.filter((entry) => entry.card.supertype === 'Pokémon').map((entry) => entry.card.id),
    ['me02-001', 'me02-014', 'mep-014', 'me02-019', 'me02-020']
  );
});

test('an Evolution pool is the Evolution pack plus the packs; Special Energy stays, Basic Energy never does', () => {
  const opened = openEvo('evolution-deck', 11);
  const pool = poolFromBox({ box: evoBox('evolution-deck'), data: evoDeckData, cards: evoSetCards, opened });
  const total = pool.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal(total, opened.evolutionPack.length + opened.packs.flat().length);
  assert.ok(pool.every((entry) => !entry.card.id.startsWith('sve-')));
});

test('a pool from an unknown deck key or unknown pack ids keeps only what is known', () => {
  const pool = poolFromBox({ box, data, cards: setCards, opened: { deckKey: 'nope', packs: [['x-1', 'me02-001']] } });
  assert.deepEqual(pool.map((entry) => [entry.card.id, entry.count]), [['me02-001', 1]]);
  assert.deepEqual(poolFromBox({ box, data, cards: setCards, opened: undefined }), []);
  assert.equal(getBuildBattleBox('phantasmal-flames'), box);
});
