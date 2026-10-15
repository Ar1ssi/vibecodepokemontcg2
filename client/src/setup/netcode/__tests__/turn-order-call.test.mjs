import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTurnOrderFlip,
  getTurnOrderResult,
  normalizeTurnOrderFlip,
  normalizeTurnOrderResult,
  registerTurnOrderCallListeners,
  resetTurnOrderCall,
} from '../turn-order-call.js';

/** Minimal socket stand-in: records handlers and lets a test fire them. */
function fakeSocket() {
  const handlers = new Map();
  return {
    on(event, handler) {
      handlers.set(event, handler);
    },
    emitInbound(event, data) {
      handlers.get(event)?.(data);
    },
    has(event) {
      return handlers.has(event);
    },
  };
}

/** Minimal document stand-in that records dispatched CustomEvents. */
function fakeDoc() {
  const events = [];
  return {
    events,
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
}

// CustomEvent is available in Node 19+; assert rather than silently skip.
test('the test environment provides CustomEvent', () => {
  assert.equal(typeof CustomEvent, 'function');
});

test('normalizeTurnOrderResult accepts a well-formed payload', () => {
  assert.deepEqual(
    normalizeTurnOrderResult({
      caller: 'opp',
      call: 'tails',
      result: 'heads',
      winner: 'self',
      goFirst: false,
      starter: 'opp',
      auto: 1,
      choiceAuto: 0,
    }),
    {
      caller: 'opp',
      call: 'tails',
      result: 'heads',
      winner: 'self',
      goFirst: false,
      starter: 'opp',
      coinId: null,
      auto: true,
      choiceAuto: false,
    }
  );
});

test('normalizeTurnOrderResult passes a bounded coinId and drops a bad one', () => {
  const base = {
    caller: 'self',
    call: 'heads',
    result: 'heads',
    winner: 'self',
    goFirst: true,
    starter: 'self',
  };
  assert.equal(
    normalizeTurnOrderResult({ ...base, coinId: 'SVC_Gold_Pikachu_Coin' }).coinId,
    'SVC_Gold_Pikachu_Coin'
  );
  assert.equal(normalizeTurnOrderResult({ ...base, coinId: '' }).coinId, null);
  assert.equal(normalizeTurnOrderResult({ ...base, coinId: 42 }).coinId, null);
  assert.equal(normalizeTurnOrderResult({ ...base, coinId: 'x'.repeat(129) }).coinId, null);
});

test('normalizeTurnOrderResult rejects a half-valid payload', () => {
  const good = {
    caller: 'self',
    call: 'heads',
    result: 'heads',
    winner: 'self',
    goFirst: true,
    starter: 'self',
  };
  assert.equal(normalizeTurnOrderResult(null), null);
  assert.equal(normalizeTurnOrderResult(undefined), null);
  assert.equal(normalizeTurnOrderResult({}), null);
  for (const key of ['caller', 'call', 'result', 'winner', 'goFirst', 'starter']) {
    assert.equal(
      normalizeTurnOrderResult({ ...good, [key]: 'nonsense' }),
      null,
      `expected a bad ${key} to be rejected`
    );
    assert.equal(normalizeTurnOrderResult({ ...good, [key]: null }), null);
  }
});

test('registerTurnOrderCallListeners tolerates a missing socket', () => {
  assert.doesNotThrow(() => registerTurnOrderCallListeners(null, fakeDoc()));
  assert.doesNotThrow(() => registerTurnOrderCallListeners({}, fakeDoc()));
});

test('a turnOrderCall for the designated caller carries its callId', () => {
  resetTurnOrderCall();
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderCall', {
    roomId: 'room-1',
    callId: 'room-1:1',
    waiting: false,
    timeoutMs: 15000,
  });

  assert.equal(doc.events.length, 1);
  assert.equal(doc.events[0].type, 'rules-turn-order-call');
  assert.deepEqual(doc.events[0].detail, {
    roomId: 'room-1',
    callId: 'room-1:1',
    waiting: false,
    timeoutMs: 15000,
  });
});

test('the non-calling seat is told to wait and gets no callId', () => {
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderCall', { roomId: 'room-1', callId: null, waiting: true });

  assert.deepEqual(doc.events[0].detail, {
    roomId: 'room-1',
    callId: null,
    waiting: true,
    timeoutMs: null,
  });
});

test('a non-string callId is not passed on as a usable call', () => {
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderCall', { roomId: 'room-1', callId: 42, waiting: false });

  assert.equal(doc.events[0].detail.callId, null);
});

test('an empty turnOrderCall payload dispatches nothing', () => {
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderCall', null);

  assert.equal(doc.events.length, 0);
});

