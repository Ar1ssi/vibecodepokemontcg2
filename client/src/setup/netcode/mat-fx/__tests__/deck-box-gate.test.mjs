import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATE_BACKSTOP_SLACK_MS, createOpeningDealGate } from '../deck-box-gate.mjs';

const fakeClock = () => {
  const timers = new Map();
  let next = 1;
  return {
    schedule: (fn, ms) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    cancel: (id) => timers.delete(id),
    fire: () => {
      const pending = [...timers.entries()];
      timers.clear();
      for (const [, { fn }] of pending) fn();
    },
    pending: () => [...timers.values()].map((timer) => timer.ms),
  };
};

test('with no deal playing, a callback runs at once', () => {
  const gate = createOpeningDealGate(fakeClock());
  const calls = [];
  gate.afterOpeningDeal(() => calls.push('call'));
  assert.deepEqual(calls, ['call']);
  assert.equal(gate.busy(), false);
});

test('during a deal, callbacks wait and run in arrival order when it ends', () => {
  const gate = createOpeningDealGate(fakeClock());
  const calls = [];
  gate.begin(3000);
  gate.afterOpeningDeal(() => calls.push('call'));
  gate.afterOpeningDeal(() => calls.push('flip'));
  gate.afterOpeningDeal(() => calls.push('result'));
  assert.deepEqual(calls, []);
  assert.equal(gate.busy(), true);
  gate.end();
  assert.deepEqual(calls, ['call', 'flip', 'result']);
  gate.afterOpeningDeal(() => calls.push('later'));
  assert.deepEqual(calls.at(-1), 'later');
});

test('a deal that never reports its end is released by the backstop', () => {
  const clock = fakeClock();
  const gate = createOpeningDealGate(clock);
  const calls = [];
  gate.begin(3000);
  assert.deepEqual(clock.pending(), [3000 + GATE_BACKSTOP_SLACK_MS]);
  gate.afterOpeningDeal(() => calls.push('call'));
  clock.fire();
  assert.deepEqual(calls, ['call']);
  assert.equal(gate.busy(), false);
});

test('ending cancels the backstop, and a second end is harmless', () => {
  const clock = fakeClock();
  const gate = createOpeningDealGate(clock);
  gate.begin(1000);
  gate.end();
  assert.deepEqual(clock.pending(), []);
  gate.end();
  assert.equal(gate.busy(), false);
});

test('a callback that throws does not stop the ones queued after it', () => {
  const gate = createOpeningDealGate(fakeClock());
  const calls = [];
  const original = console.error;
  console.error = () => {};
  try {
    gate.begin(1000);
    gate.afterOpeningDeal(() => {
      throw new Error('boom');
    });
    gate.afterOpeningDeal(() => calls.push('after'));
    gate.end();
  } finally {
    console.error = original;
  }
  assert.deepEqual(calls, ['after']);
});

test('a non-function is ignored', () => {
  const gate = createOpeningDealGate(fakeClock());
  gate.begin(1000);
  gate.afterOpeningDeal(null);
  gate.end();
  assert.equal(gate.busy(), false);
});
