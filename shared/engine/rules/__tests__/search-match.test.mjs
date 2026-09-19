import test from 'node:test';
import assert from 'node:assert/strict';

const { matchesSearch } = await import('../search-match.mjs');

const card = (props) => ({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...props });

// Gap #16: Radiant and V-UNION carry a Rule Box, so they must be excluded by a
// "without a Rule Box" search (the old prizes>1 heuristic wrongly included them).
test('rule-box search: Radiant and V-UNION have a Rule Box', () => {
  const radiant = card({ name: 'Radiant Greninja' });
  const vunion = card({ name: 'Mewtwo V-UNION', hp: 310 });
  const plain = card({ name: 'Pikachu', hp: 60 });

  assert.equal(matchesSearch(radiant, 'Pokémon without a Rule Box'), false);
  assert.equal(matchesSearch(radiant, 'Pokémon with a Rule Box'), true);
  assert.equal(matchesSearch(vunion, 'Pokémon without a Rule Box'), false);
  assert.equal(matchesSearch(vunion, 'Pokémon with a Rule Box'), true);
  assert.equal(matchesSearch(plain, 'Pokémon without a Rule Box'), true);
  assert.equal(matchesSearch(plain, 'Pokémon with a Rule Box'), false);

  // A plain name ending in the letters "ex" (Toxapex) must not be treated as a
  // Rule Box ex by the bare `endsWith('ex')` fallback.
  const toxapex = card({ name: 'Toxapex', hp: 130 });
  assert.equal(matchesSearch(toxapex, 'Pokémon without a Rule Box'), true);
  assert.equal(matchesSearch(toxapex, 'Pokémon with a Rule Box'), false);
});
