import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom, TURN_ORDER_CALL_TIMEOUT_MS } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';

// Design 013: the opening coin call is a server-owned handshake living on GameRoom,
// outside GameState — the client supplies only the heads/tails call, never the result.

/** Enough cards for setupGame's 6 prizes + 7-card opening hand, plus spares. */
function deckOf(playerId) {
  return Array.from({ length: 20 }, (_, i) =>
    createCard({
      instanceId: Number(`${playerId === 'p1' ? 1 : 2}${String(i).padStart(2, '0')}`),
      name: `${playerId} card ${i}`,
      supertype: 'Pokémon',
      subtypes: ['Basic'],
    })
  );
}

/** A room with two seated players, both decked and both "Set Up" — ready to deal. */
function readyRoom({ seed = 7 } = {}) {
  const room = new GameRoom({ roomId: 'room-turn-order', rulesEnabled: false, seed });
  room.addPlayer('sock1', 'p1', 'Ash');
  room.addPlayer('sock2', 'p2', 'Gary');
  room.state.players.p1.zones.deck.push(...deckOf('p1'));
  room.state.players.p2.zones.deck.push(...deckOf('p2'));
  room.markReady('p1');
  room.markReady('p2');
  return room;
}

/** The socket seated opposite the designated caller. */
function nonCallerSocket(room) {
  return room.turnOrder.callerPlayerId === 'p1' ? 'sock2' : 'sock1';
}

function callerSocket(room) {
  return room.playerToSocket.get(room.turnOrder.callerPlayerId);
}

test('beginTurnOrderCall opens a call naming one of the two seated players', () => {
  const room = readyRoom();
  const opened = room.beginTurnOrderCall();

  assert.ok(opened, 'expected a call to open');
  assert.ok(['p1', 'p2'].includes(opened.callerPlayerId));
  assert.equal(opened.timeoutMs, TURN_ORDER_CALL_TIMEOUT_MS);
  assert.equal(room.turnOrder.phase, 'awaiting-call');
  assert.equal(room.isAwaitingTurnOrderCall(), true);
  assert.equal(room.turnOrder.callId, opened.callId);
});

// Row 1: fewer than two ready, decked players.
test('beginTurnOrderCall returns null when the room is not ready to deal', () => {
  const soloRoom = new GameRoom({ roomId: 'room-solo', rulesEnabled: false, seed: 7 });
  soloRoom.addPlayer('sock1', 'p1', 'Ash');
  soloRoom.state.players.p1.zones.deck.push(...deckOf('p1'));
  soloRoom.markReady('p1');

  assert.equal(soloRoom.beginTurnOrderCall(), null);
  assert.equal(soloRoom.turnOrder, null);

  const unreadyRoom = readyRoom();
  unreadyRoom.readyPlayerIds.delete('p2');
  assert.equal(unreadyRoom.beginTurnOrderCall(), null);
  assert.equal(unreadyRoom.turnOrder, null);
});

// Row 4 (first half): a duplicate "both ready" trigger must not re-roll the caller.
test('beginTurnOrderCall is idempotent while a call is open', () => {
  const room = readyRoom();
  const first = room.beginTurnOrderCall();

  assert.equal(room.beginTurnOrderCall(), null);
  assert.equal(room.turnOrder.callId, first.callId);
  assert.equal(room.turnOrder.callerPlayerId, first.callerPlayerId);
});

test('beginTurnOrderCall picks the caller deterministically from the room seed', () => {
  const callerFor = (seed) => readyRoom({ seed }).beginTurnOrderCall().callerPlayerId;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const callers = seeds.map(callerFor);

  assert.deepEqual(seeds.map(callerFor), callers, 'same seed must pick the same caller');
  assert.ok(callers.includes('p1') && callers.includes('p2'), 'both seats must be reachable');
});

// Row 11: the coin actually decides, and the caller wins only on a matching face.
test('submitTurnOrderCall resolves the starter from the call and the server flip', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  const caller = room.turnOrder.callerPlayerId;
  const other = caller === 'p1' ? 'p2' : 'p1';

  const res = room.submitTurnOrderCall(callerSocket(room), { callId, call: 'heads' });

  assert.equal(res.ok, true);
  assert.equal(res.call, 'heads');
  assert.ok(['heads', 'tails'].includes(res.result));
  assert.equal(res.auto, false);
  assert.equal(res.callerPlayerId, caller);
  assert.equal(res.starterPlayerId, res.result === 'heads' ? caller : other);
  assert.equal(room.turnOrder.phase, 'resolved');
  assert.equal(room.isAwaitingTurnOrderCall(), false);
});

