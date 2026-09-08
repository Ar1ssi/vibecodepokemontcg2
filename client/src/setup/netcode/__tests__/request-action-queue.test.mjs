import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_ACTION_TIMEOUT_MS,
  admitRequestAction,
  createRequestActionQueue,
} from '../request-action-queue.js';

test('admitRequestAction classifies counter against expected', () => {
  assert.equal(admitRequestAction(2, 5), 'stale');
  assert.equal(admitRequestAction(5, 5), 'apply');
  assert.equal(admitRequestAction(7, 5), 'buffer');
});

test('STALE_ACTION_TIMEOUT_MS is the design-specified 2000ms', () => {
  assert.equal(STALE_ACTION_TIMEOUT_MS, 2000);
});

test('createRequestActionQueue buffers a gapped action and releases it once expected catches up', () => {
  const queue = createRequestActionQueue();
  queue.buffer(6, { action: 'draw', parameters: ['self'] });
  assert.equal(queue.hasPending(), true);
  assert.deepEqual(queue.takeReady(5), []);
  assert.deepEqual(queue.takeReady(6), [{ action: 'draw', parameters: ['self'] }]);
  assert.equal(queue.hasPending(), false);
});

test('createRequestActionQueue releases a contiguous run in counter order, stopping at the first gap', () => {
  const queue = createRequestActionQueue();
  queue.buffer(7, { action: 'pass', parameters: [] });
  queue.buffer(5, { action: 'draw', parameters: [] });
  queue.buffer(6, { action: 'retreat', parameters: [] });
  queue.buffer(9, { action: 'attack', parameters: [] });
  const ready = queue.takeReady(5);
  assert.deepEqual(ready, [
    { action: 'draw', parameters: [] },
    { action: 'retreat', parameters: [] },
    { action: 'pass', parameters: [] },
  ]);
  assert.equal(queue.hasPending(), true);
  assert.deepEqual(queue.takeReady(9), [{ action: 'attack', parameters: [] }]);
  assert.equal(queue.hasPending(), false);
});

test('createRequestActionQueue.clear drops every buffered action', () => {
  const queue = createRequestActionQueue();
  queue.buffer(3, { action: 'draw', parameters: [] });
  queue.buffer(4, { action: 'pass', parameters: [] });
  queue.clear();
  assert.equal(queue.hasPending(), false);
  assert.deepEqual(queue.takeReady(3), []);
});
