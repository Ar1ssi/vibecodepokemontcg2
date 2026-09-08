import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

test('Paralysis persists across opponent turn and is only cured at the end of the paralyzed player\'s turn', () => {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          active: [
            createCard({
              instanceId: 10,
              name: 'Pikachu',
              hp: 60,
              damage: 0,
              attacks: [{ name: 'Thunder Shock', damage: 20, cost: [] }],
            }),
          ],
          deck: [createCard({ instanceId: 11, name: 'P1 Card' })],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [
            createCard({
              instanceId: 20,
              name: 'Squirtle',
              hp: 70,
              damage: 0,
              specialCondition: 'Paralyzed',
              attacks: [{ name: 'Water Gun', damage: 20, cost: [] }],
            }),
          ],
          bench: [
            createCard({
              instanceId: 21,
              name: 'Charmander',
              hp: 60,
              damage: 0,
            }),
          ],
          deck: [createCard({ instanceId: 22, name: 'P2 Card' })],
        },
      },
    },
    rulesEnabled: true,
  });

  // It is Player 1's turn (Turn 2)
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  // P1 ends their turn by attacking
  const attackRes = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });

  assert.equal(attackRes.error, null);
  // P1 dealt 20 damage to P2's active Squirtle
  assert.equal(attackRes.state.players.p2.zones.active[0].damage, 20);

  // CRITICAL (Finding 13): P2 was paralyzed. At the end of P1's turn,
  // P2's Paralysis MUST NOT be cured!
  assert.equal(
    attackRes.state.players.p2.zones.active[0].specialCondition,
    'Paralyzed',
    'Defending Pokémon should remain Paralyzed when the attacking player ends their turn'
  );

  // Verify no statusCleared event was fired for P2 during P1's checkup
  const clearedDuringP1 = attackRes.events.filter(
    (e) => e.type === 'statusCleared' && e.playerId === 'p2' && e.condition === 'Paralyzed'
  );
  assert.equal(clearedDuringP1.length, 0);

  // Turn advanced to Player 2
  assert.equal(attackRes.state.turn.player, 'p2');
  assert.equal(attackRes.state.turn.number, 3);

  // On P2's turn, P2 is Paralyzed and cannot attack
  const p2AttackAttempt = applyCommand(attackRes.state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p2',
  });
  assert.equal(
    p2AttackAttempt.error,
    "Paralyzed — this Pokémon can't attack or retreat."
  );

  // P2 is Paralyzed and cannot retreat
  const p2RetreatAttempt = applyCommand(attackRes.state, {
    type: 'retreat',
    payload: { benchInstanceId: 21 },
    playerId: 'p2',
  });
  assert.equal(
    p2RetreatAttempt.error,
    "Paralyzed — this Pokémon can't retreat."
  );

  // P2 passes their turn
  const p2PassRes = applyCommand(attackRes.state, {
    type: 'pass',
    payload: {},
    playerId: 'p2',
  });
  assert.equal(p2PassRes.error, null);

  // At the end of P2's own turn, Paralysis IS cured!
  assert.equal(
    p2PassRes.state.players.p2.zones.active[0].specialCondition,
    null,
    "Paralysis should be cured at the end of the paralyzed player's turn"
  );

  // Verify statusCleared event was fired for P2
  const p2ClearedEvent = p2PassRes.events.find(
    (e) => e.type === 'statusCleared' && e.playerId === 'p2' && e.condition === 'Paralyzed'
  );
  assert.ok(p2ClearedEvent, 'Expected statusCleared event for Paralyzed on P2 at end of P2 turn');
  assert.equal(p2ClearedEvent.instanceId, 20);

  // Turn advanced back to Player 1
  assert.equal(p2PassRes.state.turn.player, 'p1');
  assert.equal(p2PassRes.state.turn.number, 4);
});

test('Paralysis is not cured when opponent passes', () => {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          active: [createCard({ instanceId: 10, name: 'Pikachu' })],
          deck: [createCard({ instanceId: 11, name: 'P1 Card' })],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [createCard({ instanceId: 20, name: 'Squirtle', specialCondition: 'Paralyzed' })],
          deck: [createCard({ instanceId: 21, name: 'P2 Card' })],
        },
      },
    },
    rulesEnabled: true,
  });

  state.turn = { player: 'p1', number: 1, phase: 'main' };

  // P1 simply passes without attacking
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });

  assert.equal(res.error, null);
  // P2 must still be paralyzed
  assert.equal(res.state.players.p2.zones.active[0].specialCondition, 'Paralyzed');
});
