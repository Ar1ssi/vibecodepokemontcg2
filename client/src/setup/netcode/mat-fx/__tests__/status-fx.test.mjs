import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusApplyPose, statusFxFor } from '../status-fx.mjs';

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
