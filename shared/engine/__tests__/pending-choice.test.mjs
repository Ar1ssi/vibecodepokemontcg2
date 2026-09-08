import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';
import { createPendingChoice } from '../effects/executor.mjs';

function setupTwoPlayerState() {
  const state = createGameState({ gameId: 'choice-test', seed: 42, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

test('pendingChoice: deterministic creation without Math.random (Invariant 6)', () => {
  const choice = createPendingChoice({
    player: 'p1',
    prompt: 'Choose a card',
    source: 'Test',
    options: [{ instanceId: 10, name: 'Card 10' }, { instanceId: 11, name: 'Card 11' }],
    min: 1,
    max: 1,
    stateVersion: 5,
    stepIndex: 1,
  });

  assert.equal(choice.choiceId, 'choice_p1_5_1');
  assert.equal(choice.player, 'p1');
  assert.equal(choice.min, 1);
  assert.equal(choice.max, 1);
  assert.equal(choice.options.length, 2);
  assert.equal(choice.options[0].instanceId, 10);
});

test('pendingChoice: view redaction hides option details from opponent and spectators', () => {
  const state = setupTwoPlayerState();
  state.pendingChoice = createPendingChoice({
    player: 'p1',
    prompt: 'Search deck for a Pokemon',
    source: 'Ultra Ball',
    options: [
      { instanceId: 101, name: 'Pikachu', type: 'Lightning' },
      { instanceId: 102, name: 'Charizard', type: 'Fire' },
    ],
    min: 1,
    max: 1,
    stateVersion: 10,
    stepIndex: 0,
  });

  // Owner view: receives full details
  const p1View = viewFor(state, 'p1');
  assert.ok(p1View.pendingChoice);
  assert.equal(p1View.pendingChoice.player, 'p1');
  assert.equal(p1View.pendingChoice.options.length, 2);
  assert.equal(p1View.pendingChoice.options[0].name, 'Pikachu');

  // Opponent view: options details are redacted, only count provided
  const p2View = viewFor(state, 'p2');
  assert.ok(p2View.pendingChoice);
  assert.equal(p2View.pendingChoice.player, 'p1');
  assert.equal(p2View.pendingChoice.optionsCount, 2);
  assert.equal(p2View.pendingChoice.options, undefined);

  // Spectator view: options details redacted
  const specView = viewFor(state, null);
  assert.ok(specView.pendingChoice);
  assert.equal(specView.pendingChoice.optionsCount, 2);
  assert.equal(specView.pendingChoice.options, undefined);

  // Serialized json leak check (Invariant 5)
  const p2Json = JSON.stringify(p2View);
  assert.ok(!p2Json.includes('Pikachu'), 'Opponent view must not leak Pikachu');
  assert.ok(!p2Json.includes('Charizard'), 'Opponent view must not leak Charizard');
});

test('pendingChoice: blocks all other commands while choice is pending', () => {
  const state = setupTwoPlayerState();
  const c1 = createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon' });
  state.players.p1.zones.hand.push(c1);

  state.pendingChoice = createPendingChoice({
    player: 'p1',
    prompt: 'Make a choice',
    source: 'Test',
    options: [{ instanceId: 1, name: 'Pikachu' }],
    min: 1,
    max: 1,
    stateVersion: 1,
    stepIndex: 0,
  });

  // Attempting moveCard from p1
  const moveRes = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 1, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(moveRes.error, 'waiting_for_choice');

  // Attempting pass from p1
  const passRes = applyCommand(state, {
    type: 'pass',
    payload: {},
    playerId: 'p1',
  });
  assert.equal(passRes.error, 'waiting_for_choice');

  // Attempting moveCard from p2
  const p2Res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 99, from: 'hand', to: 'bench' },
    playerId: 'p2',
  });
  assert.equal(p2Res.error, 'waiting_for_choice');
});

