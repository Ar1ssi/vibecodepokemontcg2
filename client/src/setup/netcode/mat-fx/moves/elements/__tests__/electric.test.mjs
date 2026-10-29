import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { materialFor } from '../../materials/index.js';
import { ELECTRIC_SCALE, flickerRandom, jagPoints } from '../electric.js';

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

test('flickerRandom: same seed and flicker step → same numbers; the next step re-rolls', () => {
  const a = flickerRandom(3, 1.0);
  const b = flickerRandom(3, 1.0 + 0.5 / 14);
  const c = flickerRandom(3, 1.0 + 1.5 / 14);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([c(), c(), c()], first);
  assert.ok(first.every((v) => v >= 0 && v < 1));
});

test('jagPoints: ends on the axis, kinks between, re-rolled by the flicker clock', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100 };
  const points = jagPoints(spec, { jag: 0.2, seed: 1, time: 0 });
  assert.deepEqual(points[0], [0, 0]);
  assert.ok(Math.abs(points.at(-1)[0] - 100) < 1e-9 && Math.abs(points.at(-1)[1]) < 1e-9);
  assert.ok(points.slice(1, -1).some(([, y]) => Math.abs(y) > 0.5));
  assert.ok(points.every(([, y]) => Math.abs(y) <= 20 + 1e-9));
  assert.deepEqual(jagPoints(spec, { jag: 0.2, seed: 1, time: 0.01 }), points);
});

test('electric jagStroke → bolt segments for trunk and branches, plus a strike flash', () => {
  const { canvas, ctx, emits } = live();
  materialFor('electric').jagStroke(ctx, [[[0, 0], [10, 0], [20, 5]], [[10, 0], [12, 10]]], { width: 4, alpha: 0.9 });
  const bolts = emits.filter((e) => e.kind === 'bolt');
  assert.equal(bolts.length, 3);
  assert.equal(bolts[0].params.width, 4 * ELECTRIC_SCALE.bolt);
  assert.ok(bolts[2].params.width < bolts[0].params.width, 'branches are thinner');
  assert.equal(emits.filter((e) => e.kind === 'sprite').length, 1);
  assert.equal(canvas.recording().vertexCount, 0);
});

test('electric body → plasma; projectile → plasma, forked bolts and sparks, stable for a frozen frame', () => {
  const { ctx, emits } = live();
  materialFor('electric').body(ctx, 0, 0, 10, 1, 0.5);
  assert.equal(emits[0].kind, 'plasma');
  assert.equal(emits[0].params.radius, 10 * ELECTRIC_SCALE.body);
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 1.2, seed: 5, tongues: 3 };
  const one = live();
  materialFor('electric').projectile(one.ctx, shot);
  const kinds = one.emits.map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'plasma').length, 1);
  assert.ok(kinds.filter((k) => k === 'bolt').length >= 3 * 4);
  const two = live();
  materialFor('electric').projectile(two.ctx, shot);
  assert.deepEqual(two.emits, one.emits);
});

test('the bolt drawer routes an electric bolt to the bolt kind while live', () => {
  const lane = localLane(laneGeometry({ left: 0, top: 300, width: 90, height: 126 }, { left: 0, top: 0, width: 90, height: 126 }), { left: 0, top: 0 });
  const { ctx, emits } = live();
  const material = materialFor('electric');
  DRAWERS.bolt.draw(ctx, lane, 0.5, { material, materialAt: () => material, params: {}, elapsedMs: 500, time: 0.5, seed: 2, spec: {} });
  assert.ok(emits.some((e) => e.kind === 'bolt'));
  assert.ok(emits.filter((e) => e.kind === 'bolt').every((e) => e.params.a.z > 3), 'the drawer lift raises the bolt off the pass');
});
