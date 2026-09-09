import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';

// design 002 slice 3.4c: setup & turn translations. `takeTurn` is the only action in this
// group that gets a translator case — setup/setupPrizes/drawOpeningHand/readyUp/reset/
// restartGame are `server_lifecycle` (the server runs them itself, never as a client-sent
// command) and changeCardBack/changePlaymat are `client_local`; both stay relay-only by
// design, confirmed by the disposition-gate tests in dual-run-bridge.test.mjs.

function makeRoom() {
  const room = new GameRoom({ roomId: 'room-setup-turn', rulesEnabled: false, seed: 3 });
  room.addPlayer('sock1', 'p1', 'Ash');
  room.addPlayer('sock2', 'p2', 'Gary');
  return room;
}

function card(instanceId, overrides = {}) {
  return createCard({ instanceId, name: `Card ${instanceId}`, supertype: 'Trainer', ...overrides });
}

test('takeTurn: advances turn to the opponent and performs start-of-turn draw', () => {
  const room = makeRoom();
  room.state.turn = { player: 'p1', number: 1, phase: 'main' };
  room.state.players.p2.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', { type: 'takeTurn', payload: {}, clientSeq: 1 });

  assert.equal(res.success, true);
  assert.equal(room.state.turn.player, 'p2');
  assert.equal(room.state.turn.number, 2);
  assert.deepEqual(room.state.players.p2.zones.hand.map((c) => c.instanceId), [10]);
  assert.equal(room.state.players.p2.zones.deck.length, 0);
});

test('takeTurn replayed twice via clientSeq dedupe advances the turn once', () => {
  const room = makeRoom();
  room.state.turn = { player: 'p1', number: 1, phase: 'main' };
  room.state.players.p2.zones.deck.push(card(10), card(11));

  const cmd = { type: 'takeTurn', payload: {}, clientSeq: 1 };
  const res1 = room.handleCommand('sock1', cmd);
  const res2 = room.handleCommand('sock1', cmd);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(room.state.turn.player, 'p2');
  assert.equal(room.state.turn.number, 2);
  assert.equal(room.state.players.p2.zones.hand.length, 1);
});