// Design 013 row 8: the result normally lands before the rules bridge is ready
// for it, so it must still be readable afterwards.
test('turnOrderResult is dispatched and cached for a late reader', () => {
  resetTurnOrderCall();
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  assert.equal(getTurnOrderResult(), null);
  socket.emitInbound('turnOrderResult', {
    roomId: 'room-1',
    caller: 'self',
    call: 'heads',
    result: 'tails',
    winner: 'opp',
    goFirst: true,
    starter: 'opp',
    coinId: 'SVC_Gold_Pikachu_Coin',
    auto: false,
    choiceAuto: true,
  });

  const expected = {
    caller: 'self',
    call: 'heads',
    result: 'tails',
    winner: 'opp',
    goFirst: true,
    starter: 'opp',
    coinId: 'SVC_Gold_Pikachu_Coin',
    auto: false,
    choiceAuto: true,
  };
  assert.equal(doc.events[0].type, 'rules-turn-order-result');
  assert.deepEqual(doc.events[0].detail, expected);
  assert.deepEqual(getTurnOrderResult(), expected);

  resetTurnOrderCall();
  assert.equal(getTurnOrderResult(), null);
});

test('a malformed turnOrderResult is neither dispatched nor cached', () => {
  resetTurnOrderCall();
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderResult', { caller: 'self', starter: 'nobody' });

  assert.equal(doc.events.length, 0);
  assert.equal(getTurnOrderResult(), null);
});

test('a rejected call is surfaced with its reason', () => {
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderCallRejected', { reason: 'not_caller' });
  socket.emitInbound('turnOrderCallRejected', null);

  assert.deepEqual(
    doc.events.map((e) => [e.type, e.detail.reason]),
    [
      ['rules-turn-order-call-rejected', 'not_caller'],
      ['rules-turn-order-call-rejected', 'unknown'],
    ]
  );
});

// Design 072: the coin lands first; the winner's choice comes later.
const FLIP = {
  roomId: 'room-1',
  caller: 'opp',
  call: 'tails',
  result: 'tails',
  winner: 'self',
  choiceId: 'room-1:1:choice',
  coinId: 'SVC_Gold_Pikachu_Coin',
  auto: false,
  timeoutMs: 25000,
};

test('normalizeTurnOrderFlip keeps the choiceId only on the winner copy', () => {
  assert.deepEqual(normalizeTurnOrderFlip(FLIP), {
    caller: 'opp',
    call: 'tails',
    result: 'tails',
    winner: 'self',
    choiceId: 'room-1:1:choice',
    coinId: 'SVC_Gold_Pikachu_Coin',
    auto: false,
    timeoutMs: 25000,
  });
  assert.equal(normalizeTurnOrderFlip({ ...FLIP, winner: 'opp' }).choiceId, null);
  assert.equal(normalizeTurnOrderFlip({ ...FLIP, choiceId: 7 }).choiceId, null);
  assert.equal(normalizeTurnOrderFlip({ ...FLIP, timeoutMs: 'soon' }).timeoutMs, null);
});

test('normalizeTurnOrderFlip rejects a half-valid payload', () => {
  assert.equal(normalizeTurnOrderFlip(null), null);
  for (const key of ['caller', 'call', 'result', 'winner']) {
    assert.equal(
      normalizeTurnOrderFlip({ ...FLIP, [key]: 'nonsense' }),
      null,
      `expected a bad ${key} to be rejected`
    );
  }
});

test('turnOrderFlip is dispatched with its room and cached until reset', () => {
  resetTurnOrderCall();
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderFlip', FLIP);
  socket.emitInbound('turnOrderFlip', { ...FLIP, winner: 'nobody' });

  assert.equal(doc.events.length, 1);
  assert.equal(doc.events[0].type, 'rules-turn-order-flip');
  assert.equal(doc.events[0].detail.roomId, 'room-1');
  assert.equal(doc.events[0].detail.choiceId, 'room-1:1:choice');
  assert.equal(getTurnOrderFlip().winner, 'self');

  resetTurnOrderCall();
  assert.equal(getTurnOrderFlip(), null);
});

test('a rejected choice is surfaced with its reason', () => {
  const socket = fakeSocket();
  const doc = fakeDoc();
  registerTurnOrderCallListeners(socket, doc);

  socket.emitInbound('turnOrderChoiceRejected', { reason: 'not_winner' });
  socket.emitInbound('turnOrderChoiceRejected', undefined);

  assert.deepEqual(
    doc.events.map((e) => [e.type, e.detail.reason]),
    [
      ['rules-turn-order-choice-rejected', 'not_winner'],
      ['rules-turn-order-choice-rejected', 'unknown'],
    ]
  );
});

test('normalizeTurnOrderResult rejects a starter the winner did not choose', () => {
  const base = { caller: 'self', call: 'heads', result: 'tails', winner: 'opp' };
  assert.equal(normalizeTurnOrderResult({ ...base, goFirst: true, starter: 'self' }), null);
  assert.equal(normalizeTurnOrderResult({ ...base, goFirst: false, starter: 'opp' }), null);
  assert.equal(normalizeTurnOrderResult({ ...base, goFirst: false, starter: 'self' }).starter, 'self');
});
