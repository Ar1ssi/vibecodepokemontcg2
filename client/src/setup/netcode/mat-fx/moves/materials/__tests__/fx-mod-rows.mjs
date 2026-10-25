// Design 076 test helper: a kit drawn on the GPU canvas recorder, read back as the modifiers each
// paint row carries (FX_MODS texels) and how high its geometry stands (vertex z, in lane units),
// with a drawer's dissolve already set by the caller.
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { FX_MODS, PAINT_TEXELS, VERTEX_FLOATS, createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';

const PAINT_FLOATS = PAINT_TEXELS * 4;
const EDGE_TEXEL = 18;
const UNIT = 100;

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

/** What a drawer sets round a kit call: its exit dissolve, part-way through. */
export const DRAWER_MOD = Object.freeze({ dissolve: Object.freeze({ amount: 0.4 }) });

const named = (row, { texel, params }) => Object.fromEntries(params.map(([key], i) => [key, row[texel * 4 + i]]));

/** The highest vertex of each paint row, in lane units over the pass (0 = on the cloth). */
function liftsOf(rec) {
  const lifts = new Array(rec.paintCount).fill(0);
  for (let v = 0; v < rec.vertexCount; v += 1) {
    const o = v * VERTEX_FLOATS;
    const row = rec.vertices[o + VERTEX_FLOATS - 1];
    lifts[row] = Math.max(lifts[row], rec.vertices[o + 2] / UNIT);
  }
  return lifts;
}

/**
 * Each paint row's modifiers and height: `{ dissolve, edge ([r, g, b] 0–255 | null), distort,
 * detail, volume, lift }`.
 */
function modsOf(rec) {
  const lifts = liftsOf(rec);
  return Array.from({ length: rec.paintCount }, (_, i) => {
    const row = rec.paints.subarray(i * PAINT_FLOATS, (i + 1) * PAINT_FLOATS);
    const e = EDGE_TEXEL * 4;
    return {
      dissolve: named(row, FX_MODS.dissolve),
      edge: row[e + 3] > 0.5 ? [row[e], row[e + 1], row[e + 2]].map((v) => Math.round(v * 255)) : null,
      distort: named(row, FX_MODS.distort),
      detail: named(row, FX_MODS.detail),
      volume: named(row, FX_MODS.volume),
      lift: lifts[i],
    };
  });
}

/**
 * Runs `draw(ctx)` on a fresh recorder under DRAWER_MOD and returns each row's modifiers.
 * Asserts the kit hands the caller's `fxMod` back untouched (the same object).
 */
export function drawMods(draw) {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: UNIT, seed: 1 });
  canvas.ctx.fxMod = DRAWER_MOD;
  draw(canvas.ctx);
  assert.equal(canvas.ctx.fxMod, DRAWER_MOD, 'the caller fxMod is restored');
  const rows = modsOf(canvas.recording());
  assert.ok(rows.length > 0, 'the draw recorded fills');
  return rows;
}

/** Every row keeps the drawer's dissolve amount and burns its edge in `rgb`. */
export function assertEdged(rows, rgb) {
  rows.forEach((row, i) => {
    assert.ok(Math.abs(row.dissolve.amount - DRAWER_MOD.dissolve.amount) < 1e-6, `row ${i} keeps the drawer's dissolve amount`);
    assert.deepEqual(row.edge, [...rgb], `row ${i} edge colour`);
  });
}

export const distorted = (row) => row.distort.strength > 0;
export const detailed = (row) => row.detail.amount > 0;
export const lit = (row) => row.volume.amount > 0;
/** Row `row` stands `z` lane units off the cloth (within float error). */
export const assertLift = (row, z, what) => assert.ok(Math.abs(row.lift - z) < 1e-4, `${what}: lift ${row.lift}, expected ${z}`);
