// Design 076: the poison kit's GPU modifiers. Globs, drips and the pool bubble (a rising distort
// under a detail layer), a stream's ooze wavers along it, and every fill burns a drawer's
// dissolve at the kit's thick lilac edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { poison } from '../poison.js';
import { assertEdged, detailed, distorted, drawMods } from './fx-mod-rows.mjs';

test('poison glob: the glob and its drip bubble; the rim and glint hold still', () => {
  const rows = drawMods((ctx) => poison.body(ctx, 50, 50, 30, 1, 1));
  assert.equal(rows.length, 4, 'glob, drip, rim, glint');
  assert.ok(rows.slice(0, 2).every((row) => distorted(row) && detailed(row)));
  assert.ok(!rows.slice(2).some((row) => distorted(row) || detailed(row)));
  assertEdged(rows, poison.palette.hot);
});

test('poison stream and pool: the ooze wavers along the stream, the pool bubbles', () => {
  const stream = drawMods((ctx) => poison.tongue(ctx, { x: 50, y: 50, angleDeg: 0, length: 90, width: 20, time: 0.3, seed: 1 }));
  assert.ok(distorted(stream[0]) && !detailed(stream[0]), 'the ooze band');
  assertEdged(stream, poison.palette.hot);
  const pool = drawMods((ctx) => poison.sigil(ctx, 50, 50, 40, 0.5));
  assert.ok(distorted(pool[0]) && detailed(pool[0]), 'the pool');
  assertEdged(pool, poison.palette.hot);
});
