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

// ── Design 024: the dispatcher also gates sound and returns the queue hold ──

const makeWithSound = (over = {}) => {
  const calls = [];
  const dispatch = createFxDispatcher({
    // NB: these bodies are braced on purpose. `Array.push` returns the new
    // length, and a bare `() => calls.push(...)` would hand the dispatcher a
    // stray numeric hold override.
    effects: {
      damage: () => {
        calls.push(['fx', 'damage']);
      },
    },
    staticFallbacks: {
      glow: () => {
        calls.push(['static', 'glow']);
      },
    },
    isDisabled: () => false,
    isMotionReduced: () => false,
    isSoundDisabled: () => false,
    playSound: (p) => {
      calls.push(['sound', p.effect]);
    },
    holdFor: (effect) => (effect === 'damage' ? 180 : 0),
    ...over,
  });
  return { dispatch, calls };
};

test('dispatcher: returns the effect hold, and 0 for anything it did not run', () => {
  const { dispatch } = makeWithSound();
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 180);
  assert.equal(dispatch({ kind: 'fx', effect: 'nope' }), 0);
  assert.equal(dispatch({ kind: 'shuffle' }), 0);
  assert.equal(dispatch(null), 0);
});

test('dispatcher: a throwing effect returns a 0 hold so the queue keeps moving', () => {
  const { dispatch } = makeWithSound({
    effects: {
      damage: () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 0);
});

test('dispatcher: sound plays before the visual, from the same choke point', () => {
  const { dispatch, calls } = makeWithSound();
  dispatch({ kind: 'fx', effect: 'damage' });
  assert.deepEqual(calls, [
    ['sound', 'damage'],
    ['fx', 'damage'],
  ]);
});

test('dispatcher: reduced motion skips the visual but KEEPS the sound', () => {
  // Motion sensitivity and sound preference are separate accessibility axes.
  const { dispatch, calls } = makeWithSound({ isMotionReduced: () => true });
  dispatch({ kind: 'fx', effect: 'damage' });
  assert.deepEqual(calls, [['sound', 'damage']]);
});

test('dispatcher: the mute silences sound but leaves visuals alone', () => {
  const { dispatch, calls } = makeWithSound({ isSoundDisabled: () => true });
  dispatch({ kind: 'fx', effect: 'damage' });
  assert.deepEqual(calls, [['fx', 'damage']]);
});

test('dispatcher: the kill switch stops sound as well as visuals', () => {
  const { dispatch, calls } = makeWithSound({ isDisabled: () => true });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 0);
  assert.deepEqual(calls, []);
});

test('dispatcher: a throwing sound never stops the visual', () => {
  const { dispatch, calls } = makeWithSound({
    playSound: () => {
      throw new Error('no audio device');
    },
  });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 180);
  assert.deepEqual(calls, [['fx', 'damage']]);
});

test('dispatcher: sound is off by default when no driver is injected', () => {
  const calls = [];
  const dispatch = createFxDispatcher({
    effects: {
      damage: () => {
        calls.push('fx');
      },
    },
    isDisabled: () => false,
    isMotionReduced: () => false,
  });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 0);
  assert.deepEqual(calls, ['fx']);
});

test('dispatcher: an effect that drew nothing returns 0 and does not pace the queue', () => {
  // Every effect guards on a missing card/rect and returns 0 there. Holding
  // the chain for a beat nothing drew would stall it on an invisible step.
  const { dispatch } = makeWithSound({ effects: { damage: () => 0 } });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 0);
});

test('dispatcher: an effect may override its table hold with its own', () => {
  // The Tool branch of `attach` does this: it arrives as `attach` but paces
  // as the shorter `tool-attach`.
  const { dispatch } = makeWithSound({ effects: { damage: () => 55 } });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 55);
});

test('dispatcher: a void or junk return falls back to the table hold', () => {
  for (const returned of [undefined, null, NaN, Infinity, 'soon', {}]) {
    const { dispatch } = makeWithSound({ effects: { damage: () => returned } });
    assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 180, `bad return: ${returned}`);
  }
});

test('dispatcher: a negative override cannot rewind the queue', () => {
  const { dispatch } = makeWithSound({ effects: { damage: () => -500 } });
  assert.equal(dispatch({ kind: 'fx', effect: 'damage' }), 0);
});
