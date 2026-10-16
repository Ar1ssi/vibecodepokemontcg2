import test from 'node:test';
import assert from 'node:assert/strict';

import { createTween, easeOutCubic } from '../tween.mjs';

const linear = (t) => t;
const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: ${actual} vs ${expected}`
  );

test('number tween: start, half way, end', () => {
  const tween = createTween({
    from: 0,
    to: 100,
    ms: 200,
    now: 1000,
    ease: linear,
  });
  assert.equal(tween.at(1000), 0);
  assert.equal(tween.at(1100), 50);
  assert.equal(tween.at(1200), 100);
  assert.equal(tween.at(5000), 100);
  assert.equal(tween.done(1100), false);
  assert.equal(tween.done(1200), true);
});

test('default ease is ease-out cubic', () => {
  const tween = createTween({ from: 0, to: 1, ms: 100, now: 0 });
  close(tween.at(50), easeOutCubic(0.5), 'half');
  close(easeOutCubic(0.5), 0.875, 'ease value');
});

test('object tween mixes numeric fields and switches the rest', () => {
  const tween = createTween({
    from: { x: 0, y: 10, yawDeg: 0, face: 'front' },
    to: { x: 100, y: 20, yawDeg: 180, face: 'back' },
    ms: 100,
    now: 0,
    ease: linear,
  });
  assert.deepEqual(tween.at(0), { x: 0, y: 10, yawDeg: 0, face: 'back' });
  assert.deepEqual(tween.at(50), { x: 50, y: 15, yawDeg: 90, face: 'back' });
  assert.deepEqual(tween.at(100), { x: 100, y: 20, yawDeg: 180, face: 'back' });
});

test('retarget mid-way continues from the current value (edge case 11)', () => {
  const tween = createTween({
    from: { x: 0 },
    to: { x: 100 },
    ms: 100,
    now: 0,
    ease: linear,
  });
  assert.equal(tween.at(20).x, 20);
  tween.retarget({ x: 200 }, 20, 100);
  assert.equal(tween.at(20).x, 20, 'no snap at the retarget instant');
  assert.equal(tween.at(70).x, 110);
  assert.equal(tween.at(120).x, 200);
  assert.deepEqual(tween.target, { x: 200 });
});

test('ms 0 is done immediately at the target', () => {
  const tween = createTween({ from: 5, to: 9, ms: 0, now: 100 });
  assert.equal(tween.done(100), true);
  assert.equal(tween.at(100), 9);
  tween.retarget(3, 200, 0);
  assert.equal(tween.at(200), 3);
});
