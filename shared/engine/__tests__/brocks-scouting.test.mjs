import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';

const { parseTrainerEffect } = await import('../rules/trainer-effects.mjs');

// Source: out/pkmn-trainer-cards.json "Brock’s Scouting" (Journey Together 179)
const TEXT =
  'Search your deck for up to 2 Basic Pokémon or 1 Evolution Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.';

test("Brock's Scouting parses as 2 Basic OR 1 Evolution", () => {
  const step = parseTrainerEffect(TEXT).steps[0];
  assert.equal(step.type, 'searchDeck');
  assert.equal(step.destination, 'hand');
  assert.deepEqual(step.alternatives, [
    { what: 'Basic Pokémon', count: 2 },
    { what: 'Evolution Pokémon', count: 1 },
  ]);
});

function run(selection) {
  const state = createGameState({ gameId: 'brock', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 2, name: 'Charmander', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 3, name: 'Raichu', supertype: 'Pokémon', subtypes: 'Stage 1', stage: 'Stage 1' }),
    createCard({ instanceId: 4, name: 'Charizard', supertype: 'Pokémon', subtypes: 'Stage 2', stage: 'Stage 2' })
  );
  const res = executeSteps(state, {
    steps: parseTrainerEffect(TEXT).steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: "Brock's Scouting" },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
    ...(selection ? { selection } : {}),
  });
  return { res, hand: state.players.p1.zones.hand.map((c) => c.instanceId) };
}

test('Brock\'s Scouting offers Basics and Evolutions, capped at 2', () => {
  const { res } = run(null);
  assert.equal(res.pendingChoice.max, 2);
  assert.equal(res.pendingChoice.options.length, 4);
});

test("Brock's Scouting: 2 Basics is allowed", () => {
  assert.deepEqual(run([1, 2]).hand, [1, 2]);
});

test("Brock's Scouting: 1 Evolution is allowed", () => {
  assert.deepEqual(run([3]).hand, [3]);
});

test("Brock's Scouting: Basic + Evolution collapses to the first pick's branch", () => {
  assert.deepEqual(run([1, 3]).hand, [1]);
  assert.deepEqual(run([3, 4]).hand, [3]);
});
