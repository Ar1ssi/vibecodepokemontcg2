import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

// Precious Trolley (Surging Sparks 185, tcg corpus row): "Search your deck for any number of
// Basic Pokémon and put them onto your Bench. Then, shuffle your deck."

function setupGame({ benchCount = 1, basicsInDeck = 4 } = {}) {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'trolley-test', seed: 42, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: {} };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(createCard({ instanceId: 100, name: 'Active', hp: 60, stage: 'Basic', supertype: 'Pokémon' }));
  for (let i = 1; i <= benchCount; i++) {
    state.players.p1.zones.bench.push(createCard({ instanceId: 100 + i, name: `Bench ${i}`, hp: 60, stage: 'Basic', supertype: 'Pokémon' }));
  }
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 50,
      name: 'Precious Trolley',
      supertype: 'Trainer',
      subtypes: ['Item'],
      type: 'Item',
      text: 'Search your deck for any number of Basic Pokémon and put them onto your Bench. Then, shuffle your deck.',
    })
  );
  for (let i = 0; i < basicsInDeck; i++) {
    state.players.p1.zones.deck.push(createCard({ instanceId: 70 + i, name: `Basic ${i}`, hp: 60, stage: 'Basic', supertype: 'Pokémon' }));
  }
  return { state, rng };
}

const playTrolley = (state, rng) =>
  applyCommand(state, { type: 'playTrainer', payload: { instanceId: 50 }, playerId: 'p1' }, rng);

test('Precious Trolley lets you pick every Basic that fits on the Bench, not just one', () => {
  const { state, rng } = setupGame({ benchCount: 1, basicsInDeck: 4 });

  const res = playTrolley(state, rng);
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'Trolley asks which Basics to bench');
  assert.equal(res.pendingChoice.options.length, 4);
  assert.equal(res.pendingChoice.max, 4, 'four open Bench slots allow four picks');
  assert.equal(res.pendingChoice.min, 0, 'any number includes zero');
});

test('Precious Trolley caps the picks at the open Bench slots', () => {
  const { state, rng } = setupGame({ benchCount: 3, basicsInDeck: 4 });

  const res = playTrolley(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.max, 2);
});

test('Precious Trolley benches the four Basics picked', () => {
  const { state, rng } = setupGame({ benchCount: 1, basicsInDeck: 4 });
  const first = playTrolley(state, rng);

  const picked = first.pendingChoice.options.map((c) => c.instanceId);
  const res = applyCommand(
    first.state,
    { type: 'resolveChoice', payload: { choiceId: first.pendingChoice.choiceId, selection: picked }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.bench.length, 5);
  assert.equal(res.state.players.p1.zones.deck.length, 0);
});
