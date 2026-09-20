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

// Word-form energy type ("Basic Lightning Energy", from Thundurus' Charge):
// the printed type word stands in for the {L} glyph. Without it every energy
// card matched and the whole deck was offered.
test('word-form typed energy search filters by type', () => {
  const lightning = { name: 'Lightning Energy', supertype: 'Energy', type: 'Energy' };
  const water = { name: 'Water Energy', supertype: 'Energy', type: 'Energy' };
  const fire = { name: 'Fire Energy', supertype: 'Energy', type: 'Energy' };
  const trainer = { name: 'Professor Research', supertype: 'Trainer', type: 'Trainer' };

  assert.equal(matchesSearch(lightning, 'Basic Lightning Energy'), true);
  assert.equal(matchesSearch(water, 'Basic Lightning Energy'), false);
  assert.equal(matchesSearch(fire, 'Basic Lightning Energy'), false);
  assert.equal(matchesSearch(trainer, 'Basic Lightning Energy'), false);

  assert.equal(matchesSearch(water, 'Basic Water Energy'), true);
  assert.equal(matchesSearch(lightning, 'Basic Water Energy'), false);

  // A special energy must not satisfy a "Basic <type> Energy" search.
  const special = {
    name: 'Speed Lightning Energy',
    supertype: 'Energy',
    type: 'Energy',
    subtypes: ['special'],
  };
  assert.equal(matchesSearch(special, 'Basic Lightning Energy'), false);
});
