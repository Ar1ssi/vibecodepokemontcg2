import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleReplay } from '../peer-log-catchup.js';

const entries = [
  { action: 'a', parameters: [1] },
  { action: 'b', parameters: [2] },
  { action: 'c', parameters: [3] },
];

test('scheduleReplay: a failed action stops the replay, reports it, and still settles', async () => {
  const applied = [];
  const failures = [];
  let settled = 0;
  await scheduleReplay({
    actions: entries,
    applyAction: async (action) => {
      applied.push(action);
      if (action === 'b') throw new Error('boom');
    },
    onFailed: (error, entry) => failures.push([error.message, entry.action]),
    onSettled: () => {
      settled++;
    },
  });
  assert.deepEqual(applied, ['a', 'b']);
  assert.deepEqual(failures, [['boom', 'b']]);
  assert.equal(settled, 1);
});

test('scheduleReplay: the returned tail resolves so later live actions still run', async () => {
  const ran = [];
  let queue = scheduleReplay({
    actions: entries,
    applyAction: async () => {
      throw new Error('boom');
    },
  });
  queue = queue.then(() => ran.push('live'));
  await queue;
  assert.deepEqual(ran, ['live']);
});

test('scheduleReplay: a rejected current queue does not skip the replay or its settle', async () => {
  const applied = [];
  let settled = false;
  await scheduleReplay({
    actions: entries,
    currentQueue: Promise.reject(new Error('earlier')),
    applyAction: async (action) => {
      applied.push(action);
    },
    onSettled: () => {
      settled = true;
    },
  });
  assert.deepEqual(applied, ['a', 'b', 'c']);
  assert.equal(settled, true);
});

test('scheduleReplay: a throwing onFailed neither skips onSettled nor rejects the tail', async () => {
  let settled = false;
  await scheduleReplay({
    actions: entries,
    applyAction: async () => {
      throw new Error('boom');
    },
    onFailed: () => {
      throw new Error('handler');
    },
    onSettled: () => {
      settled = true;
    },
  });
  assert.equal(settled, true);
});
