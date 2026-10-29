import test from 'node:test';
import assert from 'node:assert/strict';

import { LENS_BODY, LENS_FLOATS, normalizeLens, packLens } from '../lens.mjs';
import { SMOKE_FLOATS, normalizeSmoke, packSmoke } from '../smoke.mjs';

test('lens: psychic colours by default, refusals, packed row', () => {
  const lens = normalizeLens({ at: { x: 0, y: 0 }, radius: 10 });
  assert.deepEqual(lens.body, [...LENS_BODY]);
  assert.equal(lens.strength, 0.7);
  assert.equal(lens.rings, 1);
  assert.equal(normalizeLens({ at: { x: 0, y: 0 }, radius: 0 }), null);
  assert.equal(normalizeLens({ radius: 3 }), null);
  const out = new Float32Array(LENS_FLOATS);
  packLens(normalizeLens({ at: { x: 1, y: 2, z: 3 }, radius: 4, alpha: 0.5, seed: 6, spin: 7, strength: 0.25, rings: 0.75, dissolve: 0.5, body: [0, 0, 0], hot: [1, 1, 1] }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 4, 0, 0, 0, 0.5, 1, 1, 1, 6, 7, 0.25, 0.5, 0.75]);
});

test('smoke: defaults, refusals, packed row', () => {
  const puff = normalizeSmoke({ at: { x: 0, y: 0 }, radius: 10 });
  assert.equal(puff.density, 0.7);
  assert.equal(puff.glow, 0);
  assert.equal(normalizeSmoke({ at: { x: 0, y: 0 }, radius: 10, alpha: 0 }), null);
  const out = new Float32Array(SMOKE_FLOATS);
  packSmoke(normalizeSmoke({ at: { x: 1, y: 2, z: 3 }, radius: 4, alpha: 0.5, seed: 6, tint: [0, 0, 0], light: [2, 1, 1], density: 0.25, rise: 0.5, glow: 0.75, dissolve: 1 }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 4, 0, 0, 0, 0.5, 2, 1, 1, 6, 0.25, 0.5, 0.75, 1]);
});
