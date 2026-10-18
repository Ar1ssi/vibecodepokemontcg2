import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../board3d/fx/gpu-canvas.mjs';
import { GLOW_COLOURS, HEAT_VARIANTS, drawHeat, drawRim } from '../card-glow.mjs';
import { MATERIAL_KEYS, PARTICLE_KINDS } from '../move-spec.mjs';
import { PARTICLE_SHAPES, drawParticle } from '../particle-shapes.mjs';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );
const recorder = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'top', z: 4, unit: 126 });
  return canvas;
};
const STATE = { x: 10, y: -20, rotateDeg: 30, scale: 0.9, opacity: 1 };

test('every move particle kind has a shape and draws at least one fill', () => {
  for (const kind of PARTICLE_KINDS) {
    assert.ok(PARTICLE_SHAPES[kind], kind);
    const canvas = recorder();
    drawParticle(canvas.ctx, kind, STATE, { originX: 100, originY: 100, size: 12, aspect: 0.4, colour: 'rgb(241, 175, 13)' });
    const rec = canvas.recording();
    assert.ok(rec.vertexCount > 0, `${kind} drew nothing`);
    assert.ok(rec.vertices.every(Number.isFinite), `${kind} drew NaN`);
  }
});

test('particles land on their point; an invisible state draws nothing', () => {
  const canvas = recorder();
  drawParticle(canvas.ctx, 'mote', STATE, { originX: 100, originY: 100, size: 12, colour: '#fff' });
  const rec = canvas.recording();
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < rec.vertexCount; i += 1) {
    sx += rec.vertices[i * 9];
    sy += rec.vertices[i * 9 + 1];
  }
  assert.ok(Math.abs(sx / rec.vertexCount - 110) < 2 && Math.abs(sy / rec.vertexCount - 80) < 2);
  const none = recorder();
  drawParticle(none.ctx, 'mote', null, { size: 12 });
  drawParticle(none.ctx, 'mote', { ...STATE, opacity: 0 }, { size: 12 });
  assert.equal(none.recording().vertexCount, 0);
});

test('every move material has rim colours; shaded heats draw over, lit ones add', () => {
  for (const key of MATERIAL_KEYS) assert.ok(GLOW_COLOURS[key], key);
  for (const [material, blend] of [
    ['fire', 'add'],
    ['dark', 'over'],
    ['ghost', 'over'],
    ['mud', 'over'],
    ['poison', 'add'],
  ]) {
    const canvas = recorder();
    drawHeat(canvas.ctx, { width: 90, height: 126, alpha: 0.8, material });
    assert.deepEqual([...new Set(canvas.recording().runs.map((run) => run.blend))], [blend], material);
  }
  assert.equal(HEAT_VARIANTS.cold.colours, HEAT_VARIANTS.ice.colours);
});

test('the rim is two blurred additive strokes; zero alpha draws nothing', () => {
  const canvas = recorder();
  drawRim(canvas.ctx, { width: 90, height: 126, alpha: 1, material: 'fire' });
  const rec = canvas.recording();
  assert.equal(rec.paintCount, 2);
  assert.deepEqual([...new Set(rec.runs.map((run) => run.blend))], ['add']);
  const none = recorder();
  drawRim(none.ctx, { width: 90, height: 126, alpha: 0, material: 'fire' });
  assert.equal(none.recording().vertexCount, 0);
});
