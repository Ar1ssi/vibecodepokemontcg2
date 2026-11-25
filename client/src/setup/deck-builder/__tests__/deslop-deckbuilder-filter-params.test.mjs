import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_ENERGY_TYPES,
  FILTER_FORMATS,
  FILTER_RARITIES,
  FILTER_REGULATION_MARKS,
  FILTER_SUPERTYPES,
  FILTER_TRAINER_TYPES,
  TCGDEX_FILTER_PARAM_DROP_ORDER,
  buildTcgdexFilterParams,
  countActiveFilters,
  createEmptyFilters,
  describeActiveFilters,
  toggleFilter,
} from '../core/card-filters.mjs';
import { buildSummaryQuery } from '../core/card-search.mjs';

describe('TCGDEX_FILTER_PARAM_DROP_ORDER', () => {
  it('names every param buildTcgdexFilterParams can emit', () => {
    for (const format of FILTER_FORMATS) {
      const filters = {
        ...createEmptyFilters(),
        supertypes: [...FILTER_SUPERTYPES],
        energyTypes: [FILTER_ENERGY_TYPES[0]],
        stages: ['Basic'],
        trainerTypes: [FILTER_TRAINER_TYPES[0]],
        energyKinds: ['Basic'],
        regulationMarks: [FILTER_REGULATION_MARKS[0]],
        rarities: [FILTER_RARITIES[0]],
        retreatCosts: ['2'],
        hpMin: 60,
        format,
        mechanics: ['ex'],
      };
      for (const key of Object.keys(buildTcgdexFilterParams(filters))) {
        assert.ok(TCGDEX_FILTER_PARAM_DROP_ORDER.includes(key), `${key} is never dropped for an over-long query`);
      }
    }
  });

  it('lets buildSummaryQuery drop the format param when the query is too long', () => {
    const query = buildSummaryQuery({
      cardName: 'x'.repeat(285),
      params: { 'legal.expanded': 'true', rarity: 'y'.repeat(120) },
    });
    assert.equal(query['legal.expanded'], undefined);
    assert.ok(query.name);
  });
});

describe('filter group kinds', () => {
  it('every array group in the empty state toggles, so no group is inert', () => {
    for (const [group, value] of Object.entries(createEmptyFilters())) {
      if (!Array.isArray(value)) continue;
      const toggled = toggleFilter(createEmptyFilters(), group, 'probe');
      assert.deepEqual(toggled[group], ['probe'], `${group} ignores toggleFilter`);
    }
  });

  it('counts exactly the chips it describes', () => {
    const filters = {
      ...createEmptyFilters(),
      supertypes: ['Pokémon', 'Trainer'],
      retreatCosts: ['5'],
      hpMin: 70,
      format: 'standard',
      hasAbility: true,
    };
    assert.equal(countActiveFilters(filters), describeActiveFilters(filters).length);
    assert.equal(countActiveFilters(filters), 6);
  });
});