test('pendingChoice: Edge Case 11 - rejected not_your_choice when wrong player resolves', () => {
  const state = setupTwoPlayerState();
  state.pendingChoice = createPendingChoice({
    choiceId: 'choice-1',
    player: 'p1',
    prompt: 'Pick a card',
    source: 'Test',
    options: [{ instanceId: 10, name: 'Card 10' }],
    min: 1,
    max: 1,
  });

  const res = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-1', selection: [10] },
    playerId: 'p2', // wrong player
  });

  assert.equal(res.error, 'not_your_choice');
  assert.ok(res.reason?.includes('p1'));
});

test('pendingChoice: Edge Case 12 - rejected invalid_selection on min/max or foreign options', () => {
  const state = setupTwoPlayerState();
  state.pendingChoice = createPendingChoice({
    choiceId: 'choice-1',
    player: 'p1',
    prompt: 'Pick 2 cards',
    source: 'Test',
    options: [
      { instanceId: 10, name: 'Card 10' },
      { instanceId: 11, name: 'Card 11' },
      { instanceId: 12, name: 'Card 12' },
    ],
    min: 2,
    max: 2,
  });

  // Too few cards (min: 2)
  const tooFew = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-1', selection: [10] },
    playerId: 'p1',
  });
  assert.equal(tooFew.error, 'invalid_selection');

  // Too many cards (max: 2)
  const tooMany = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-1', selection: [10, 11, 12] },
    playerId: 'p1',
  });
  assert.equal(tooMany.error, 'invalid_selection');

  // Card not in options
  const foreign = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-1', selection: [10, 999] },
    playerId: 'p1',
  });
  assert.equal(foreign.error, 'invalid_selection');
});

test('pendingChoice: rejected stale_choice or no_pending_choice', () => {
  const state = setupTwoPlayerState();

  // No pending choice
  const noChoiceRes = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-99', selection: [] },
    playerId: 'p1',
  });
  assert.equal(noChoiceRes.error, 'no_pending_choice');

  // Stale choice ID
  state.pendingChoice = createPendingChoice({
    choiceId: 'choice-current',
    player: 'p1',
    prompt: 'Pick',
    options: [{ instanceId: 1 }],
    min: 1,
    max: 1,
  });
  const staleRes = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-old', selection: [1] },
    playerId: 'p1',
  });
  assert.equal(staleRes.error, 'stale_choice');
});

test('Finding 10: Opponent choice resolution preserves initiator attribution and cleans up trainer card to initiator discard', () => {
  const state = setupTwoPlayerState();

  // Setup p1 with Repel in hand
  const repelCard = createCard({
    instanceId: 50,
    name: 'Repel',
    supertype: 'Trainer',
    type: 'Item',
    text: "Switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)",
  });
  state.players.p1.zones.hand.push(repelCard);

  // Setup p2 with Active Pokemon and 2 Benched Pokemon
  const p2Active = createCard({ instanceId: 60, name: 'Pidgey', supertype: 'Pokémon' });
  const p2Bench1 = createCard({ instanceId: 61, name: 'Rattata', supertype: 'Pokémon' });
  const p2Bench2 = createCard({ instanceId: 62, name: 'Spearow', supertype: 'Pokémon' });
  state.players.p2.zones.active.push(p2Active);
  state.players.p2.zones.bench.push(p2Bench1, p2Bench2);

  // P1 plays Repel
  const playRes = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 50 },
    playerId: 'p1',
  });

  assert.equal(playRes.error, null);
  // Repel is moved to p1's board during execution
  assert.equal(playRes.state.players.p1.zones.board.length, 1);
  assert.equal(playRes.state.players.p1.zones.board[0].instanceId, 50);

  // Pending choice must be prompted to P2, with initiator attribution to P1
  assert.ok(playRes.pendingChoice);
  assert.equal(playRes.pendingChoice.player, 'p2');
  assert.equal(playRes.pendingChoice.resumeToken.initiatorPlayerId, 'p1');
  assert.equal(playRes.pendingChoice.resumeToken.sourceInstanceId, 50);

  // P2 resolves choice selecting Spearow (instanceId 62)
  const resolveRes = applyCommand(playRes.state, {
    type: 'resolveChoice',
    payload: {
      choiceId: playRes.pendingChoice.choiceId,
      selection: [62],
    },
    playerId: 'p2',
  });

  assert.equal(resolveRes.error, null);
  // P2's active is now Spearow (62) and Pidgey (60) is benched
  assert.equal(resolveRes.state.players.p2.zones.active[0].instanceId, 62);
  const p2BenchIds = resolveRes.state.players.p2.zones.bench.map((c) => c.instanceId);
  assert.ok(p2BenchIds.includes(60));
  assert.ok(p2BenchIds.includes(61));

  // Crucial Finding 10: Repel is removed from P1's board and placed in P1's discard
  assert.equal(resolveRes.state.players.p1.zones.board.length, 0);
  assert.equal(resolveRes.state.players.p1.zones.discard.length, 1);
  assert.equal(resolveRes.state.players.p1.zones.discard[0].instanceId, 50);

  // P2's board and discard are untouched by P1's trainer cleanup
  assert.equal(resolveRes.state.players.p2.zones.board.length, 0);
  assert.equal(resolveRes.state.players.p2.zones.discard.length, 0);
  assert.equal(resolveRes.pendingChoice, null);
});

