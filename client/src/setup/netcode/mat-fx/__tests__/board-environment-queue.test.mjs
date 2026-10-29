import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_ENVIRONMENT, createBoardEnvironmentQueue } from '../board-environment-queue.mjs';

const harness = ({ mayAnimate = true } = {}) => {
  const pushed = [];
  let clears = 0;
  const calls = [];
  const queue = createBoardEnvironmentQueue({
    push: (plan) => pushed.push(plan),
    clear: () => {
      clears += 1;
    },
    mayAnimate: () => mayAnimate,
  });
  const transition = (name, hold = 1600) => ({
    play: () => {
      calls.push(`${name}:play`);
      return hold;
    },
    settle: () => calls.push(`${name}:settle`),
  });
  return { queue, pushed, calls, transition, clears: () => clears };
};

test('a change that may animate is queued as a board-environment plan; running it plays and returns the hold', () => {
  const { queue, pushed, calls, transition } = harness();
  queue.queue(transition('enter'));
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].kind, BOARD_ENVIRONMENT);
  assert.deepEqual(calls, [], 'nothing plays until the queue reaches it');
  assert.equal(queue.run(pushed[0]), 1600);
  assert.deepEqual(calls, ['enter:play']);
});

test('a change that may not animate (FX off, catch-up, hidden tab) settles at once and queues nothing', () => {
  const { queue, pushed, calls, transition } = harness({ mayAnimate: false });
  queue.queue(transition('enter'));
  assert.deepEqual(pushed, []);
  assert.deepEqual(calls, ['enter:settle']);
});

test('clear empties the FX queue and settles each board plan it dropped, once', () => {
  const { queue, pushed, calls, transition, clears } = harness();
  queue.queue(transition('a'));
  queue.queue(transition('b'));
  queue.clear();
  assert.equal(clears(), 1);
  assert.deepEqual(calls, ['a:settle', 'b:settle']);
  queue.clear();
  assert.equal(clears(), 2);
  assert.deepEqual(calls, ['a:settle', 'b:settle'], 'already settled plans are not settled again');
  assert.equal(pushed.length, 2);
});

test('a plan that already ran is not settled by a later clear', () => {
  const { queue, pushed, calls, transition } = harness();
  queue.queue(transition('a'));
  queue.run(pushed[0]);
  queue.clear();
  assert.deepEqual(calls, ['a:play']);
});
