import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyFilters, setHpRange, toggleFilter } from '../core/card-filters.mjs';
import {
  filtersCoverEverySet,
  filtersNeedCardDetails,
  findSetFilterMatches,
  scopeFilterSets,
} from '../core/set-browser-filters.mjs';

// Listing cards (what /sets/{id} gives, via normalizeSetCard) and the full
// records behind them. Fields per TCGdex sv03.5-004/006 and sv03-125 (2026-09-28).
const LISTINGS = {
  'sv03.5': [
    { id: 'sv03.5-004', name: 'Charmander', supertype: 'Pokémon', set: { id: 'sv03.5' } },
    { id: 'sv03.5-006', name: 'Charizard ex', supertype: 'Pokémon', set: { id: 'sv03.5' } },
    { id: 'sv03.5-165', name: 'Rare Candy', supertype: 'Trainer', set: { id: 'sv03.5' } },
  ],
  sv03: [
    { id: 'sv03-125', name: 'Charizard ex', supertype: 'Pokémon', set: { id: 'sv03' } },
  ],
};
const DETAILS = {
  'sv03.5-004': { id: 'sv03.5-004', name: 'Charmander', supertype: 'Pokémon', types: ['Fire'], stage: 'Basic', hp: 70, abilities: [] },
  'sv03.5-006': { id: 'sv03.5-006', name: 'Charizard ex', supertype: 'Pokémon', types: ['Fire'], stage: 'Stage2', suffix: 'ex', hp: 330, abilities: [] },
  'sv03.5-165': { id: 'sv03.5-165', name: 'Rare Candy', supertype: 'Trainer', trainerType: 'Item' },
  'sv03-125': { id: 'sv03-125', name: 'Charizard ex', supertype: 'Pokémon', types: ['Darkness'], stage: 'Stage2', suffix: 'ex', hp: 330, abilities: ['Infernal Reign'] },
};

function fakes({ summaryIds } = {}) {
  const calls = { summaries: [], details: [], sets: [] };
  return {
    calls,
    fetchSummaries: async (params) => {
      calls.summaries.push(params);
      const setId = params['set.id'].replace(/^eq:/, '');
      const ids = summaryIds?.[setId] ?? LISTINGS[setId].map((card) => card.id);
      return ids.map((id) => ({ id }));
    },
    loadSetCards: async (setId) => {
      calls.sets.push(setId);
      return LISTINGS[setId];
    },
    fetchDetail: async (cardId) => {
      calls.details.push(cardId);
      if (!DETAILS[cardId]) throw new Error('404');
      return DETAILS[cardId];
    },
  };
}

const ids = (matches, setId) => [...(matches.get(setId) || [])].sort();

test('card type and expansion filters need no full records', () => {
  let filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Trainer');
  filters = toggleFilter(filters, 'sets', 'sv03');
  filters = toggleFilter(filters, 'inDeck');
  assert.equal(filtersNeedCardDetails(filters), false);
  assert.equal(filtersNeedCardDetails(toggleFilter(createEmptyFilters(), 'hasAbility')), true);
  assert.equal(filtersNeedCardDetails(setHpRange(createEmptyFilters(), 100, 200)), true);
});

test('narrowable filters scan every set; detail-only filters only the opened set', () => {
  const setIds = ['sv03.5', 'sv03'];
  const fire = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  assert.deepEqual(scopeFilterSets({ filters: fire, setIds }), setIds);
  const ability = toggleFilter(createEmptyFilters(), 'hasAbility');
  assert.deepEqual(scopeFilterSets({ filters: ability, setIds, expandedSetId: 'sv03' }), ['sv03']);
  assert.deepEqual(scopeFilterSets({ filters: ability, setIds }), []);
  assert.deepEqual(scopeFilterSets({ filters: ability, setIds, expandedSetId: 'xy1' }), []);
  const trainers = toggleFilter(createEmptyFilters(), 'supertypes', 'Trainer');
  assert.deepEqual(scopeFilterSets({ filters: trainers, setIds }), setIds);
  assert.equal(filtersCoverEverySet(fire), true);
  assert.equal(filtersCoverEverySet(ability), false);
});

