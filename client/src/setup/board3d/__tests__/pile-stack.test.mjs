import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pileLayers, pileOffsets, pileVisualCount } from '../pile-stack.mjs';

test('row 7: deck count 0 / 1 / 60 / 90 → 0 / 1 / 12 / 12 layers', () => {
  assert.deepEqual([0, 1, 60, 90].map((n) => pileLayers(n)), [0, 1, 12, 12]);
  assert.equal(pileLayers(Number.NaN), 0);
  assert.equal(pileLayers(30, { maxCount: 60, maxLayers: 6 }), 3);
});

test('offsets stack each layer one thickness higher', () => {
  assert.deepEqual(pileOffsets(0, 0.5), []);
  assert.deepEqual(pileOffsets(1, 0.5), [0]);
  assert.deepEqual(pileOffsets(4, 0.5), [0, 0.5, 1, 1.5]);
  assert.deepEqual(pileOffsets(3, Number.NaN), [0, 0, 0]);
  assert.deepEqual(pileOffsets(-2, 1), []);
});

test('open piles draw at most six cards', () => {
  assert.deepEqual([0, 1, 5, 6, 7, 60].map((n) => pileVisualCount(n)), [0, 1, 5, 6, 6, 6]);
  assert.equal(pileVisualCount(10, 3), 3);
  assert.equal(pileVisualCount(-1), 0);
});
