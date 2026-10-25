import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFT, anchorLift, bodyLift, burstLift, standOn, travelLift } from '../beat-lift.mjs';
import { liftPoint } from '../../../../board3d/fx/gpu-canvas.mjs';

const lane = { ax: 100, ay: 500, bx: 120, by: 200, h: 100 };
const a = { x: 100, y: 500 };
const b = { x: 120, y: 200 };
/** The resolved form gpu-canvas builds from a hint under the identity transform. */
const resolved = (hint) => ({
  z: hint.z ?? 0,
  arc: hint.from && hint.to ? hint.arc ?? 0 : 0,
  from: hint.from ? { x: hint.from[0], y: hint.from[1] } : null,
  to: hint.to ? { x: hint.to[0], y: hint.to[1] } : null,
  stand: hint.at ? hint.stand ?? 0 : 0,
  at: hint.at ? { x: hint.at[0], y: hint.at[1] } : null,
});
const heightAt = (hint, x, y) => liftPoint(resolved(hint), x, y, lane.h).h / lane.h;

test('a travelling beat flies at chest height and rises mid-lane', () => {
  const lift = travelLift(a, b);
  assert.deepEqual(lift.from, [100, 500]);
  assert.deepEqual(lift.to, [120, 200]);
  assert.ok(Math.abs(heightAt(lift, a.x, a.y) - LIFT.travelZ) < 1e-9, 'leaves at chest height');
  assert.ok(Math.abs(heightAt(lift, b.x, b.y) - LIFT.travelZ) < 1e-9, 'lands at chest height');
  assert.ok(Math.abs(heightAt(lift, 110, 350) - (LIFT.travelZ + LIFT.travelArc)) < 1e-9, 'peaks mid-lane');
  assert.equal(travelLift(a, b, { arc: 0.1, z: 0 }).arc, 0.1);
});

test('a travelling body meets the burst at contact at the same height and stand (no jump at hand-over)', () => {
  const body = bodyLift(a, b, b);
  const burst = burstLift(b);
  assert.equal(body.stand, burst.stand);
  for (const [x, y] of [[120, 200], [120, 170], [90, 190]]) {
    assert.ok(Math.abs(heightAt(body, x, y) - heightAt(burst, x, y)) < 0.02 + 1e-9, `${x},${y}`);
  }
});

test('stood on its base line, what the 2D layout drew above it becomes height', () => {
  const lift = standOn(b);
  assert.equal(lift.stand, LIFT.upright);
  const top = liftPoint(resolved(lift), 120, 200 - 160, lane.h);
  const angle = (LIFT.upright * Math.PI) / 2;
  assert.ok(Math.abs(top.h - 160 * Math.sin(angle)) < 1e-9, 'a sky bolt top 1.6 h up the screen rises');
  assert.ok(Math.abs(top.y - (200 - 160 * Math.cos(angle))) < 1e-9, 'leaning back from its base');
  const vertical = liftPoint(resolved(standOn(b, { stand: 1 })), 120, 40, lane.h);
  assert.ok(Math.abs(vertical.h - 160) < 1e-9 && Math.abs(vertical.y - 200) < 1e-9, 'stand 1 is straight up');
});

test('nothing stands past `upright`: a vertical shape is foreshortened by the near-top-down board camera', () => {
  for (const key of ['burstStand', 'faceStand', 'bodyStand', 'particleStand', 'upright']) {
    assert.ok(LIFT[key] > 0 && LIFT[key] <= LIFT.upright, key);
  }
  assert.ok(LIFT.upright <= 0.55);
});

test('a burst opens over its anchor, partly upright so it keeps its size from above', () => {
  const lift = burstLift(b);
  assert.deepEqual(lift.at, [120, 200]);
  assert.equal(lift.z, LIFT.burstZ);
  assert.ok(lift.stand >= 0.3 && lift.stand <= LIFT.upright);
  assert.ok(heightAt(lift, 120, 150) > heightAt(lift, 120, 200), 'its upper half rises');
  assert.equal(burstLift(b, { stand: LIFT.faceStand }).stand, LIFT.faceStand);
});

test('a sky anchor hangs above its card instead of lying up the table', () => {
  const sky = anchorLift(lane, 'sky', { x: 70, y: 30 });
  assert.deepEqual(sky, standOn(b));
  assert.deepEqual(anchorLift(lane, 'sky-attacker', { x: 50, y: 330 }), standOn(a));
  assert.deepEqual(anchorLift(lane, 'defender', b), burstLift(b));
  assert.deepEqual(anchorLift(lane, undefined, b, { stand: 0, z: 0.2 }), { z: 0.2, stand: 0, at: [120, 200] });
});
