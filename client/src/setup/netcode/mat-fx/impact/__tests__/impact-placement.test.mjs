import test from 'node:test';
import assert from 'node:assert/strict';

import { boardCamera } from '../impact-geometry.mjs';
import { DEG, mat4Identity, quatEuler, transformPoint } from '../impact-math.mjs';
import { GAME_ACTIVE_CARD_UNITS, GAME_BENCH_CARD_SCALE, prefabAxes, sceneEffectFrame, unitPxFor } from '../impact-scene.mjs';

const TABLE_FLAT = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
/** The 12° board tilt: the table's y recedes (board-camera.mjs tableToWorld). */
const tilted = (deg) => {
  const a = deg * DEG;
  return { x: [1, 0, 0], y: [0, Math.cos(a), -Math.sin(a)], z: [0, Math.sin(a), Math.cos(a)] };
};
const TOP_DOWN = { position: [0, 0, 1000], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], fovDeg: 20 };
const close = (actual, expected, eps = 1e-6) =>
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < eps, `${actual} vs ${expected}`));

const frameFor = (options) =>
  sceneEffectFrame({ viewProjection: mat4Identity(), camera: TOP_DOWN, centre: [10, 20, 1], table: TABLE_FLAT, heightPx: 168, ...options });

test('near seat: prefab X → table x, Y → toward the camera, Z → up the table', () => {
  const { viewProjection: model, unitPx } = frameFor({ table: tilted(12) });
  const t = tilted(12);
  close(transformPoint(model, [1, 0, 0]), [10 + unitPx * t.x[0], 20 + unitPx * t.x[1], 1 + unitPx * t.x[2]]);
  close(transformPoint(model, [0, 1, 0]), [10 + unitPx * t.z[0], 20 + unitPx * t.z[1], 1 + unitPx * t.z[2]]);
  close(transformPoint(model, [0, 0, 1]), [10 + unitPx * t.y[0], 20 + unitPx * t.y[1], 1 + unitPx * t.y[2]]);
});

test('far seat: X and Z turn round, Y still faces the camera', () => {
  const axes = prefabAxes(TABLE_FLAT, true);
  assert.deepEqual(axes.X, [-1, -0, -0]);
  assert.deepEqual(axes.Z, [-0, -1, -0]);
  assert.deepEqual(axes.Y, [0, 0, 1]);
});

test('scale: board px per game unit for the card height; a Bench card is the condensed size', () => {
  assert.equal(unitPxFor(168), 168 / (8.9 * 1.615));
  assert.equal(unitPxFor(168, true), 168 / (GAME_ACTIVE_CARD_UNITS * GAME_BENCH_CARD_SCALE));
});

test('a straight-down board camera is the game camera, in prefab terms', () => {
  const { camera, unitPx } = frameFor({});
  close(camera.forward, [0, -1, 0]);
  close(camera.up, [0, 0, 1]);
  close(camera.right, [1, 0, 0]);
  close(camera.rotation, quatEuler(90 * DEG, 0, 0));
  close(camera.position, [-10 / unitPx, 999 / unitPx, -20 / unitPx]);
  assert.ok(Math.abs(camera.depthOf([0, 0, 0]) - 999 / unitPx) < 1e-9);
});

test('the game camera measures depth straight down', () => {
  assert.equal(boardCamera().depthOf([0, 0, 0]), 183);
  assert.equal(boardCamera().depthOf([0, 3, 0]), 180);
});
