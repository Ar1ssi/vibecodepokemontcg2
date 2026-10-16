import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSceneClock } from '../scene-clock.js';

// A WAAPI-shaped canvas whose animation time the test sets, as fx-preview's freeze does.
const setup = () => {
  const animation = { currentTime: 0, cancelled: false, cancel: () => (animation.cancelled = true) };
  const canvas = { animate: () => animation };
  const frames = [];
  const clock = createSceneClock(canvas, {
    requestFrame: (fn) => frames.push(fn),
    cancelFrame: (id) => {
      frames[id - 1] = null;
    },
  });
  const runFrame = () => {
    const pending = frames.splice(0);
    for (const fn of pending) fn?.();
  };
  return { animation, clock, frames, runFrame };
};

describe('createSceneClock', () => {
  it('reads time from the canvas animation, so a frozen animation freezes the scene', () => {
    const { animation, clock } = setup();
    animation.currentTime = 1234;
    assert.equal(clock.now(), 1234);
  });

  it('ticks only while started and subscribed (hidden tab = stopped = no frames)', () => {
    const { animation, clock, frames, runFrame } = setup();
    const seen = [];
    const off = clock.onTick((time) => seen.push(time));
    assert.equal(frames.length, 0, 'not started');
    clock.start();
    animation.currentTime = 16;
    runFrame();
    assert.deepEqual(seen, [16]);
    clock.stop();
    runFrame();
    assert.deepEqual(seen, [16]);
    clock.start();
    animation.currentTime = 48;
    runFrame();
    assert.deepEqual(seen, [16, 48]);
    off();
    runFrame();
    assert.equal(frames.length, 0, 'no subscribers, no frames');
  });

  it('dispose cancels the animation and ignores later subscriptions', () => {
    const { animation, clock, frames } = setup();
    clock.start();
    clock.dispose();
    assert.equal(animation.cancelled, true);
    clock.onTick(() => {});
    assert.equal(frames.length, 0);
  });
});
