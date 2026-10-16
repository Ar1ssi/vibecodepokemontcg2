import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handFanPoses } from '../hand-fan.mjs';

const geometry = { width: 800, radius: 1600, cardW: 100, cardH: 140 };
const extent = (poses, cardW) =>
  Math.max(...poses.map((p) => p.x)) - Math.min(...poses.map((p) => p.x)) + cardW;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function assertSymmetric(poses) {
  const n = poses.length;
  for (let i = 0; i < n; i++) {
    const mirror = poses[n - 1 - i];
    assert.ok(near(poses[i].x, -mirror.x), `x of ${i}`);
    assert.ok(near(poses[i].y, mirror.y), `y of ${i}`);
    assert.ok(near(poses[i].yawDeg, -mirror.yawDeg), `yaw of ${i}`);
  }
}

test('0 cards → no poses', () => {
  assert.deepEqual(handFanPoses(0, geometry), []);
  assert.deepEqual(handFanPoses(-3, geometry), []);
  assert.deepEqual(handFanPoses(Number.NaN, geometry), []);
});

test('1 card is centred, upright, cropped by 45 %', () => {
  const [pose] = handFanPoses(1, geometry);
  assert.deepEqual({ ...pose, y: 0 }, { x: 0, y: 0, z: 0, yawDeg: 0, lift: 0 });
  // Bottom edge sits 45 % of the height below y = 0.
  assert.ok(near(pose.y - 140 / 2, -0.45 * 140));
});

test('7 cards: symmetric, fanned within the spread cap and the width', () => {
  const poses = handFanPoses(7, geometry);
  assert.equal(poses.length, 7);
  assertSymmetric(poses);
  assert.ok(poses[0].yawDeg > 0 && poses[6].yawDeg < 0, 'left leans left, right leans right');
  assert.ok(poses[0].yawDeg - poses[6].yawDeg <= 40 + 1e-9, 'spread ≤ maxSpreadDeg');
  assert.ok(extent(poses, 100) <= 800 + 1e-9);
  assert.equal(poses[3].x, 0);
  assert.ok(poses[0].y < poses[3].y, 'outer cards sit lower on the arc');
  assert.deepEqual(poses.map((p) => p.z), [0, 1, 2, 3, 4, 5, 6]);
});

test('15 cards overlap to fit the width exactly', () => {
  const poses = handFanPoses(15, geometry);
  assert.equal(poses.length, 15);
  assertSymmetric(poses);
  assert.ok(near(extent(poses, 100), 800, 1e-6), `extent ${extent(poses, 100)}`);
  const visible = poses[8].x - poses[7].x;
  assert.ok(visible >= 0.35 * 100 * 0.99, 'still above the overlap floor');
});

test('40 cards clamp at the overlap floor and run past the width symmetrically', () => {
  const poses = handFanPoses(40, geometry);
  assert.equal(poses.length, 40);
  assertSymmetric(poses);
  assert.ok(extent(poses, 100) > 800);
  const pitchRad = (poses[19].yawDeg - poses[20].yawDeg) * (Math.PI / 180);
  assert.ok(near(pitchRad * 1600, 35, 1e-6), 'arc per card = overlapMin × cardW');
});

test('hover lifts the card by 0.35 card heights and spreads its neighbours by a quarter card', () => {
  const rest = handFanPoses(7, geometry);
  const hover = handFanPoses(7, { ...geometry, hoverIndex: 3 });
  assert.ok(near(hover[3].lift, 140 * 0.35));
  assert.ok(near(hover[3].y, rest[3].y + 140 * 0.35));
  assert.equal(hover[3].z, 7, 'hovered card draws on top');
  assert.ok(near(hover[2].x, rest[2].x - 25));
  assert.ok(near(hover[4].x, rest[4].x + 25));
  assert.ok(near(hover[0].x, rest[0].x - 25));
  assert.equal(hover[2].lift, 0);
  assert.ok(near(hover[2].y, rest[2].y));

  const outOfRange = handFanPoses(7, { ...geometry, hoverIndex: 9 });
  assert.deepEqual(outOfRange, rest);
});

test('crop sets the baseline', () => {
  const [pose] = handFanPoses(1, { ...geometry, crop: 0 });
  assert.equal(pose.y, 70, 'nothing below the edge');
});