test('Finding 10: Multi-step trainer preserves initiatorPlayerId across sequential choices', () => {
  const state = setupTwoPlayerState();
  const customTrainer = createCard({
    instanceId: 70,
    name: 'Custom Swapper',
    supertype: 'Trainer',
    type: 'Item',
  });
  state.players.p1.zones.board.push(customTrainer);

  // P2 Active & Bench
  state.players.p2.zones.active.push(createCard({ instanceId: 80, name: 'Active Mon' }));
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 81, name: 'Bench Mon 1' }),
    createCard({ instanceId: 82, name: 'Bench Mon 2' })
  );

  // A 2-step effect: step 0 prompts opponent to switch, step 1 prompts initiator to heal
  const steps = [
    { type: 'switchOpponentOut' },
    { type: 'heal', amount: 30 },
  ];

  state.players.p1.zones.active.push(createCard({ instanceId: 75, name: 'Injured Mon', damage: 40 }));
  state.players.p1.zones.bench.push(createCard({ instanceId: 76, name: 'Injured Bench', damage: 30 }));

  // Simulate pending choice at step 0 directed to p2
  state.pendingChoice = createPendingChoice({
    choiceId: 'choice-step0',
    player: 'p2',
    prompt: 'Choose bench',
    options: state.players.p2.zones.bench,
    resumeToken: {
      effectType: 'trainer',
      sourceInstanceId: 70,
      initiatorPlayerId: 'p1',
      stepIndex: 0,
      steps,
    },
  });

  // P2 resolves step 0
  const step1Res = applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: 'choice-step0', selection: [81] },
    playerId: 'p2',
  });

  assert.equal(step1Res.error, null);
  // P2's active switched to 81
  assert.equal(step1Res.state.players.p2.zones.active[0].instanceId, 81);

  // Step 1 now prompts P1 (initiator) to heal one of P1's damaged Pokemon
  assert.ok(step1Res.pendingChoice);
  assert.equal(step1Res.pendingChoice.player, 'p1');
  assert.equal(step1Res.pendingChoice.resumeToken.initiatorPlayerId, 'p1');
  assert.equal(step1Res.pendingChoice.resumeToken.stepIndex, 1);

  // P1 resolves step 1, selecting card 75
  const step2Res = applyCommand(step1Res.state, {
    type: 'resolveChoice',
    payload: { choiceId: step1Res.pendingChoice.choiceId, selection: [75] },
    playerId: 'p1',
  });

  assert.equal(step2Res.error, null);
  assert.equal(step2Res.state.players.p1.zones.active[0].damage, 10);
  // Trainer card 70 cleaned up to p1 discard
  assert.equal(step2Res.state.players.p1.zones.board.length, 0);
  assert.equal(step2Res.state.players.p1.zones.discard.find((c) => c.instanceId === 70)?.name, 'Custom Swapper');
  assert.equal(step2Res.pendingChoice, null);
});
