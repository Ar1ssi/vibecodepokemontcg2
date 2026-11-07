import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

// Source: client/src/assets/custom-sets/customhb/set.json customhb Hilda (edits.effect), a rewrite
// of out/pkmn-trainer-cards.json "Hilda" (White Flare 084) from "and … reveal them" to "or … reveal it".
const HOMEBREW_HILDA =
  'Search your deck for an Evolution Pokémon or an Energy card, reveal it, and put it into your hand. Then, shuffle your deck.';

test('homebrew Hilda parses as one card of either kind, not a sequence', () => {
  const { steps } = parseTrainerEffect(HOMEBREW_HILDA);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].type, 'searchDeck');
  assert.equal(steps[0].what, 'Evolution Pokémon or Energy');
  assert.equal(steps[0].count, 1);
  assert.equal(steps[0].destination, 'hand');
});

function pick(selection) {
  const state = createGameState({ gameId: 'hilda-hb', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 2, name: 'Raichu', supertype: 'Pokémon', subtypes: 'Stage 1', stage: 'Stage 1' }),
    createCard({ instanceId: 3, name: 'Basic Lightning Energy', supertype: 'Energy', type: 'Energy' })
  );
  const res = executeSteps(state, {
    steps: parseTrainerEffect(HOMEBREW_HILDA).steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Hilda' },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
    ...(selection ? { selection } : {}),
  });
  return { res, hand: state.players.p1.zones.hand.map((c) => c.instanceId) };
}

test('homebrew Hilda offers Evolutions and Energy together, one pick', () => {
  const { res } = pick(null);
  assert.equal(res.pendingChoice.max, 1);
  assert.deepEqual(res.pendingChoice.options.map((c) => c.instanceId).sort(), [2, 3]);
});

test('homebrew Hilda takes an Evolution or an Energy', () => {
  assert.deepEqual(pick([2]).hand, [2]);
  assert.deepEqual(pick([3]).hand, [3]);
});
