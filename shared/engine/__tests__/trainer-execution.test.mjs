import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';

function setupGame() {
  const rng = createRng(12345);
  const state = createGameState({ gameId: 'trainer-test', seed: 12345, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {}, supporterPlayed: false },
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  // Setup initial board
  const activeP1 = createCard({ instanceId: 1, name: 'Pikachu', hp: 70, types: ['Lightning'], supertype: 'Pokémon' });
  state.players.p1.zones.active.push(activeP1);

  const activeP2 = createCard({ instanceId: 2, name: 'Squirtle', hp: 60, types: ['Water'], supertype: 'Pokémon' });
  state.players.p2.zones.active.push(activeP2);

  return { state, rng };
}

test('Worked Example B: Ultra Ball end-to-end multi-step choice execution', () => {
  const { state, rng } = setupGame();

  // Give p1 Ultra Ball and hand fodder
  const ultraBall = createCard({
    instanceId: 7,
    name: 'Ultra Ball',
    supertype: 'Trainer',
    trainerType: 'Item',
    text: 'Discard 2 cards from your hand. If you do, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.',
  });
  const fodder1 = createCard({ instanceId: 15, name: 'Lightning Energy', type: 'Energy' });
  const fodder2 = createCard({ instanceId: 23, name: 'Potion', type: 'Trainer' });
  state.players.p1.zones.hand.push(ultraBall, fodder1, fodder2);

  // Deck has Pokemon to search for
  const targetPokemon = createCard({
    instanceId: 31,
    name: 'Raichu',
    hp: 120,
    types: ['Lightning'],
    supertype: 'Pokémon',
    stage: 'Stage 1',
  });
  const otherDeckCard = createCard({ instanceId: 40, name: 'Fire Energy', type: 'Energy' });
  state.players.p1.zones.deck.push(targetPokemon, otherDeckCard);

  // 1. Play Ultra Ball
  const step1 = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 7 },
    playerId: 'p1',
  }, rng);

  assert.equal(step1.error, null);
  // Ultra Ball moved to board while resolving
  assert.equal(step1.state.players.p1.zones.hand.length, 2);
  assert.ok(step1.pendingChoice);
  assert.equal(step1.pendingChoice.player, 'p1');
  assert.equal(step1.pendingChoice.min, 2);
  assert.equal(step1.pendingChoice.max, 2);
  assert.equal(step1.pendingChoice.options.length, 2);
  assert.deepEqual(step1.pendingChoice.options.map((o) => o.instanceId).sort(), [15, 23]);

  // Worked Example B Step 3: B receives choice too but cannot execute commands
  const p2Attempt = applyCommand(step1.state, {
    type: 'pass',
    payload: {},
    playerId: 'p2',
  }, rng);
  assert.equal(p2Attempt.error, 'waiting_for_choice');

  // Worked Example B Step 4: A resolves discard choice [15, 23]
  const step2 = applyCommand(step1.state, {
    type: 'resolveChoice',
    payload: { choiceId: step1.pendingChoice.choiceId, selection: [15, 23] },
    playerId: 'p1',
  }, rng);

  assert.equal(step2.error, null);
  // 15 and 23 are now in discard
  const discardIds = step2.state.players.p1.zones.discard.map((c) => c.instanceId);
  assert.ok(discardIds.includes(15));
  assert.ok(discardIds.includes(23));

  // Worked Example B Step 5: Deck search choice point
  assert.ok(step2.pendingChoice);
  assert.equal(step2.pendingChoice.player, 'p1');
  // Options filtered to Pokemon only (card 31 Raichu, NOT card 40 Fire Energy)
  assert.equal(step2.pendingChoice.options.length, 1);
  assert.equal(step2.pendingChoice.options[0].instanceId, 31);
  assert.equal(step2.pendingChoice.options[0].name, 'Raichu');

  // Opponent view does NOT leak deck contents
  const oppView = viewFor(step2.state, 'p2');
  assert.equal(oppView.pendingChoice.options, undefined);
  assert.equal(oppView.pendingChoice.optionsCount, 1);

  // Worked Example B Step 6: A resolves deck search, picking card 31
  const step3 = applyCommand(step2.state, {
    type: 'resolveChoice',
    payload: { choiceId: step2.pendingChoice.choiceId, selection: [31] },
    playerId: 'p1',
  }, rng);

  assert.equal(step3.error, null);
  // Raichu is now in p1's hand
  const handIds = step3.state.players.p1.zones.hand.map((c) => c.instanceId);
  assert.ok(handIds.includes(31));

  // Events: cardsRevealed and deckShuffled
  const revealEvt = step3.events.find((e) => e.type === 'cardsRevealed');
  assert.ok(revealEvt);
  assert.equal(revealEvt.cards[0].instanceId, 31);

  const shuffleEvt = step3.events.find((e) => e.type === 'deckShuffled');
  assert.ok(shuffleEvt);

  // Worked Example B Step 8: pendingChoice cleared, Ultra Ball in discard
  assert.equal(step3.pendingChoice, null);
  const finalDiscardIds = step3.state.players.p1.zones.discard.map((c) => c.instanceId);
  assert.ok(finalDiscardIds.includes(7), 'Ultra Ball must be moved to discard on completion');
});

