import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSummaryQuery,
  newestSummariesFirst,
  normalizeSearchQuery,
  normalizeTcgdexCard,
  queryCards,
  resolveSearchPlan,
  setIdOfCardId,
} from '../core/card-search.mjs';
import { SET_RELEASE_DATES } from '../core/set-release-dates.generated.mjs';

// ---------------------------------------------------------------------------
// normalizeSearchQuery
// ---------------------------------------------------------------------------

test('normalizeSearchQuery: plain name passes through unchanged', () => {
  assert.equal(normalizeSearchQuery('Pikachu'), 'Pikachu');
});

// E4
test('normalizeSearchQuery: standalone E4 → 4', () => {
  assert.equal(normalizeSearchQuery('E4'), '4');
  assert.equal(normalizeSearchQuery('e4'), '4');
});

test('normalizeSearchQuery: name E4 suffix → name 4', () => {
  assert.equal(normalizeSearchQuery('Infernape E4'), 'Infernape 4');
});

test('normalizeSearchQuery: name E4 LV.X → name 4', () => {
  assert.equal(normalizeSearchQuery('Infernape E4 LV.X'), 'Infernape 4');
  assert.equal(normalizeSearchQuery('Infernape E4 LV. X'), 'Infernape 4');
});

// LV.X normalisation (spacing)
test('normalizeSearchQuery: LV.X → LV. X (space added)', () => {
  assert.equal(normalizeSearchQuery('Torterra LV.X'), 'Torterra LV. X');
});

test('normalizeSearchQuery: LV. X already correct passes through', () => {
  assert.equal(normalizeSearchQuery('Torterra LV. X'), 'Torterra LV. X');
});

test('normalizeSearchQuery: standalone LV.X → LV. X', () => {
  assert.equal(normalizeSearchQuery('LV.X'), 'LV. X');
});

// Prism star
test('normalizeSearchQuery: standalone "prism star" → ◇', () => {
  assert.equal(normalizeSearchQuery('prism star'), '◇');
  assert.equal(normalizeSearchQuery('Prism Star'), '◇');
});

test('normalizeSearchQuery: standalone ◇ passes through', () => {
  assert.equal(normalizeSearchQuery('◇'), '◇');
});

test('normalizeSearchQuery: standalone {*} → ◇', () => {
  assert.equal(normalizeSearchQuery('{*}'), '◇');
});

test('normalizeSearchQuery: name prism star suffix → name ◇', () => {
  assert.equal(normalizeSearchQuery('Mewtwo prism star'), 'Mewtwo ◇');
});

test('normalizeSearchQuery: name {*} suffix → name ◇', () => {
  assert.equal(normalizeSearchQuery('Mewtwo {*}'), 'Mewtwo ◇');
});

// Gold star
test('normalizeSearchQuery: standalone "gold star" → Star', () => {
  assert.equal(normalizeSearchQuery('gold star'), 'Star');
  assert.equal(normalizeSearchQuery('Gold Star'), 'Star');
});

test('normalizeSearchQuery: standalone * → Star', () => {
  assert.equal(normalizeSearchQuery('*'), 'Star');
});

test('normalizeSearchQuery: standalone ☆ → Star', () => {
  assert.equal(normalizeSearchQuery('☆'), 'Star');
});

test('normalizeSearchQuery: name gold star suffix → name Star', () => {
  assert.equal(normalizeSearchQuery('Pikachu gold star'), 'Pikachu Star');
});

test('normalizeSearchQuery: name * suffix → name Star', () => {
  assert.equal(normalizeSearchQuery('Pikachu *'), 'Pikachu Star');
});

test('normalizeSearchQuery: name ☆ suffix → name Star', () => {
  assert.equal(normalizeSearchQuery('Pikachu ☆'), 'Pikachu Star');
});

// Delta species
test('normalizeSearchQuery: standalone "delta" → δ', () => {
  assert.equal(normalizeSearchQuery('delta'), 'δ');
  assert.equal(normalizeSearchQuery('Delta'), 'δ');
  assert.equal(normalizeSearchQuery('DELTA'), 'δ');
});

