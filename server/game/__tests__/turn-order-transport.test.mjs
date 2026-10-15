import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GameRoom,
  TURN_ORDER_CALL_TIMEOUT_MS,
  TURN_ORDER_CHOICE_TIMEOUT_MS,
} from '../room.mjs';
import { createTurnOrderTransport } from '../turn-order-transport.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';

// Design 072: TCG Live's StartingCoinFlip over sockets — call, flip, the winner's
// first/second choice, then the deal — driven with a fake emitter and fake timers.

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

function readyRoom({ seed = 7 } = {}) {
  const room = new GameRoom({ roomId: 'room-transport', rulesEnabled: false, seed });
  room.addPlayer('sock1', 'p1', 'Ash');
  room.addPlayer('sock2', 'p2', 'Gary');
  room.state.players.p1.zones.deck.push(...deckOf('p1'));
  room.state.players.p2.zones.deck.push(...deckOf('p2'));
  room.markReady('p1');
  room.markReady('p2');
  return room;
}

/** Fake timers: nothing fires until the test says so. */
function fakeTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    setTimer(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    pendingDelays: () => [...pending.values()].map((t) => t.ms),
    fireAll() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, timer] of due) timer.fn();
    },
  };
}

function harness({ seed, dealSucceeds = () => true } = {}) {
  const room = readyRoom({ seed });
  const sent = [];
  const deals = [];
  const opened = [];
  const timers = fakeTimers();
  const transport = createTurnOrderTransport({
    emitTo: (socketId, event, payload) => sent.push({ socketId, event, payload }),
    deal: (gameRoom, roomId, starterPlayerId) => {
      if (!dealSucceeds(gameRoom)) return false;
      deals.push({ roomId, starterPlayerId });
      return true;
    },
    onCallOpened: (roomId) => opened.push(roomId),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const messages = (event) => sent.filter((m) => m.event === event);
  const to = (event, socketId) => messages(event).find((m) => m.socketId === socketId)?.payload;
  const socketOf = (playerId) => room.playerToSocket.get(playerId);
  return { room, sent, deals, opened, timers, transport, messages, to, socketOf };
}

/** Opens the call and answers it; returns the room's flip state. */
function callAndFlip(h, call = 'heads') {
  h.transport.open(h.room, 'r1');
  const callerSocket = h.socketOf(h.room.turnOrder.callerPlayerId);
  const { callId } = h.to('turnOrderCall', callerSocket);
  h.transport.receiveCall(h.room, 'r1', callerSocket, { callId, call });
  return h.room.turnOrder;
}

test('open sends the callId to the caller only and arms the call timeout', () => {
  const h = harness();
  assert.equal(h.transport.open(h.room, 'r1'), true);

  const callerSocket = h.socketOf(h.room.turnOrder.callerPlayerId);
  const otherSocket = callerSocket === 'sock1' ? 'sock2' : 'sock1';
  assert.equal(h.to('turnOrderCall', callerSocket).callId, h.room.turnOrder.callId);
  assert.equal(h.to('turnOrderCall', callerSocket).waiting, false);
  assert.equal(h.to('turnOrderCall', otherSocket).callId, null);
  assert.equal(h.to('turnOrderCall', otherSocket).waiting, true);
  assert.deepEqual(h.opened, ['r1']);
  assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CALL_TIMEOUT_MS]);

  assert.equal(h.transport.open(h.room, 'r1'), false, 'a second open must not re-roll');
  assert.equal(h.messages('turnOrderCall').length, 2);
});

// Design 072 rows 1 and 11.
test('a call flips the coin and only the winner receives a choiceId; nothing is dealt yet', () => {
  const h = harness();
  const flip = callAndFlip(h);

  assert.equal(flip.phase, 'awaiting-choice');
  const winnerSocket = h.socketOf(flip.winnerPlayerId);
  const loserSocket = winnerSocket === 'sock1' ? 'sock2' : 'sock1';
  const toWinner = h.to('turnOrderFlip', winnerSocket);
  const toLoser = h.to('turnOrderFlip', loserSocket);

  assert.equal(toWinner.winner, 'self');
  assert.equal(toWinner.choiceId, flip.choiceId);
  assert.equal(toLoser.winner, 'opp');
  assert.equal(toLoser.choiceId, null);
  for (const payload of [toWinner, toLoser]) {
    assert.equal(payload.call, 'heads');
    assert.equal(payload.result, flip.result);
    assert.equal(payload.auto, false);
    assert.equal(payload.timeoutMs, TURN_ORDER_CHOICE_TIMEOUT_MS);
    assert.equal('starter' in payload, false);
  }
  const callerSocket = h.socketOf(flip.callerPlayerId);
  assert.equal(h.to('turnOrderFlip', callerSocket).caller, 'self');
  assert.equal(h.messages('turnOrderResult').length, 0);
  assert.deepEqual(h.deals, []);
  assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CHOICE_TIMEOUT_MS]);
});

