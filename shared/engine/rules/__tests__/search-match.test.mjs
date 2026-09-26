import test from 'node:test';
import assert from 'node:assert/strict';

const { matchesSearch, matchesDiscardCost, isEnergyDiscardCost, energySearchWhat } = await import(
  '../search-match.mjs'
);

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

// Dragon/Fairy typed energy searches (audit S&M F1). ENERGY_SYMBOL_TO_TYPE used
// to omit {N}/{Y}, so every "Basic {N}/{Y} Energy" search matched nothing
// (Mina LOT 183 searched a Fairy Energy and attached zero).
test('typed energy search covers Dragon and Fairy symbols', () => {
  const fairy = { name: 'Fairy Energy', supertype: 'Energy', type: 'Energy', types: ['Fairy'] };
  const fairyNoTypes = { name: 'Fairy Energy', supertype: 'Energy', type: 'Energy' };
  const dragon = { name: 'Dragon Energy', supertype: 'Energy', type: 'Energy', types: ['Dragon'] };
  const water = { name: 'Water Energy', supertype: 'Energy', type: 'Energy', types: ['Water'] };
  const special = {
    name: 'Wonderous Fairy Energy',
    supertype: 'Energy',
    type: 'Energy',
    subtypes: ['special'],
  };

  assert.equal(energySearchWhat({ basic: true, energyType: 'fairy' }), 'Basic {Y} Energy');
  assert.equal(matchesSearch(fairy, 'Basic {Y} Energy'), true);
  assert.equal(matchesSearch(fairyNoTypes, 'Basic {Y} Energy'), true);
  assert.equal(matchesSearch(water, 'Basic {Y} Energy'), false);
  assert.equal(matchesSearch(special, 'Basic {Y} Energy'), false);

  assert.equal(energySearchWhat({ basic: true, energyType: 'dragon' }), 'Basic {N} Energy');
  assert.equal(matchesSearch(dragon, 'Basic {N} Energy'), true);
  assert.equal(matchesSearch(water, 'Basic {N} Energy'), false);
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

// A typed Basic search still has to honour its HP cap (Fan Call: "up to 3 {C}
// Pokémon with 100 HP or less"). The type-symbol branch used to return before
// the HP-cap branch, so every over-cap Colorless Pokémon matched.
test('typed Basic search applies the HP cap', () => {
  const underCap = { name: 'Fan Rotom', type: 'Pokémon', stage: 'Basic', types: ['Colorless'], hp: 70 };
  const overCap = { name: 'Snorlax', type: 'Pokémon', stage: 'Basic', types: ['Colorless'], hp: 150 };
  const wrongType = { name: 'Charmander', type: 'Pokémon', stage: 'Basic', types: ['Fire'], hp: 70 };
  const what = 'Basic {C} Pokémon ≤100 HP';

  assert.equal(matchesSearch(underCap, what), true);
  assert.equal(matchesSearch(overCap, what), false);
  assert.equal(matchesSearch(wrongType, what), false);

  const overCapWord = { name: 'Snorlax', type: 'Pokémon', stage: 'Basic', types: ['Colorless'], hp: 150 };
  assert.equal(matchesSearch(overCapWord, 'Basic {C} Pokémon with 100 HP or less'), false);
  assert.equal(matchesSearch(underCap, 'Basic {C} Pokémon with 100 HP or less'), true);
});

// Deck rows / oracle-harness cards can carry the Pokémon marker on `supertype`
// (or only `hp`) rather than `type`, which used to make typed Basic searches
// miss every real card.
test('typed Basic search accepts supertype/hp Pokémon markers and stage casing', () => {
  const row = { name: 'Fan Rotom', supertype: 'Pokémon', stage: 'basic', types: ['Colorless'], hp: 70 };
  assert.equal(matchesSearch(row, 'Basic {C} Pokémon ≤100 HP'), true);
  const hpOnly = { name: 'Fan Rotom', stage: 'Basic', types: ['Colorless'], hp: 70 };
  assert.equal(matchesSearch(hpOnly, 'Basic {C} Pokémon ≤100 HP'), true);
  const energy = { name: 'Basic Water Energy', supertype: 'Energy', type: 'Energy' };
  assert.equal(matchesSearch(energy, 'Basic {C} Pokémon ≤100 HP'), false);
});

test('Cherish Ball (UNM 191, pkmncards): "a Pokémon-GX" matches only GX Pokémon', async () => {
  const { parseSearchDeckParams } = await import('../trainer-effects.mjs');
  const step = parseSearchDeckParams(
    'search your deck for a pokémon-gx, reveal it, and put it into your hand. then, shuffle your deck.'
  );
  assert.equal(step.what, 'Pokémon-GX');
  assert.equal(matchesSearch({ name: 'Necrozma-GX', hp: 190 }, step.what), true);
  assert.equal(matchesSearch({ name: 'Pikachu', hp: 60 }, step.what), false);
  assert.equal(matchesSearch({ name: 'Ultra Ball', type: 'Item' }, step.what), false);
});
