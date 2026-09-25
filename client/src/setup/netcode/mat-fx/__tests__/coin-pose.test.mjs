import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COIN_CHIP_MS, coinChipPose, coinFaceLabel } from '../coin-pose.mjs';

test('coinFaceLabel: only the two real faces produce a chip', () => {
  assert.equal(coinFaceLabel('heads'), 'HEADS');
  assert.equal(coinFaceLabel('tails'), 'TAILS');
  assert.equal(coinFaceLabel('HEADS'), null, 'the engine emits lowercase');
  assert.equal(coinFaceLabel(undefined), null);
  assert.equal(coinFaceLabel(''), null);
  assert.equal(coinFaceLabel(true), null);
});

test('coinChipPose: rises, holds legibly, then fades out', () => {
  assert.equal(coinChipPose(0).opacity, 0);
  assert.equal(coinChipPose(1).opacity, 0);
  assert.equal(coinChipPose(0.5).opacity, 1);
  assert.ok(coinChipPose(1).y < coinChipPose(0).y, 'the chip rises');
});

test('coinChipPose: the spin settles to a readable face before the hold', () => {
  assert.equal(coinChipPose(0.7).spin, 1);
  assert.equal(coinChipPose(1).spin, 1);
  const mid = coinChipPose(0.2).spin;
  assert.ok(mid >= -1 && mid <= 1);
});

test('coinChipPose: the spin actually passes edge-on during the flip', () => {
  let minAbs = 1;
  for (let t = 0; t < 0.6; t += 0.01) minAbs = Math.min(minAbs, Math.abs(coinChipPose(t).spin));
  assert.ok(minAbs < 0.1, 'the chip turns through its edge');
});

test('coinChipPose: stays finite and bounded outside [0,1]', () => {
  for (const t of [-2, -0.1, 1.1, 9]) {
    const pose = coinChipPose(t);
    assert.ok(Number.isFinite(pose.y) && Number.isFinite(pose.scale));
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    assert.ok(pose.scale > 0);
  }
});

test('coinChipPose: the chip is on screen long enough to read', () => {
  assert.ok(COIN_CHIP_MS >= 500);
});
