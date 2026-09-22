import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDER_FILTER_GROUPS,
  applyCardFilters,
  countActiveFilters,
  createEmptyFilters,
  hasActiveFilters,
  toggleFilter,
} from '../core/card-filters.mjs';

const CHARIZARD = {
  id: 'a',
  name: 'Charizard ex',
  supertype: 'Pokémon',
  types: ['Fire'],
};
const BLASTOISE = {
  id: 'b',
  name: 'Blastoise',
  supertype: 'Pokémon',
  types: ['Water'],
};
const UMBREON = {
  id: 'c',
  name: 'Umbreon',
  supertype: 'Pokémon',
  types: ['Dark'],
};
const BOSS = {
  id: 'd',
  name: "Boss's Orders",
  supertype: 'Trainer',
  trainerType: 'Supporter',
};
const SWITCH = {
  id: 'e',
  name: 'Switch',
  supertype: 'Trainer',
  trainerType: 'Item',
};
const HQ = {
  id: 'f',
  name: 'Pokémon League Headquarters',
  supertype: 'Trainer',
  trainerType: 'Stadium',
};
const VITALITY = {
  id: 'g',
  name: 'Vitality Band',
  supertype: 'Trainer',
  trainerType: 'Pokémon Tool',
};
const FIRE_ENERGY = {
  id: 'h',
  name: 'Fire Energy',
  supertype: 'Energy',
  types: ['Fire'],
};

const ALL = [
  CHARIZARD,
  BLASTOISE,
  UMBREON,
  BOSS,
  SWITCH,
  HQ,
  VITALITY,
  FIRE_ENERGY,
];

const ids = (cards) => cards.map((card) => card.id);

test('an empty filter state narrows nothing', () => {
  const filters = createEmptyFilters();
  assert.equal(hasActiveFilters(filters), false);
  assert.equal(countActiveFilters(filters), 0);
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ids(ALL));
  assert.deepEqual(ids(applyCardFilters(ALL, {})), ids(ALL));
});

test('applyCardFilters returns a copy, not the input array', () => {
  const out = applyCardFilters(ALL, createEmptyFilters());
  assert.notEqual(out, ALL);
  assert.deepEqual(ids(out), ids(ALL));
});

test('a supertype pill keeps only that class of card', () => {
  const filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Trainer');
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ['d', 'e', 'f', 'g']);
});

test('pills within a group are OR-ed', () => {
  let filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'energyTypes', 'water');
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ['a', 'b', 'h']);
});

test('pills across groups are AND-ed', () => {
  let filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Pokémon');
  filters = toggleFilter(filters, 'energyTypes', 'fire');
  // Fire Energy is Fire but not a Pokémon, so the two groups intersect it out.
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ['a']);
});

test('an energy-type pill excludes cards that have no energy type at all', () => {
  const filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  const out = ids(applyCardFilters(ALL, filters));
  assert.ok(!out.includes('d'), 'a Supporter has no type and must be excluded');
  assert.ok(!out.includes('e'));
});

test('"Dark" on the card matches the darkness pill', () => {
  const filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'darkness');
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ['c']);
});

test('Trainer subtype pills separate Items, Supporters, Stadiums and Tools', () => {
  const only = (value) =>
    ids(
      applyCardFilters(
        ALL,
        toggleFilter(createEmptyFilters(), 'trainerTypes', value)
      )
    );
  assert.deepEqual(only('Supporter'), ['d']);
  assert.deepEqual(only('Item'), ['e']);
  assert.deepEqual(only('Stadium'), ['f']);
  // "Pokémon Tool" is the printed long form; the Tool pill must still catch it.
  assert.deepEqual(only('Tool'), ['g']);
});

test('toggling the same pill twice clears it', () => {
  const once = toggleFilter(createEmptyFilters(), 'supertypes', 'Trainer');
  const twice = toggleFilter(once, 'supertypes', 'Trainer');
  assert.deepEqual(twice.supertypes, []);
  assert.equal(hasActiveFilters(twice), false);
});

test('toggleFilter does not mutate the state it was given', () => {
  const before = createEmptyFilters();
  toggleFilter(before, 'supertypes', 'Trainer');
  assert.deepEqual(before.supertypes, []);
});

test('an unknown filter group is ignored rather than throwing', () => {
  const filters = toggleFilter(createEmptyFilters(), 'nonsense', 'x');
  assert.equal(hasActiveFilters(filters), false);
  assert.deepEqual(ids(applyCardFilters(ALL, filters)), ids(ALL));
});

test('countActiveFilters counts every pill across groups', () => {
  let filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Pokémon');
  filters = toggleFilter(filters, 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'energyTypes', 'water');
  assert.equal(countActiveFilters(filters), 3);
  assert.equal(hasActiveFilters(filters), true);
});

test('junk input yields an empty result rather than a crash', () => {
  const filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Pokémon');
  assert.deepEqual(applyCardFilters(undefined, filters), []);
  assert.deepEqual(applyCardFilters(null, filters), []);
  assert.doesNotThrow(() => applyCardFilters([null, undefined], filters));
});

test('the pill rows are data-driven and carry energy token icons', () => {
  const energy = BUILDER_FILTER_GROUPS.find(
    (group) => group.key === 'energyTypes'
  );
  assert.ok(energy);
  assert.equal(energy.options.length, 11);
  for (const option of energy.options) {
    assert.match(option.icon, /^\/src\/assets\/energy\/tokens\/[a-z]+\.png$/);
    assert.match(option.label, /^[A-Z]/);
  }

  // Every group must name a key that createEmptyFilters actually tracks,
  // or its pills would silently narrow nothing.
  const empty = createEmptyFilters();
  for (const group of BUILDER_FILTER_GROUPS) {
    assert.ok(Array.isArray(empty[group.key]), `unknown group ${group.key}`);
  }
});
