import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';

function createMockGame(activeSpecialCondition = 'Asleep') {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          active: [
            createCard({
              instanceId: 10,
              name: 'Snorlax',
              hp: 100,
              damage: 0,
              specialCondition: activeSpecialCondition,
              attacks: [{ name: 'Body Slam', damage: 30, cost: [] }],
            }),
          ],
          bench: [
            createCard({
              instanceId: 11,
              name: 'Pikachu',
              hp: 60,
              damage: 0,
            }),
          ],
          deck: [createCard({ instanceId: 12, name: 'P1 Deck' })],
          discard: [],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [
            createCard({
              instanceId: 20,
              name: 'Eevee',
              hp: 60,
              damage: 0,
              attacks: [{ name: 'Quick Attack', damage: 10, cost: [] }],
            }),
          ],
          bench: [
            createCard({
              instanceId: 21,
              name: 'Vulpix',
              hp: 60,
              damage: 0,
            }),
          ],
          deck: [createCard({ instanceId: 22, name: 'P2 Deck' })],
          discard: [],
        },
      },
    },
    rulesEnabled: true,
  });

  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

test('Asleep active Pokémon cannot declare an attack (validateLegality and applyCommand)', () => {
  const state = createMockGame('Asleep');

  // Direct validateLegality check
  const legality = validateLegality(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(legality.allowed, false);
  assert.equal(legality.reason, "Asleep — this Pokémon can't attack or retreat.");

  // applyCommand returns error and preserves state without attack execution
  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(res.error, "Asleep — this Pokémon can't attack or retreat.");
  assert.equal(res.events.length, 0);
  assert.equal(res.state.players.p1.zones.active[0].specialCondition, 'Asleep');
  assert.equal(res.state.players.p2.zones.active[0].damage, 0);
});

test('Asleep active Pokémon cannot retreat', () => {
  const state = createMockGame('Asleep');

  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 11 },
    playerId: 'p1',
  });
  assert.equal(res.error, "Asleep — this Pokémon can't retreat.");
  assert.equal(res.state.players.p1.zones.active[0].instanceId, 10);
});

test('Infinite attack reroll exploit is blocked: repeated attack commands fail deterministically', () => {
  const state = createMockGame('Asleep');

  // Attempting multiple consecutive attack commands must consistently fail
  for (let i = 0; i < 5; i++) {
    const res = applyCommand(state, {
      type: 'attack',
      payload: { attackIndex: 0 },
      playerId: 'p1',
    });
    assert.equal(res.error, "Asleep — this Pokémon can't attack or retreat.");
    assert.equal(res.state.players.p1.zones.active[0].specialCondition, 'Asleep');
    assert.equal(res.state.players.p1.flags?.attackerAttacked, undefined);
  }
});

test('Checkup between turns flips coin for Asleep: tails remains Asleep, heads wakes up', () => {
  const state = createMockGame('Asleep');

  // Mock RNG returning tails (>= 0.5) during checkup
  const rngTails = {
    cursor: 0,
    next: () => 0.8,
  };

  const passTailsRes = applyCommand(
    state,
    {
      type: 'pass',
      payload: {},
      playerId: 'p1',
    },
    rngTails
  );

  assert.equal(passTailsRes.error, null);
  // Still asleep on P2's turn
  assert.equal(passTailsRes.state.players.p1.zones.active[0].specialCondition, 'Asleep');
  assert.equal(passTailsRes.state.turn.player, 'p2');

  // Mock RNG returning heads (< 0.5) during checkup when P2 passes back
  const rngHeads = {
    cursor: 0,
    next: () => 0.2,
  };

  const passHeadsRes = applyCommand(
    passTailsRes.state,
    {
      type: 'pass',
      payload: {},
      playerId: 'p2',
    },
    rngHeads
  );

  assert.equal(passHeadsRes.error, null);
  // Snorlax woke up!
  assert.equal(passHeadsRes.state.players.p1.zones.active[0].specialCondition, null);
  const statusClearedEvent = passHeadsRes.events.find(
    (e) => e.type === 'statusCleared' && e.condition === 'Asleep'
  );
  assert.ok(statusClearedEvent);
  assert.equal(statusClearedEvent.instanceId, 10);
  assert.equal(statusClearedEvent.playerId, 'p1');

  // Now that Snorlax is awake, P1 can attack legally
  assert.equal(passHeadsRes.state.turn.player, 'p1');
  const attackRes = applyCommand(passHeadsRes.state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attackRes.error, null);
  assert.equal(attackRes.state.players.p2.zones.active[0].damage, 30);
});
