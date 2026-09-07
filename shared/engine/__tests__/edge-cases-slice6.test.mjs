import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { GameRoom } from '../../../server/game/room.mjs';
import { executeSteps, MAX_EFFECT_STEPS } from '../effects/executor.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'edge-cases-test', seed: 42, rulesEnabled: true });
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

test('Edge Case 6: Client disconnects mid-choice; choice remains pending and getView re-sends verbatim', () => {
  const room = new GameRoom({ roomId: 'room-ec6', rulesEnabled: true, seed: 100 });
  room.addPlayer('socket-p1', 'p1', 'Alice');
  room.addPlayer('socket-p2', 'p2', 'Bob');

  // Add Ultra Ball and fodder
  const ultraBall = createCard({
    instanceId: 7,
    name: 'Ultra Ball',
    supertype: 'Trainer',
    text: 'Discard 2 cards from your hand. If you do, search your deck for a Pokémon.',
  });
  room.state.players.p1.zones.hand.push(
    ultraBall,
    createCard({ instanceId: 10, name: 'Card A' }),
    createCard({ instanceId: 11, name: 'Card B' })
  );
  room.state.turn = { player: 'p1', number: 2, phase: 'main' };

  // p1 plays Ultra Ball -> generates PendingChoice
  const cmdRes = room.handleCommand('socket-p1', {
    type: 'playTrainer',
    payload: { instanceId: 7 },
  });

  assert.equal(cmdRes.success, true);
  assert.ok(cmdRes.pendingChoice);
  const choiceId = cmdRes.pendingChoice.choiceId;

  // p1 socket disconnects
  room.removeSocket('socket-p1');

  // Choice is STILL pending in room state
  assert.ok(room.state.pendingChoice);
  assert.equal(room.state.pendingChoice.choiceId, choiceId);

  // p2 attempts command while p1 is disconnected mid-choice -> blocked
  const p2Try = room.handleCommand('socket-p2', { type: 'pass', payload: {} });
  assert.equal(p2Try.error, 'waiting_for_choice');

  // p1 reconnects with a new socket ID
  room.addPlayer('socket-p1-reconnect', 'p1', 'Alice');

  // p1 requests view upon reconnection (requestView equivalent)
  const reconnectedView = room.getViewForSocket('socket-p1-reconnect');
  assert.ok(reconnectedView.pendingChoice);
  assert.equal(reconnectedView.pendingChoice.choiceId, choiceId);
  assert.equal(reconnectedView.pendingChoice.options.length, 2);

  // p1 can now resolve the choice over the new socket
  const resolveRes = room.resolveChoice('socket-p1-reconnect', {
    choiceId,
    selection: [10, 11],
  });
  assert.equal(resolveRes.success, true);
});

test('Edge Case 10: Attachment target removed by prior step; step skipped gracefully with announcement', () => {
  const { state, rng } = setupGame();
  const events = [];

  // Active Pokemon exists initially, but then gets removed
  const activeMon = createCard({ instanceId: 1, name: 'Pikachu', hp: 70, supertype: 'Pokémon' });
  state.players.p1.zones.active.push(activeMon);

  const energyCard = createCard({ instanceId: 99, name: 'Psychic Energy', type: 'Energy' });
  state.players.p1.zones.discard.push(energyCard);

  // Define steps where step 0 discards active and step 1 attempts to attach to that target
  const steps = [
    { type: 'attachFromDiscard', energy: 'Psychic Energy' },
  ];

  // First prompt creates choice
  const res1 = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Energy Return' },
    playerId: 'p1',
    activeRng: rng,
    events,
  });

  assert.ok(res1.pendingChoice);

  // Now, suppose the target was knocked out or removed before resume
  state.players.p1.zones.active = [];

  // Resume with selection
  const res2 = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Energy Return' },
    playerId: 'p1',
    activeRng: rng,
    events,
    selection: [99],
  });

  // Must not throw, step skipped with event
  assert.equal(res2.completed, true);
  assert.equal(res2.pendingChoice, null);
  const skippedEvt = events.find((e) => e.type === 'effectStepSkipped');
  assert.ok(skippedEvt);
  assert.equal(skippedEvt.reason, 'target_not_found');
});

test('Edge Case 11: Choice resolved by wrong player rejected not_your_choice without mutating state', () => {
  const { state, rng } = setupGame();
  state.pendingChoice = {
    choiceId: 'choice-ec11',
    player: 'p1',
    prompt: 'Pick 1',
    options: [{ instanceId: 5 }],
    min: 1,
    max: 1,
  };
  const versionBefore = state.stateVersion;

  const res = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-ec11', selection: [5] },
    playerId: 'p2', // Bob trying to resolve Alice's choice
  }, rng);

  assert.equal(res.error, 'not_your_choice');
  assert.equal(res.state.stateVersion, versionBefore);
  assert.ok(res.state.pendingChoice);
});

test('Edge Case 12: Selection violating min/max or options rejected invalid_selection', () => {
  const { state, rng } = setupGame();
  state.pendingChoice = {
    choiceId: 'choice-ec12',
    player: 'p1',
    prompt: 'Pick 1',
    options: [{ instanceId: 5 }, { instanceId: 6 }],
    min: 1,
    max: 1,
  };

  // Selection empty when min is 1
  const emptyRes = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-ec12', selection: [] },
    playerId: 'p1',
  }, rng);
  assert.equal(emptyRes.error, 'invalid_selection');

  // Selection contains invalid card ID
  const invalidCardRes = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-ec12', selection: [999] },
    playerId: 'p1',
  }, rng);
  assert.equal(invalidCardRes.error, 'invalid_selection');
});

test('Edge Case 15: Effect loop aborted when exceeding step budget', () => {
  const { state, rng } = setupGame();
  const events = [];

  // Create an artificial recursive loop step
  const loopStep = { type: 'coinFlip', heads: [], tails: [] };
  const loopBranch = [loopStep];
  loopStep.heads = loopBranch;
  loopStep.tails = loopBranch;

  const res = executeSteps(state, {
    steps: loopBranch,
    fromStepIndex: 0,
    effectType: 'ability',
    sourceCard: { name: 'Infinite Ability' },
    playerId: 'p1',
    activeRng: rng,
    events,
  });

  assert.equal(res.completed, true);
  assert.equal(res.pendingChoice, null);
  const loopEvt = events.find((e) => e.type === 'effectLoopAborted');
  assert.ok(loopEvt);
  assert.equal(loopEvt.reason, 'step_budget_exceeded');
  assert.ok(loopEvt.stepCount > MAX_EFFECT_STEPS);
});
