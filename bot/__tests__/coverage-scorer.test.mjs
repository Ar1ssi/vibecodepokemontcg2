// Design 004 / S86: the coverage scorer exists to exercise mechanics, not to play
// well. These tests pin the three behaviours that distinguish it from the heuristic
// scorer: abilities/Stadiums get taken as soon as they are legal, turn-ending moves
// are held back so a turn is more than one action, and repeats lose to novelty.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCoverageScorer, coverageKey } from '../coverage-scorer.mjs';
import { decide } from '../bot.mjs';

const rng = () => 0;

function pokemon(overrides = {}) {
  return {
    name: 'Squirtle',
    hp: 60,
    damage: 0,
    stage: 'Basic',
    types: ['Water'],
    specialCondition: null,
    attachedEnergy: ['Water'],
    attacks: [{ index: 0, name: 'Tackle', cost: ['Water'], damage: '20' }],
    ...overrides,
  };
}

function observation({ options, hand = [], bench = [pokemon({ name: 'Pikachu' })], exercised = [] }) {
  return {
    self: { active: pokemon(), bench, hand },
    opp: { active: pokemon() },
    options,
    exercised,
  };
}

test('takes an ability the moment it is legal, over attacking or passing', () => {
  const obs = observation({
    options: [
      { kind: 'attack', attackIndex: 0 },
      { kind: 'ability', zone: 'bench', index: 0, abilityIndex: 0 },
      { kind: 'pass' },
    ],
  });
  assert.equal(decide(obs, createCoverageScorer({ rng })).kind, 'ability');
});

test('plays a Stadium/Trainer over attacking', () => {
  const obs = observation({
    hand: [{ index: 0, name: 'Artazon', supertype: 'Trainer' }],
    options: [
      { kind: 'attack', attackIndex: 0 },
      { kind: 'playTrainer', handIndex: 0 },
      { kind: 'pass' },
    ],
  });
  assert.equal(decide(obs, createCoverageScorer({ rng })).kind, 'playTrainer');
});

test('prefers an unexercised mechanic over one already used this game', () => {
  const obs = observation({
    hand: [
      { index: 0, name: 'Water Energy', supertype: 'Energy' },
      { index: 1, name: 'Nest Ball', supertype: 'Trainer' },
    ],
    options: [
      { kind: 'attach', handIndex: 0, targetZone: 'active' },
      { kind: 'playTrainer', handIndex: 1 },
      { kind: 'pass' },
    ],
    // attach already done twice this game; the Trainer never.
    exercised: ['attach:Water Energy:active', 'attach:Water Energy:active'],
  });
  assert.equal(decide(obs, createCoverageScorer({ rng })).kind, 'playTrainer');
});

test('prefers a second, different ability over re-using the first', () => {
  const obs = observation({
    bench: [pokemon({ name: 'Pikachu' }), pokemon({ name: 'Bulbasaur' })],
    options: [
      { kind: 'ability', zone: 'bench', index: 0, abilityIndex: 0 },
      { kind: 'ability', zone: 'bench', index: 1, abilityIndex: 0 },
      { kind: 'pass' },
    ],
    exercised: ['ability:bench:0:0'],
  });
  const choice = decide(obs, createCoverageScorer({ rng }));
  assert.deepEqual(choice, { kind: 'ability', zone: 'bench', index: 1, abilityIndex: 0 });
});

test('holds back attack until nothing developing is left, then attacks', () => {
  const developing = observation({
    hand: [{ index: 0, name: 'Charmander', supertype: 'Pokémon' }],
    options: [
      { kind: 'attack', attackIndex: 0 },
      { kind: 'playBasic', handIndex: 0, targetZone: 'bench' },
      { kind: 'pass' },
    ],
  });
  assert.equal(decide(developing, createCoverageScorer({ rng })).kind, 'playBasic');

  const spent = observation({
    options: [{ kind: 'attack', attackIndex: 0 }, { kind: 'pass' }],
  });
  assert.equal(decide(spent, createCoverageScorer({ rng })).kind, 'attack');
});

test('empty-bench guard still outranks everything, including a fresh ability', () => {
  const obs = observation({
    bench: [],
    hand: [{ index: 0, name: 'Charmander', supertype: 'Pokémon' }],
    options: [
      { kind: 'ability', zone: 'active', index: 0, abilityIndex: 0 },
      { kind: 'playBasic', handIndex: 0, targetZone: 'bench' },
      { kind: 'attack', attackIndex: 0 },
    ],
  });
  assert.equal(decide(obs, createCoverageScorer({ rng })).kind, 'playBasic');
});

test('honours the inert-Trainer guard and never strands the bot on pass', () => {
  const obs = observation({
    hand: [{ index: 0, name: 'Unimplemented Stadium', supertype: 'Trainer' }],
    options: [{ kind: 'playTrainer', handIndex: 0 }, { kind: 'pass' }],
  });
  obs.triedThisTurn = ['playTrainer:Unimplemented Stadium'];
  assert.equal(decide(obs, createCoverageScorer({ rng })).kind, 'pass');
});

test('coverageKey separates distinct mechanics and collapses repeats', () => {
  const obs = observation({ hand: [{ index: 0, name: 'Nest Ball', supertype: 'Trainer' }], options: [] });
  assert.equal(coverageKey({ kind: 'playTrainer', handIndex: 0 }, obs), 'playTrainer:Nest Ball');
  assert.equal(coverageKey({ kind: 'ability', zone: 'bench', index: 2 }, obs), 'ability:bench:2:0');
  assert.notEqual(
    coverageKey({ kind: 'attack', attackIndex: 0 }, obs),
    coverageKey({ kind: 'attack', attackIndex: 1 }, obs)
  );
});
