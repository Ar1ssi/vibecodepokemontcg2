import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PEER_LOG_MAX,
  buildPeerLogResponse,
  isPeerLogForMe,
  emitRequestPeerLog,
  scheduleReplay,
} from '../peer-log-catchup.js';

test('buildPeerLogResponse returns the tail past fromCounter, uncapped', () => {
  const selfActionData = [
    { action: 'draw', parameters: ['self'] },
    { action: 'pass', parameters: ['self'] },
    { action: 'draw', parameters: ['self'] },
  ];
  const result = buildPeerLogResponse({
    selfActionData,
    fromCounter: 1,
    requesterSocketId: 'peer-1',
    roomId: 'room-1',
  });
  assert.equal(result.capped, false);
  assert.equal(result.roomId, 'room-1');
  assert.equal(result.toSocketId, 'peer-1');
  assert.deepEqual(result.actions, [
    { action: 'pass', parameters: ['self'] },
    { action: 'draw', parameters: ['self'] },
  ]);
});

test('buildPeerLogResponse strips extra fields down to action/parameters', () => {
  const selfActionData = [
    { action: 'draw', parameters: ['self'], type: 'draw', user: 'self', timestamp: 1, meta: {} },
  ];
  const result = buildPeerLogResponse({ selfActionData, fromCounter: 0, roomId: 'r' });
  assert.deepEqual(result.actions, [{ action: 'draw', parameters: ['self'] }]);
});

test('buildPeerLogResponse caps at PEER_LOG_MAX and returns no actions', () => {
  const selfActionData = Array.from({ length: PEER_LOG_MAX + 1 }, (_, i) => ({
    action: 'pass',
    parameters: [i],
  }));
  const result = buildPeerLogResponse({ selfActionData, fromCounter: 0, roomId: 'r' });
  assert.equal(result.capped, true);
  assert.deepEqual(result.actions, []);
});

test('buildPeerLogResponse at exactly the cap is not capped', () => {
  const selfActionData = Array.from({ length: PEER_LOG_MAX }, (_, i) => ({
    action: 'pass',
    parameters: [i],
  }));
  const result = buildPeerLogResponse({ selfActionData, fromCounter: 0, roomId: 'r' });
  assert.equal(result.capped, false);
  assert.equal(result.actions.length, PEER_LOG_MAX);
});

test('buildPeerLogResponse clamps a negative or missing fromCounter to 0', () => {
  const selfActionData = [{ action: 'draw', parameters: [] }];
  const result = buildPeerLogResponse({ selfActionData, fromCounter: -5, roomId: 'r' });
  assert.equal(result.actions.length, 1);
  const resultMissing = buildPeerLogResponse({ selfActionData, roomId: 'r' });
  assert.equal(resultMissing.actions.length, 1);
});

test('isPeerLogForMe matches only when toSocketId equals mySocketId', () => {
  assert.equal(isPeerLogForMe({ toSocketId: 'abc', mySocketId: 'abc' }), true);
  assert.equal(isPeerLogForMe({ toSocketId: 'abc', mySocketId: 'def' }), false);
  assert.equal(isPeerLogForMe({ toSocketId: undefined, mySocketId: 'abc' }), false);
});

test('emitRequestPeerLog emits requestPeerLog with the given fields', () => {
  const calls = [];
  const socket = { emit: (event, data) => calls.push([event, data]) };
  const ok = emitRequestPeerLog({
    socket,
    roomId: 'room-1',
    fromCounter: 3,
    requesterSocketId: 'me',
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['requestPeerLog', { roomId: 'room-1', fromCounter: 3, requesterSocketId: 'me' }],
  ]);
});

test('emitRequestPeerLog returns false without a socket or roomId', () => {
  assert.equal(emitRequestPeerLog({ socket: null, roomId: 'r', fromCounter: 0 }), false);
  assert.equal(emitRequestPeerLog({ socket: { emit: () => {} }, roomId: '', fromCounter: 0 }), false);
});

test('scheduleReplay applies actions in order and calls onSettled once, after', async () => {
  const applied = [];
  const applyAction = async (action, parameters) => {
    applied.push([action, parameters]);
  };
  let settledAt = null;
  const actions = [
    { action: 'a', parameters: [1] },
    { action: 'b', parameters: [2] },
    { action: 'c', parameters: [3] },
  ];
  const queue = scheduleReplay({
    actions,
    applyAction,
    onSettled: () => {
      settledAt = applied.length;
    },
  });
  await queue;
  assert.deepEqual(applied, [
    ['a', [1]],
    ['b', [2]],
    ['c', [3]],
  ]);
  assert.equal(settledAt, 3);
});

test('scheduleReplay chains onto an existing queue so ordering with live traffic is preserved', async () => {
  const order = [];
  const currentQueue = Promise.resolve().then(() => order.push('live-1'));
  const applyAction = async (action) => {
    order.push(action);
  };
  const queue = scheduleReplay({
    actions: [{ action: 'catchup-1', parameters: [] }],
    currentQueue,
    applyAction,
  });
  await queue;
  assert.deepEqual(order, ['live-1', 'catchup-1']);
});

test('scheduleReplay with no actions still resolves and runs onSettled', async () => {
  let settled = false;
  await scheduleReplay({
    actions: [],
    applyAction: async () => {},
    onSettled: () => {
      settled = true;
    },
  });
  assert.equal(settled, true);
});