test('TCGdex narrows each set exactly, then full records decide', async () => {
  const deps = fakes({ summaryIds: { 'sv03.5': ['sv03.5-004', 'sv03.5-006'], sv03: [] } });
  let filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'stages', 'Stage2');
  const result = await findSetFilterMatches({ setIds: ['sv03.5', 'sv03'], filters, ...deps });
  assert.deepEqual(ids(result.matches, 'sv03.5'), ['sv03.5-006']);
  assert.deepEqual(ids(result.matches, 'sv03'), []);
  assert.deepEqual(deps.calls.summaries, [
    { types: 'Fire', stage: 'Stage2', 'set.id': 'eq:sv03.5' },
    { types: 'Fire', stage: 'Stage2', 'set.id': 'eq:sv03' },
  ]);
  assert.deepEqual(deps.calls.details.sort(), ['sv03.5-004', 'sv03.5-006']);
  assert.equal(result.truncated, false);
});

test('a detail-only filter checks the listing of the scanned set', async () => {
  const deps = fakes();
  const filters = toggleFilter(createEmptyFilters(), 'hasAbility');
  const result = await findSetFilterMatches({ setIds: ['sv03'], filters, ...deps });
  assert.deepEqual(ids(result.matches, 'sv03'), ['sv03-125']);
  assert.deepEqual(deps.calls.summaries, []);
});

test('listing-only filters never fetch full records', async () => {
  const deps = fakes();
  const filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Trainer');
  const result = await findSetFilterMatches({ setIds: ['sv03.5', 'sv03'], filters, ...deps });
  assert.deepEqual(ids(result.matches, 'sv03.5'), ['sv03.5-165']);
  assert.deepEqual(ids(result.matches, 'sv03'), []);
  assert.deepEqual(deps.calls.details, []);
});

test('the detail cap is reported, and a failed record just does not match', async () => {
  const deps = fakes({ summaryIds: { 'sv03.5': ['sv03.5-004', 'missing-1', 'sv03.5-006'] } });
  const filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  const capped = await findSetFilterMatches({ setIds: ['sv03.5'], filters, ...deps, detailLimit: 2 });
  assert.equal(capped.truncated, true);
  assert.equal(capped.candidateCount, 3);
  assert.equal(capped.checkedCount, 2);
  assert.deepEqual(ids(capped.matches, 'sv03.5'), ['sv03.5-004']);
});

test('picked Expansions narrow the scan to those tab sets', async () => {
  const setIds = ['sv03.5', 'sv03'];
  let filters = toggleFilter(createEmptyFilters(), 'energyTypes', 'fire');
  filters = toggleFilter(filters, 'sets', 'sv03');
  assert.deepEqual(scopeFilterSets({ filters, setIds }), ['sv03']);
  assert.deepEqual(scopeFilterSets({ filters: toggleFilter(createEmptyFilters(), 'sets', 'xy1'), setIds }), []);
  let ability = toggleFilter(createEmptyFilters(), 'hasAbility');
  ability = toggleFilter(ability, 'sets', 'sv03');
  assert.deepEqual(scopeFilterSets({ filters: ability, setIds, expandedSetId: 'sv03.5' }), []);
  assert.deepEqual(scopeFilterSets({ filters: ability, setIds, expandedSetId: 'sv03' }), ['sv03']);

  // The detail cap is spent on the picked set only, never on sets it filters out.
  const deps = fakes();
  const result = await findSetFilterMatches({ setIds, filters, ...deps, detailLimit: 1 });
  assert.deepEqual(deps.calls.summaries, [{ types: 'Fire', 'set.id': 'eq:sv03' }]);
  assert.deepEqual(deps.calls.details, ['sv03-125']);
  assert.equal(result.truncated, false);
  assert.equal(result.matches.has('sv03.5'), false);
});

test('a picked synthetic tab set keeps its cards from other set ids', async () => {
  // The Energy tab (ENERGY_SET_ID) lists TCGdex sve-001 Grass Energy under its real set.
  const listing = [{ id: 'sve-001', name: 'Grass Energy', supertype: 'Energy', set: { id: 'sve' } }];
  const deps = {
    fetchSummaries: async () => assert.fail('listing-only filters need no summaries'),
    loadSetCards: async (setId) => (setId === '__energy__' ? listing : assert.fail(setId)),
    fetchDetail: async () => assert.fail('listing-only filters need no records'),
  };
  let filters = toggleFilter(createEmptyFilters(), 'supertypes', 'Energy');
  filters = toggleFilter(filters, 'sets', '__energy__');
  const result = await findSetFilterMatches({ setIds: ['__energy__', 'sv03'], filters, ...deps });
  assert.deepEqual(ids(result.matches, '__energy__'), ['sve-001']);
});
