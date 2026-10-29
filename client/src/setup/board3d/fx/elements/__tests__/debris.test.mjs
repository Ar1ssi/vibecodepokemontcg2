import test from 'node:test';
import assert from 'node:assert/strict';

import { DEBRIS_FLOATS, normalizeDebris, packDebris, rockMesh } from '../debris.mjs';

test('debris: defaults, a stretch never below 1, refusals, packed row', () => {
  const stone = normalizeDebris({ at: { x: 0, y: 0 }, size: 5, stretch: 0.2, headingDeg: 90 });
  assert.equal(stone.stretch, 1);
  assert.ok(Math.abs(stone.heading - Math.PI / 2) < 1e-9);
  assert.equal(normalizeDebris({ at: { x: 0, y: 0 }, size: 0 }), null);
  assert.equal(normalizeDebris({ size: 3 }), null);
  const out = new Float32Array(DEBRIS_FLOATS);
  packDebris(normalizeDebris({ at: { x: 1, y: 2, z: 3 }, size: 4, alpha: 0.5, seed: 6, colour: [0, 0, 0], light: [1, 1, 1], stretch: 2, headingDeg: 0, spin: 7, dissolve: 0.25 }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 4, 0, 0, 0, 0.5, 1, 1, 1, 6, 2, 0, 7, 0.25, 0, 0, 0, 0]);
  packDebris(normalizeDebris({ at: { x: 0, y: 0 }, size: 1, gloss: 2, smooth: 0.5 }), out, 0);
  assert.deepEqual([...out.subarray(16)], [1, 0.5, 0, 0], 'gloss clamps; smooth rides beside it');
});

test('rockMesh: 80 closed, jagged faces; shared corners move together', () => {
  const { positions } = rockMesh();
  assert.equal(positions.length, 80 * 3 * 3);
  const radii = [];
  const byCorner = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const p = positions.slice(i, i + 3);
    const r = Math.hypot(...p);
    radii.push(r);
    const key = p.map((v) => (v / r).toFixed(4)).join(',');
    if (!byCorner.has(key)) byCorner.set(key, r);
    else assert.ok(Math.abs(byCorner.get(key) - r) < 1e-9, 'a shared corner has one radius (the stone stays closed)');
  }
  assert.ok(Math.min(...radii) >= 0.68 - 1e-9 && Math.max(...radii) <= 1.16 + 1e-9);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.2, 'jagged, not a sphere');
  assert.equal(byCorner.size, 42, 'an icosahedron subdivided once has 42 corners');
});
