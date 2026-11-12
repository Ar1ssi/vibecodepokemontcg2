import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatcher } from '../batcher.mjs';
import { createRing } from '../ring.mjs';
import { LIMITS } from '../log-schema.mjs';

function setup(limits = LIMITS, ringLimits = LIMITS.clientRing) {
  const ring = createRing(ringLimits);
  const batcher = createBatcher({ limits });
  let seq = 0;
  const add = (t, lvl = 'info', line = `{"seq":${seq + 1}}`) => {
    seq += 1;
    ring.push({ seq, t, line });
    batcher.note({ seq, lvl }, t);
  };
  batcher.onConnect(0);
  return { ring, batcher, add };
}

test('3 notes then 2000 ms: due, and take returns 3 lines', () => {
  const { ring, batcher, add } = setup();
  add(0);
  add(0);
  add(0);
  assert.equal(batcher.due(1999), false);
  assert.equal(batcher.due(2000), true);
  const batch = batcher.take(ring, 2000);
  assert.equal(batch.lines.length, 3);
  assert.deepEqual([batch.from, batch.to], [1, 3]);
});

test('an error note is due 250 ms later, not 249', () => {
  const { batcher, add } = setup();
  add(1000, 'error');
  assert.equal(batcher.due(1249), false);
  assert.equal(batcher.due(1250), true);
});

test('take while one is in flight returns null', () => {
  const { ring, batcher, add } = setup();
  add(0);
  assert.ok(batcher.take(ring, 0));
  assert.equal(batcher.take(ring, 0), null);
  assert.equal(batcher.state().inFlight, true);
});

test('acked then reconnect: next take starts at seq 4', () => {
  const { ring, batcher, add } = setup();
  add(0);
  add(0);
  add(0);
  batcher.take(ring, 0);
  batcher.acked(3, 10);
  batcher.onDisconnect();
  batcher.onConnect();
  add(20);
  add(20);
  assert.equal(batcher.take(ring, 5000).from, 4);
});

test("failed('rate') backs off 10 s; other failures back off one flush interval", () => {
  const { ring, batcher, add } = setup();
  add(0);
  batcher.take(ring, 5000);
  batcher.failed('rate', 5000);
  assert.equal(batcher.due(14999), false);
  assert.equal(batcher.due(15000), true);
  batcher.take(ring, 15000);
  batcher.failed('timeout', 15000);
  assert.equal(batcher.due(16999), false);
  assert.equal(batcher.due(17000), true);
});

test('not connected: never due and take is null', () => {
  const { ring, batcher, add } = setup();
  add(0);
  batcher.onDisconnect();
  assert.equal(batcher.due(1e9), false);
  assert.equal(batcher.take(ring, 1e9), null);
});

test('200 pending is due immediately; a take is cut to 200 lines', () => {
  const { ring, batcher, add } = setup();
  for (let i = 0; i < 250; i++) add(0);
  assert.equal(batcher.due(0), true);
  assert.equal(batcher.take(ring, 0).lines.length, 200);
});

test('force makes a young batch due and is cleared by take', () => {
  const { ring, batcher, add } = setup();
  add(0);
  assert.equal(batcher.due(1), false);
  batcher.force();
  assert.equal(batcher.due(1), true);
  batcher.take(ring, 1);
  batcher.acked(1, 2);
  add(3);
  assert.equal(batcher.due(4), false);
});

test('batchMaxBytes cut still returns at least one line', () => {
  const limits = { ...LIMITS, batchMaxBytes: 10 };
  const { ring, batcher, add } = setup(limits);
  add(0, 'info', 'x'.repeat(50));
  add(0, 'info', 'y'.repeat(50));
  assert.equal(batcher.take(ring, 0).lines.length, 1);
  batcher.acked(1, 1);
  const small = setup({ ...LIMITS, batchMaxBytes: 25 });
  for (let i = 0; i < 5; i++) small.add(0, 'info', 'z'.repeat(10));
  assert.equal(small.batcher.take(small.ring, 0).lines.length, 2);
});

test('onConnect(5) skips already-acked seqs', () => {
  const { ring, batcher, add } = setup();
  for (let i = 0; i < 7; i++) add(0);
  batcher.onConnect(5);
  assert.equal(batcher.pending(), 2);
  assert.equal(batcher.take(ring, 0).from, 6);
});

test('unacked respects maxBytes, oldest first', () => {
  const { ring, batcher, add } = setup();
  for (let i = 0; i < 4; i++) add(0, 'info', 'a'.repeat(10));
  assert.equal(batcher.unacked(ring, 25).length, 2);
  batcher.take(ring, 0);
  batcher.acked(2, 1);
  assert.equal(batcher.unacked(ring, 1000).length, 2);
});

test('a ring that evicted unacked entries: take starts at the oldest remaining seq', () => {
  const { ring, batcher, add } = setup(LIMITS, { maxBytes: 1e6, maxEntries: 3 });
  for (let i = 0; i < 6; i++) add(0);
  const batch = batcher.take(ring, 0);
  assert.equal(batch.from, 4);
  assert.equal(batch.lines.length, 3);
});

test('empty ring slice acks nothing pending and returns null', () => {
  const { ring, batcher } = setup();
  batcher.note({ seq: 2, lvl: 'info' }, 0);
  assert.equal(batcher.take(ring, 0), null);
  assert.equal(batcher.pending(), 0);
});
