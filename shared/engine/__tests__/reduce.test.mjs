import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, getZone, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

test('applyCommand: Invariant 3 & 7 - pure, total, and stateVersion only increments on success', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });

  const pikachu = createCard({ instanceId: 10, name: 'Pikachu', supertype: 'Pokémon' });
  state.players.p1.zones.hand.push(pikachu);
  state.stateVersion = 5;

  const originalJSON = JSON.stringify(state);

  // Illegal command: stale_view
  const badResult = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 999, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });

  assert.equal(badResult.error, 'stale_view');
  assert.equal(badResult.state.stateVersion, 5);
  assert.equal(JSON.stringify(state), originalJSON, 'Original state must not be mutated on failure');

  // Legal command: moveCard
  state.turn.phase = 'main';
  const beforeGoodJSON = JSON.stringify(state);

  const goodResult = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 10, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });

  assert.equal(goodResult.error, null);
  assert.equal(goodResult.state.stateVersion, 6);
  assert.equal(goodResult.state.commandLog.length, 1);
  assert.equal(goodResult.state.players.p1.zones.bench.length, 1);
  assert.equal(goodResult.state.players.p1.zones.hand.length, 0);
  assert.equal(JSON.stringify(state), beforeGoodJSON, 'Original input state must never be mutated (Invariant 3)');
});

test('Edge Case 2: Malformed command returns bad_command and state is untouched', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
  });
  state.stateVersion = 10;

  // Unknown command type
  const res1 = applyCommand(state, { type: 'nonExistentCommand', payload: {}, playerId: 'p1' });
  assert.equal(res1.error, 'bad_command');
  assert.equal(res1.state.stateVersion, 10);

  // Missing payload
  const res2 = applyCommand(state, { type: 'moveCard', playerId: 'p1' });
  assert.equal(res2.error, 'bad_command');
  assert.equal(res2.state.stateVersion, 10);

  // Missing playerId
  const res3 = applyCommand(state, { type: 'moveCard', payload: { instanceId: 1, from: 'hand', to: 'bench' } });
  assert.equal(res3.error, 'bad_command');
  assert.equal(res3.state.stateVersion, 10);
});

test('Edge Case 3: instanceId not in claimed zone returns stale_view', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';

  const card = createCard({ instanceId: 5, name: 'Pikachu' });
  state.players.p1.zones.hand.push(card);

  // Claiming card is in bench when it is in hand
  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 5, from: 'bench', to: 'active' },
    playerId: 'p1',
  });

  assert.equal(res.error, 'stale_view');
});

test('Edge Case 1: Empty deck: draw with 0 cards returns deck_empty', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';
  state.players.p1.zones.deck = []; // Empty deck

  const res = applyCommand(state, {
    type: 'draw',
    payload: { count: 1 },
    playerId: 'p1',
  });

  assert.equal(res.error, 'deck_empty');
});

test('Edge Case 9: Bench full (5 max) rejects move to bench with bench_full', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';

  for (let i = 1; i <= 5; i++) {
    state.players.p1.zones.bench.push(createCard({ instanceId: i, name: `Pokemon ${i}` }));
  }
  const sixth = createCard({ instanceId: 6, name: 'Sixth Pokemon' });
  state.players.p1.zones.hand.push(sixth);

  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 6, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });

  assert.equal(res.error, 'bench_full');
});

test('Edge Case 19: Sandbox mode (rulesEnabled === false) skips legality checks while preserving references', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: false, // Sandbox mode
  });

  for (let i = 1; i <= 5; i++) {
    state.players.p1.zones.bench.push(createCard({ instanceId: i, name: `Pokemon ${i}` }));
  }
  const extra = createCard({ instanceId: 6, name: 'Extra Pokemon' });
  state.players.p1.zones.hand.push(extra);

  // Even though bench has 5, sandbox mode allows moving 6th Pokemon to bench
  const res1 = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 6, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(res1.error, null);
  assert.equal(res1.state.players.p1.zones.bench.length, 6);

  // Reference check is STILL enforced: moving nonexistent card is rejected
  const res2 = applyCommand(res1.state, {
    type: 'moveCard',
    payload: { instanceId: 9999, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(res2.error, 'stale_view');
});

test('applyCommand: turn gate blocks commands when PendingChoice is outstanding for another player', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';
  state.pendingChoice = {
    choiceId: 'c1',
    player: 'p1',
    prompt: 'Discard 2 cards',
    options: [],
  };

  state.players.p2.zones.hand.push(createCard({ instanceId: 20, name: 'Eevee' }));

  // Gary attempts to move a card while Ash has an outstanding PendingChoice
  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 20, from: 'hand', to: 'bench' },
    playerId: 'p2',
  });

  assert.equal(res.error, 'waiting_for_choice');
});

