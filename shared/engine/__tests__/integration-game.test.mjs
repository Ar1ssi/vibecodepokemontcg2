import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

function buildDeck(prefix, basicName, weaknessType = null) {
  const deck = [];
  // 5 Basic Pokemon
  for (let i = 1; i <= 5; i++) {
    deck.push(
      createCard({
        instanceId: Number(`${prefix}0${i}`),
        name: `${basicName} ${i}`,
        supertype: 'Pokémon',
        types: [weaknessType ? 'Water' : 'Lightning'],
        stage: 'Basic',
        hp: 60,
        weakness: weaknessType ? { type: weaknessType, value: 2 } : null,
        attacks: [
          {
            name: 'Quick Strike',
            cost: ['Lightning'],
            damage: 30,
          },
        ],
      })
    );
  }
  // 25 Energy cards
  for (let i = 6; i <= 30; i++) {
    deck.push(
      createCard({
        instanceId: Number(`${prefix}${i < 10 ? '0' : ''}${i}`),
        name: 'Lightning Energy',
        supertype: 'Energy',
        type: 'Energy',
      })
    );
  }
  return deck;
}

test('integration: scripted two-player game reaches server-side win condition via prizes and knockout', () => {
  const rng = createRng(1001);

  // Initialize GameState with 2 players and 30-card decks
  let state = createGameState({
    gameId: 'game-integration-1',
    players: {
      p1: { username: 'Ash', zones: { deck: buildDeck(1, 'Pikachu') } },
      p2: { username: 'Gary', zones: { deck: buildDeck(2, 'Squirtle', 'Lightning') } },
    },
    seed: 1001,
    rulesEnabled: true,
  });

  assert.equal(state.turn.phase, 'setup');

  // 1. Setup Phase
  let res = applyCommand(state, {
    type: 'setup',
    payload: { firstPlayerId: 'p1' },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  state = res.state;

  assert.equal(state.turn.phase, 'main');
  assert.equal(state.turn.player, 'p1');
  assert.equal(state.turn.number, 1);
  assert.equal(state.players.p1.zones.hand.length, 8);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p2.zones.hand.length, 7);
  assert.equal(state.players.p2.zones.prizes.length, 6);

  // 2. Turn 1 (Ash / p1)
  // Find a Basic Pokemon in hand to move to active
  const p1Hand = state.players.p1.zones.hand;
  const p1Pokemon = p1Hand.find((c) => c.supertype === 'Pokémon');
  assert.ok(p1Pokemon, 'p1 should have drawn at least one Basic Pokemon due to mulligan logic');

  res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: p1Pokemon.instanceId, from: 'hand', to: 'active' },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Attach an Energy card to active
  const p1Energy = state.players.p1.zones.hand.find((c) => c.supertype === 'Energy');
  assert.ok(p1Energy);

  res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: p1Energy.instanceId, targetInstanceId: p1Pokemon.instanceId },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Confirm Ash cannot attack on Turn 1
  res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, "The player going first can't attack on turn 1.");

  // Ash passes turn
  res = applyCommand(state, {
    type: 'pass',
    payload: {},
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // 3. Turn 2 (Gary / p2)
  assert.equal(state.turn.player, 'p2');
  assert.equal(state.turn.number, 2);
  assert.equal(state.turn.phase, 'main');
  // p2 should have automatically drawn 1 card
  assert.equal(state.players.p2.zones.hand.length, 8);

  // Gary plays Pokemon to active
  const p2Pokemon = state.players.p2.zones.hand.find((c) => c.supertype === 'Pokémon');
  assert.ok(p2Pokemon);

  res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: p2Pokemon.instanceId, from: 'hand', to: 'active' },
    playerId: 'p2',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Gary attaches Energy
  const p2Energy = state.players.p2.zones.hand.find((c) => c.supertype === 'Energy');
  assert.ok(p2Energy);

  res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: p2Energy.instanceId, targetInstanceId: p2Pokemon.instanceId },
    playerId: 'p2',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Gary attacks Ash's active Pokemon
  res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p2',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Ash's Pikachu should have taken 30 damage
  const ashActiveAfterGaryAttack = state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(ashActiveAfterGaryAttack.damage, 30);

  // Gary's attack auto-passed turn to Ash (Turn 3)
  assert.equal(state.turn.player, 'p1');
  assert.equal(state.turn.number, 3);
  assert.equal(state.turn.phase, 'main');

  // 4. Turn 3 (Ash / p1)
  // Ash attacks Gary's Squirtle.
  // Base 30 * 2x (Weakness to Lightning) = 60 damage -> Squirtle HP is 60 -> Knockout!
  res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, null);
  state = res.state;

  // Verify Squirtle was Knocked Out and placed in p2 discard pile
  const squirtleInDiscard = state.players.p2.zones.discard.find((c) => c.instanceId === p2Pokemon.instanceId);
  assert.ok(squirtleInDiscard, "Gary's Squirtle must be in discard after KO");

  // Verify Ash was awarded a prize card on KO (prizes 6 -> 5, hand increased)
  assert.equal(state.players.p1.zones.prizes.length, 5);

  // Gary had no benched Pokemon in play, so Gary has 0 Pokemon in play -> Ash wins by "no Pokémon in play"!
  assert.equal(state.turn.phase, 'ended');
  assert.equal(state.winner, 'p1');
  assert.equal(state.winReason, 'no Pokémon in play');

  const gameEndedEvent = res.events.find((e) => e.type === 'gameEnded');
  assert.ok(gameEndedEvent, 'gameEnded event must be emitted');
  assert.equal(gameEndedEvent.winner, 'p1');
  assert.equal(gameEndedEvent.reason, 'no Pokémon in play');
});
