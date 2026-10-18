import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_PIN_MAX_MS, createSlidePins } from '../slide-pins.mjs';

const fakeTween = () => {
  const calls = [];
  const tween = (id, poseFn, ms) => {
    let resolve;
    const done = new Promise((r) => {
      resolve = r;
    });
    calls.push({ id, pose: poseFn(0), ms, resolve });
    return done;
  };
  return { calls, tween };
};

const POSE = { rect: { left: 10, top: 20, width: 63, height: 88 }, rotateZDeg: 0, tiltXDeg: 0, lift: 0 };

test('pin holds the mesh at the pre-diff pose with the backstop duration', () => {
  const { calls, tween } = fakeTween();
  const pins = createSlidePins(tween);
  pins.pin(7, POSE);
  assert.deepEqual(
    calls.map(({ id, pose, ms }) => ({ id, pose, ms })),
    [{ id: 7, pose: POSE, ms: SLIDE_PIN_MAX_MS }]
  );
  assert.equal(pins.has(7), true);
});

test('a taken pin is not released again when the queue idles', () => {
  const { calls, tween } = fakeTween();
  const pins = createSlidePins(tween);
  pins.pin(7, POSE);
  pins.take(7);
  pins.releaseAll();
  assert.equal(calls.length, 1);
});

test('releaseAll lets a pin whose slide never came go to its own pose at once', () => {
  const { calls, tween } = fakeTween();
  const pins = createSlidePins(tween);
  pins.pin(7, POSE);
  pins.pin(8, POSE);
  pins.releaseAll();
  assert.deepEqual(
    calls.slice(2).map(({ id, ms }) => ({ id, ms })),
    [
      { id: 7, ms: 0 },
      { id: 8, ms: 0 },
    ]
  );
  assert.equal(pins.has(7), false);
});

test('a pin that ran out on its own is forgotten', async () => {
  const { calls, tween } = fakeTween();
  const pins = createSlidePins(tween);
  pins.pin(7, POSE);
  calls[0].resolve();
  await Promise.resolve();
  assert.equal(pins.has(7), false);
  pins.releaseAll();
  assert.equal(calls.length, 1);
});
