import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { materialFor } from '../../materials/index.js';
import { EARTH_SCALE } from '../earth.js';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const live = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  const emits = [];
  canvas.ctx.fxElements = { live: false, emit: (kind, params) => (emits.push({ kind, params }), true) };
  canvas.begin({ layer: 'front', z: 3, unit: 100 });
  return { canvas, ctx: canvas.ctx, emits };
};

test('rock and ground bodies are stones; their tongues stones stretched along the tongue', () => {
  for (const key of ['rock', 'ground']) {
    const { ctx, emits } = live();
    materialFor(key).body(ctx, 0, 0, 10, 1);
    materialFor(key).tongue(ctx, { x: 0, y: 0, angleDeg: -90, length: 60, width: 10, seed: 2 });
    assert.deepEqual(emits.map((e) => e.kind), ['debris', 'debris'], key);
    assert.equal(emits[0].params.size, 10 * EARTH_SCALE.body);
    const shard = emits[1].params;
    assert.equal(shard.stretch, 4, 'capped');
    assert.equal(shard.headingDeg, -90);
    assert.ok(Math.abs(shard.at.y - -30) < 1e-9, 'centred on the tongue');
  }
});

test('a thrown rock tumbles with time and trails dust; frozen time is stable', () => {
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 0.5, seed: 1, tongues: 3 };
  const one = live();
  materialFor('rock').projectile(one.ctx, shot);
  assert.equal(one.emits.filter((e) => e.kind === 'smoke').length, 3);
  const stone = one.emits.find((e) => e.kind === 'debris').params;
  assert.equal(stone.spin, 0.5 * 4 + 1);
  const two = live();
  materialFor('rock').projectile(two.ctx, shot);
  assert.deepEqual(two.emits, one.emits);
});

test('a grass tongue is a leaf sprite along it, framed by its seed', () => {
  const { ctx, emits } = live();
  materialFor('grass').tongue(ctx, { x: 0, y: 0, angleDeg: 0, length: 40, width: 8, seed: 3 });
  assert.equal(emits[0].kind, 'sprite');
  assert.equal(emits[0].params.channel, 'rgba');
  assert.equal(emits[0].params.frame, 21 % 4);
  assert.equal(emits[0].params.size, 40 * EARTH_SCALE.leaf);
});
