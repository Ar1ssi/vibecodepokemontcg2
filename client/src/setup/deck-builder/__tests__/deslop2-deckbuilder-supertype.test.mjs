import test from 'node:test';
import assert from 'node:assert/strict';

import { compareCardsBySupertype } from '../core/card-sort.mjs';
import { pokemonSpriteForName } from '../core/card-sprites.mjs';
import { deckVariants } from '../core/deck-variants.mjs';
import { filterDeck, getDeckCounts } from '../core/deck-state.mjs';
import { parseSupertype } from '../core/supertype.mjs';

test('parseSupertype reads either spelling and any case, and names unknowns as null', () => {
  assert.deepEqual(['Pokémon', 'Pokemon', 'POKÉMON', 'trainer', ' Energy '].map(parseSupertype), [
    'pokemon', 'pokemon', 'pokemon', 'trainer', 'energy',
  ]);
  assert.deepEqual([undefined, '', 'Stadium'].map(parseSupertype), [null, null, null]);
});

test('sorting, counting and filtering agree on one reading of the supertype', () => {
  const deck = {
    A: { cards: [{ data: { supertype: 'Pokemon' }, count: 2 }], totalCount: 2 },
    B: { cards: [{ data: { supertype: 'trainer' }, count: 3 }], totalCount: 3 },
    C: { cards: [{ data: { supertype: 'Mystery' }, count: 1 }], totalCount: 1 },
  };
  assert.deepEqual(getDeckCounts(deck), { pokemon: 2, trainer: 3, energy: 0, total: 6 });
  assert.deepEqual(Object.keys(filterDeck(deck, { pokemon: true, trainer: false, energy: false })), ['A']);
  assert.equal(compareCardsBySupertype({ supertype: 'Pokemon' }, { supertype: 'Trainer' }), -1);
  assert.equal(compareCardsBySupertype({ supertype: 'Mystery' }, { supertype: 'Energy' }), 1);
});

test('an "EX" suffix in either case still picks the ex-only forms', () => {
  assert.equal(pokemonSpriteForName('Terapagos EX').slug, 'terapagos-terastal');
  assert.equal(pokemonSpriteForName('Palafin ex').slug, 'palafin-hero');
});

test('deckVariants flattens groups and ignores missing decks and groups', () => {
  assert.deepEqual(deckVariants(null), []);
  assert.deepEqual(deckVariants({ A: null, B: { cards: 'x' }, C: { cards: [{ count: 1 }, { count: 2 }] } }), [
    { count: 1 },
    { count: 2 },
  ]);
});
