// A coinFlip branch that suspends on a pick must hand the parent's remaining steps to the resume
// token, so they still run once the pick is made.
// Old PC, Darkness Ablaze 164 (out/pkmn-trainer-cards.json): "Flip 2 coins. If both are heads, put
// a card from your discard pile into your hand." No printed card pairs a coin flip with a later
// step, so the trailing draw is appended by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng, flipCoin } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

const OLD_PC = 'Flip 2 coins. If both are heads, put a card from your discard pile into your hand.';

const bothHeads = (seed) => {
  const rng = createRng(seed);
  return flipCoin(rng) === 'heads' && flipCoin(rng) === 'heads';
};

function setup() {
  const state = createGameState({ gameId: 'coin-resume', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.discard.push(createCard({ instanceId: 1, name: 'Potion', supertype: 'Trainer' }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 2, name: 'Pikachu', supertype: 'Pokémon' }));
  return state;
}

test('a suspended coin branch still runs the steps after the flip when resumed', () => {
  const seed = Array.from({ length: 200 }, (_, i) => i + 1).find(bothHeads);
  const state = setup();
  const steps = [...parseTrainerEffect(OLD_PC).steps, { type: 'draw', count: 1 }];
  const args = { effectType: 'trainer', sourceCard: { name: 'Old PC' }, playerId: 'p1', activeRng: createRng(seed) };

  const first = executeSteps(state, { ...args, steps, events: [] });
  assert.ok(first.pendingChoice, 'heads branch asks which card to recover');

  const token = first.pendingChoice.resumeToken;
  const events = [];
  const second = executeSteps(state, {
    ...args,
    steps: token.steps,
    fromStepIndex: token.stepIndex,
    selection: [1],
    context: token.context,
    budget: { count: token.budgetCount },
    events,
  });

  assert.equal(second.pendingChoice ?? null, null);
  const handIds = state.players.p1.zones.hand.map((c) => c.instanceId).sort();
  assert.deepEqual(handIds, [1, 2], 'recovered card and the trailing draw both land in hand');
});
