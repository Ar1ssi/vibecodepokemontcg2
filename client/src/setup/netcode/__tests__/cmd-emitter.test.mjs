import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  emitCmd,
  emitResolveChoice,
  emitRequestView,
  handleCmdRejected,
  getClientSeq,
  resetClientSeq,
  seedClientSeq,
  addInFlightAffordance,
  clearInFlightAffordances,
} from '../cmd-emitter.js';

class MockSocket {
  constructor() {
    this.emitted = [];
  }
  emit(event, data) {
    this.emitted.push({ event, data });
  }
}

class MockElement {
  constructor() {
    this.classes = new Set();
    this.classList = {
      add: (cls) => this.classes.add(cls),
      remove: (cls) => this.classes.delete(cls),
      contains: (cls) => this.classes.has(cls),
    };
  }
}

beforeEach(() => {
  resetClientSeq(0);
});

test('emitCmd increments monotonic clientSeq and formats command envelope', async () => {
  const socket = new MockSocket();
  const el = new MockElement();

  const res1 = await emitCmd({
    socket,
    roomId: 'room-1',
    type: 'moveCard',
    payload: { instanceId: 10, from: 'hand', to: 'bench' },
    element: el,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.clientSeq, 1);
  assert.equal(getClientSeq(), 1);
  assert.equal(el.classList.contains('cmd-pending'), true);

  assert.equal(socket.emitted.length, 1);
  assert.deepEqual(socket.emitted[0], {
    event: 'cmd',
    data: {
      gameId: 'room-1',
      roomId: 'room-1',
      clientSeq: 1,
      type: 'moveCard',
      payload: { instanceId: 10, from: 'hand', to: 'bench' },
    },
  });

  // Second command increments clientSeq to 2
  const res2 = await emitCmd({
    socket,
    roomId: 'room-1',
    type: 'draw',
    payload: { count: 1 },
  });

  assert.equal(res2.success, true);
  assert.equal(res2.clientSeq, 2);
  assert.equal(getClientSeq(), 2);
});

test('emitCmd rejects malformed command before emitting', async () => {
  const socket = new MockSocket();

  const res = await emitCmd({
    socket,
    roomId: 'room-1',
    type: 'moveCard',
    payload: { instanceId: 'not_an_int', from: 'hand', to: 'bench' },
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'bad_command');
  assert.equal(socket.emitted.length, 0);
  assert.equal(getClientSeq(), 0);
});

test('emitResolveChoice formats resolveChoice payload', async () => {
  const socket = new MockSocket();
  const el = new MockElement();

  const res = await emitResolveChoice({
    socket,
    roomId: 'room-1',
    choiceId: 'choice-99',
    selection: [4, 7],
    element: el,
  });

  assert.equal(res.success, true);
  assert.equal(res.clientSeq, 1);
  assert.equal(el.classList.contains('cmd-pending'), true);

  assert.equal(socket.emitted.length, 1);
  assert.deepEqual(socket.emitted[0], {
    event: 'resolveChoice',
    data: {
      gameId: 'room-1',
      roomId: 'room-1',
      choiceId: 'choice-99',
      selection: [4, 7],
      clientSeq: 1,
    },
  });
});

test('emitRequestView emits requestView event', () => {
  const socket = new MockSocket();
  const ok = emitRequestView({ socket, roomId: 'room-xyz' });
  assert.equal(ok, true);
  assert.equal(socket.emitted.length, 1);
  assert.deepEqual(socket.emitted[0], {
    event: 'requestView',
    data: { gameId: 'room-xyz', roomId: 'room-xyz' },
  });
});

test('clearInFlightAffordances and handleCmdRejected remove cmd-pending', () => {
  const el = new MockElement();
  addInFlightAffordance(el);
  assert.equal(el.classList.contains('cmd-pending'), true);
  clearInFlightAffordances();
  assert.equal(el.classList.contains('cmd-pending'), false);

  addInFlightAffordance(el);
  assert.equal(el.classList.contains('cmd-pending'), true);

  let rejectedResult = null;
  handleCmdRejected(
    { clientSeq: 1, reason: 'stale_view', details: 'Card 10 not in hand' },
    {
      onRejected: (err) => {
        rejectedResult = err;
      },
    }
  );

  assert.equal(el.classList.contains('cmd-pending'), false);
  assert.deepEqual(rejectedResult, {
    reason: 'stale_view',
    details: 'Card 10 not in hand',
    clientSeq: 1,
  });
});

test('seedClientSeq advances clientSeq from server and preserves monotonicity', async () => {
  const socket = new MockSocket();

  assert.equal(getClientSeq(), 0);

  // Seed with server lastClientSeq: 42
  const updated = seedClientSeq(42);
  assert.equal(updated, 42);
  assert.equal(getClientSeq(), 42);

  // Lower or equal sequence does not regress
  seedClientSeq(20);
  assert.equal(getClientSeq(), 42);

  // Invalid values ignored
  seedClientSeq(null);
  seedClientSeq(undefined);
  seedClientSeq(NaN);
  seedClientSeq('100');
  assert.equal(getClientSeq(), 42);

  // Next emitCmd increments past 42 to 43
  const res = await emitCmd({
    socket,
    roomId: 'room-1',
    type: 'draw',
    payload: { count: 1 },
  });

  assert.equal(res.success, true);
  assert.equal(res.clientSeq, 43);
  assert.equal(getClientSeq(), 43);
  assert.equal(socket.emitted[0].data.clientSeq, 43);
});

