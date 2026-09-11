import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGenerationSets,
  fetchGenerationEnergyCards,
  fetchSetCards,
  filterCardsBySupertype,
  generationEnergySetId,
  GENERATION_SERIES,
  GENERATIONS,
} from '../set-browser.mjs';

// Each test installs its own fetch stub keyed by URL substring, then restores
// the original global.fetch — set-browser.mjs caches series/set records at
// module scope, so every test here must use unique series/set ids to avoid
// reading another test's cached response.
let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function stubFetch(handlers) {
  global.fetch = async (url) => {
    for (const [match, body] of handlers) {
      if (url.includes(match)) return jsonResponse(body);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// fetchEnergyCardSummaries() caches the /cards?category=Energy response at
// module scope forever (it's genuinely global data — every Energy card across
// every TCGdex set), so every Energy-tab test below must share ONE canonical
// response rather than each stubbing its own: whichever test's fetch runs
// first wins the cache, and a later test with a different body would silently
// read stale data instead of its own stub.
const SHARED_ENERGY_SUMMARY = [
  { id: 'gte1a-002', name: 'Basic Fire Energy', localId: '002' },
  { id: 'gte3a-010', name: 'Basic Water Energy', localId: '010' },
  { id: 'gte3a-011', name: 'Basic Water Energy (secret rare)', localId: '011' },
  { id: 'gte4a-005', name: 'Basic Grass Energy', localId: '005' },
];

describe('fetchGenerationSets', () => {
  it('GENERATIONS lists 9 down to 1, each with at least one series', () => {
    assert.deepEqual(GENERATIONS, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
    for (const gen of GENERATIONS) {
      assert.ok(GENERATION_SERIES[gen]?.length > 0, `gen ${gen} has no series`);
    }
  });

  it('merges sets from every series in the generation, newest first', async () => {
    stubFetch([
      ['/series/gt1', { id: 'gt1', name: 'GT Series 1', sets: [{ id: 'gt1a', name: 'GT Set A' }] }],
      ['/series/gt2', { id: 'gt2', name: 'GT Series 2', sets: [{ id: 'gt2a', name: 'GT Set B' }] }],
      ['/sets/gt1a', { id: 'gt1a', name: 'GT Set A', releaseDate: '2001-01-01', cards: [{ image: 'x' }] }],
      ['/sets/gt2a', { id: 'gt2a', name: 'GT Set B', releaseDate: '2002-01-01', cards: [{ image: 'x' }] }],
    ]);
    GENERATION_SERIES[99] = ['gt1', 'gt2'];
    const sets = await fetchGenerationSets(99);
    assert.deepEqual(sets.map((s) => s.setId), ['gt2a', 'gt1a']);
    delete GENERATION_SERIES[99];
  });

  it('drops a series that 404s without blanking the others', async () => {
    stubFetch([
      ['/series/gt3', { id: 'gt3', name: 'GT Series 3', sets: [{ id: 'gt3a', name: 'GT Set C' }] }],
      ['/sets/gt3a', { id: 'gt3a', name: 'GT Set C', releaseDate: '2003-01-01', cards: [{ image: 'x' }] }],
      // gt4 series intentionally has no handler -> 404
    ]);
    GENERATION_SERIES[98] = ['gt3', 'gt4'];
    const sets = await fetchGenerationSets(98);
    assert.deepEqual(sets.map((s) => s.setId), ['gt3a']);
    delete GENERATION_SERIES[98];
  });

  it('drops sets with zero image-bearing cards', async () => {
    stubFetch([
      ['/series/gt5', { id: 'gt5', name: 'GT Series 5', sets: [{ id: 'gt5a', name: 'Empty Set' }] }],
      ['/sets/gt5a', { id: 'gt5a', name: 'Empty Set', releaseDate: '2005-01-01', cards: [{ image: '' }, {}] }],
    ]);
    GENERATION_SERIES[97] = ['gt5'];
    const sets = await fetchGenerationSets(97);
    assert.deepEqual(sets, []);
    delete GENERATION_SERIES[97];
  });

  it('de-dupes a set id that appears in two series', async () => {
    stubFetch([
      ['/series/gt6', { id: 'gt6', name: 'GT Series 6', sets: [{ id: 'gt6a', name: 'Shared' }] }],
      ['/series/gt7', { id: 'gt7', name: 'GT Series 7', sets: [{ id: 'gt6a', name: 'Shared' }] }],
      ['/sets/gt6a', { id: 'gt6a', name: 'Shared', releaseDate: '2006-01-01', cards: [{ image: 'x' }] }],
    ]);
    GENERATION_SERIES[96] = ['gt6', 'gt7'];
    const sets = await fetchGenerationSets(96);
    assert.equal(sets.length, 1);
    delete GENERATION_SERIES[96];
  });

  it('returns an empty array for a generation with no reachable series', async () => {
    stubFetch([]);
    GENERATION_SERIES[95] = ['gt8-missing'];
    const sets = await fetchGenerationSets(95);
    assert.deepEqual(sets, []);
    delete GENERATION_SERIES[95];
  });

  it('appends a synthetic Energy tab that aggregates Energy cards across the generation', async () => {
    stubFetch([
      ['/series/gte1', { id: 'gte1', name: 'GTE Series 1', sets: [{ id: 'gte1a', name: 'GTE Set A' }] }],
      [
        '/sets/gte1a',
        {
          id: 'gte1a',
          name: 'GTE Set A',
          releaseDate: '2010-01-01',
          cards: [
            { id: 'gte1a-001', image: 'x' },
            { id: 'gte1a-002', name: 'Basic Fire Energy', localId: '002', image: 'y' },
          ],
        },
      ],
      ['/cards?category=Energy', SHARED_ENERGY_SUMMARY],
    ]);
    GENERATION_SERIES[94] = ['gte1'];
    const sets = await fetchGenerationSets(94);
    const energyTab = sets.find((s) => s.setId === generationEnergySetId(94));
    assert.ok(energyTab, 'expected a synthetic Energy tab');
    assert.equal(energyTab.name, 'Energy');
    assert.equal(energyTab.cardCount, 1);
    delete GENERATION_SERIES[94];
  });

  it('omits the Energy tab when the generation has no Energy cards', async () => {
    stubFetch([
      ['/series/gte2', { id: 'gte2', name: 'GTE Series 2', sets: [{ id: 'gte2a', name: 'GTE Set B' }] }],
      ['/sets/gte2a', { id: 'gte2a', name: 'GTE Set B', releaseDate: '2011-01-01', cards: [{ id: 'gte2a-001', image: 'x' }] }],
      ['/cards?category=Energy', SHARED_ENERGY_SUMMARY],
    ]);
    GENERATION_SERIES[93] = ['gte2'];
    const sets = await fetchGenerationSets(93);
    assert.ok(!sets.some((s) => s.setId === generationEnergySetId(93)));
    delete GENERATION_SERIES[93];
  });
});

describe('fetchGenerationEnergyCards', () => {
  it('hydrates images for Energy-category cards from cached set records, rarer variants included', async () => {
    stubFetch([
      ['/series/gte3', { id: 'gte3', name: 'GTE Series 3', sets: [{ id: 'gte3a', name: 'GTE Set C' }] }],
      [
        '/sets/gte3a',
        {
          id: 'gte3a',
          name: 'GTE Set C',
          releaseDate: '2012-01-01',
          cards: [
            { id: 'gte3a-010', name: 'Basic Water Energy', localId: '010', image: 'water' },
            { id: 'gte3a-011', name: 'Basic Water Energy (secret rare)', localId: '011', image: 'water-secret' },
            { id: 'gte3a-999', name: 'Not Energy', localId: '999', image: 'other' },
          ],
        },
      ],
      ['/cards?category=Energy', SHARED_ENERGY_SUMMARY],
    ]);
    GENERATION_SERIES[92] = ['gte3'];
    const cards = await fetchGenerationEnergyCards(92);
    assert.deepEqual(
      cards.map((c) => c.id).sort(),
      ['gte3a-010', 'gte3a-011']
    );
    delete GENERATION_SERIES[92];
  });
});

describe('fetchSetCards routes a generation Energy tab id to fetchGenerationEnergyCards', () => {
  it('__energy_gen<N>__ resolves the same cards as fetchGenerationEnergyCards(N)', async () => {
    stubFetch([
      ['/series/gte4', { id: 'gte4', name: 'GTE Series 4', sets: [{ id: 'gte4a', name: 'GTE Set D' }] }],
      [
        '/sets/gte4a',
        {
          id: 'gte4a',
          name: 'GTE Set D',
          releaseDate: '2013-01-01',
          cards: [{ id: 'gte4a-005', name: 'Basic Grass Energy', localId: '005', image: 'grass' }],
        },
      ],
      ['/cards?category=Energy', SHARED_ENERGY_SUMMARY],
    ]);
    GENERATION_SERIES[91] = ['gte4'];
    const viaSetCards = await fetchSetCards(generationEnergySetId(91));
    assert.deepEqual(
      viaSetCards.map((c) => c.id),
      ['gte4a-005']
    );
    delete GENERATION_SERIES[91];
  });
});

describe('filterCardsBySupertype', () => {
  it('filters to just the requested supertype', () => {
    const cards = [
      { id: 'a', supertype: 'Pokémon' },
      { id: 'b', supertype: 'Trainer' },
      { id: 'c', supertype: 'Energy' },
    ];
    assert.deepEqual(filterCardsBySupertype(cards, 'pokemon').map((c) => c.id), ['a']);
    assert.deepEqual(filterCardsBySupertype(cards, 'trainer').map((c) => c.id), ['b']);
    assert.deepEqual(filterCardsBySupertype(cards, 'energy').map((c) => c.id), ['c']);
  });

  it('returns every card when no filter is given', () => {
    const cards = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(filterCardsBySupertype(cards, null), cards);
  });

  it('matches the unaccented "Pokemon" spelling too', () => {
    const cards = [{ id: 'a', supertype: 'Pokemon' }];
    assert.deepEqual(filterCardsBySupertype(cards, 'pokemon').map((c) => c.id), ['a']);
  });
});

describe('fetchSetCards tags each card with its TCGdex supertype', () => {
  it('cross-references /cards?category=X to tag Pokémon/Trainer/Energy', async () => {
    stubFetch([
      ['/cards?category=Pokemon', [{ id: 'gts1-001' }]],
      ['/cards?category=Trainer', [{ id: 'gts1-002' }]],
      ['/cards?category=Energy', [{ id: 'gts1-003' }]],
      [
        '/sets/gts1',
        {
          id: 'gts1',
          name: 'GTS Set',
          cards: [
            { id: 'gts1-001', name: 'Bulbasaur', localId: '001', image: 'x' },
            { id: 'gts1-002', name: 'Poké Ball', localId: '002', image: 'y' },
            { id: 'gts1-003', name: 'Basic Grass Energy', localId: '003', image: 'z' },
          ],
        },
      ],
    ]);
    const cards = await fetchSetCards('gts1');
    const byId = Object.fromEntries(cards.map((c) => [c.id, c.supertype]));
    assert.deepEqual(byId, {
      'gts1-001': 'Pokémon',
      'gts1-002': 'Trainer',
      'gts1-003': 'Energy',
    });
  });
});