test('submitTurnOrderCall echoes the caller coin id, echoing null when absent', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  const res = room.submitTurnOrderCall(callerSocket(room), {
    callId,
    call: 'heads',
    coinId: 'SVC_Gold_Pikachu_Coin',
  });
  assert.equal(res.ok, true);
  assert.equal(res.coinId, 'SVC_Gold_Pikachu_Coin');
  assert.equal(room.turnOrder.coinId, 'SVC_Gold_Pikachu_Coin');

  const room2 = readyRoom();
  const { callId: callId2 } = room2.beginTurnOrderCall();
  const res2 = room2.submitTurnOrderCall(callerSocket(room2), { callId: callId2, call: 'heads' });
  assert.equal(res2.coinId, null);
});

test('submitTurnOrderCall drops a malformed or oversize coin id', () => {
  for (const bad of [42, {}, '', 'x'.repeat(129)]) {
    const room = readyRoom();
    const { callId } = room.beginTurnOrderCall();
    const res = room.submitTurnOrderCall(callerSocket(room), {
      callId,
      call: 'heads',
      coinId: bad,
    });
    assert.equal(res.ok, true);
    assert.equal(res.coinId, null, `expected coinId ${JSON.stringify(bad)} to be dropped`);
  }
});

test('a losing call hands the first turn to the other player', () => {
  // Drive both faces by scanning seeds until each outcome appears, so neither
  // branch depends on one lucky seed.
  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    const room = readyRoom({ seed });
    const { callId } = room.beginTurnOrderCall();
    const caller = room.turnOrder.callerPlayerId;
    const other = caller === 'p1' ? 'p2' : 'p1';
    const res = room.submitTurnOrderCall(callerSocket(room), { callId, call: 'tails' });
    assert.equal(res.ok, true);
    assert.equal(res.starterPlayerId, res.result === 'tails' ? caller : other);
    outcomes.add(res.result === 'tails' ? 'won' : 'lost');
  }
  assert.deepEqual([...outcomes].sort(), ['lost', 'won']);
});

// Row 2: malformed call payloads.
test('submitTurnOrderCall rejects a call that is not heads or tails', () => {
  for (const bad of [null, undefined, '', 'HEADS', 'edge', 0, 1, {}]) {
    const room = readyRoom();
    const { callId } = room.beginTurnOrderCall();

    const res = room.submitTurnOrderCall(callerSocket(room), { callId, call: bad });

    assert.deepEqual(res, { ok: false, reason: 'invalid_call' });
    assert.equal(room.turnOrder.phase, 'awaiting-call', 'the call must stay open');
  }
});

test('submitTurnOrderCall with no payload is rejected before the call face is read', () => {
  const room = readyRoom();
  room.beginTurnOrderCall();

  assert.deepEqual(room.submitTurnOrderCall(callerSocket(room)), {
    ok: false,
    reason: 'stale_call',
  });
  assert.equal(room.turnOrder.phase, 'awaiting-call');
});

// Row 3: the opponent cannot call.
test('submitTurnOrderCall rejects a socket that is not the designated caller', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();

  const res = room.submitTurnOrderCall(nonCallerSocket(room), { callId, call: 'heads' });

  assert.deepEqual(res, { ok: false, reason: 'not_caller' });
  assert.equal(room.turnOrder.phase, 'awaiting-call');
});

// Row 10: spectators map to no playerId.
test('submitTurnOrderCall rejects a spectator socket', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  room.addSpectator('sock-spectator');

  const res = room.submitTurnOrderCall('sock-spectator', { callId, call: 'heads' });

  assert.deepEqual(res, { ok: false, reason: 'not_caller' });
  assert.equal(room.turnOrder.phase, 'awaiting-call');
});

// Row 4 (second half): double-click / duplicate socket event.
test('a second call from the caller is rejected as already resolved', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  const socketId = callerSocket(room);

  const first = room.submitTurnOrderCall(socketId, { callId, call: 'heads' });
  const second = room.submitTurnOrderCall(socketId, { callId, call: 'tails' });

  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, reason: 'already_resolved' });
  assert.equal(room.turnOrder.call, 'heads');
  assert.equal(room.turnOrder.starterPlayerId, first.starterPlayerId);
});

