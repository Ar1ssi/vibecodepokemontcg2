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
