import test from 'node:test';
import assert from 'node:assert/strict';

import { tableToWorld } from '../../board-camera.mjs';
import { laneGeometry } from '../../../netcode/mat-fx/moves/move-geometry.mjs';
import { LAYER_Z, driveOffset, particleState, stageRectOf, stageToWorldMatrix } from '../fx-stage.mjs';

const apply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const close = (actual, expected, eps = 1e-5) =>
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < eps, `${actual} vs ${expected}`));

test('a table pose becomes a y-down stage rect', () => {
  assert.deepEqual(stageRectOf({ x: 10, y: 20, widthPx: 90, heightPx: 126 }), {
    left: -35,
    top: -83,
    width: 90,
    height: 126,
  });
});

test('stage → world is the y flip then tableToWorld', () => {
  const m = stageToWorldMatrix(12);
  close(apply(m, [10, 20, 5]), tableToWorld({ x: 10, y: -20, z: 5 }, { tiltDeg: 12 }));
  close(apply(stageToWorldMatrix(0), [3, 4, 5]), [3, -4, 5]);
});

test('layers: back under the card faces, front and top above', () => {
  assert.ok(LAYER_Z.back < 1 && LAYER_Z.front > LAYER_Z.back && LAYER_Z.top > LAYER_Z.front);
});

test('drive offsets follow the lane and flip into table px', () => {
  const right = laneGeometry({ left: 0, top: 0, width: 72, height: 100 }, { left: 300, top: 0, width: 72, height: 100 });
  const r = driveOffset(right, { along: 0.5 });
  close([r.dx, r.dy, r.dz], [50, 0, 0]);
  const down = laneGeometry({ left: 0, top: 0, width: 72, height: 100 }, { left: 0, top: 300, width: 72, height: 100 });
  const d = driveOffset(down, { along: 0.5, lift: 0.2, rotate: 7, scale: 1.1 });
  close([d.dx, d.dy, d.dz], [0, -50, 20]);
  assert.equal(d.yawDeg, 7);
  assert.equal(d.scale, 1.1);
  assert.equal(d.laneAngleDeg, 90);
});

test('a far-seat lane (pointing up the screen) needs nothing seat-specific', () => {
  const up = laneGeometry({ left: 0, top: 300, width: 72, height: 100 }, { left: 0, top: 0, width: 72, height: 100 });
  const u = driveOffset(up, { along: 0.5, across: 0.1 });
  close([u.dx, u.dy], [10, 50]);
});

test('particles sample spawnParticles keyframes', () => {
  const row = { dx: 100, dy: 0, angle: 30, gravity: 40, delay: 0.1, life: 1, orient: true };
  const timing = { durationMs: 1000 };
  assert.equal(particleState(row, 50, timing), null, 'before its delay');
  assert.equal(particleState(row, 1101, timing), null, 'after its life');
  const start = particleState(row, 100, timing);
  close([start.x, start.y, start.opacity, start.scale], [0, 0, 0, 1]);
  const end = particleState(row, 1100, timing);
  close([end.x, end.y, end.opacity, end.scale], [100, 40, 0, 0]);
  assert.equal(end.rotateDeg, 30);
  assert.equal(particleState({ ...row, orient: false }, 600, timing).rotateDeg, 0);
  // Local .05 eases to .216: between the .08 and .55 keyframes, so fully opaque.
  const mid = particleState(row, 150, timing);
  assert.equal(mid.opacity, 1);
  assert.ok(mid.x > 12 && mid.x < 80);
  // Local .2 eases to .628, past .55: fading out toward the end keyframe.
  const late = particleState(row, 300, timing);
  assert.ok(late.opacity < 1 && late.opacity > 0);
});
