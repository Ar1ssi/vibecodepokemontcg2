import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOCKOUT_DURATION_MS,
  KNOCKOUT_FLASH_END,
  knockoutPose,
  knockoutStackIds,
} from '../knockout-pose.mjs';
import { createSlidePins } from '../../netcode/mat-fx/slide-pins.mjs';

test('design 089: a knocked-out stack is the Pokémon then its attached cards; junk has no ids', () => {
  assert.deepEqual(knockoutStackIds({ instanceId: 5, attached: [{ instanceId: 6 }, { src: 'x' }, { instanceId: 7 }] }), [5, 6, 7]);
  assert.deepEqual(knockoutStackIds({ instanceId: 5 }), [5]);
  assert.deepEqual(knockoutStackIds(null), []);
  assert.deepEqual(knockoutStackIds({ attached: 'nope' }), []);
});

test('design 089: the cards of a stack the knockout scene does not fly are let go when it starts, not at the 9 s backstop', () => {
  const log = [];
  const pins = createSlidePins({ pin: () => true, unpin: (id, { ms }) => log.push([id, ms]), setTimer: () => 0, clearTimer: () => {} });
  // A Pokémon with eight cards attached: the scene flies it and five of them.
  const ghost = { instanceId: 1, attached: [2, 3, 4, 5, 6, 7, 8, 9].map((instanceId) => ({ instanceId })) };
  const stack = knockoutStackIds(ghost);
  stack.forEach((id) => pins.pin(id));
  stack.forEach((id) => pins.claim(id));
  // The queue goes idle: claimed pins stay.
  pins.releaseAll();
  assert.ok(stack.every((id) => pins.has(id)));
  const flown = stack.slice(0, 6);
  flown.forEach((id) => pins.take(id));
  // What knockout-flight.js does once the scene has started.
  stack.forEach((id) => pins.release(id));
  assert.ok(stack.every((id) => !pins.has(id)), 'nothing is left frozen in the slot');
  assert.deepEqual(log.filter(([id]) => flown.includes(id)).length, 6, 'a flown card is not released a second time');
  assert.deepEqual(log.filter(([, ms]) => ms > 0).map(([id]) => id), [7, 8, 9]);
});

const fromRect = { left: 100, top: 100, width: 80, height: 110 };
const toRect = { left: 400, top: 600, width: 60, height: 80 };

test('knockoutPose: duration and flash-end constants are sane', () => {
  assert.ok(KNOCKOUT_DURATION_MS > 0);
  assert.ok(KNOCKOUT_FLASH_END > 0 && KNOCKOUT_FLASH_END < 1);
});

test('knockoutPose: t=0 is at the victim rect, fully opaque, no drift', () => {
  const pose = knockoutPose(0, { fromRect, toRect });
  assert.equal(pose.x, 0);
  assert.equal(pose.y, 0);
  assert.equal(pose.opacity, 1);
  assert.equal(pose.saturate, 1);
});

test('knockoutPose: t=1 has drifted to the discard rect and fully faded', () => {
  const pose = knockoutPose(1, { fromRect, toRect });
  const fromCx = fromRect.left + fromRect.width / 2;
  const fromCy = fromRect.top + fromRect.height / 2;
  const toCx = toRect.left + toRect.width / 2;
  const toCy = toRect.top + toRect.height / 2;
  assert.equal(pose.x, toCx - fromCx);
  assert.equal(pose.y, toCy - fromCy);
  assert.equal(pose.opacity, 0);
  assert.equal(pose.saturate, 0);
});

test('knockoutPose: flash phase (t <= FLASH_END) never drifts', () => {
  for (const t of [0, 0.1, 0.2, KNOCKOUT_FLASH_END]) {
    const pose = knockoutPose(t, { fromRect, toRect });
    assert.equal(pose.x, 0);
    assert.equal(pose.y, 0);
    assert.equal(pose.opacity, 1);
  }
});

test('knockoutPose: opacity is monotonically non-increasing across the whole timeline', () => {
  let prevOpacity = Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const pose = knockoutPose(t, { fromRect, toRect });
    assert.ok(pose.opacity <= prevOpacity + 1e-9, `opacity rose at t=${t}`);
    prevOpacity = pose.opacity;
  }
});

test('knockoutPose: t outside [0,1] is clamped, matching the endpoints', () => {
  assert.deepEqual(knockoutPose(-0.5, { fromRect, toRect }), knockoutPose(0, { fromRect, toRect }));
  assert.deepEqual(knockoutPose(1.5, { fromRect, toRect }), knockoutPose(1, { fromRect, toRect }));
});
