import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSummaryQuery,
  normalizeSearchQuery,
  normalizeTcgdexCard,
  queryCards,
  resolveSearchPlan,
} from '../core/card-search.mjs';

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
