import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { discardCurrentStadium, executeTrainer } from '../effects/trainer.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'stadium-overwrite-test', seed: 42, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false, stadiumUsedThisTurn: false },
    deckList: [],
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false, stadiumUsedThisTurn: false },
    deckList: [],
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, ownerId: 'p1', name: 'Pikachu', hp: 70, supertype: 'Pokémon' })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, ownerId: 'p2', name: 'Squirtle', hp: 60, supertype: 'Pokémon' })
  );

  return { state, rng };
}

test('stadium: initial play places stadium and records ownerId', () => {
  const { state, rng } = setupGame();

  const stadium1 = createCard({
    instanceId: 10,
    name: 'Path to the Peak',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Pokémon with a Rule Box in play have no Abilities.',
  });
  state.players.p1.zones.hand.push(stadium1);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 10 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.stadium?.instanceId, 10);
  assert.equal(res.state.stadium?.name, 'Path to the Peak');
  assert.equal(res.state.stadium?.ownerId, 'p1');
  assert.equal(res.state.players.p1.zones.hand.length, 0);

  const found = findCard(res.state, 10);
  assert.ok(found);
  assert.equal(found.zoneId, 'stadium');
  assert.equal(found.playerId, 'p1');
});

test('Finding 14: opponent stadium displaces previous stadium to original owner discard', () => {
  const { state, rng } = setupGame();

  // P1 plays Stadium A (Path to the Peak)
  const stadiumA = createCard({
    instanceId: 10,
    name: 'Path to the Peak',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Pokémon with a Rule Box in play have no Abilities.',
  });
  state.players.p1.zones.hand.push(stadiumA);

  const res1 = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 10 },
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.equal(res1.state.stadium?.instanceId, 10);

  // Switch to P2's turn
  res1.state.turn.player = 'p2';

  // P2 plays Stadium B (Artazon)
  const stadiumB = createCard({
    instanceId: 20,
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Once during each player’s turn, that player may search their deck for a Basic Pokémon...',
  });
  res1.state.players.p2.zones.hand.push(stadiumB);

  const res2 = applyCommand(res1.state, {
    type: 'playTrainer',
    payload: { instanceId: 20 },
    playerId: 'p2',
  }, rng);

  assert.equal(res2.error, null);
  // Current stadium is now Stadium B owned by p2
  assert.equal(res2.state.stadium?.instanceId, 20);
  assert.equal(res2.state.stadium?.ownerId, 'p2');

  // Stadium A must be in P1's discard pile (NOT P2's discard, and NOT erased)
  assert.equal(res2.state.players.p1.zones.discard.length, 1);
  assert.equal(res2.state.players.p1.zones.discard[0].instanceId, 10);
  assert.equal(res2.state.players.p1.zones.discard[0].name, 'Path to the Peak');
  assert.equal(res2.state.players.p2.zones.discard.length, 0);

  // Verify cardMoved event was emitted for Stadium A moving to p1 discard
  const movedEvent = res2.events.find(
    (e) => e.type === 'cardMoved' && e.instanceId === 10 && e.from === 'stadium' && e.to === 'discard'
  );
  assert.ok(movedEvent, 'cardMoved event must be emitted for displaced stadium');
  assert.equal(movedEvent.playerId, 'p1');
});

test('Finding 14: replacing own stadium moves previous stadium to own discard', () => {
  const { state, rng } = setupGame();

  const stadium1 = createCard({
    instanceId: 10,
    ownerId: 'p1',
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = stadium1;

  const stadium2 = createCard({
    instanceId: 30,
    name: 'Lost City',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p1.zones.hand.push(stadium2);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 30 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.stadium?.instanceId, 30);
  assert.equal(res.state.stadium?.ownerId, 'p1');
  assert.equal(res.state.players.p1.zones.discard.length, 1);
  assert.equal(res.state.players.p1.zones.discard[0].instanceId, 10);
  assert.equal(res.state.players.p1.zones.discard[0].name, 'Artazon');
});

test('stadium: cannot play stadium if same name is already in play', () => {
  const { state, rng } = setupGame();

  const stadiumInPlay = createCard({
    instanceId: 10,
    ownerId: 'p1',
    name: 'Path to the Peak',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = stadiumInPlay;

  const duplicateStadium = createCard({
    instanceId: 11,
    name: 'Path to the Peak',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p1.zones.hand.push(duplicateStadium);

  const legal = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 11 },
    playerId: 'p1',
  });
  assert.equal(legal.allowed, false);
  assert.match(legal.reason, /same name/i);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 11 },
    playerId: 'p1',
  }, rng);

  assert.match(res.error, /same name/i);
  assert.equal(res.state.stadium.instanceId, 10);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('stadium: playing new stadium resets stadiumUsedThisTurn flag', () => {
  const { state, rng } = setupGame();

  const stadium1 = createCard({
    instanceId: 10,
    ownerId: 'p1',
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = stadium1;
  state.players.p1.flags.stadiumUsedThisTurn = true;

  const stadium2 = createCard({
    instanceId: 20,
    name: 'Lost City',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p1.zones.hand.push(stadium2);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 20 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, false);
});

test('stadium: moveCard with to: stadium displaces existing stadium to discard', () => {
  const { state, rng } = setupGame();

  const existingStadium = createCard({
    instanceId: 10,
    ownerId: 'p1',
    name: 'Old Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = existingStadium;

  const newStadium = createCard({
    instanceId: 20,
    ownerId: 'p2',
    name: 'New Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p2.zones.hand.push(newStadium);

  state.turn.player = 'p2';
  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 20, from: 'hand', to: 'stadium' },
    playerId: 'p2',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.stadium?.instanceId, 20);
  assert.equal(res.state.players.p1.zones.discard.length, 1);
  assert.equal(res.state.players.p1.zones.discard[0].instanceId, 10);
});

test('stadium: discardCurrentStadium resolves owner from deckList if ownerId missing', () => {
  const { state } = setupGame();

  const legacyStadium = createCard({
    instanceId: 99,
    syncInstance: 5,
    name: 'Mystery Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = legacyStadium;

  state.players.p2.deckList = [{ instanceId: 99, syncInstance: 5, name: 'Mystery Stadium' }];

  const events = [];
  const discarded = discardCurrentStadium(state, events, 'p1');

  assert.equal(discarded.instanceId, 99);
  assert.equal(state.stadium, null);
  assert.equal(state.players.p2.zones.discard.length, 1);
  assert.equal(state.players.p2.zones.discard[0].instanceId, 99);
  assert.equal(events[0].playerId, 'p2');
});

test('stadium: completing a resumed stadium choice replaces existing stadium and discards it', () => {
  const { state, rng } = setupGame();

  const oldStadium = createCard({
    instanceId: 10,
    ownerId: 'p1',
    name: 'Old Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.stadium = oldStadium;

  const newStadium = createCard({
    instanceId: 20,
    name: 'Resumed Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p2.zones.board.push(newStadium);

  const events = [];
  const res = executeTrainer(state, {
    card: newStadium,
    playerId: 'p2',
    activeRng: rng,
    events,
    resumeToken: {
      steps: [{ type: 'draw', count: 1 }],
      stepIndex: 1,
      initiatorPlayerId: 'p2',
    },
  });

  assert.equal(res.completed, true);
  assert.equal(state.stadium?.instanceId, 20);
  assert.equal(state.stadium?.ownerId, 'p2');
  assert.equal(state.players.p1.zones.discard.length, 1);
  assert.equal(state.players.p1.zones.discard[0].instanceId, 10);
});

