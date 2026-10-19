import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareCardsBySupertype,
  flattenDeckToCardArray,
  sortCardsBySupertype,
  getSortedDeckCardArray,
  uniqueDeckCards,
} from '../core/card-sort.mjs';

function makeVariant(name, supertype, count, extra = {}) {
  return {
    data: { name, supertype, ...extra },
    count,
  };
}

test('compareCardsBySupertype orders Pokémon before Trainer before Energy', () => {
  assert.equal(compareCardsBySupertype({ supertype: 'Pokémon' }, { supertype: 'Trainer' }), -1);
  assert.equal(compareCardsBySupertype({ supertype: 'Trainer' }, { supertype: 'Energy' }), -1);
  assert.equal(compareCardsBySupertype({ supertype: 'Energy' }, { supertype: 'Pokémon' }), 1);
});

test('flattenDeckToCardArray converts grouped deck state to displayable card array', () => {
  const deck = {
    Pikachu: { totalCount: 2, cards: [makeVariant('Pikachu', 'Pokémon', 2, { id: '1' })] },
    Switch: { totalCount: 1, cards: [makeVariant('Switch', 'Trainer', 1, { id: '2' })] },
  };

  const cards = flattenDeckToCardArray(deck);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].count, 2);
  assert.equal(cards[1].count, 1);
});

test('sortCardsBySupertype sorts cards in display priority order', () => {
  const sorted = sortCardsBySupertype([
    { name: 'Energy', supertype: 'Energy' },
    { name: 'Switch', supertype: 'Trainer' },
    { name: 'Pikachu', supertype: 'Pokémon' },
  ]);

  assert.deepEqual(sorted.map((card) => card.supertype), ['Pokémon', 'Trainer', 'Energy']);
});

test('unknown supertypes sort last', () => {
  const sorted = sortCardsBySupertype([
    { name: 'Mystery', supertype: 'Unknown' },
    { name: 'Pikachu', supertype: 'Pokémon' },
  ]);

  assert.deepEqual(sorted.map((card) => card.supertype), ['Pokémon', 'Unknown']);
});

test('getSortedDeckCardArray flattens then sorts deck cards', () => {
  const deck = {
    Energy: { totalCount: 1, cards: [makeVariant('Energy', 'Energy', 1, { id: '3' })] },
    Pikachu: { totalCount: 1, cards: [makeVariant('Pikachu', 'Pokémon', 1, { id: '1' })] },
    Switch: { totalCount: 1, cards: [makeVariant('Switch', 'Trainer', 1, { id: '2' })] },
  };

  const sorted = getSortedDeckCardArray(deck);
  assert.deepEqual(sorted.map((card) => card.supertype), ['Pokémon', 'Trainer', 'Energy']);
});

test('uniqueDeckCards returns each record once in deck order, skipping entries with no data or id', () => {
  const pikachu = { id: 'sv01-001', name: 'Pikachu' };
  const switchCard = { id: 'sv01-010', name: 'Switch' };
  const deck = {
    Pikachu: {
      totalCount: 4,
      cards: {
        a: { data: pikachu, count: 2 },
        missingData: { count: 1 },
        noId: { data: { name: 'Nameless' }, count: 1 },
        reprint: { data: { id: 'sv01-001', name: 'Pikachu reprint' }, count: 1 },
      },
    },
    Switch: { totalCount: 1, cards: [{ data: switchCard, count: 1 }] },
  };

  const records = uniqueDeckCards(deck);

  assert.deepEqual(
    records.map((record) => record.id),
    ['sv01-001', 'sv01-010']
  );
  assert.equal(records[0], pikachu);
  assert.equal(records[1], switchCard);
});

test('uniqueDeckCards returns an empty array for a missing or empty deck', () => {
  assert.deepEqual(uniqueDeckCards(undefined), []);
  assert.deepEqual(uniqueDeckCards({}), []);
});
