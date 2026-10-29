import test from 'node:test';
import assert from 'node:assert/strict';

import { BOLT_FLOATS, BOLT_HOT, boltSegments, normalizeBoltSegment, packBoltSegment } from '../bolt.mjs';
import { PLASMA_FLOATS, normalizePlasma, packPlasma } from '../plasma.mjs';

test('bolt segment: needs two distinct points and a width; colours default to thunder yellow', () => {
  const seg = normalizeBoltSegment({ a: { x: 0, y: 0 }, b: { x: 10, y: 0, z: 5 }, width: 3 });
  assert.deepEqual(seg.hot, [...BOLT_HOT]);
  assert.equal(seg.alpha, 1);
  for (const bad of [
    null,
    { a: { x: 0, y: 0 }, width: 3 },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, width: 3 },
    { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, width: 0 },
    { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, width: 2, alpha: 0 },
  ]) {
    assert.equal(normalizeBoltSegment(bad), null, JSON.stringify(bad));
  }
  const out = new Float32Array(BOLT_FLOATS);
  packBoltSegment(normalizeBoltSegment({ a: { x: 1, y: 2, z: 3 }, b: { x: 4, y: 5, z: 6 }, width: 7, alpha: 0.5, seed: 8, along: 9, hot: [0.1, 0.2, 0.3], glow: [0.4, 0.5, 0.6] }), out, 0);
  assert.deepEqual([...out].map((v) => Math.round(v * 100) / 100), [1, 2, 3, 7, 4, 5, 6, 0.5, 0.1, 0.2, 0.3, 8, 0.4, 0.5, 0.6, 9]);
});

test('boltSegments: one per step, along accumulates, non-finite points are skipped, the root ramps in', () => {
  const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: NaN, y: 0 }, { x: 3, y: 14 }, { x: 3, y: 14 }];
  const segments = boltSegments(points, { width: 2, alpha: 1, rootAlpha: 0, rampPx: 10 });
  assert.equal(segments.length, 2, 'the NaN point is dropped and the zero-length step skipped');
  assert.deepEqual(segments.map((s) => s.along), [0, 5]);
  assert.deepEqual(segments.map((s) => s.alpha), [0, 0.5]);
  assert.deepEqual(boltSegments(null, { width: 1 }), []);
});

test('plasma: defaults, clamps and its packed row', () => {
  const ball = normalizePlasma({ at: { x: 1, y: 2 }, radius: 5, arcs: 3 });
  assert.equal(ball.arcs, 1);
  assert.equal(ball.shell, 0.5);
  assert.equal(normalizePlasma({ at: { x: 1, y: 2 }, radius: -1 }), null);
  const out = new Float32Array(PLASMA_FLOATS);
  packPlasma(normalizePlasma({ at: { x: 1, y: 2, z: 3 }, radius: 4, alpha: 0.5, heat: 0.25, arcs: 0.5, shell: 1, dissolve: 0.75, seed: 6, hot: [1, 1, 1], glow: [0, 0, 0] }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 4, 1, 1, 1, 0.5, 0, 0, 0, 6, 0.25, 0.5, 0.75, 1]);
});