test('normalizeSearchQuery: standalone δ passes through', () => {
  assert.equal(normalizeSearchQuery('δ'), 'δ');
});

test('normalizeSearchQuery: name delta suffix → name δ', () => {
  assert.equal(normalizeSearchQuery('Charizard delta'), 'Charizard δ');
  assert.equal(normalizeSearchQuery('Pikachu Delta'), 'Pikachu δ');
});

// ---------------------------------------------------------------------------
// resolveSearchPlan
// ---------------------------------------------------------------------------

test('resolveSearchPlan: plain name → single name query', () => {
  assert.deepEqual(resolveSearchPlan('Pikachu'), { type: 'name', queries: ['Pikachu'] });
});

test('resolveSearchPlan: LV. X suffix → stage plan', () => {
  assert.deepEqual(resolveSearchPlan('Torterra LV. X'), {
    type: 'stage',
    stage: 'LEVEL-UP',
    baseName: 'Torterra',
  });
});

test('resolveSearchPlan: standalone LV. X → stage plan with empty baseName', () => {
  assert.deepEqual(resolveSearchPlan('LV. X'), {
    type: 'stage',
    stage: 'LEVEL-UP',
    baseName: '',
  });
});

test('resolveSearchPlan: space-EX → dual query including hyphen-EX', () => {
  const plan = resolveSearchPlan('Charizard EX');
  assert.equal(plan.type, 'name');
  assert.ok(plan.queries.includes('Charizard EX'));
  assert.ok(plan.queries.includes('Charizard-EX'));
});

test('resolveSearchPlan: hyphen-EX → dual query including space-EX', () => {
  const plan = resolveSearchPlan('Charizard-EX');
  assert.equal(plan.type, 'name');
  assert.ok(plan.queries.includes('Charizard-EX'));
  assert.ok(plan.queries.includes('Charizard EX'));
});

test('resolveSearchPlan: space-GX → dual query including hyphen-GX', () => {
  const plan = resolveSearchPlan('Charizard GX');
  assert.equal(plan.type, 'name');
  assert.ok(plan.queries.includes('Charizard GX'));
  assert.ok(plan.queries.includes('Charizard-GX'));
});

test('resolveSearchPlan: hyphen-GX → dual query including space-GX', () => {
  const plan = resolveSearchPlan('Charizard-GX');
  assert.equal(plan.type, 'name');
  assert.ok(plan.queries.includes('Charizard-GX'));
  assert.ok(plan.queries.includes('Charizard GX'));
});

// ---------------------------------------------------------------------------
// Design 050: filter params and the fields the filter drawer reads
// ---------------------------------------------------------------------------

test('normalizeTcgdexCard keeps the fields the filter drawer reads', () => {
  // Trimmed from api.tcgdex.net/v2/en/cards/sv03-125 (2026-09-28).
  const card = normalizeTcgdexCard({
    id: 'sv03-125',
    name: 'Charizard ex',
    category: 'Pokemon',
    image: 'https://assets.tcgdex.net/en/sv/sv03/125',
    localId: '125',
    rarity: 'Double rare',
    set: { id: 'sv03', name: 'Obsidian Flames' },
    hp: 330,
    types: ['Darkness'],
    stage: 'Stage2',
    suffix: 'ex',
    abilities: [{ type: 'Ability', name: 'Infernal Reign', effect: '…' }],
    weaknesses: [{ type: 'Grass', value: '×2' }],
    retreat: 2,
    regulationMark: 'G',
    legal: { standard: false, expanded: true },
  });
  assert.equal(card.hp, 330);
  assert.equal(card.retreat, 2);
  assert.deepEqual(card.weaknesses, ['Grass']);
  assert.deepEqual(card.abilities, ['Infernal Reign']);
  assert.equal(card.regulationMark, 'G');
  assert.deepEqual(card.legal, { standard: false, expanded: true });
  assert.equal(card.suffix, 'ex');
  assert.equal(card.supertype, 'Pokémon');
});