test('submitTurnOrderCall before any call is open is rejected', () => {
  const room = readyRoom();

  assert.deepEqual(room.submitTurnOrderCall('sock1', { callId: 'x', call: 'heads' }), {
    ok: false,
    reason: 'no_pending_call',
  });
});

// Row 7: a call id left over from the previous game.
test('a callId from before resetGame is rejected as stale', () => {
  const room = readyRoom();
  const { callId: staleCallId } = room.beginTurnOrderCall();

  room.resetGame({ seed: 11 });
  assert.equal(room.turnOrder, null, 'resetGame must clear the open call');

  room.state.players.p1.zones.deck.push(...deckOf('p1'));
  room.state.players.p2.zones.deck.push(...deckOf('p2'));
  room.markReady('p1');
  room.markReady('p2');
  const fresh = room.beginTurnOrderCall();
  assert.ok(fresh);
  assert.notEqual(fresh.callId, staleCallId);

  const res = room.submitTurnOrderCall(callerSocket(room), {
    callId: staleCallId,
    call: 'heads',
  });

  assert.deepEqual(res, { ok: false, reason: 'stale_call' });
  assert.equal(room.turnOrder.phase, 'awaiting-call');
});

// Rows 5 and 6: timeout and caller disconnect share one resolution path.
test('resolveTurnOrderCallAutomatically calls for a silent caller', () => {
  const room = readyRoom();
  room.beginTurnOrderCall();
  const caller = room.turnOrder.callerPlayerId;
  const other = caller === 'p1' ? 'p2' : 'p1';

  const res = room.resolveTurnOrderCallAutomatically();

  assert.equal(res.ok, true);
  assert.equal(res.auto, true);
  assert.ok(['heads', 'tails'].includes(res.call));
  assert.ok(['heads', 'tails'].includes(res.result));
  assert.equal(res.starterPlayerId, res.result === res.call ? caller : other);
  assert.equal(room.turnOrder.phase, 'resolved');
});

test('resolveTurnOrderCallAutomatically is refused once the caller has answered', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  room.submitTurnOrderCall(callerSocket(room), { callId, call: 'heads' });

  assert.deepEqual(room.resolveTurnOrderCallAutomatically(), {
    ok: false,
    reason: 'already_resolved',
  });
});

test('resolveTurnOrderCallAutomatically with no open call is refused', () => {
  const room = readyRoom();

  assert.deepEqual(room.resolveTurnOrderCallAutomatically(), {
    ok: false,
    reason: 'no_pending_call',
  });
});

test('clearTurnOrderCall drops the handshake, open or resolved', () => {
  const openRoom = readyRoom();
  openRoom.beginTurnOrderCall();
  openRoom.clearTurnOrderCall();
  assert.equal(openRoom.turnOrder, null);
  assert.equal(openRoom.isAwaitingTurnOrderCall(), false);

  const resolvedRoom = readyRoom();
  const { callId } = resolvedRoom.beginTurnOrderCall();
  resolvedRoom.submitTurnOrderCall(callerSocket(resolvedRoom), { callId, call: 'heads' });
  resolvedRoom.clearTurnOrderCall();
  assert.equal(resolvedRoom.turnOrder, null);
});

// Row 11, end to end: the resolved starter is what `setup` actually seats first.
test('the resolved starter is the player the setup command seats first', () => {
  for (const call of ['heads', 'tails']) {
    const room = readyRoom({ seed: call === 'heads' ? 5 : 9 });
    const { callId } = room.beginTurnOrderCall();
    const res = room.submitTurnOrderCall(callerSocket(room), { callId, call });
    assert.equal(res.ok, true);

    const setupResult = room.handleCommand(callerSocket(room), {
      type: 'setup',
      payload: { firstPlayerId: res.starterPlayerId },
      clientSeq: 1,
    });

    assert.equal(setupResult.success, true);
    assert.equal(room.state.turn.player, res.starterPlayerId);
  }
});

test('the coin call never leaks into GameState', () => {
  const room = readyRoom();
  const { callId } = room.beginTurnOrderCall();
  room.submitTurnOrderCall(callerSocket(room), { callId, call: 'heads' });

  assert.equal('turnOrder' in room.state, false);
  assert.equal(JSON.stringify(room.state).includes(callId), false);
});
