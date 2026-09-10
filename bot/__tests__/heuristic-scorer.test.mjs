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

// ── S86: playTrainer tier + the inert-Trainer guard ──────────────────────────
// The scorer shipped with no `playTrainer` branch at all (the priority list in
// design 004 omitted it), so a real 60-card deck — half of it Trainers — passed
// instead of playing them: 264 passes / 0 Trainers across 25 turns.

test('plays a Trainer over attaching, attacking or passing', () => {
  const observation = {
    self: {
      active: activePokemon(),
      bench: [activePokemon({ name: 'Pikachu' })],
      hand: [
        { index: 0, name: "Professor's Research", supertype: 'Trainer' },
        { index: 1, name: 'Water Energy', supertype: 'Energy' },
      ],
    },
    opp: { active: activePokemon() },
    options: [
      { kind: 'attach', handIndex: 1, targetZone: 'active', targetIndex: 0 },
      { kind: 'playTrainer', handIndex: 0 },
      { kind: 'attack', attackIndex: 0 },
      { kind: 'pass' },
    ],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.deepEqual(decide(observation, scorer), { kind: 'playTrainer', handIndex: 0 });
});

test('playBasic still outranks playTrainer (board development first)', () => {
  const observation = {
    self: {
      active: activePokemon(),
      bench: [],
      hand: [
        { index: 0, name: "Professor's Research", supertype: 'Trainer' },
        { index: 1, name: 'Charmander', supertype: 'Pokémon' },
      ],
    },
    opp: { active: activePokemon() },
    options: [
      { kind: 'playTrainer', handIndex: 0 },
      { kind: 'playBasic', handIndex: 1, targetZone: 'bench' },
      { kind: 'pass' },
    ],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.equal(decide(observation, scorer).kind, 'playBasic');
});

test('skips a Trainer the runner marked inert this turn, and still acts', () => {
  const observation = {
    self: {
      active: activePokemon(),
      bench: [activePokemon({ name: 'Pikachu' })],
      hand: [
        { index: 0, name: 'Unimplemented Stadium', supertype: 'Trainer' },
        { index: 1, name: 'Water Energy', supertype: 'Energy' },
      ],
    },
    opp: { active: activePokemon() },
    options: [
      { kind: 'playTrainer', handIndex: 0 },
      { kind: 'attach', handIndex: 1, targetZone: 'active', targetIndex: 0 },
      { kind: 'pass' },
    ],
    triedThisTurn: ['playTrainer:Unimplemented Stadium'],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.equal(decide(observation, scorer).kind, 'attach');
});

test('an inert Trainer keyed by name survives the hand index shifting under it', () => {
  const observation = {
    self: {
      active: activePokemon(),
      bench: [activePokemon({ name: 'Pikachu' })],
      // The card that was at index 0 last action is now at index 2.
      hand: [
        { index: 0, name: 'Water Energy', supertype: 'Energy' },
        { index: 1, name: 'Charmander', supertype: 'Pokémon' },
        { index: 2, name: 'Unimplemented Stadium', supertype: 'Trainer' },
      ],
    },
    opp: { active: activePokemon() },
    options: [
      { kind: 'playTrainer', handIndex: 2 },
      { kind: 'pass' },
    ],
    triedThisTurn: ['playTrainer:Unimplemented Stadium'],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  assert.equal(decide(observation, scorer).kind, 'pass');
});

test('exclusions never strand the bot: pass survives even when everything is tried', () => {
  const observation = {
    self: { active: activePokemon(), bench: [], hand: [{ index: 0, name: 'Judge', supertype: 'Trainer' }] },
    opp: { active: activePokemon() },
    options: [{ kind: 'playTrainer', handIndex: 0 }, { kind: 'pass' }],
    triedThisTurn: ['playTrainer:Judge'],
  };
  const scorer = createHeuristicScorer({ rng: deterministicRng });
  const choice = decide(observation, scorer);
  assert.equal(choice.kind, 'pass');
});

test('optionKey is name-keyed for Trainers and kind-keyed for everything else', async () => {
  const { optionKey } = await import('../heuristic-scorer.mjs');
  const observation = { self: { hand: [{ index: 0, name: 'Boss’s Orders', supertype: 'Trainer' }] } };
  assert.equal(
    optionKey({ kind: 'playTrainer', handIndex: 0 }, observation),
    'playTrainer:Boss’s Orders'
  );
  assert.equal(optionKey({ kind: 'attack', attackIndex: 0 }, observation), 'attack');
});
