// Design 076: the ice kit's GPU modifiers. A crystal's ice fill takes a frost detail layer and is
// never warped; only the mist drifts (distort + detail); ice and aurora burn a drawer's dissolve
// at a thin pale-cyan edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { aurora, ice } from '../ice.js';
import { assertEdged, detailed, distorted, drawMods } from './fx-mod-rows.mjs';

test('ice crystal: frost on the ice fill, no warp anywhere; facet and edge clean', () => {
  const rows = drawMods((ctx) => ice.tongue(ctx, { x: 50, y: 50, angleDeg: -90, length: 80, width: 30, seed: 3 }));
  assert.equal(rows.length, 3, 'ice fill, lit facet, edge');
  assert.ok(detailed(rows[0]));
  assert.ok(!rows.some(distorted), 'ice holds still');
  assert.ok(!rows.slice(1).some(detailed));
  assertEdged(rows, ice.palette.hot);
});

test('ice and aurora mist drifts; the aurora burns at the same frost edge', () => {
  const mist = drawMods((ctx) => ice.glow(ctx, 50, 50, 40, 1));
  assert.ok(distorted(mist[0]) && detailed(mist[0]));
  const ring = drawMods((ctx) => aurora.body(ctx, 50, 50, 30, 1, 1));
  assert.ok(distorted(ring[0]), 'the aurora mist');
  assert.ok(!ring.slice(1).some(distorted), 'the rings hold their shape');
  assertEdged(ring, aurora.palette.hot);
});