// Design 072 row 2.
test('the winner going second deals with the other seat first', () => {
  const h = harness();
  const flip = callAndFlip(h);
  const winnerSocket = h.socketOf(flip.winnerPlayerId);
  const loserSocket = winnerSocket === 'sock1' ? 'sock2' : 'sock1';
  const loserPlayerId = h.room.socketToPlayer.get(loserSocket);

  h.transport.receiveChoice(h.room, 'r1', winnerSocket, {
    choiceId: flip.choiceId,
    goFirst: false,
  });

  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: loserPlayerId }]);
  const toWinner = h.to('turnOrderResult', winnerSocket);
  const toLoser = h.to('turnOrderResult', loserSocket);
  assert.equal(toWinner.starter, 'opp');
  assert.equal(toWinner.winner, 'self');
  assert.equal(toWinner.goFirst, false);
  assert.equal(toWinner.choiceAuto, false);
  assert.equal(toLoser.starter, 'self');
  assert.equal(toLoser.winner, 'opp');
  assert.deepEqual(h.timers.pendingDelays(), [], 'the choice timeout must be cleared');
});

test('the winner going first deals with the winner first', () => {
  const h = harness();
  const flip = callAndFlip(h);
  h.transport.receiveChoice(h.room, 'r1', h.socketOf(flip.winnerPlayerId), {
    choiceId: flip.choiceId,
    goFirst: true,
  });

  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: flip.winnerPlayerId }]);
  assert.equal(h.to('turnOrderResult', h.socketOf(flip.winnerPlayerId)).starter, 'self');
});

// Design 072 rows 3 and 5.
test('a loser choice is rejected to the sender alone and a duplicate choice deals once', () => {
  const h = harness();
  const flip = callAndFlip(h);
  const winnerSocket = h.socketOf(flip.winnerPlayerId);
  const loserSocket = winnerSocket === 'sock1' ? 'sock2' : 'sock1';

  h.transport.receiveChoice(h.room, 'r1', loserSocket, { choiceId: flip.choiceId, goFirst: true });
  assert.deepEqual(h.messages('turnOrderChoiceRejected'), [
    { socketId: loserSocket, event: 'turnOrderChoiceRejected', payload: { roomId: 'r1', reason: 'not_winner' } },
  ]);
  assert.deepEqual(h.deals, []);

  h.transport.receiveChoice(h.room, 'r1', winnerSocket, { choiceId: flip.choiceId, goFirst: true });
  h.transport.receiveChoice(h.room, 'r1', winnerSocket, { choiceId: flip.choiceId, goFirst: false });
  assert.equal(h.deals.length, 1);
  assert.equal(h.to('turnOrderChoiceRejected', winnerSocket).reason, 'already_resolved');
});

test('a malformed call is rejected to the sender and flips nothing', () => {
  const h = harness();
  h.transport.open(h.room, 'r1');
  const callerSocket = h.socketOf(h.room.turnOrder.callerPlayerId);

  h.transport.receiveCall(h.room, 'r1', callerSocket, { callId: h.room.turnOrder.callId, call: 'edge' });
  h.transport.receiveCall(h.room, 'r1', callerSocket, null);

  assert.deepEqual(
    h.messages('turnOrderCallRejected').map((m) => m.payload.reason),
    ['invalid_call', 'stale_call']
  );
  assert.equal(h.messages('turnOrderFlip').length, 0);
  assert.equal(h.room.turnOrder.phase, 'awaiting-call');
});

// Design 072 row 7.
test('a silent winner goes first when the choice times out', () => {
  const h = harness();
  const flip = callAndFlip(h);

  h.timers.fireAll();

  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: flip.winnerPlayerId }]);
  const result = h.to('turnOrderResult', h.socketOf(flip.winnerPlayerId));
  assert.equal(result.goFirst, true);
  assert.equal(result.choiceAuto, true);
  assert.equal(result.auto, false);
});

test('a silent caller is called for, and the deal still waits on the winner', () => {
  const h = harness();
  h.transport.open(h.room, 'r1');

  h.timers.fireAll();

  assert.equal(h.room.turnOrder.phase, 'awaiting-choice');
  assert.equal(h.messages('turnOrderFlip').every((m) => m.payload.auto === true), true);
  assert.deepEqual(h.deals, []);
  assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CHOICE_TIMEOUT_MS]);
});

