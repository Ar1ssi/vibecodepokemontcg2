import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDER_FILTER_GROUPS,
  applyCardFilters,
  buildTcgdexFilterParams,
  countActiveFilters,
  createEmptyFilters,
  deriveSetOptions,
  describeActiveFilters,
  hasActiveFilters,
  removeFilterChip,
  setHpRange,
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
  // or its controls would silently narrow nothing.
  const empty = createEmptyFilters();
  for (const group of BUILDER_FILTER_GROUPS) {
    if (group.kind === 'toggles') {
      for (const option of group.options) {
        assert.equal(empty[option.value], false, `unknown toggle ${option.value}`);
      }
    } else if (group.kind === 'range') {
      assert.ok('hpMin' in empty && 'hpMax' in empty);
    } else if (group.kind === 'single') {
      assert.equal(empty[group.key], '', `unknown single group ${group.key}`);
    } else {
      assert.ok(Array.isArray(empty[group.key]), `unknown group ${group.key}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Design 050: the TCG Live drawer groups. Card fields mirror TCGdex details —
// sv03.5-006 Charizard ex: hp 330, Fire, Stage2, suffix "ex", weakness Water,
// retreat 2, regulationMark G, legal {standard:false, expanded:true},
// rarity "Double rare" (api.tcgdex.net/v2/en/cards/sv03.5-006, 2026-09-28).
// ---------------------------------------------------------------------------

const ZARD_151 = {
  id: 'sv03.5-006',
  name: 'Charizard ex',
  supertype: 'Pokémon',
  types: ['Fire'],
  stage: 'Stage2',
  suffix: 'ex',
  hp: 330,
  retreat: 2,
  weaknesses: [{ type: 'Water', value: '×2' }],
  regulationMark: 'G',
  legal: { standard: false, expanded: true },
  rarity: 'Double rare',
  abilities: [],
  set: { id: 'sv03.5', name: '151', releaseDate: '2023-09-22' },
};
const ZARD_OBF = {
  ...ZARD_151,
  id: 'sv03-125',
  types: ['Darkness'],
  abilities: ['Infernal Reign'],
  regulationMark: 'G',
  set: { id: 'sv03', name: 'Obsidian Flames', releaseDate: '2023-08-11' },
};
const M_MANECTRIC = {
  id: 'xy4-24',
  name: 'M Manectric EX',
  supertype: 'Pokémon',
  types: ['Lightning'],
  stage: 'MEGA',
  suffix: 'EX',
  hp: 210,
  retreat: 0,
  weaknesses: [{ type: 'Fighting' }],
  legal: { standard: false, expanded: true },
  set: { id: 'xy4', name: 'Phantom Forces', releaseDate: '2014-11-05' },
};
const CHARMANDER = {
  id: 'sv03.5-004',
  name: 'Charmander',
  supertype: 'Pokémon',
  types: ['Fire'],
  stage: 'Basic',
  hp: 70,
  retreat: 1,
  weaknesses: [{ type: 'Water' }],
  regulationMark: 'G',
  legal: { standard: false, expanded: true },
  rarity: 'Common',
  set: { id: 'sv03.5', name: '151', releaseDate: '2023-09-22' },
};
const SNORLAX = {
  id: 'x-snorlax',
  name: 'Snorlax',
  supertype: 'Pokémon',
  types: ['Colorless'],
  stage: 'Basic',
  hp: 150,
  retreat: 5,
};
const NEST_BALL = {
  id: 'sv01-181',
  name: 'Nest Ball',
  supertype: 'Trainer',
  trainerType: 'Item',
  regulationMark: 'G',
  legal: { standard: false, expanded: true },
  rarity: 'Uncommon',
};
const PRIME_CATCHER = {
  id: 'sv05-157',
  name: 'Prime Catcher',
  supertype: 'Trainer',
  trainerType: 'Item',
  rarity: 'ACE SPEC Rare',
};
const BASIC_FIRE = { id: 'sve-2', name: 'Basic Fire Energy', supertype: 'Energy', energyType: 'Normal' };
const JET_ENERGY = { id: 'sv02-190', name: 'Jet Energy', supertype: 'Energy', energyType: 'Special' };
const V_GUARD = { id: 'sv05-v', name: 'V Guard Energy', supertype: 'Energy', energyType: 'Special' };

const DRAWER = [
  ZARD_151,
  ZARD_OBF,
  M_MANECTRIC,
  CHARMANDER,
  SNORLAX,
  NEST_BALL,
  PRIME_CATCHER,
  BASIC_FIRE,
  JET_ENERGY,
  V_GUARD,
];

const only = (filters, context) => ids(applyCardFilters(DRAWER, filters, context));

test('Fire + Stage 2 + Pokémon ex finds exactly the Fire Charizard ex', () => {
  let filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'stages', 'Stage2');
  filters = toggleFilter(filters, 'mechanics', 'ex');
  assert.deepEqual(only(filters), ['sv03.5-006']);
});

test('Pokémon ex and Pokémon-EX are told apart by the printed case', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'mechanics', 'ex')), [
    'sv03.5-006',
    'sv03-125',
  ]);
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'mechanics', 'EX')), ['xy4-24']);
});

test('Mega covers the legacy "M …-EX" printing', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'mechanics', 'Mega')), ['xy4-24']);
});

test('the V mechanic never matches V Guard Energy (rule-box names are Pokémon only)', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'mechanics', 'V')), []);
});

test('ACE SPEC matches Trainers by their printed rarity', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'mechanics', 'ACE SPEC')), [
    'sv05-157',
  ]);
});

test('an HP range excludes Trainers and Energy, and is inclusive', () => {
  const filters = setHpRange(createEmptyFilters(), 70, 210);
  assert.deepEqual(only(filters), ['xy4-24', 'sv03.5-004', 'x-snorlax']);
});

test('setHpRange snaps, clamps, swaps, and clears a full range', () => {
  assert.deepEqual(
    pick(setHpRange(createEmptyFilters(), 251, 64)),
    { hpMin: 60, hpMax: 250 }
  );
  assert.deepEqual(pick(setHpRange(createEmptyFilters(), -50, 999)), { hpMin: null, hpMax: null });
  assert.deepEqual(pick(setHpRange(createEmptyFilters(), 'junk', 120)), {
    hpMin: null,
    hpMax: 120,
  });
  assert.equal(countActiveFilters(setHpRange(createEmptyFilters(), 0, 400)), 0);
});

function pick(state) {
  return { hpMin: state.hpMin, hpMax: state.hpMax };
}

test('retreat pips: 5 means five or more, exact values otherwise', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'retreatCosts', '5')), ['x-snorlax']);
  let filters = toggleFilter(createEmptyFilters(), 'retreatCosts', '0');
  filters = toggleFilter(filters, 'retreatCosts', '1');
  assert.deepEqual(only(filters), ['xy4-24', 'sv03.5-004']);
});

test('weakness, regulation mark, rarity and expansion groups', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'weaknessTypes', 'water')), [
    'sv03.5-006',
    'sv03-125',
    'sv03.5-004',
  ]);
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'regulationMarks', 'G')), [
    'sv03.5-006',
    'sv03-125',
    'sv03.5-004',
    'sv01-181',
  ]);
  // TCGdex capitalises rarities inconsistently ("Double rare", "Ultra Rare").
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'rarities', 'DOUBLE RARE')), [
    'sv03.5-006',
    'sv03-125',
  ]);
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'sets', 'xy4')), ['xy4-24']);
});

test('format is single-select and reads TCGdex legality', () => {
  let filters = toggleFilter(createEmptyFilters(), 'format', 'standard');
  assert.equal(filters.format, 'standard');
  assert.deepEqual(only(filters), []);
  filters = toggleFilter(filters, 'format', 'expanded');
  assert.equal(filters.format, 'expanded');
  assert.equal(only(filters).length, 5);
  filters = toggleFilter(filters, 'format', 'expanded');
  assert.equal(filters.format, '');
  assert.equal(toggleFilter(createEmptyFilters(), 'format', 'glc').format, '');
});

test('Basic vs Special Energy', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'energyKinds', 'Basic')), ['sve-2']);
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'energyKinds', 'Special')), [
    'sv02-190',
    'sv05-v',
  ]);
});

test('toggles: Has Ability and In current deck', () => {
  assert.deepEqual(only(toggleFilter(createEmptyFilters(), 'hasAbility')), ['sv03-125']);
  const inDeck = toggleFilter(createEmptyFilters(), 'inDeck');
  assert.deepEqual(only(inDeck, { quantities: { 'sv01-181': 4, 'sve-2': 0 } }), ['sv01-181']);
  assert.deepEqual(only(inDeck), []);
  assert.equal(toggleFilter(inDeck, 'inDeck').inDeck, false);
});

test('buildTcgdexFilterParams sends only what TCGdex can narrow', () => {
  let filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'stages', 'Stage2');
  filters = setHpRange(filters, 100, 250);
  filters = toggleFilter(filters, 'weaknessTypes', 'water');
  filters = toggleFilter(filters, 'hasAbility');
  assert.deepEqual(buildTcgdexFilterParams(filters), {
    types: 'Fire',
    stage: 'Stage2',
    hp: 'gte:100',
  });
  assert.deepEqual(buildTcgdexFilterParams(createEmptyFilters()), {});
  assert.deepEqual(buildTcgdexFilterParams(setHpRange(createEmptyFilters(), 0, 90)), {
    hp: 'lte:90',
  });
});

test('buildTcgdexFilterParams maps categories, formats, energy kinds and suffixes', () => {
  let filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Pokémon');
  filters = toggleFilter(filters, 'supertypes', 'Energy');
  filters = toggleFilter(filters, 'format', 'standard');
  filters = toggleFilter(filters, 'energyKinds', 'Basic');
  filters = toggleFilter(filters, 'mechanics', 'ex');
  filters = toggleFilter(filters, 'mechanics', 'GX');
  filters = toggleFilter(filters, 'retreatCosts', '1');
  filters = toggleFilter(filters, 'rarities', 'Holo Rare');
  assert.deepEqual(buildTcgdexFilterParams(filters), {
    category: 'Pokemon|Energy',
    energyType: 'Normal',
    'legal.standard': 'true',
    suffix: 'ex|GX',
    retreat: '1',
    rarity: 'Holo Rare|Rare',
  });
  // "V" and "5+" have no faithful server form, so they stay client-side.
  let clientOnly = toggleFilter(createEmptyFilters(), 'mechanics', 'V');
  clientOnly = toggleFilter(clientOnly, 'retreatCosts', '5');
  assert.deepEqual(buildTcgdexFilterParams(clientOnly), {});
});

test('describeActiveFilters lists every filter as a chip, and removeFilterChip clears it', () => {
  let filters = toggleFilter(createEmptyFilters(), 'format', 'standard');
  filters = toggleFilter(filters, 'regulationMarks', 'H');
  filters = toggleFilter(filters, 'trainerTypes', 'Tool');
  filters = toggleFilter(filters, 'sets', 'sv03.5');
  filters = setHpRange(filters, 60, 250);
  filters = toggleFilter(filters, 'inDeck');
  const chips = describeActiveFilters(filters, { setNames: { 'sv03.5': '151' } });
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['Standard', 'Reg. H', 'Pokémon Tool', 'In current deck', 'HP 60–250', '151']
  );
  assert.equal(chips.length, countActiveFilters(filters));

  let cleared = filters;
  for (const chip of chips) cleared = removeFilterChip(cleared, chip);
  assert.equal(countActiveFilters(cleared), 0);
});

test('deriveSetOptions lists each expansion once, newest first', () => {
  assert.deepEqual(deriveSetOptions(DRAWER), [
    { value: 'sv03.5', label: '151' },
    { value: 'sv03', label: 'Obsidian Flames' },
    { value: 'xy4', label: 'Phantom Forces' },
  ]);
  assert.deepEqual(deriveSetOptions(null), []);
});

// Design 058: the Ancient/Future tag is per printing (pokemontcg.io subtypes): sv04-124 Roaring
// Moon ex Ancient, sv01-123 Great Tusk ex untagged, sv04-070 Iron Hands ex Future, sv04-180
// Techno Radar Future Item. TCGdex search rows carry the id and no tag.
const PARADOX = [
  { id: 'sv04-124', name: 'Roaring Moon ex', supertype: 'Pokémon', suffix: 'ex' },
  { id: 'sv01-123', name: 'Great Tusk ex', supertype: 'Pokémon', suffix: 'ex' },
  { id: 'sv04-070', name: 'Iron Hands ex', supertype: 'Pokémon', suffix: 'ex' },
  { id: 'sv04-180', name: 'Techno Radar', supertype: 'Trainer', trainerType: 'Item' },
];

test('Special: Ancient and Future filter by printing, Trainers included', () => {
  const pick = (value) =>
    ids(applyCardFilters(PARADOX, toggleFilter(createEmptyFilters(), 'mechanics', value)));
  assert.deepEqual(pick('Ancient'), ['sv04-124']);
  assert.deepEqual(pick('Future'), ['sv04-070', 'sv04-180']);
  const special = BUILDER_FILTER_GROUPS.find((group) => group.key === 'mechanics');
  assert.ok(special.options.some((o) => o.value === 'Ancient'));
  assert.ok(special.options.some((o) => o.value === 'Future'));
  // TCGdex cannot narrow by tag, so the filter stays client-side.
  assert.deepEqual(buildTcgdexFilterParams(toggleFilter(createEmptyFilters(), 'mechanics', 'Future')), {});
});
