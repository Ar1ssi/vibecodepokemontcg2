import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { materialFor } from '../../materials/index.js';
import { WATER_SCALE } from '../water.js';

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

const lane = localLane(laneGeometry({ left: 0, top: 300, width: 90, height: 126 }, { left: 0, top: 0, width: 90, height: 126 }), { left: 0, top: 0 });
const info = (params) => {
  const material = materialFor('water');
  return { material, materialAt: () => material, params, elapsedMs: 600, time: 0.6, seed: 3, spec: {} };
};

test('water tongue → a tapering stream; body → a refracting drop', () => {
  const { ctx, emits } = live();
  materialFor('water').tongue(ctx, { x: 0, y: 0, angleDeg: 90, length: 40, width: 10, seed: 2 });
  materialFor('water').body(ctx, 5, 5, 10, 0.8);
  assert.deepEqual(emits.map((e) => e.kind), ['waterBeam', 'waterDrop']);
  const stream = emits[0].params;
  assert.equal(stream.taper, 1);
  assert.equal(stream.width, 10 * WATER_SCALE.stream);
  assert.ok(Math.abs(stream.to.y - 40 * WATER_SCALE.streamLength) < 1e-9);
  assert.equal(emits[1].params.radius, 10 * WATER_SCALE.drop);
});

test('the beam drawer draws a solid water beam as an even column with a breaking head, lifted and burning', () => {
  const { ctx, emits } = live();
  DRAWERS.beam.draw(ctx, lane, 0.5, info({ kind: 'solid' }));
  const beams = emits.filter((e) => e.kind === 'waterBeam');
  assert.equal(beams.length, 1);
  assert.equal(beams[0].params.taper, 0);
  assert.ok(beams[0].params.from.z > 3, 'the drawer lift still raises it');
  assert.ok(emits.some((e) => e.kind === 'sprite' && e.params.texture.includes('Splash')));
  const late = live();
  DRAWERS.beam.draw(late.ctx, lane, 0.97, info({ kind: 'solid', retract: 0.3 }));
  const tail = late.emits.find((e) => e.kind === 'waterBeam');
  assert.ok(tail && tail.params.dissolve > 0, 'the drawer burn reaches the element beam');
});

test('helix and pulse-train beams fall back to the canvas drawer, whose bodies are drops', () => {
  const { ctx, emits } = live();
  DRAWERS.beam.draw(ctx, lane, 0.5, info({ kind: 'pulse-train' }));
  assert.ok(emits.length > 0);
  assert.ok(emits.every((e) => e.kind === 'waterDrop'));
});

test('water projectile: streams, a drop and droplets; frozen time is stable', () => {
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 1.1, seed: 2, tongues: 3 };
  const one = live();
  materialFor('water').projectile(one.ctx, shot);
  assert.equal(one.emits.filter((e) => e.kind === 'waterBeam').length, 3);
  assert.equal(one.emits.filter((e) => e.kind === 'waterDrop').length, 1);
  const two = live();
  materialFor('water').projectile(two.ctx, shot);
  assert.deepEqual(two.emits, one.emits);
});
