import test from 'node:test';
import assert from 'node:assert/strict';

import { WATER_PALETTE } from '../element-params.mjs';
import { WATER_BEAM_FLOATS, normalizeWaterBeam, packWaterBeam } from '../water-beam.mjs';
import { WATER_DROP_FLOATS, normalizeWaterDrop, packWaterDrop } from '../water-drop.mjs';

test('water beam: defaults, refusals, and the packed row', () => {
  const beam = normalizeWaterBeam({ from: { x: 0, y: 0 }, to: { x: 30, y: 0 }, width: 10 });
  assert.equal(beam.taper, 0);
  assert.equal(beam.foam, 0.6);
  assert.equal(beam.flow, 1);
  assert.deepEqual(beam.palette.body, WATER_PALETTE.body);
  for (const bad of [null, { from: { x: 0, y: 0 }, width: 5 }, { from: { x: 0, y: 0 }, to: { x: 0.2, y: 0 }, width: 5 }, { from: { x: 0, y: 0 }, to: { x: 9, y: 0 }, width: 0 }]) {
    assert.equal(normalizeWaterBeam(bad), null, JSON.stringify(bad));
  }
  const out = new Float32Array(WATER_BEAM_FLOATS);
  packWaterBeam(normalizeWaterBeam({ from: { x: 1, y: 2, z: 3 }, to: { x: 4, y: 5, z: 6 }, width: 7, alpha: 0.5, seed: 8, flow: 2, taper: 1, foam: 0.25, dissolve: 0.75, palette: { deep: [0, 0, 0], body: [1, 1, 1], hot: [0.5, 0.5, 0.5] } }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 7, 4, 5, 6, 0.5, 0, 0, 0, 8, 1, 1, 1, 2, 0.5, 0.5, 0.5, 1, 0.75, 0.25, 0, 0]);
});

test('water drop: defaults, refusals, and the packed row', () => {
  assert.equal(normalizeWaterDrop({ at: { x: 0, y: 0 }, radius: 0 }), null);
  assert.equal(normalizeWaterDrop({ at: { x: 0 }, radius: 2 }), null);
  const out = new Float32Array(WATER_DROP_FLOATS);
  packWaterDrop(normalizeWaterDrop({ at: { x: 1, y: 2, z: 3 }, radius: 4, alpha: 0.5, seed: 6, dissolve: 0.25, palette: { deep: [0, 0, 0], body: [1, 1, 1], hot: [0.5, 0.5, 0.5] } }), out, 0);
  assert.deepEqual([...out], [1, 2, 3, 4, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 6, 0, 0, 0, 0.25]);
});