// Design 072 row 8: chosen for at once, but dealt only when the winner's seat is bound
// again, so their dealOrder is not lost (review: a seat dealt to while away desyncs).
test('a winner who drops is chosen for at once and dealt to on their return', () => {
  const h = harness();
  const flip = callAndFlip(h);
  const winnerSocket = h.socketOf(flip.winnerPlayerId);
  const loserSocket = winnerSocket === 'sock1' ? 'sock2' : 'sock1';

  h.room.removeSocket(winnerSocket);
  h.transport.handleSeatLost(h.room, 'r1', flip.winnerPlayerId);

  assert.equal(h.room.turnOrder.phase, 'resolved');
  assert.deepEqual(h.timers.pendingDelays(), []);
  assert.equal(h.to('turnOrderResult', loserSocket).choiceAuto, true);
  assert.equal(h.to('turnOrderResult', winnerSocket), undefined, 'a dropped socket gets nothing');
  assert.deepEqual(h.deals, [], 'no deal while a seat is away');

  h.room.addPlayer('sock-back', flip.winnerPlayerId, flip.winnerPlayerId === 'p1' ? 'Ash' : 'Gary');
  h.transport.replayTo(h.room, 'r1', flip.winnerPlayerId);

  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: flip.winnerPlayerId }]);
  assert.equal(h.to('turnOrderResult', 'sock-back').starter, 'self');
});

test('the loser dropping mid-choice changes nothing', () => {
  const h = harness();
  const flip = callAndFlip(h);
  const loserPlayerId = flip.winnerPlayerId === 'p1' ? 'p2' : 'p1';

  h.room.removeSocket(h.socketOf(loserPlayerId));
  h.transport.handleSeatLost(h.room, 'r1', loserPlayerId);
  h.transport.handleSeatLost(h.room, 'r1', null);

  assert.equal(h.room.turnOrder.phase, 'awaiting-choice');
  assert.deepEqual(h.deals, []);
});

// Design 072 row 9: scan seeds so both "the dropped caller won" and "lost" are exercised.
test('a dropped caller is called for; if they won the toss the choice is made at once', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    const h = harness({ seed });
    h.transport.open(h.room, 'r1');
    const callerPlayerId = h.room.turnOrder.callerPlayerId;

    h.room.removeSocket(h.socketOf(callerPlayerId));
    h.transport.handleSeatLost(h.room, 'r1', callerPlayerId);

    const flip = h.room.turnOrder;
    if (flip.winnerPlayerId === callerPlayerId) {
      outcomes.add('caller won');
      assert.equal(flip.phase, 'resolved');
      assert.equal(flip.starterPlayerId, callerPlayerId);
      assert.deepEqual(h.deals, [], 'dealt only once the caller is back');
      assert.deepEqual(h.timers.pendingDelays(), []);
    } else {
      outcomes.add('caller lost');
      assert.equal(flip.phase, 'awaiting-choice');
      assert.deepEqual(h.deals, []);
      assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CHOICE_TIMEOUT_MS]);
      const winnerSocket = h.socketOf(flip.winnerPlayerId);
      assert.equal(h.to('turnOrderFlip', winnerSocket).choiceId, flip.choiceId);
    }
  }
  assert.deepEqual([...outcomes].sort(), ['caller lost', 'caller won']);
});

// Design 072 row 10.
test('clearTimer drops the pending answer timeout', () => {
  const h = harness();
  callAndFlip(h);
  assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CHOICE_TIMEOUT_MS]);

  h.transport.clearTimer('r1');

  assert.deepEqual(h.timers.pendingDelays(), []);
});

// Review fix: Socket.IO does not carry what was sent to a replaced socket.
test('replayTo re-sends the pending call, with the callId only to the caller', () => {
  const h = harness();
  h.transport.open(h.room, 'r1');
  const callerPlayerId = h.room.turnOrder.callerPlayerId;
  const otherPlayerId = callerPlayerId === 'p1' ? 'p2' : 'p1';
  h.room.addPlayer('sock-new', callerPlayerId, callerPlayerId === 'p1' ? 'Ash' : 'Gary');
  h.sent.length = 0;

  h.transport.replayTo(h.room, 'r1', callerPlayerId);
  h.transport.replayTo(h.room, 'r1', otherPlayerId);

  assert.equal(h.to('turnOrderCall', 'sock-new').callId, h.room.turnOrder.callId);
  assert.equal(h.to('turnOrderCall', h.socketOf(otherPlayerId)).callId, null);
  assert.deepEqual(h.timers.pendingDelays(), [TURN_ORDER_CALL_TIMEOUT_MS], 'no second timer');
});

