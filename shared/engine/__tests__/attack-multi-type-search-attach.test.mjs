import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

// Source: TCGdex sv07-050 Joltik, Jolting Charge.
test('Jolting Charge searches Grass then Lightning, 2 each', () => {
  const text =
    'Search your deck for up to 2 Basic {G} Energy cards and up to 2 Basic {L} Energy cards and attach them to your Pokémon in any way you like. Then, shuffle your deck.';
  const { after, handlesSearch } = parseAttackSteps(text, { selfName: 'Joltik' });
  assert.equal(handlesSearch, true);
  assert.deepEqual(
    after.map((s) => [s.type, s.what, s.count, s.destination]),
    [
      ['searchAbility', 'Basic {G} Energy', 2, 'attach'],
      ['searchAbility', 'Basic {L} Energy', 2, 'attach'],
    ]
  );
});
