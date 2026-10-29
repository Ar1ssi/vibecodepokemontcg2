import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { materialFor } from '../../materials/index.js';
import { FIRE_SCALE } from '../fire.js';

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

test('fire body → one fireball at the stage point, scaled up, in the kit palette', () => {
  const { canvas, ctx, emits } = live();
  ctx.translate(100, 50);
  materialFor('fire').body(ctx, 10, 0, 20, 0.8, 0.5);
  assert.equal(emits.length, 1);
  const { kind, params } = emits[0];
  assert.equal(kind, 'fireball');
  assert.deepEqual(params.at, { x: 110, y: 50, z: 3 });
  assert.equal(params.radius, 20 * FIRE_SCALE.body);
  assert.equal(params.alpha, 0.8);
  assert.equal(params.heat, 0.5);
  assert.deepEqual(params.palette.body, [235 / 255, 108 / 255, 6 / 255]);
  assert.equal(canvas.recording().vertexCount, 0, 'the canvas kit did not also draw');
});

test('fire tongue → a flame jet from its root to its scaled tip; the drawer dissolve rides along', () => {
  const { ctx, emits } = live();
  ctx.fxMod = { dissolve: { amount: 0.4 } };
  materialFor('fire').tongue(ctx, { x: 0, y: 0, angleDeg: 0, length: 40, width: 10, time: 1, seed: 3 }, { alpha: 0.5 });
  const { kind, params } = emits[0];
  assert.equal(kind, 'flameJet');
  assert.deepEqual(params.from, { x: 0, y: 0, z: 3 });
  assert.ok(Math.abs(params.to.x - 40 * FIRE_SCALE.tongueLength) < 1e-9);
  assert.equal(params.width, 10 * FIRE_SCALE.tongueWidth);
  assert.equal(params.dissolve, 0.4);
  assert.equal(params.seed, 3);
});

test('fire projectile → a comet fireball with trailing jets, embers and a glow; frozen time is stable', () => {
  const { ctx, emits } = live();
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 2.5, seed: 4, alpha: 1 };
  materialFor('fire').projectile(ctx, shot);
  const kinds = emits.map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'fireball').length, 1);
  assert.equal(kinds.filter((k) => k === 'flameJet').length, 3);
  assert.ok(kinds.filter((k) => k === 'sprite').length >= 10);
  const ball = emits.find((e) => e.kind === 'fireball').params;
  assert.equal(ball.headingDeg, 0);
  assert.ok(ball.stretch > 0);
  for (const jet of emits.filter((e) => e.kind === 'flameJet')) assert.ok(jet.params.to.x < 0, 'jets stream behind the heading');
  const again = live();
  materialFor('fire').projectile(again.ctx, shot);
  assert.deepEqual(again.emits, emits);
});

test('the cast pass and a 2D context draw the canvas fire kit, not elements', () => {
  const { canvas, ctx, emits } = live();
  canvas.begin({ layer: 'back', z: 0.25, unit: 100, cast: {} });
  materialFor('fire').body(ctx, 0, 0, 10, 1);
  assert.equal(emits.length, 0);
  assert.ok(canvas.recording().vertexCount > 0);
});
