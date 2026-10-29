import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { materialFor } from '../../materials/index.js';
import { PSYCHIC_SCALE } from '../psychic.js';
import { PUFF_SCALE } from '../_smoke.js';

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
const info = (key, params = {}) => {
  const material = materialFor(key);
  return { material, materialAt: () => material, params, elapsedMs: 700, time: 0.7, seed: 4, spec: {} };
};

test('psychic sigil → a lens turning with the beat; body → lens plus light', () => {
  const { ctx, emits } = live();
  materialFor('psychic').sigil(ctx, 10, 10, 20, 0.5);
  assert.equal(emits[0].kind, 'lens');
  assert.equal(emits[0].params.radius, 20 * PSYCHIC_SCALE.sigil);
  assert.ok(Math.abs(emits[0].params.spin - Math.PI * 1.2) < 1e-9);
  materialFor('psychic').body(ctx, 0, 0, 10, 1);
  assert.deepEqual(emits.slice(1).map((e) => e.kind), ['sprite', 'lens']);
});

test('the glyph drawer reaches the lens through the psychic kit', () => {
  const { ctx, emits } = live();
  DRAWERS.glyph.draw(ctx, lane, 0.5, info('psychic'));
  assert.ok(emits.some((e) => e.kind === 'lens'));
});

test('ghost and dark smoke beats → lit smoke puffs where the canvas puffs were; fire smoke is soot', () => {
  for (const key of ['ghost', 'dark', 'fire']) {
    const { ctx, emits } = live();
    DRAWERS.smoke.draw(ctx, lane, 0.5, info(key, { count: 3 }));
    const puffs = emits.filter((e) => e.kind === 'smoke');
    assert.ok(puffs.length > 0, key);
    assert.ok(puffs.every((p) => p.params.radius > 0 && p.params.alpha <= 1), key);
  }
  const ghost = live();
  DRAWERS.cloud.draw(ghost.ctx, lane, 0.5, info('ghost', { target: 'defender' }));
  const clouds = ghost.emits.filter((e) => e.kind === 'smoke');
  assert.ok(clouds.length > 0);
  assert.ok(clouds[0].params.glow > 0, 'ghost clouds glow');
  assert.ok(PUFF_SCALE > 1);
});

test('shadow ball style: ghost body and projectile are smoke with a lit heart; frozen time is stable', () => {
  const { ctx, emits } = live();
  materialFor('ghost').body(ctx, 0, 0, 10, 1);
  assert.equal(emits[0].kind, 'smoke');
  assert.ok(emits[0].params.glow > 0.5);
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 0.9, seed: 3 };
  const one = live();
  materialFor('dark').projectile(one.ctx, shot);
  assert.ok(one.emits.filter((e) => e.kind === 'smoke').length >= 5);
  const two = live();
  materialFor('dark').projectile(two.ctx, shot);
  assert.deepEqual(two.emits, one.emits);
});