test('normalizeTcgdexCard gives Trainers null HP/retreat and empty lists', () => {
  const card = normalizeTcgdexCard({
    id: 'sv01-181',
    name: 'Nest Ball',
    category: 'Trainer',
    trainerType: 'Item',
    image: 'https://assets.tcgdex.net/en/sv/sv01/181',
  });
  assert.equal(card.hp, null);
  assert.equal(card.retreat, null);
  assert.deepEqual(card.weaknesses, []);
  assert.deepEqual(card.abilities, []);
  assert.deepEqual(card.legal, { standard: false, expanded: false });
});

test('buildSummaryQuery merges the name, stage plan and filter params', () => {
  assert.deepEqual(buildSummaryQuery({ cardName: 'Charizard', params: { types: 'Fire' } }), {
    name: 'Charizard',
    types: 'Fire',
  });
  // The LV.X plan's stage wins over a Stage filter.
  assert.deepEqual(
    buildSummaryQuery({ cardName: 'Arceus', cardStage: 'LEVEL-UP', params: { stage: 'Basic' } }),
    { name: 'Arceus', stage: 'LEVEL-UP' }
  );
  assert.deepEqual(buildSummaryQuery({ params: { hp: '', types: 'Water' } }), { types: 'Water' });
});

test('buildSummaryQuery drops the loosest filter params to fit the proxy limit', () => {
  const rarity = Array.from({ length: 30 }, (_, index) => `Rarity number ${index}`).join('|');
  const query = buildSummaryQuery({
    cardName: 'Pikachu',
    params: { rarity, types: 'Lightning', stage: 'Basic' },
  });
  assert.deepEqual(query, { name: 'Pikachu', types: 'Lightning', stage: 'Basic' });
  assert.ok(new URLSearchParams(query).toString().length <= 300);
});

test('queryCards with no name and no params fetches nothing', async () => {
  const response = await queryCards({ term: '  ', params: {} });
  assert.deepEqual(response.results, []);
  assert.equal(response.totalSummaries, 0);
  assert.equal(response.detailedCount, 0);
  assert.equal(response.isHugeResultSet, false);
});

// A stand-in for the network: `routes(url)` answers each request, possibly after a gate.
function stubFetch(routes) {
  const requested = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requested.push(parsed);
    const body = await routes(parsed, requested);
    return { ok: true, status: 200, json: async () => body };
  };
  return { requested, restore: () => (globalThis.fetch = previous) };
}

