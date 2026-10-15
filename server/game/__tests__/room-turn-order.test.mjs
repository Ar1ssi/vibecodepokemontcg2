import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GameRoom,
  TURN_ORDER_CALL_TIMEOUT_MS,
  TURN_ORDER_CHOICE_TIMEOUT_MS,
} from '../room.mjs';
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

function winnerSocket(room) {
  return room.playerToSocket.get(room.turnOrder.winnerPlayerId);
}

const otherPlayer = (playerId) => (playerId === 'p1' ? 'p2' : 'p1');

/** A room whose coin has landed, waiting on the winner's first/second answer. */
function flippedRoom({ seed = 7 } = {}) {
  const room = readyRoom({ seed });
  const { callId } = room.beginTurnOrderCall();
  const flip = room.submitTurnOrderCall(callerSocket(room), { callId, call: 'heads' });
  assert.equal(flip.ok, true);
  return { room, flip };
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

// Design 072 row 1: the coin names a winner, who then chooses; nothing is seated yet.
test('submitTurnOrderCall flips and hands the choice to the winner', () => {
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
  assert.equal(res.winnerPlayerId, res.result === 'heads' ? caller : other);
  assert.equal(res.choiceId, `${callId}:choice`);
  assert.equal(res.timeoutMs, TURN_ORDER_CHOICE_TIMEOUT_MS);
  assert.equal('starterPlayerId' in res, false, 'the call alone must not seat a starter');
  assert.equal(room.turnOrder.phase, 'awaiting-choice');
  assert.equal(room.turnOrder.starterPlayerId, null);
  assert.equal(room.isAwaitingTurnOrderCall(), false);
  assert.equal(room.isAwaitingTurnOrderChoice(), true);
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

test('a losing call hands the toss to the other player', () => {
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
    assert.equal(res.winnerPlayerId, res.result === 'tails' ? caller : other);
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
  assert.equal(room.turnOrder.winnerPlayerId, first.winnerPlayerId);
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
  assert.equal(res.winnerPlayerId, res.result === res.call ? caller : other);
  assert.equal(room.turnOrder.phase, 'awaiting-choice');
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

// Design 072 row 2, end to end: the chosen starter is what `setup` actually seats first.
test('the chosen starter is the player the setup command seats first', () => {
  for (const goFirst of [true, false]) {
    const { room, flip } = flippedRoom({ seed: goFirst ? 5 : 9 });
    const res = room.submitTurnOrderChoice(winnerSocket(room), {
      choiceId: flip.choiceId,
      goFirst,
    });
    assert.equal(res.ok, true);
    assert.equal(
      res.starterPlayerId,
      goFirst ? flip.winnerPlayerId : otherPlayer(flip.winnerPlayerId)
    );

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

// Design 072 row 2: the winner may hand the first turn away.
test('a winner going second seats the other player first', () => {
  const { room, flip } = flippedRoom();
  const res = room.submitTurnOrderChoice(winnerSocket(room), {
    choiceId: flip.choiceId,
    goFirst: false,
  });

  assert.equal(res.ok, true);
  assert.equal(res.goFirst, false);
  assert.equal(res.choiceAuto, false);
  assert.equal(res.auto, false);
  assert.equal(res.winnerPlayerId, flip.winnerPlayerId);
  assert.equal(res.starterPlayerId, otherPlayer(flip.winnerPlayerId));
  assert.equal(res.call, flip.call);
  assert.equal(res.result, flip.result);
  assert.equal(room.turnOrder.phase, 'resolved');
  assert.equal(room.isAwaitingTurnOrderChoice(), false);
});

test('a winner going first is seated first', () => {
  const { room, flip } = flippedRoom();
  const res = room.submitTurnOrderChoice(winnerSocket(room), {
    choiceId: flip.choiceId,
    goFirst: true,
  });

  assert.equal(res.ok, true);
  assert.equal(res.goFirst, true);
  assert.equal(res.starterPlayerId, flip.winnerPlayerId);
});

// Design 072 row 3.
test('submitTurnOrderChoice rejects the loser and spectators', () => {
  const { room, flip } = flippedRoom();
  room.addSpectator('sock-spectator');
  const loserSocket = room.playerToSocket.get(otherPlayer(flip.winnerPlayerId));

  for (const socketId of [loserSocket, 'sock-spectator', 'sock-unknown']) {
    assert.deepEqual(
      room.submitTurnOrderChoice(socketId, { choiceId: flip.choiceId, goFirst: true }),
      { ok: false, reason: 'not_winner' }
    );
  }
  assert.equal(room.turnOrder.phase, 'awaiting-choice');
});

// Design 072 row 4.
test('a choice before the coin is flipped is refused', () => {
  const room = readyRoom();
  assert.deepEqual(room.submitTurnOrderChoice('sock1', { choiceId: 'x', goFirst: true }), {
    ok: false,
    reason: 'no_pending_choice',
  });
  assert.deepEqual(room.resolveTurnOrderChoiceAutomatically(), {
    ok: false,
    reason: 'no_pending_choice',
  });

  const { callId } = room.beginTurnOrderCall();
  for (const socketId of ['sock1', 'sock2']) {
    assert.deepEqual(
      room.submitTurnOrderChoice(socketId, { choiceId: `${callId}:choice`, goFirst: true }),
      { ok: false, reason: 'no_pending_choice' }
    );
  }
  assert.equal(room.turnOrder.phase, 'awaiting-call');
});

// Design 072 row 5.
test('a second choice is rejected as already resolved', () => {
  const { room, flip } = flippedRoom();
  const first = room.submitTurnOrderChoice(winnerSocket(room), {
    choiceId: flip.choiceId,
    goFirst: false,
  });
  const second = room.submitTurnOrderChoice(winnerSocket(room), {
    choiceId: flip.choiceId,
    goFirst: true,
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, reason: 'already_resolved' });
  assert.deepEqual(room.resolveTurnOrderChoiceAutomatically(), {
    ok: false,
    reason: 'already_resolved',
  });
  assert.equal(room.turnOrder.starterPlayerId, first.starterPlayerId);
});

// Design 072 row 6.
test('malformed and stale choices are rejected', () => {
  const { room, flip } = flippedRoom();
  for (const bad of [undefined, null, 'yes', 'first', 1, 0, {}]) {
    assert.deepEqual(
      room.submitTurnOrderChoice(winnerSocket(room), { choiceId: flip.choiceId, goFirst: bad }),
      { ok: false, reason: 'invalid_choice' },
      `expected goFirst ${JSON.stringify(bad)} to be refused`
    );
  }
  assert.deepEqual(
    room.submitTurnOrderChoice(winnerSocket(room), { choiceId: 'other', goFirst: true }),
    { ok: false, reason: 'stale_choice' }
  );
  assert.deepEqual(room.submitTurnOrderChoice(winnerSocket(room)), {
    ok: false,
    reason: 'stale_choice',
  });
  assert.equal(room.turnOrder.phase, 'awaiting-choice');
});

// Design 072 row 7: the timeout and a dropped winner share this path.
test('resolveTurnOrderChoiceAutomatically sends a silent winner first', () => {
  const { room, flip } = flippedRoom();
  const res = room.resolveTurnOrderChoiceAutomatically();

  assert.equal(res.ok, true);
  assert.equal(res.goFirst, true);
  assert.equal(res.choiceAuto, true);
  assert.equal(res.auto, false);
  assert.equal(res.starterPlayerId, flip.winnerPlayerId);
  assert.equal(room.turnOrder.phase, 'resolved');
});

// Design 072 row 10.
test('a choiceId from before resetGame is stale', () => {
  const { room, flip } = flippedRoom();
  room.resetGame({ seed: 11 });
  assert.equal(room.turnOrder, null, 'resetGame must clear the pending choice');

  room.state.players.p1.zones.deck.push(...deckOf('p1'));
  room.state.players.p2.zones.deck.push(...deckOf('p2'));
  room.markReady('p1');
  room.markReady('p2');
  const { callId } = room.beginTurnOrderCall();
  const fresh = room.submitTurnOrderCall(callerSocket(room), { callId, call: 'heads' });
  assert.notEqual(fresh.choiceId, flip.choiceId);

  assert.deepEqual(
    room.submitTurnOrderChoice(winnerSocket(room), { choiceId: flip.choiceId, goFirst: false }),
    { ok: false, reason: 'stale_choice' }
  );
  assert.equal(room.turnOrder.phase, 'awaiting-choice');
});

test('the first/second choice never leaks into GameState', () => {
  const { room, flip } = flippedRoom();
  room.submitTurnOrderChoice(winnerSocket(room), { choiceId: flip.choiceId, goFirst: false });

  assert.equal(JSON.stringify(room.state).includes(flip.choiceId), false);
});
