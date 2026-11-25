// An Energy discard cost and an Energy recovery must not count an Item whose name contains
// "Energy". Energy Retrieval, Chaos Rising 108 (out/pkmn-trainer-cards.json), is an Item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';

function setup() {
  const state = createGameState({ gameId: 'energy-predicate', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

const energyRetrieval = (instanceId) =>
  createCard({
    instanceId,
    name: 'Energy Retrieval',
    supertype: 'Trainer',
    trainerType: 'Item',
    subtypes: ['Item'],
    text: 'Put up to 2 Basic Energy cards from your discard pile into your hand.',
  });
const fireEnergy = (instanceId) =>
  createCard({ instanceId, name: 'Fire Energy', supertype: 'Energy', subtypes: ['Basic'] });

const run = (state, step) =>
  executeSteps(state, {
    steps: [step],
    effectType: 'trainer',
    sourceCard: { name: 'Test Stadium' },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
  });

test('an Energy discard cost offers the Energy card, not Energy Retrieval', () => {
  const state = setup();
  state.players.p1.zones.hand.push(energyRetrieval(1), fireEnergy(2));
  const res = run(state, { type: 'discardCost', count: 1, energyOnly: true });
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [2]);
});

test('an Energy discard cost with only Energy Retrieval in hand cannot be paid', () => {
  const state = setup();
  state.players.p1.zones.hand.push(energyRetrieval(1));
  const res = run(state, { type: 'discardCost', count: 1, energyOnly: true });
  assert.equal(res.pendingChoice ?? null, null);
});

test('recovering Energy from the discard pile does not offer Energy Retrieval', () => {
  const state = setup();
  state.players.p1.zones.discard.push(energyRetrieval(1), fireEnergy(2));
  const res = run(state, { type: 'recoverEnergy', count: 1 });
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [2]);
});
