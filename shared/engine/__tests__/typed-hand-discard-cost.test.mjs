import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { matchesSearch } from '../rules/search-match.mjs';

// Corpus: out/pkmn-trainer-cards.json — Team Plasma Grunt (Plasma Storm 125), Fiery Torch,
// Engineer's Adjustments.
test('Team Plasma Grunt opens a Team Plasma discard cost before drawing', () => {
  const { steps } = parseTrainerEffect(
    'Discard a Team Plasma card from your hand. (If you can’t discard a Team Plasma card, you can’t play this card.) Draw 4 cards.'
  );
  assert.deepEqual(steps, [
    { type: 'discardCost', count: 1, what: 'team plasma card' },
    { type: 'draw', count: 4 },
  ]);
});

test('typed Energy hand-discard costs are parsed', () => {
  assert.equal(parseTrainerEffect('Discard an Energy card from your hand. Then, draw 4 cards.').steps[0].what, 'energy card');
  assert.equal(parseTrainerEffect('Discard a {R} Energy card from your hand. Draw 3 cards.').steps[0].what, '{r} energy card');
});

test('cost filter accepts Team Plasma cards only', () => {
  assert.equal(matchesSearch({ name: 'Team Plasma Grunt', type: 'Supporter', subtypes: ['Team Plasma'] }, 'team plasma card'), true);
  assert.equal(matchesSearch({ name: 'Professor Juniper', type: 'Supporter' }, 'team plasma card'), false);
});
