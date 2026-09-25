import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckCardIds, warmDeckCardCache } from '../core/deck-card-warm.mjs';

const deck = {
  'Groudon-EX': {
    cards: [
      { count: 2, data: { id: 'xy5-85' } },
      { count: 1, data: { id: 'xy5-150' } },
    ],
  },
  'Groudon Spirit Link': { cards: [{ count: 2, data: { id: 'xy5-137' } }] },
  Broken: { cards: [{ count: 1, data: {} }, null] },
  Dupe: { cards: [{ count: 1, data: { id: 'xy5-85' } }] },
};

test('deckCardIds lists each card id once and skips entries without one', () => {
  assert.deepEqual(deckCardIds(deck), ['xy5-85', 'xy5-150', 'xy5-137']);
  assert.deepEqual(deckCardIds(null), []);
});

test('warmDeckCardCache fetches every id and survives failures', async () => {
  const seen = [];
  const count = await warmDeckCardCache(deck, async (id) => {
    seen.push(id);
    if (id === 'xy5-150') throw new Error('blocked');
  });
  assert.equal(count, 3);
  assert.deepEqual(seen.sort(), ['xy5-137', 'xy5-150', 'xy5-85']);
});