// Waits until `ready()` holds and says whether it did; gives up after a short while so a
// regression fails rather than hangs.
async function until(ready) {
  for (let tries = 0; tries < 50 && !ready(); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  return ready();
}

// Set ids absent from the generated release-date table, so their dates come from /sets/<id>.
// 2026-10-15.
test('queryCards looks up a set as soon as its first card arrives, not after every card', async () => {
  assert.ok(!Object.hasOwn(SET_RELEASE_DATES, 'zz98'));
  assert.ok(!Object.hasOwn(SET_RELEASE_DATES, 'zz99'));
  const sets = { zz98: '2030-01-02', zz99: '2030-01-01' };
  let lookupStartedEarly = false;
  const card = (id, setId, name) => ({
    id,
    name,
    category: 'Pokemon',
    image: `https://assets.tcgdex.net/en/zz/${setId}/${id.split('-')[1]}`,
    set: { id: setId, name: setId },
  });
  const stub = stubFetch(async (url, requested) => {
    const path = url.pathname;
    if (path.endsWith('/cards')) return [{ id: 'zz98-001' }, { id: 'zz99-001' }];
    if (path.endsWith('/cards/zz98-001')) return card('zz98-001', 'zz98', 'Pikachu ex');
    if (path.endsWith('/cards/zz99-001')) {
      // Held until the first card's set lookup is under way.
      lookupStartedEarly = await until(() =>
        requested.some((entry) => entry.pathname.endsWith('/sets/zz98'))
      );
      return card('zz99-001', 'zz99', 'Pikachu');
    }
    const setId = path.split('/').pop();
    if (sets[setId]) return { id: setId, releaseDate: sets[setId] };
    throw new Error(`unexpected request ${url}`);
  });
  try {
    const response = await queryCards({ term: 'Pikachu' });
    assert.ok(lookupStartedEarly, 'the zz98 lookup waited for every card record');
    assert.deepEqual(
      response.results.map((entry) => [entry.id, entry.set.releaseDate]),
      [
        ['zz98-001', '2030-01-02'],
        ['zz99-001', '2030-01-01'],
      ]
    );
  } finally {
    stub.restore();
  }
});

test('setIdOfCardId finds the set id even when the set id contains dashes', () => {
  assert.equal(setIdOfCardId('sv03.5-006'), 'sv03.5');
  assert.equal(setIdOfCardId('P-A-050'), 'P-A');
  assert.equal(setIdOfCardId('tk-hs-r-2'), 'tk-hs-r');
  assert.equal(setIdOfCardId('30th-c-008'), '30th-c');
  assert.equal(setIdOfCardId('30th-023'), '30th');
});

test('setIdOfCardId returns empty for unknown sets and bad input', () => {
  assert.equal(setIdOfCardId('nope-1'), '');
  assert.equal(setIdOfCardId(''), '');
  assert.equal(setIdOfCardId(undefined), '');
  assert.equal(setIdOfCardId(42), '');
});

test('newestSummariesFirst orders by printing date, unknown sets last, without mutating its input', () => {
  assert.ok(SET_RELEASE_DATES.sv08 > SET_RELEASE_DATES.sv05);
  assert.ok(SET_RELEASE_DATES.sv05 > SET_RELEASE_DATES.base1);
  const input = [{ id: 'base1-4' }, { id: 'sv08-057' }, { id: 'unknown-1' }, { id: 'sv05-051' }];
  const snapshot = [...input];
  const ordered = newestSummariesFirst(input);
  assert.deepEqual(
    ordered.map((summary) => summary.id),
    ['sv08-057', 'sv05-051', 'base1-4', 'unknown-1']
  );
  assert.notEqual(ordered, input);
  assert.deepEqual(input, snapshot);
});

test('queryCards keeps the newest printings when the list exceeds the detail cap', async () => {
  const summaries = [];
  for (let n = 1; n <= 150; n += 1) summaries.push({ id: `base1-${n}` });
  summaries.push({ id: 'sv08-057' });
  const stub = stubFetch(async (url) => {
    const path = url.pathname;
    if (path.endsWith('/cards')) return summaries;
    const cardMatch = path.match(/\/cards\/(.+)$/);
    if (cardMatch) {
      const id = decodeURIComponent(cardMatch[1]);
      return {
        id,
        name: 'Pikachu',
        category: 'Pokemon',
        image: 'https://assets.tcgdex.net/en/x/y/1',
        set: { id: setIdOfCardId(id), name: 'x' },
      };
    }
    throw new Error(`unexpected request ${url}`);
  });
  try {
    const response = await queryCards({ term: 'Pikachu' });
    assert.ok(response.results.some((entry) => entry.id === 'sv08-057'));
    assert.equal(response.detailedCount, 150);
    assert.equal(response.totalSummaries, 151);
    assert.ok(
      !stub.requested.some((entry) => entry.pathname.includes('/sets/')),
      'dates should come from the table, not /sets/ requests'
    );
  } finally {
    stub.restore();
  }
});

// TCGdex spells both "Mewtwo EX" (xy12-52) and "Mewtwo-EX" (bw4-54), 2026-10-15.
test('queryCards asks for both EX spellings at once and merges them in plan order', async () => {
  let askedTogether = false;
  const stub = stubFetch(async (url, requested) => {
    const name = url.searchParams.get('name');
    if (name === 'Mewtwo EX') {
      askedTogether = await until(() =>
        requested.some((entry) => entry.searchParams.get('name') === 'Mewtwo-EX')
      );
      return [{ id: 'xy12-52' }, { id: 'shared-1' }];
    }
    if (name === 'Mewtwo-EX') return [{ id: 'bw4-54' }, { id: 'shared-1' }];
    return { id: 'x', name: 'x', category: 'Pokemon', set: {} };
  });
  try {
    const response = await queryCards({ term: 'Mewtwo EX' });
    assert.ok(askedTogether, 'the second spelling waited for the first');
    assert.equal(response.totalSummaries, 3);
    assert.deepEqual(
      stub.requested.filter((entry) => entry.pathname.endsWith('/cards')).map((entry) => entry.searchParams.get('name')),
      ['Mewtwo EX', 'Mewtwo-EX']
    );
  } finally {
    stub.restore();
  }
});

// Set id absent from the generated release-date table; not zz98, whose date the
// lookup test above caches for the whole run.
function progressCard(id) {
  const [setId, localId] = id.split('-');
  return {
    id,
    name: 'Pikachu',
    category: 'Pokemon',
    image: `https://assets.tcgdex.net/en/zz/${setId}/${localId}`,
    set: { id: setId, name: setId },
  };
}

test('queryCards reports each card as it loads, in summary order, with a new array each time', async () => {
  const progress = [];
  let thirdReportedFirst = false;
  const stub = stubFetch(async (url) => {
    const path = url.pathname;
    if (path.endsWith('/cards')) return [{ id: 'zz97-001' }, { id: 'zz97-002' }, { id: 'zz97-003' }];
    if (path.endsWith('/cards/zz97-003')) return progressCard('zz97-003');
    if (path.endsWith('/cards/zz97-001')) {
      // 001 loads after 003 has been reported, so the reports show the arrival order.
      thirdReportedFirst = await until(() => progress.length === 1);
      return progressCard('zz97-001');
    }
    if (path.endsWith('/cards/zz97-002')) throw new Error('detail request failed');
    if (path.endsWith('/sets/zz97')) return { id: 'zz97', releaseDate: '2030-01-02' };
    throw new Error(`unexpected request ${url}`);
  });
  try {
    const response = await queryCards({
      term: 'Pikachu',
      onProgress: (update) => progress.push(update),
    });
    assert.ok(thirdReportedFirst, 'zz97-001 waited until zz97-003 had been reported');
    assert.deepEqual(
      progress.map((update) => update.results.map((card) => card.id)),
      [['zz97-003'], ['zz97-001', 'zz97-003']]
    );
    assert.notEqual(progress[0].results, progress[1].results);
    assert.deepEqual(
      progress.map((update) => [update.totalSummaries, update.detailedCount]),
      [
        [3, 3],
        [3, 3],
      ]
    );
    assert.deepEqual(
      response.results.map((card) => card.id),
      progress.at(-1).results.map((card) => card.id)
    );
  } finally {
    stub.restore();
  }
});

test('queryCards still returns every valid card when onProgress throws', async () => {
  let reports = 0;
  const stub = stubFetch(async (url) => {
    const path = url.pathname;
    if (path.endsWith('/cards')) return [{ id: 'zz97-001' }, { id: 'zz97-002' }];
    const cardMatch = path.match(/\/cards\/(zz97-\d+)$/);
    if (cardMatch) return progressCard(cardMatch[1]);
    if (path.endsWith('/sets/zz97')) return { id: 'zz97', releaseDate: '2030-01-02' };
    throw new Error(`unexpected request ${url}`);
  });
  try {
    const response = await queryCards({
      term: 'Pikachu',
      onProgress: () => {
        reports += 1;
        throw new Error('listener broke');
      },
    });
    assert.equal(reports, 2);
    assert.deepEqual(
      response.results.map((card) => card.id),
      ['zz97-001', 'zz97-002']
    );
  } finally {
    stub.restore();
  }
});