test('a winner whose socket was replaced gets the prompt again and can answer from it', () => {
  const h = harness();
  const flip = callAndFlip(h);
  const winnerName = flip.winnerPlayerId === 'p1' ? 'Ash' : 'Gary';
  const loserPlayerId = flip.winnerPlayerId === 'p1' ? 'p2' : 'p1';
  h.room.addPlayer('sock-new', flip.winnerPlayerId, winnerName);
  h.sent.length = 0;

  h.transport.replayTo(h.room, 'r1', flip.winnerPlayerId);
  h.transport.replayTo(h.room, 'r1', loserPlayerId);

  const replayed = h.to('turnOrderFlip', 'sock-new');
  assert.equal(replayed.choiceId, flip.choiceId);
  assert.equal(replayed.winner, 'self');
  assert.equal(replayed.timeoutMs, TURN_ORDER_CHOICE_TIMEOUT_MS);
  assert.equal(h.to('turnOrderFlip', h.socketOf(loserPlayerId)).choiceId, null);

  h.transport.receiveChoice(h.room, 'r1', 'sock-new', { choiceId: flip.choiceId, goFirst: false });
  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: loserPlayerId }]);
});

test('replayTo leaves a dealt game alone', () => {
  const h = harness();
  const flip = callAndFlip(h);
  h.transport.receiveChoice(h.room, 'r1', h.socketOf(flip.winnerPlayerId), {
    choiceId: flip.choiceId,
    goFirst: true,
  });
  h.sent.length = 0;

  h.transport.replayTo(h.room, 'r1', 'p1');
  h.transport.replayTo(h.room, 'r1', 'p2');

  assert.deepEqual(h.sent, []);
  assert.equal(h.deals.length, 1);
});

// Review fixes: both seats gone when the choice resolves must not leave the match undealt
// forever, and the first seat back must not be dealt to while the other is still away.
test('a result that could not be dealt is dealt once every seat is back', () => {
  const h = harness({ dealSucceeds: (gameRoom) => gameRoom.playerToSocket.size > 0 });
  h.transport.open(h.room, 'r1');
  const callerPlayerId = h.room.turnOrder.callerPlayerId;
  const otherPlayerId = callerPlayerId === 'p1' ? 'p2' : 'p1';

  h.room.removeSocket(h.socketOf(otherPlayerId));
  h.transport.handleSeatLost(h.room, 'r1', otherPlayerId);
  h.room.removeSocket(h.socketOf(callerPlayerId));
  h.transport.handleSeatLost(h.room, 'r1', callerPlayerId);
  h.timers.fireAll(); // the choice timeout, if the winner was the seat left in the room

  assert.equal(h.room.turnOrder.phase, 'resolved');
  assert.deepEqual(h.deals, []);
  const starterPlayerId = h.room.turnOrder.starterPlayerId;

  h.room.addPlayer('sock1b', 'p1', 'Ash');
  h.transport.replayTo(h.room, 'r1', 'p1');
  assert.deepEqual(h.deals, [], 'p2 is still away');
  assert.equal(h.to('turnOrderResult', 'sock1b').starter, starterPlayerId === 'p1' ? 'self' : 'opp');

  h.room.addPlayer('sock2b', 'p2', 'Gary');
  h.transport.replayTo(h.room, 'r1', 'p2');
  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId }]);
  assert.equal(h.to('turnOrderResult', 'sock2b').starter, starterPlayerId === 'p2' ? 'self' : 'opp');

  h.transport.replayTo(h.room, 'r1', 'p1');
  assert.equal(h.transport.open(h.room, 'r1'), false);
  assert.equal(h.deals.length, 1, 'dealt exactly once');
});

test('open retries an undealt result instead of opening a new call', () => {
  let socketsBack = false;
  const h = harness({ dealSucceeds: () => socketsBack });
  const flip = callAndFlip(h);
  h.transport.receiveChoice(h.room, 'r1', h.socketOf(flip.winnerPlayerId), {
    choiceId: flip.choiceId,
    goFirst: true,
  });
  assert.deepEqual(h.deals, []);

  socketsBack = true;
  h.transport.open(h.room, 'r1');

  assert.deepEqual(h.deals, [{ roomId: 'r1', starterPlayerId: flip.winnerPlayerId }]);
  assert.equal(h.messages('turnOrderCall').length, 2, 'no new call was opened');
});
