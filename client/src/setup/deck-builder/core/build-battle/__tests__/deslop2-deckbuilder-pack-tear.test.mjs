import test from 'node:test';
import assert from 'node:assert/strict';

import { packBodyEdge, packTearEdge } from '../unboxing.mjs';

const points = (polygon) => polygon.slice('polygon('.length, -1).split(', ');

test('packBodyEdge cuts along the same line as packTearEdge and closes with the bottom corners', () => {
  for (const [seed, packIndex] of [[42, 0], [7, 3]]) {
    const strip = points(packTearEdge(seed, packIndex));
    const body = points(packBodyEdge(seed, packIndex));
    assert.deepEqual(strip.slice(2), body.slice(0, -2), 'one shared tear line');
    assert.deepEqual(body.slice(-2), ['0% 100%', '100% 100%']);
    assert.equal(packBodyEdge(seed, packIndex), packBodyEdge(seed, packIndex), 'seeded');
  }
});
