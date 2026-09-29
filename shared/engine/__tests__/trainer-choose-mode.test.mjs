// Kieran (corpus out/pkmn-trainer-cards.json: TWM 154/206/218, PRE 113/174): "Choose 1: • Switch
// your Active Pokémon with 1 of your Benched Pokémon. • During this turn, attacks used by your
// Pokémon do 30 more damage to your opponent's Active Pokémon ex and Active Pokémon V".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { turnDamageBonusTotal } from '../rules/turn-damage-bonus.mjs';

const KIERAN =
  'Choose 1: • Switch your Active Pokémon with 1 of your Benched Pokémon. • During this turn, attacks used by your Pokémon do 30 more damage to your opponent’s Active Pokémon ex and Active Pokémon V (before applying Weakness and Resistance).';

function game({ bench = true } = {}) {
  const state = createGameState({ gameId: 'kieran', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const mon = (instanceId, name) =>
    createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', stage: 'Basic' });
  state.players.p1.zones.active.push(mon(1, 'Active A'));
  if (bench) state.players.p1.zones.bench.push(mon(2, 'Bench B'));
  return state;
}

function play(state, selection, first) {
  return executeSteps(state, {
    steps: first ? first.pendingChoice.resumeToken.steps : parseTrainerEffect(KIERAN).steps,
    fromStepIndex: first ? first.pendingChoice.resumeToken.stepIndex : 0,
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: createRng(3),
    events: [],
    selection,
    context: first ? first.pendingChoice.resumeToken.context : {},
    sourceCard: createCard({ instanceId: 900, name: 'Kieran', supertype: 'Trainer' }),
  });
}

test('Kieran parses to two modes: switch, and a turn damage bonus', () => {
  const { steps } = parseTrainerEffect(KIERAN);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].type, 'chooseMode');
  assert.deepEqual(steps[0].modes.map((m) => m.steps[0].type), ['switchOwn', 'turnDamageBonusTrainer']);
});

test('Kieran offers both modes and applies only the damage bonus when chosen', () => {
  const state = game();
  const first = play(state);
  assert.deepEqual(first.pendingChoice.options.map((o) => o.instanceId), [1, 2]);
  assert.equal(state.players.p1.flags.turnDamageBonuses, undefined);
  play(state, [2], first);
  const bonuses = state.players.p1.flags.turnDamageBonuses;
  assert.equal(bonuses.length, 1);
  assert.equal(state.players.p1.zones.active[0].instanceId, 1, 'no switch happened');
  const ex = createCard({ instanceId: 5, name: 'Target ex', supertype: 'Pokémon', subtypes: ['ex'] });
  const plain = createCard({ instanceId: 6, name: 'Target', supertype: 'Pokémon' });
  assert.equal(turnDamageBonusTotal(bonuses, state.players.p1.zones.active[0], ex), 30);
  assert.equal(turnDamageBonusTotal(bonuses, state.players.p1.zones.active[0], plain), 0);
});

test('Kieran switch mode switches (sole Benched Pokémon needs no pick) and adds no bonus', () => {
  const state = game();
  const first = play(state);
  const second = play(state, [1], first);
  assert.equal(second.pendingChoice, null);
  assert.equal(state.players.p1.zones.active[0].instanceId, 2);
  assert.equal(state.players.p1.flags.turnDamageBonuses, undefined);
});

test('Kieran with an empty Bench skips the prompt and applies the damage bonus', () => {
  const state = game({ bench: false });
  const res = play(state);
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.flags.turnDamageBonuses.length, 1);
});
