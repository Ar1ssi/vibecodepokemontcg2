import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  HIDDEN_SCALE,
  PASSIVE_DEGREES_PER_SECOND,
  blendPose,
  coinFrame,
  composePoint,
  dragYaw,
  layoutFor,
  nextIndex,
  passiveYaw,
  projectPoint,
} from '../stage-math.mjs';

const scene = JSON.parse(
  fs.readFileSync(new URL('../../../../../assets/deckbox/scene.json', import.meta.url), 'utf8')
);
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

const identity = { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };

test('layoutFor(null) is Preview All: every slot at its grouped pose', () => {
  const layout = layoutFor(scene, null);
  for (const slot of ['box', 'sleeve', 'coin']) {
    assert.equal(layout[slot].visible, true);
    assert.deepEqual(layout[slot].pose, scene.slots[slot].grouped);
  }
});

test('layoutFor(slot) centres that slot at x 0 and shrinks the others in place', () => {
  const layout = layoutFor(scene, 'sleeve');
  assert.equal(layout.sleeve.visible, true);
  assert.deepEqual(layout.sleeve.pose.p, [0, scene.slots.sleeve.focused.p[1], scene.slots.sleeve.focused.p[2]]);
  for (const slot of ['box', 'coin']) {
    assert.equal(layout[slot].visible, false);
    assert.deepEqual(layout[slot].pose.p, scene.slots[slot].grouped.p);
    assert.deepEqual(layout[slot].pose.s, [HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE]);
  }
});

test('layoutFor copies poses: mutating a layout leaves scene.json data alone', () => {
  const layout = layoutFor(scene, null);
  layout.box.pose.p[0] = 9999;
  assert.notEqual(scene.slots.box.grouped.p[0], 9999);
});

test('blendPose runs a→b over t, clamps t and keeps quaternions unit length', () => {
  const a = { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };
  const b = { p: [10, 20, 30], q: [0, Math.SQRT1_2, 0, Math.SQRT1_2], s: [3, 3, 3] };
  assert.deepEqual(blendPose(a, b, 0), a);
  const half = blendPose(a, b, 0.5);
  assert.deepEqual(half.p, [5, 10, 15]);
  assert.deepEqual(half.s, [2, 2, 2]);
  near(Math.hypot(...half.q), 1);
  near(half.q[1], Math.sin(Math.PI / 8));
  assert.deepEqual(blendPose(a, b, 7).p, [10, 20, 30]);
  assert.deepEqual(blendPose(a, b, -1).p, [0, 0, 0]);
});

test('blendPose takes the short way round when the quaternions are on opposite sides', () => {
  const a = { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };
  const b = { p: [0, 0, 0], q: [0, 0, 0, -1], s: [1, 1, 1] };
  const mid = blendPose(a, b, 0.5);
  near(Math.abs(mid.q[3]), 1);
});

test('composePoint scales, rotates and then translates', () => {
  const parent = { p: [10, 0, 0], q: [0, 0, Math.SQRT1_2, Math.SQRT1_2], s: [2, 2, 2] };
  const [x, y, z] = composePoint(parent, [1, 0, 0]);
  near(x, 10);
  near(y, 2);
  near(z, 0);
});

test('projectPoint puts the holder axis at the stage centre and scales with depth', () => {
  const flat = { ...scene, holder: { q: [0, 0, 0, 1] } };
  const centre = projectPoint(flat, [0, 0, 0], { width: 800, height: 600 });
  near(centre.x, 400);
  near(centre.y, 300);
  const nearer = projectPoint(flat, [0, 0, 1000], { width: 800, height: 600 });
  assert.ok(nearer.pxPerUnit > centre.pxPerUnit);
  const above = projectPoint(flat, [0, 100, 0], { width: 800, height: 600 });
  assert.ok(above.y < 300);
});

test('the grouped coin is on the left of the stage and inside it; focused it sits near the centre', () => {
  const size = { width: 900, height: 700 };
  const radius = 1.7014;
  const grouped = coinFrame(scene, layoutFor(scene, null).coin.pose, size, radius);
  assert.ok(grouped.x > 0 && grouped.x < size.width / 2, `grouped coin x ${grouped.x}`);
  assert.ok(grouped.y > 0 && grouped.y < size.height, `grouped coin y ${grouped.y}`);
  assert.ok(grouped.side > 30 && grouped.side < size.height, `grouped coin side ${grouped.side}`);
  const focused = coinFrame(scene, layoutFor(scene, 'coin').coin.pose, size, radius);
  // the disc's pivot is 90 units behind the slot origin, so the slot's 30 degree yaw nudges it off x = 0
  near(focused.x, size.width / 2, size.width * 0.1);
  assert.ok(focused.side > grouped.side);
});

test('passiveYaw spins 10 degrees per second and never runs backwards', () => {
  near(passiveYaw(1), (PASSIVE_DEGREES_PER_SECOND * Math.PI) / 180);
  assert.equal(passiveYaw(-5), 0);
});

test('dragYaw adds 0.01 rad per pixel', () => {
  near(dragYaw(1, 100), 2);
  near(dragYaw(1, -50), 0.5);
});

test('nextIndex wraps both ways and returns 0 for an empty or invalid list', () => {
  assert.equal(nextIndex(0, -1, 5), 4);
  assert.equal(nextIndex(4, 1, 5), 0);
  assert.equal(nextIndex(2, 1, 5), 3);
  assert.equal(nextIndex(3, 1, 0), 0);
  assert.equal(nextIndex(3, 1, Number.NaN), 0);
  assert.equal(nextIndex(0, -1, 1), 0);
});

test('identity composePoint is a no-op', () => {
  assert.deepEqual(composePoint(identity, [3, 4, 5]), [3, 4, 5]);
});
