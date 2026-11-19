import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxQueue } from '../fx-queue.mjs';
import { BOARD_ENVIRONMENT, createBoardEnvironmentQueue } from '../board-environment-queue.mjs';

const fakeClock = () => {
  let armed = null;
  return {
    schedule: (fn) => {
      armed = fn;
      return 1;
    },
    cancel: () => {
      armed = null;
    },
    tick() {
      const fn = armed;
      armed = null;
      fn?.();
      return !!fn;
    },
  };
};

test('fx-queue: a plan pushed from inside run waits out the running plan\'s hold', () => {
  const clock = fakeClock();
  const ran = [];
  const delays = [];
  let queue;
  queue = createFxQueue({
    run: (plan) => {
      ran.push(plan.id);
      if (plan.id === 'a') queue.push({ id: 'nested' });
      return plan.id === 'a' ? 500 : 10;
    },
    schedule: (fn, ms) => {
      delays.push(ms);
      return clock.schedule(fn, ms);
    },
    cancel: clock.cancel,
  });
  queue.push({ id: 'a' });
  assert.deepEqual(ran, ['a'], 'the nested plan did not start inside a\'s run');
  assert.deepEqual(delays, [500], 'a\'s own hold was armed');
  clock.tick();
  assert.deepEqual(ran, ['a', 'nested']);
});

test('fx-queue: a plan pushed after a clear inside the same run still plays', () => {
  const clock = fakeClock();
  const ran = [];
  let queue;
  queue = createFxQueue({
    run: (plan) => {
      ran.push(plan.id);
      if (plan.id === 'a') {
        queue.clear();
        queue.push({ id: 'after-clear' });
      }
      return 10;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  queue.push({ id: 'a' });
  assert.deepEqual(ran, ['a', 'after-clear']);
});

test('board-environment queue: a play that throws still lands the board', () => {
  const calls = [];
  const pushed = [];
  const queue = createBoardEnvironmentQueue({ push: (p) => pushed.push(p), clear: () => {}, mayAnimate: () => true });
  queue.queue({
    play: () => {
      throw new Error('scene gone');
    },
    settle: () => calls.push('settle'),
  });
  assert.equal(pushed[0].kind, BOARD_ENVIRONMENT);
  assert.equal(queue.run(pushed[0]), 0);
  assert.deepEqual(calls, ['settle']);
});
