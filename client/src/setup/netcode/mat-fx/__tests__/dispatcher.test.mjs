import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxDispatcher } from '../dispatcher.mjs';

const make = (over = {}) => {
  const calls = [];
  const dispatch = createFxDispatcher({
    effects: { damage: (p) => calls.push(['fx', p.effect]) },
    staticFallbacks: { glow: (p) => calls.push(['static', p.effect]) },
    isDisabled: () => false,
    isMotionReduced: () => false,
    ...over,
  });
  return { dispatch, calls };
};

test('dispatcher: runs the named effect', () => {
  const { dispatch, calls } = make();
  dispatch({ kind: 'fx', effect: 'damage' });
  assert.deepEqual(calls, [['fx', 'damage']]);
});

test('dispatcher: unknown effect and non-fx plans are no-ops', () => {
  const { dispatch, calls } = make();
  dispatch({ kind: 'fx', effect: 'nope' });
  dispatch({ kind: 'shuffle', effect: 'damage' });
  dispatch(null);
  assert.deepEqual(calls, []);
});

test('dispatcher: fx-off kill switch skips everything', () => {
  const { dispatch, calls } = make({ isDisabled: () => true });
  dispatch({ kind: 'fx', effect: 'damage' });
  assert.deepEqual(calls, []);
});

test('dispatcher: reduced motion skips transient effects, runs static fallbacks', () => {
  const { dispatch, calls } = make({ isMotionReduced: () => true });
  dispatch({ kind: 'fx', effect: 'damage' });
  dispatch({ kind: 'fx', effect: 'glow' });
  assert.deepEqual(calls, [['static', 'glow']]);
});

test('dispatcher: a throwing effect is contained', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { dispatch } = make({
      effects: {
        damage: () => {
          throw new Error('boom');
        },
      },
    });
    assert.doesNotThrow(() => dispatch({ kind: 'fx', effect: 'damage' }));
  } finally {
    console.warn = warn;
  }
});
