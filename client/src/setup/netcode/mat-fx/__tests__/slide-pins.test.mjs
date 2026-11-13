import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_PIN_GLIDE_MS, SLIDE_PIN_MAX_MS, createSlidePins } from '../slide-pins.mjs';

/** A fake scene (which cards have a mesh) and a fake clock. */
const harness = ({ drawn = [7, 8] } = {}) => {
  const log = [];
  const timers = new Map();
  let nextTimer = 1;
  const pins = createSlidePins({
    pin: (id) => {
      const ok = drawn.includes(id);
      if (ok) log.push(['pin', id]);
      return ok;
    },
    unpin: (id, { ms }) => log.push(['unpin', id, ms]),
    setTimer: (fn, ms) => {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const fireTimers = () => {
    for (const [id, { fn }] of [...timers]) {
      timers.delete(id);
      fn();
    }
  };
  return { pins, log, timers, fireTimers };
};

test('pin freezes a drawn card once, with the backstop armed; a card with no mesh is not pinned', () => {
  const { pins, log, timers } = harness();
  assert.equal(pins.pin(7), true);
  assert.equal(pins.pin(7), true);
  assert.equal(pins.pin(99), false);
  assert.deepEqual(log, [['pin', 7]]);
  assert.equal(pins.has(7), true);
  assert.equal(pins.has(99), false);
  assert.deepEqual([...timers.values()].map((timer) => timer.ms), [SLIDE_PIN_MAX_MS]);
});

test('take hands the card to a flight: unpinned at once, its backstop cleared, and not released again', () => {
  const { pins, log, timers } = harness();
  pins.pin(7);
  pins.take(7);
  pins.take(7);
  pins.releaseAll();
  assert.deepEqual(log, [['pin', 7], ['unpin', 7, 0]]);
  assert.equal(timers.size, 0);
  assert.equal(pins.has(7), false);
});

test('releaseAll lets a pin whose slide never came glide to where the view has it', () => {
  const { pins, log } = harness();
  pins.pin(7);
  pins.pin(8);
  pins.releaseAll();
  assert.deepEqual(log.slice(2), [
    ['unpin', 7, SLIDE_PIN_GLIDE_MS],
    ['unpin', 8, SLIDE_PIN_GLIDE_MS],
  ]);
  assert.equal(pins.has(7), false);
});

test('design 089: a claimed pin outlives releaseAll (its scene is about to play) and still goes when taken', () => {
  const { pins, log } = harness();
  pins.pin(7);
  pins.pin(8);
  pins.claim(7);
  pins.claim(99);
  pins.releaseAll();
  assert.equal(pins.has(7), true);
  assert.equal(pins.has(8), false);
  pins.take(7);
  assert.deepEqual(log.slice(2), [
    ['unpin', 8, SLIDE_PIN_GLIDE_MS],
    ['unpin', 7, 0],
  ]);
});

test('the backstop frees a pin nobody took, claimed or not', () => {
  const { pins, log, fireTimers } = harness();
  pins.pin(7);
  pins.claim(7);
  fireTimers();
  assert.deepEqual(log, [['pin', 7], ['unpin', 7, SLIDE_PIN_GLIDE_MS]]);
  assert.equal(pins.has(7), false);
  pins.releaseAll();
  assert.equal(log.length, 2);
});