test('applyCommand: draw moves cards from deck to hand and produces events', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';
  const c1 = createCard({ instanceId: 1, name: 'Card 1' });
  const c2 = createCard({ instanceId: 2, name: 'Card 2' });
  state.players.p1.zones.deck.push(c1, c2);

  const res = applyCommand(state, {
    type: 'draw',
    payload: { count: 1 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.deck.length, 1);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.hand[0].instanceId, 1);
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].type, 'cardsDrawn');
});

test('applyCommand: attachCard attaches energy and sets attachedTo pointer and turn flag', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: true,
  });
  state.turn.phase = 'main';

  const energy = createCard({ instanceId: 10, name: 'Fire Energy', supertype: 'Energy' });
  const charizard = createCard({ instanceId: 20, name: 'Charizard', supertype: 'Pokémon' });

  state.players.p1.zones.hand.push(energy);
  state.players.p1.zones.active.push(charizard);

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 10, targetInstanceId: 20 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  const activeZone = res.state.players.p1.zones.active;
  assert.equal(activeZone.length, 2);
  const attachedEnergy = activeZone.find((c) => c.instanceId === 10);
  assert.equal(attachedEnergy.attachedTo, 20);
  assert.equal(res.state.players.p1.flags.energyAttached, true);

  // Attempting second energy attachment on the same turn in rules mode is rejected
  const energy2 = createCard({ instanceId: 11, name: 'Fire Energy', supertype: 'Energy' });
  res.state.players.p1.zones.hand.push(energy2);

  const res2 = applyCommand(res.state, {
    type: 'attachCard',
    payload: { instanceId: 11, targetInstanceId: 20 },
    playerId: 'p1',
  });
  assert.equal(res2.error, 'Energy already attached this turn.');
});

test('applyCommand: manual counter and status updates modify card attributes', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' } },
    rulesEnabled: false,
  });

  const pokemon = createCard({ instanceId: 100, name: 'Mewtwo', damage: 0 });
  state.players.p1.zones.active.push(pokemon);

  // addDamageCounter
  let next = applyCommand(state, {
    type: 'addDamageCounter',
    payload: { instanceId: 100, amount: 30 },
    playerId: 'p1',
  }).state;
  assert.equal(next.players.p1.zones.active[0].damage, 30);

  // updateDamageCounter
  next = applyCommand(next, {
    type: 'updateDamageCounter',
    payload: { instanceId: 100, amount: 50 },
    playerId: 'p1',
  }).state;
  assert.equal(next.players.p1.zones.active[0].damage, 50);

  // removeDamageCounter
  next = applyCommand(next, {
    type: 'removeDamageCounter',
    payload: { instanceId: 100, amount: 20 },
    playerId: 'p1',
  }).state;
  assert.equal(next.players.p1.zones.active[0].damage, 30);

  // addSpecialCondition
  next = applyCommand(next, {
    type: 'addSpecialCondition',
    payload: { instanceId: 100, condition: 'Asleep' },
    playerId: 'p1',
  }).state;
  assert.equal(next.players.p1.zones.active[0].specialCondition, 'Asleep');

  // removeSpecialCondition
  next = applyCommand(next, {
    type: 'removeSpecialCondition',
    payload: { instanceId: 100 },
    playerId: 'p1',
  }).state;
  assert.equal(next.players.p1.zones.active[0].specialCondition, null);
});
