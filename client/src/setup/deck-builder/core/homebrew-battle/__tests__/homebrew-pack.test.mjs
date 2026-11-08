import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { isBasicEnergy } from '../../../../../../../shared/engine/rules/card-classify.mjs';
import {
  HOMEBREW_PACK_COUNT,
  HOMEBREW_PACK_SIZE,
  buildHomebrewPackModel,
  homebrewCardClass,
  homebrewPackProblems,
  hydrateHomebrewSet,
  openHomebrewBox,
  poolFromPacks,
} from '../homebrew-pack.mjs';

// Source of truth for the cards: the shipped set.json of the Homebrew set (customhb).
const RAW = JSON.parse(
  readFileSync(new URL('../../../../../assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const { setInfo, cards } = hydrateHomebrewSet(RAW);
const byId = new Map(cards.map((card) => [card.id, card]));

test('hydrate keeps every card the set has and gives each a supertype and art', () => {
  assert.equal(cards.length, RAW.cards.length);
  for (const card of cards) {
    assert.ok(['Pokémon', 'Trainer', 'Energy'].includes(card.supertype), card.id);
    assert.match(card.images.small, /\/low\.webp$/);
    assert.match(card.images.large, /\/high\.webp$/);
  }
  assert.throws(() => hydrateHomebrewSet({ id: 'other', cards: [] }), /malformed/);
  assert.throws(() => hydrateHomebrewSet(null), /malformed/);
});

test('the set can fill every guaranteed slot; a set with no Trainer cannot', () => {
  assert.deepEqual(homebrewPackProblems(cards), []);
  const noTrainers = cards.filter((card) => card.supertype !== 'Trainer');
  assert.deepEqual(homebrewPackProblems(noTrainers), ['the set has no Trainer card']);
  assert.throws(() => openHomebrewBox({ cards: noTrainers, rng: createRng(1) }), /no Trainer card/);
});

test('30 packs of 10 cards; every pack holds a Trainer and an Energy, for 200 seeds', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const packs = openHomebrewBox({ cards, rng: createRng(seed) });
    assert.equal(packs.length, HOMEBREW_PACK_COUNT);
    for (const pack of packs) {
      assert.equal(pack.length, HOMEBREW_PACK_SIZE, `seed ${seed}`);
      assert.equal(new Set(pack).size, pack.length, `seed ${seed}: a card repeats in a pack`);
      const rows = pack.map((id) => byId.get(id));
      assert.ok(rows.some((card) => card.supertype === 'Trainer'), `seed ${seed}: no Trainer`);
      assert.ok(rows.some((card) => card.supertype === 'Energy'), `seed ${seed}: no Energy`);
    }
  }
});

test('one seed is one box; a different seed is a different box', () => {
  const first = openHomebrewBox({ cards, rng: createRng(7) });
  assert.deepEqual(openHomebrewBox({ cards, rng: createRng(7) }), first);
  assert.notDeepEqual(openHomebrewBox({ cards, rng: createRng(8) }), first);
});

test('the rest of a pack varies: Trainer and Energy counts are not fixed, hits turn up', () => {
  const trainerCounts = new Set();
  const energyCounts = new Set();
  let hits = 0;
  for (let seed = 0; seed < 100; seed += 1) {
    for (const pack of openHomebrewBox({ cards, rng: createRng(seed), packCount: 6 })) {
      const rows = pack.map((id) => byId.get(id));
      trainerCounts.add(rows.filter((card) => card.supertype === 'Trainer').length);
      energyCounts.add(rows.filter((card) => card.supertype === 'Energy').length);
      if (rows.some((card) => card.rarity === 'Double rare')) hits += 1;
    }
  }
  assert.ok(trainerCounts.size >= 3, `trainer counts ${[...trainerCounts]}`);
  assert.ok(energyCounts.size >= 2, `energy counts ${[...energyCounts]}`);
  assert.ok(hits > 0);
});

test('the slot order is Energy, 3 Commons, 3 Uncommons, Trainer, reverse, rare', () => {
  const model = buildHomebrewPackModel(cards);
  assert.deepEqual(
    model.slots.map((slot) => slot.count),
    [1, 3, 3, 1, 1, 1]
  );
  assert.equal(model.slots.reduce((sum, slot) => sum + slot.count, 0), HOMEBREW_PACK_SIZE);
  const [energy, commons, uncommons] = model.slots;
  assert.ok(energy.rows.every((row) => row.ids.every((id) => byId.get(id).supertype === 'Energy')));
  assert.ok(commons.rows[0].ids.every((id) => byId.get(id).rarity === 'Common'));
  assert.ok(uncommons.rows[0].ids.every((id) => byId.get(id).rarity === 'Uncommon'));
});

test('the pool merges copies by id, leaves Basic Energy to the unlimited supply, and sorts Pokémon first', () => {
  const [first] = openHomebrewBox({ cards, rng: createRng(3), packCount: 1 });
  const duplicate = first[0];
  const pool = poolFromPacks({ cards, packs: [first, [duplicate]] });
  assert.equal(pool.find((entry) => entry.card.id === duplicate)?.count ?? 0, isBasicEnergy(byId.get(duplicate)) ? 0 : 2);
  assert.ok(pool.every((entry) => !isBasicEnergy(entry.card)));
  const order = pool.map((entry) => entry.card.supertype);
  assert.deepEqual(order, [...order].sort((a, b) => ['Pokémon', 'Trainer', 'Energy'].indexOf(a) - ['Pokémon', 'Trainer', 'Energy'].indexOf(b)));
  assert.deepEqual(poolFromPacks({ cards, packs: [['no-such-card']] }), []);
});

test('a Basic Energy is never a hit, a Hyper rare Pokémon-side card reads from the SV classes', () => {
  const basic = cards.find(isBasicEnergy);
  assert.equal(homebrewCardClass(basic, setInfo), null);
  const double = cards.find((card) => card.rarity === 'Double rare');
  assert.equal(homebrewCardClass(double, setInfo), 'hit');
  const aceSpec = cards.find((card) => card.rarity === 'ACE SPEC Rare');
  assert.equal(homebrewCardClass(aceSpec, setInfo), 'aceSpec');
});
