// Sky Field (customhb-485 printed text, user's scan): "All Active non-{C} Pokémon have their
// attacks cost {C} more" — Colorless Pokémon must NOT be taxed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStadiumAttackCostIncreaseFor, stadiumFilterMatches } from '../stadium-effects.mjs';

const SKY_FIELD = {
  name: 'Sky Field',
  text: 'All Active non-{C} Pokémon have their attacks cost {C} more',
};
const mon = (name, ...types) => ({ name, types });

test('non-{C} stadium taxes non-Colorless Pokémon', () => {
  assert.equal(getStadiumAttackCostIncreaseFor(mon('Charmander', 'Fire'), 'p1', SKY_FIELD, 'p2'), 1);
  assert.equal(getStadiumAttackCostIncreaseFor(mon('Squirtle', 'Water'), 'p2', SKY_FIELD, 'p2'), 1);
});

test('non-{C} stadium does not tax Colorless Pokémon', () => {
  assert.equal(getStadiumAttackCostIncreaseFor(mon('Snorlax', 'Colorless'), 'p1', SKY_FIELD, 'p2'), 0);
  assert.equal(getStadiumAttackCostIncreaseFor(mon('Snorlax', 'Colorless'), 'p2', SKY_FIELD, 'p2'), 0);
});

test('non-{D} filter excludes Darkness, still requires {C} for positive wording', () => {
  const nonD = { name: 'X', text: 'Active non-{D} Pokémon have their attacks cost {C} more' };
  assert.equal(stadiumFilterMatches(mon('Umbreon', 'Darkness'), nonD), false);
  assert.equal(stadiumFilterMatches(mon('Eevee', 'Colorless'), nonD), true);
  const posC = { name: 'Y', text: '{C} Pokémon have their attacks cost {C} more' };
  assert.equal(stadiumFilterMatches(mon('Charmander', 'Fire'), posC), false);
  assert.equal(stadiumFilterMatches(mon('Snorlax', 'Colorless'), posC), true);
});
