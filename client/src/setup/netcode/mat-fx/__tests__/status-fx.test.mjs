import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusApplyPose,
  statusClearPose,
  statusFxFor,
} from '../status-fx.mjs';

test('statusFxFor: every engine condition maps, unknown and inherited keys do not', () => {
  for (const condition of ['Poisoned', 'Burned', 'Asleep', 'Paralyzed', 'Confused']) {
    assert.ok(statusFxFor(condition).label);
  }
  assert.equal(statusFxFor('Frozen'), null);
  assert.equal(statusFxFor(undefined), null);
  assert.equal(statusFxFor('toString'), null);
});

test('statusApplyPose: ring flares then fades, label holds then fades', () => {
  assert.equal(statusApplyPose(0).ringOpacity, 0);
  assert.equal(statusApplyPose(1).ringOpacity, 0);
  assert.equal(statusApplyPose(1).labelOpacity, 0);
  assert.equal(statusApplyPose(0.5).labelOpacity, 1);
  assert.ok(statusApplyPose(1).ringScale > statusApplyPose(0).ringScale);
  assert.deepEqual(statusApplyPose(-1), statusApplyPose(0));
});

// ── Design 024 slice 4: recovery ──────────────────────────────────────────

test('statusClearPose: the ring collapses inward, the inverse of the apply pop', () => {
  assert.ok(statusClearPose(1).ringScale < statusClearPose(0).ringScale, 'clear contracts');
  assert.ok(statusApplyPose(1).ringScale > statusApplyPose(0).ringScale, 'apply expands');
});

test('statusClearPose: fades in and back out, and carries no label', () => {
  assert.equal(statusClearPose(0).ringOpacity, 0);
  assert.equal(statusClearPose(1).ringOpacity, 0);
  assert.ok(statusClearPose(0.2).ringOpacity > 0.8);
  assert.equal(statusClearPose(0.5).labelOpacity, undefined);
});

test('statusClearPose: bounded outside [0,1]', () => {
  for (const t of [-1, 1.5]) {
    const pose = statusClearPose(t);
    assert.ok(Number.isFinite(pose.ringScale));
    assert.ok(pose.ringOpacity >= 0 && pose.ringOpacity <= 1);
  }
});
