import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapGesture, isPhoneLayout } from '../core/card-tap-gesture.mjs';

const harness = () => {
  const calls = [];
  const timers = new Map();
  let nextId = 1;
  const tap = createTapGesture({
    onSingle: (key) => calls.push(['single', key]),
    onDouble: (key) => calls.push(['double', key]),
    setTimer: (fn) => {
      timers.set(nextId, fn);
      return nextId++;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const elapse = () => [...timers.entries()].forEach(([id, fn]) => (timers.delete(id), fn()));
  return { tap, calls, elapse };
};

test('one tap fires single once the double-tap window passes', () => {
  const { tap, calls, elapse } = harness();
  tap('a');
  assert.deepEqual(calls, []);
  elapse();
  assert.deepEqual(calls, [['single', 'a']]);
});

test('two quick taps on one tile fire double only', () => {
  const { tap, calls, elapse } = harness();
  tap('a');
  tap('a');
  elapse();
  assert.deepEqual(calls, [['double', 'a']]);
});

test('a tap on another tile settles the pending one first', () => {
  const { tap, calls, elapse } = harness();
  tap('a');
  tap('b');
  elapse();
  assert.deepEqual(calls, [['single', 'a'], ['single', 'b']]);
});

test('isPhoneLayout is false without matchMedia', () => {
  assert.equal(isPhoneLayout({}), false);
  assert.equal(isPhoneLayout({ matchMedia: () => ({ matches: true }) }), true);
});