test('trainer: playing Ultra Ball with insufficient hand cards is rejected before playing', () => {
  const { state, rng } = setupGame();
  const ultraBall = createCard({
    instanceId: 7,
    name: 'Ultra Ball',
    supertype: 'Trainer',
    text: 'Discard 2 cards from your hand. If you do, search your deck for a Pokémon.',
  });
  // Only 1 other card in hand
  state.players.p1.zones.hand.push(ultraBall, createCard({ instanceId: 8, name: 'Fodder' }));

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 7 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, 'Not enough cards in hand to pay discard cost.');
  assert.equal(state.players.p1.zones.hand.length, 2);
});

test('trainer: Supporter once-per-turn limit strictly enforced', () => {
  const { state, rng } = setupGame();
  const nemona1 = createCard({
    instanceId: 50,
    name: 'Nemona',
    supertype: 'Trainer',
    subtypes: ['Supporter'],
    text: 'Draw 3 cards.',
  });
  const nemona2 = createCard({
    instanceId: 51,
    name: 'Nemona',
    supertype: 'Trainer',
    subtypes: ['Supporter'],
    text: 'Draw 3 cards.',
  });
  state.players.p1.zones.hand.push(nemona1, nemona2);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 60 }),
    createCard({ instanceId: 61 }),
    createCard({ instanceId: 62 })
  );

  const res1 = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 50 },
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.equal(res1.state.players.p1.flags.supporterPlayed, true);

  // Attempting second Supporter
  const res2 = applyCommand(res1.state, {
    type: 'playTrainer',
    payload: { instanceId: 51 },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, 'Supporter already played this turn.');
});

test('trainer: Switch swaps Active and Benched Pokémon preserving attachments', () => {
  const { state, rng } = setupGame();
  const benched = createCard({ instanceId: 10, name: 'Raichu', hp: 120, supertype: 'Pokémon' });
  state.players.p1.zones.bench.push(benched);

  // Attach energy to active
  const energy = createCard({ instanceId: 11, name: 'Lightning Energy', type: 'Energy', attachedTo: 1 });
  state.players.p1.zones.active.push(energy);

  const switchCard = createCard({
    instanceId: 20,
    name: 'Switch',
    supertype: 'Trainer',
    text: 'Switch your Active Pokémon with 1 of your Benched Pokémon.',
  });
  state.players.p1.zones.hand.push(switchCard);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 20 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null); // Only 1 benched Pokemon -> auto switched
  const newActive = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  const newBench = res.state.players.p1.zones.bench.find((c) => !c.attachedTo);
  assert.equal(newActive.instanceId, 10);
  assert.equal(newBench.instanceId, 1);

  // Energy still attached to Pikachu (now on bench)
  const benchAttached = res.state.players.p1.zones.bench.find((c) => c.attachedTo === 1);
  assert.ok(benchAttached);
  assert.equal(benchAttached.instanceId, 11);
});

test('trainer: Potion heals 30 damage from damaged Pokémon', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active[0].damage = 50;

  const potion = createCard({
    instanceId: 30,
    name: 'Potion',
    supertype: 'Trainer',
    text: 'Heal 30 damage from 1 of your Pokémon.',
  });
  state.players.p1.zones.hand.push(potion);

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 30 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});
