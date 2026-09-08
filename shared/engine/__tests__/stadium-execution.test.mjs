import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'stadium-test', seed: 42, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: {},
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: {},
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

test('stadium: activating stadium effect draws cards and tracks once-per-turn limit', () => {
  const { state, rng } = setupGame();
  const stadium = createCard({
    instanceId: 50,
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Once during each player’s turn, that player may search their deck for a Basic Pokémon that doesn’t have a Rule Box and put it onto their Bench. Then, that player shuffles their deck.',
  });
  state.stadium = stadium;

  // Deck has basic pokemon without rule box
  const mon = createCard({
    instanceId: 70,
    name: 'Charmander',
    hp: 70,
    stage: 'Basic',
    supertype: 'Pokémon',
  });
  state.players.p1.zones.deck.push(mon);

  // Activate stadium
  const res1 = applyCommand(state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.player, 'p1');
  assert.equal(res1.pendingChoice.options.length, 1);
  assert.equal(res1.pendingChoice.options[0].instanceId, 70);

  // Resolve choice
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [70] },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.bench.length, 1);
  assert.equal(res2.state.players.p1.zones.bench[0].instanceId, 70);
  assert.equal(res2.state.players.p1.flags.stadiumUsedThisTurn, true);

  // Second activation in same turn rejected
  const res3 = applyCommand(res2.state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res3.error, 'Stadium effect already used this turn.');
});

test('stadium: Grand Tree special rule opens deck search for Evolution Pokémon', () => {
  const { state, rng } = setupGame();
  const grandTree = createCard({
    instanceId: 51,
    name: 'Grand Tree',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may search their deck for a Stage 1 Pokémon that evolves from 1 of their Pokémon in play and put it onto that Pokémon to evolve it. If that Pokémon evolved during this turn, that player may search their deck for a Stage 2 Pokémon that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, that player shuffles their deck.",
  });
  state.stadium = grandTree;

  const charmeleon = createCard({
    instanceId: 71,
    name: 'Charmeleon',
    hp: 90,
    stage: 'Stage 1',
    supertype: 'Pokémon',
    evolvesFrom: 'Charmander',
  });
  state.players.p1.zones.deck.push(charmeleon);

  // Activate stadium effect for Grand Tree
  const res1 = applyCommand(state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.player, 'p1');
  assert.equal(res1.pendingChoice.options.length, 1);
  assert.equal(res1.pendingChoice.options[0].instanceId, 71);

  // Resolve choice: picks Charmeleon
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [71] },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.hand.length, 1);
  assert.equal(res2.state.players.p1.zones.hand[0].instanceId, 71);
  assert.equal(res2.state.players.p1.flags.stadiumUsedThisTurn, true);
});

