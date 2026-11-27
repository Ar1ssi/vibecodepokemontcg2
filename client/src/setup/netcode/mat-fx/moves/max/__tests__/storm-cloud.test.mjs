import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stormCloudPose } from '../storm-cloud.mjs';

const H = 100;
const steps = (n = 100) => Array.from({ length: n + 1 }, (_, i) => i / n);

test('stormCloudPose: deterministic for a seed, different for another', () => {
  assert.deepEqual(stormCloudPose(0.5, H, 7), stormCloudPose(0.5, H, 7));
  assert.notDeepEqual(stormCloudPose(0.5, H, 7).lobes, stormCloudPose(0.5, H, 8).lobes);
});

test('stormCloudPose: rolls in, holds, thins away; t is clamped', () => {
  assert.equal(stormCloudPose(0, H, 3).alpha, 0);
  assert.ok(stormCloudPose(0.5, H, 3).alpha > 0.99);
  assert.ok(stormCloudPose(0.95, H, 3).alpha < stormCloudPose(0.6, H, 3).alpha);
  assert.equal(stormCloudPose(1, H, 3).alpha, 0);
  assert.deepEqual(stormCloudPose(-2, H, 3), stormCloudPose(0, H, 3));
  for (const s of steps()) {
    const { alpha } = stormCloudPose(s, H, 3);
    assert.ok(alpha >= 0 && alpha <= 1, `${s}: ${alpha}`);
  }
});

test('stormCloudPose: lobes gather in, swell, and spread wider as the cloud thins', () => {
  const width = (s) => {
    const { lobes } = stormCloudPose(s, H, 5, { r: 0.8, puffs: 7 });
    return Math.max(...lobes.map((l) => l.x + l.r)) - Math.min(...lobes.map((l) => l.x - l.r));
  };
  const size = (s) => stormCloudPose(s, H, 5).lobes.reduce((sum, l) => sum + l.r, 0);
  assert.ok(size(0.4) > size(0.05), 'lobes swell as it rolls in');
  assert.ok(width(0.98) > width(0.5), 'smoke spreads as it thins');
  assert.ok(stormCloudPose(0.98, H, 5).width > stormCloudPose(0.5, H, 5).width);
  const { lobes } = stormCloudPose(0.5, H, 5, { r: 0.8, puffs: 7 });
  assert.equal(lobes.length, 21, 'three lobes a billow');
  for (let i = 1; i < lobes.length; i += 1) assert.ok(lobes[i].shade >= lobes[i - 1].shade, 'underside first, lit tops last');
  for (const l of lobes) assert.ok(Math.abs(l.x) < 0.8 * H * 1.3 && l.r > 0 && l.shade >= 0 && l.shade <= 1);
});

test('stormCloudPose: its flashes switch on at once, die fast, and never outlast the cloud', () => {
  const lit = steps(400).filter((s) => stormCloudPose(s, H, 11, { flashes: 3 }).flash);
  assert.ok(lit.length > 0, 'it flickers');
  for (const s of lit) {
    const { flash } = stormCloudPose(s, H, 11, { flashes: 3 });
    assert.ok(flash.alpha > 0 && flash.alpha <= 1 && flash.r > 0, `${s}`);
    assert.ok(s >= 0.25 && s < 0.9, `${s} is inside the hold`);
  }
  assert.equal(steps(200).filter((s) => stormCloudPose(s, H, 11, { flashes: 0 }).flash).length, 0);
});
