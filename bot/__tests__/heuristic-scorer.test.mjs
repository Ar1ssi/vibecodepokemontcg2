// Design 004 slice 5 acceptance: heuristic scorer over recorded observe()+options()
// fixtures — empty bench => benches a Basic; lethal attack available => attacks
// (highest damage among attack options); no legal option => the bot scaffold
// (not this scorer) passes, never throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHeuristicScorer } from '../heuristic-scorer.mjs';
import { decide } from '../bot.mjs';

const deterministicRng = () => 0;

function activePokemon(overrides = {}) {
  return {
    name: 'Squirtle',
    hp: 60,
    damage: 0,
    stage: 'Basic',
    types: ['Water'],
    specialCondition: null,
    attachedEnergy: [],
    attacks: [{ index: 0, name: 'Tackle', cost: ['Water'], damage: '20' }],
    ...overrides,
  };
}

test('benches a Basic over passing/attacking when the bench is empty', () => {
  const observation = {
    self: { active: activePokemon(), bench: [], hand: [{ index: 0, name: 'Charmander', supertype: 'Pokémon' }] },
    opp: { active: activePokemon() },
    options: [
      { kind: 'playBasic', handIndex: 0, targetZone: 'bench' },
      { kind: 'attack', attackIndex: 0 },
      { kind: 'pass' },
    ],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  const choice = decide(observation, scorer);
  assert.deepEqual(choice, { kind: 'playBasic', handIndex: 0, targetZone: 'bench' });
});

test('attacks when a lethal attack is available and nothing outranks it', () => {
  const observation = {
    self: { active: activePokemon(), bench: [] },
    opp: { active: activePokemon({ hp: 60, damage: 40 }) },
    options: [{ kind: 'attack', attackIndex: 0 }, { kind: 'retreat', benchIndex: 0 }, { kind: 'pass' }],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.deepEqual(decide(observation, scorer), { kind: 'attack', attackIndex: 0 });
});

test('among multiple attacks, picks the highest-damage one', () => {
  const active = activePokemon({
    attachedEnergy: ['Water', 'Water'],
    attacks: [
      { index: 0, name: 'Tackle', cost: ['Water'], damage: '20' },
      { index: 1, name: 'Hydro Pump', cost: ['Water', 'Water'], damage: '60' },
    ],
  });
  const observation = {
    self: { active, bench: [] },
    opp: { active: activePokemon() },
    options: [
      { kind: 'attack', attackIndex: 0 },
      { kind: 'attack', attackIndex: 1 },
      { kind: 'pass' },
    ],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.deepEqual(decide(observation, scorer), { kind: 'attack', attackIndex: 1 });
});

test('prefers attaching to the active Pokémon when it has an unmet attack cost', () => {
  const active = activePokemon({ attachedEnergy: [], attacks: [{ index: 0, name: 'Tackle', cost: ['Water', 'Water'], damage: '20' }] });
  const observation = {
    self: { active, bench: [{ name: 'Bench Mon' }] },
    opp: { active: activePokemon() },
    options: [
      { kind: 'attach', handIndex: 0, targetZone: 'bench', targetIndex: 0 },
      { kind: 'attach', handIndex: 0, targetZone: 'active', targetIndex: 0 },
      { kind: 'pass' },
    ],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.deepEqual(decide(observation, scorer), {
    kind: 'attach',
    handIndex: 0,
    targetZone: 'active',
    targetIndex: 0,
  });
});

test('no legal option => bot scaffold passes, never throws', () => {
  const observation = { self: { active: null, bench: [] }, opp: { active: null }, options: [] };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.doesNotThrow(() => decide(observation, scorer));
  assert.deepEqual(decide(observation, scorer), { kind: 'pass' });
});

test('falls back to pass when only pass is legal', () => {
  const observation = { self: { active: null, bench: [] }, opp: { active: null }, options: [{ kind: 'pass' }] };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.deepEqual(decide(observation, scorer), { kind: 'pass' });
});
