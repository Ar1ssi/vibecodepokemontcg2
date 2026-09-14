import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOCKOUT_DURATION_MS, KNOCKOUT_FLASH_END, knockoutPose } from '../knockout-pose.mjs';

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
