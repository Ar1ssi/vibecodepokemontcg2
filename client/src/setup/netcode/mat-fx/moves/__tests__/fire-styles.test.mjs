// Design 075 slice 9: the fire kit's GPU style hints. Tongue passes record as the flame style,
// the hot sphere and its glow as the orb style, and a drawing with no hint stays flat (parity
// with Canvas2D).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { PAINT_KIND, PAINT_TEXELS, STYLE_IDS, createGpuCanvas } from '../../../../board3d/fx/gpu-canvas.mjs';
import { fire } from '../materials/fire.js';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const PAINT_FLOATS = PAINT_TEXELS * 4;
const rowsOf = (rec) =>
  Array.from({ length: rec.paintCount }, (_, row) => rec.paints.subarray(row * PAINT_FLOATS, (row + 1) * PAINT_FLOATS));
const styleOf = (row) => row[2];
const kindOf = (row) => row[0];

const recorder = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: 100, seed: 1 });
  canvas.ctx.globalCompositeOperation = 'lighter';
  return canvas;
};

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 });

test('fire tongue: every pass records the flame style on an axis gradient from base to tip', () => {
  const { ctx, recording } = recorder();
  fire.tongue(ctx, TONGUE);
  const rows = rowsOf(recording());
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(styleOf(row), STYLE_IDS.flame);
    assert.equal(kindOf(row), PAINT_KIND.linear);
    // Base (50, 50) to tip 80 px up: the shader reads base → tip from these.
    assert.ok(Math.abs(row[4] - 50) < 1e-9 && Math.abs(row[5] - 50) < 1e-9);
    assert.ok(Math.abs(row[6] - 50) < 1e-9 && Math.abs(row[7] + 30) < 1e-9);
  }
  // The outer pass erodes least, the core most.
  assert.ok(rows[0][20] < rows[1][20] && rows[1][20] < rows[2][20]);
  assert.equal(ctx.fxStyle, null);
});

test('fire body and glow record the orb style; the hint is cleared after', () => {
  const { ctx, recording } = recorder();
  fire.body(ctx, 50, 50, 20, 1, 1);
  fire.glow(ctx, 50, 50, 40, 0.5);
  const rows = rowsOf(recording());
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(styleOf(row), STYLE_IDS.orb);
    assert.equal(kindOf(row), PAINT_KIND.radial);
  }
  assert.equal(ctx.fxStyle, null);
});

test('fire projectile: tongues flame, sphere and glow orb, sparks flat', () => {
  const { ctx, recording } = recorder();
  fire.projectile(ctx, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0.2, seed: 5, tongues: 3 });
  const styles = rowsOf(recording()).map(styleOf);
  assert.equal(styles.filter((s) => s === STYLE_IDS.flame).length, 9);
  assert.equal(styles.filter((s) => s === STYLE_IDS.orb).length, 2);
  assert.equal(styles.filter((s) => s === STYLE_IDS.flat).length, 6);
});

test('parity: a recording with no fxStyle set is flat in every row', () => {
  const { ctx, recording } = recorder();
  ctx.fillStyle = 'rgba(235, 108, 6, 0.6)';
  ctx.beginPath();
  ctx.arc(20, 20, 10, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(60, 60, 0, 60, 60, 20);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, 'rgba(210, 41, 8, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(40, 40, 40, 40);
  ctx.strokeStyle = '#f1af0d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(90, 10);
  ctx.stroke();
  const rows = rowsOf(recording());
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal(styleOf(row), STYLE_IDS.flat);
});
