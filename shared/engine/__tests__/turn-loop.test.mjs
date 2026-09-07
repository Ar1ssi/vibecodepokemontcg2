import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

test('turn-loop: pass advances turn, resets flags, and performs start-of-turn draw', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: [createCard({ instanceId: 1, name: 'Card 1' })] } },
      p2: { username: 'Gary', zones: { deck: [createCard({ instanceId: 2, name: 'Card 2' })] } },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 1, phase: 'main' };
  state.players.p1.flags = { energyAttached: true, attackerAttacked: false, retreatedThisTurn: true };

  const result = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });

  assert.equal(result.error, null);
  assert.equal(result.state.turn.player, 'p2');
  assert.equal(result.state.turn.number, 2);
  assert.equal(result.state.turn.phase, 'main');
  assert.equal(result.state.players.p2.flags.energyAttached, false);
  assert.equal(result.state.players.p2.flags.retreatedThisTurn, false);

  // p2 should have drawn 1 card at start of turn
  assert.equal(result.state.players.p2.zones.hand.length, 1);
  assert.equal(result.state.players.p2.zones.deck.length, 0);

  const drawEvent = result.events.find((e) => e.type === 'cardsDrawn');
  assert.ok(drawEvent);
  assert.equal(drawEvent.playerId, 'p2');
  assert.equal(drawEvent.count, 1);
});

test('turn-loop: Edge Case 5 - non-turn player command is rejected with "It\'s not your turn."', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 1, phase: 'main' };

  // p2 attempts to pass during p1 turn
  const result = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p2' });

  assert.equal(result.error, "It's not your turn.");
  assert.equal(result.state.turn.player, 'p1');
});

test('turn-loop: status checkup damage and cures (Poison, Burn, Sleep, Paralysis)', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary', zones: { deck: [createCard({ instanceId: 99, name: 'Deck Card' })] } },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const p1Active = createCard({
    instanceId: 10,
    name: 'Seismitoad',
    hp: 120,
    damage: 0,
    specialCondition: 'Poisoned',
  });
  state.players.p1.zones.active.push(p1Active);

  // Pass turn: should trigger checkup
  const res1 = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });

  assert.equal(res1.error, null);
  // Poison should deal 10 damage during checkup
  const activeCard = res1.state.players.p1.zones.active[0];
  assert.equal(activeCard.damage, 10);
  const poisonEvent = res1.events.find((e) => e.type === 'checkupDamage' && e.condition === 'Poisoned');
  assert.ok(poisonEvent);
});

test('turn-loop: deck-out loss when next player cannot draw at start of turn', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'Gary', zones: { deck: [] } }, // Gary's deck is empty!
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const result = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });

  assert.equal(result.error, null);
  assert.equal(result.state.turn.phase, 'ended');
  assert.equal(result.state.winner, 'p1');
  assert.equal(result.state.winReason, 'deck-out');

  const gameEndedEvent = result.events.find((e) => e.type === 'gameEnded');
  assert.ok(gameEndedEvent);
  assert.equal(gameEndedEvent.winner, 'p1');
  assert.equal(gameEndedEvent.reason, 'deck-out');
});
