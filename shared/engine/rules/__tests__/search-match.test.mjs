import test from 'node:test';
import assert from 'node:assert/strict';

const { matchesSearch, matchesDiscardCost, isEnergyDiscardCost } = await import('../search-match.mjs');

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

// Discard-cost filtering. An Energy-scoped ability cost (Mortal Shuriken et al.)
// must offer only the printed Energy; a plain hand-discard cost must not hide
// non-Energy cards behind an Energy filter.
test('matchesDiscardCost: Energy-scoped cost matches only the printed Energy', () => {
  const water = { name: 'Water Energy', supertype: 'Energy', type: 'Energy' };
  const fire = { name: 'Fire Energy', supertype: 'Energy', type: 'Energy' };
  const trainer = { name: 'Professor Research', supertype: 'Trainer', type: 'Trainer' };
  const mon = { name: 'Froakie', supertype: 'Pokémon', type: 'Pokémon', hp: 70 };
  const step = { energyOnly: true, basicOnly: true, energyTypes: ['water'] };

  assert.equal(isEnergyDiscardCost(step), true);
  assert.equal(matchesDiscardCost(water, step), true);
  assert.equal(matchesDiscardCost(fire, step), false);
  assert.equal(matchesDiscardCost(trainer, step), false);
  assert.equal(matchesDiscardCost(mon, step), false);
});

test('matchesDiscardCost: explicit energyOnly:false accepts any hand card', () => {
  // "Gather Materials": discard a card, draw 3 — but the card text also names
  // Energy (in its attack), so basic/energyType are set on the same step.
  const step = { basic: true, energyType: 'psychic', energyOnly: false };
  const trainer = { name: 'Professor Research', supertype: 'Trainer', type: 'Trainer' };
  const mon = { name: 'Froakie', supertype: 'Pokémon', type: 'Pokémon', hp: 70 };
  const fire = { name: 'Fire Energy', supertype: 'Energy', type: 'Energy' };

  assert.equal(isEnergyDiscardCost(step), false);
  assert.equal(matchesDiscardCost(trainer, step), true);
  assert.equal(matchesDiscardCost(mon, step), true);
  assert.equal(matchesDiscardCost(fire, step), true);
});

test('matchesDiscardCost: plain trainer cost (no filter fields) accepts any card', () => {
  const step = { type: 'discardCost', count: 2 };
  const trainer = { name: 'Professor Research', supertype: 'Trainer', type: 'Trainer' };
  const water = { name: 'Water Energy', supertype: 'Energy', type: 'Energy' };

  assert.equal(isEnergyDiscardCost(step), false);
  assert.equal(matchesDiscardCost(trainer, step), true);
  assert.equal(matchesDiscardCost(water, step), true);
});

test('matchesDiscardCost: untyped Energy-only cost matches any Energy', () => {
  const step = { energyOnly: true };
  const water = { name: 'Water Energy', supertype: 'Energy', type: 'Energy' };
  const trainer = { name: 'Professor Research', supertype: 'Trainer', type: 'Trainer' };

  assert.equal(isEnergyDiscardCost(step), true);
  assert.equal(matchesDiscardCost(water, step), true);
  assert.equal(matchesDiscardCost(trainer, step), false);
});
