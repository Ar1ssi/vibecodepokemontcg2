// I116: `rng.shuffle` returns a shuffled copy, so effect code that called it for its side
// effect left the deck in its old order after every search. Effects shuffle in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng, shuffleInPlace } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';

function stateWithDeck(size) {
  const state = createGameState({ gameId: 'shuffle', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
  }
  for (let i = 1; i <= size; i++) {
    state.players.p1.zones.deck.push(createCard({ instanceId: i, name: `Card ${i}`, supertype: 'Trainer', type: 'Item' }));
  }
  return state;
}

test('shuffleInPlace reorders the given array and keeps its cards', () => {
  const array = Array.from({ length: 20 }, (_, i) => i);
  const same = shuffleInPlace(createRng(9), array);
  assert.equal(same, array, 'the same array comes back');
  assert.notDeepEqual(array, Array.from({ length: 20 }, (_, i) => i));
  assert.deepEqual([...array].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));
  assert.deepEqual(shuffleInPlace(null, [1, 2]), [1, 2], 'no rng leaves the order');
});

test('a deck search shuffles the deck afterwards (I116)', () => {
  const state = stateWithDeck(20);
  const before = state.players.p1.zones.deck.map((c) => c.instanceId);
  const steps = [{ type: 'searchDeck', what: 'Item', count: 1, destination: 'hand' }];
  const rng = createRng(11);
  const first = executeSteps(state, { steps, effectType: 'trainer', playerId: 'p1', activeRng: rng, events: [] });
  assert.ok(first.pendingChoice);
  const result = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: rng,
    events: [],
    selection: [1],
    context: first.pendingChoice.resumeToken.context,
  });
  assert.equal(result.pendingChoice, null);
  const after = state.players.p1.zones.deck.map((c) => c.instanceId);
  assert.deepEqual([...after].sort((a, b) => a - b), before.slice(1));
  assert.notDeepEqual(after, before.slice(1), 'the remaining deck is shuffled');
});
