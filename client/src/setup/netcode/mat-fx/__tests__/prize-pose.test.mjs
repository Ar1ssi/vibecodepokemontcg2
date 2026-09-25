import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIZE_MAX_SPARKS,
  prizeHaloPose,
  prizeSparkAngles,
  prizeSparkCount,
  prizeSparkPose,
} from '../prize-pose.mjs';

test('prizeSparkCount: one spark per card, capped', () => {
  assert.equal(prizeSparkCount(1), 1);
  assert.equal(prizeSparkCount(3), 3);
  assert.equal(prizeSparkCount(50), PRIZE_MAX_SPARKS, 'a flood cannot swamp the overlay');
});

test('prizeSparkCount: nothing to celebrate draws nothing (edge 12)', () => {
  assert.equal(prizeSparkCount(0), 0);
  assert.equal(prizeSparkCount(-2), 0);
  assert.equal(prizeSparkCount(undefined), 0);
  assert.equal(prizeSparkCount(null), 0);
  assert.equal(prizeSparkCount('lots'), 0);
});

test('prizeSparkAngles: evenly spaced, and a single prize throws straight up', () => {
  assert.deepEqual(prizeSparkAngles(0), []);
  assert.deepEqual(prizeSparkAngles(1), [-Math.PI / 2]);
  const four = prizeSparkAngles(4);
  assert.equal(four.length, 4);
  const gaps = four.slice(1).map((a, i) => a - four[i]);
  for (const gap of gaps) assert.ok(Math.abs(gap - Math.PI / 2) < 1e-9);
});

test('prizeSparkPose: starts at the centre, flies out, ends faded', () => {
  const angle = 0;
  const start = prizeSparkPose(angle, 0);
  const end = prizeSparkPose(angle, 1, { distance: 70 });
  assert.equal(start.x, 0);
  assert.equal(start.y, 0);
  assert.equal(start.opacity, 0);
  assert.ok(Math.abs(end.x - 70) < 1e-9, 'travels the full distance along its angle');
  assert.equal(end.opacity, 0);
  assert.ok(prizeSparkPose(angle, 0.3).opacity > 0.5, 'visible in the middle');
});

test('prizeSparkPose: motion decelerates rather than running at constant speed', () => {
  const first = prizeSparkPose(0, 0.25).x;
  const later = prizeSparkPose(0, 1).x - prizeSparkPose(0, 0.75).x;
  assert.ok(first > later, 'the spark slows as it goes');
});

test('prizeSparkPose: stays finite and bounded outside [0,1]', () => {
  for (const t of [-1, -0.01, 1.01, 5]) {
    const pose = prizeSparkPose(0.7, t);
    assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    assert.ok(pose.scale > 0);
  }
});

test('prizeHaloPose: blooms and settles, invisible at both ends', () => {
  assert.ok(prizeHaloPose(0).opacity < 0.01);
  assert.ok(prizeHaloPose(0.3).opacity > 0.5);
  assert.ok(prizeHaloPose(1).opacity < 0.01);
  assert.ok(prizeHaloPose(1).scale > prizeHaloPose(0).scale, 'the halo expands');
});
