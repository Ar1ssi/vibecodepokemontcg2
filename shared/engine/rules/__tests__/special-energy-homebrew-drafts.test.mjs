import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  failedSpecialEnergyRestriction,
  getSpecialEnergyStatusImmunity,
  parseSpecialEnergyEffects,
  planSpecialEnergyTriggers,
} from '../special-energy-parse.mjs';

// Draft wordings from .agent/scratch/customhb-card-drafts.md (design 091); the printed models are
// Reversal Energy (Paradox Rift 266), Capture Energy (Darkness Ablaze 201) and Therapeutic Energy
// (Paldea Evolved 193), out/pkmn-special-energy-cards.json.
const PROVIDES_C = 'As long as this card is attached to a Pokémon, it provides {C} Energy.\n\n';
const energy = (name, rest) => ({ name, type: 'Energy', category: 'Energy', energyType: 'Special', effect: PROVIDES_C + rest });

const UNDERDOG = energy(
  'Underdog Energy',
  "If you have more Prize cards remaining than your opponent, and if this card is attached to an Evolution Pokémon that doesn't have a Rule Box (Pokémon ex, Pokémon V, etc. have Rule Boxes), this card provides every type of Energy but provides only 2 Energy at a time."
);
const RALLY = energy(
  'Rally Energy',
  'When you attach this card from your hand to 1 of your Pokémon, you may search your deck for a Basic Pokémon with 70 HP or less and put it onto your Bench. Then, shuffle your deck.'
);
const REMEDY = energy(
  'Remedy Energy',
  "The Pokémon this card is attached to recovers from being Burned and Poisoned and can't be affected by those Special Conditions."
);
const RANGER = energy(
  'Ranger Energy',
  "This card can only be attached to a Ranger's Pokémon. If this card is attached to anything other than a Ranger's Pokémon, discard this card."
);

const provideSteps = (card) => parseSpecialEnergyEffects(card).steps.filter((s) => s.type === 'provide');

test('a Reversal-style condition before "provides" survives the "etc." reminder (Underdog)', () => {
  assert.deepEqual(provideSteps(UNDERDOG), [
    { type: 'provide', energyTypes: ['Colorless'], count: 1 },
    { type: 'provide', energyTypes: ['Any'], count: 2, condition: 'trailingPrizesEvolutionNoRuleBox' },
  ]);
});

test('"you may search" on attach is an optional Bench search with the HP limit (Rally)', () => {
  const step = parseSpecialEnergyEffects(RALLY).steps.find((s) => s.type === 'onAttachSearch');
  assert.deepEqual(step, { type: 'onAttachSearch', what: 'Basic Pokémon ≤70 HP', count: 1, destination: 'bench', hostType: undefined });
  const plans = planSpecialEnergyTriggers(RALLY, { trigger: 'attach', fromZone: 'hand', host: { name: 'Pikachu' } });
  assert.deepEqual(plans.map((p) => [p.action, p.what, p.destination]), [['search', 'Basic Pokémon ≤70 HP', 'bench']]);
});

test('a listed "recovers from being … and can\'t be affected" immunity reads every named condition', () => {
  const host = { instanceId: 'h1', name: 'Pikachu' };
  const attached = { ...REMEDY, instanceId: 'e1', attachedTo: 'h1' };
  assert.deepEqual([...getSpecialEnergyStatusImmunity(host, [attached])].sort(), ['Burned', 'Poisoned']);
  const therapeutic = energy(
    'Therapeutic Energy',
    "The Pokémon this card is attached to recovers from being Asleep, Confused, or Paralyzed and can't be affected by those Special Conditions."
  );
  const steps = parseSpecialEnergyEffects(therapeutic).steps.filter((s) => s.type === 'statusImmunity');
  assert.deepEqual(steps, [{ type: 'statusImmunity', conditions: ['Asleep', 'Confused', 'Paralyzed'] }]);
});

test("an owner restriction keeps the Energy only on that owner's Pokémon (Ranger Energy)", () => {
  const step = parseSpecialEnergyEffects(RANGER).steps.find((s) => s.type === 'attachRestriction');
  assert.deepEqual(step, { type: 'attachRestriction', kind: 'owner', owner: 'ranger', discardIfNot: true });
  assert.equal(failedSpecialEnergyRestriction(RANGER, { name: "Ranger's Luxio" }), null);
  assert.deepEqual(failedSpecialEnergyRestriction(RANGER, { name: 'Luxio' }), { kind: 'owner', discardIfNot: true });
  assert.deepEqual(failedSpecialEnergyRestriction(RANGER, { name: "Team Rocket's Luxio" }), { kind: 'owner', discardIfNot: true });
  assert.deepEqual(failedSpecialEnergyRestriction(RANGER, { name: 'Rangers Luxio' }), { kind: 'owner', discardIfNot: true });
});
