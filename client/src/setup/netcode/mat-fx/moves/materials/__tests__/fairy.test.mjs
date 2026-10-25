// Design 076: the fairy kit's GPU modifiers. The soft light shimmers (distort + detail), a trail's
// ribbon wavers, the moon's disc takes a surface layer, sparkles stay crisp; every fill burns a
// drawer's dissolve at the kit's gold edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fairy } from '../fairy.js';
import { assertEdged, detailed, distorted, drawMods } from './fx-mod-rows.mjs';

test('fairy moon: haze shimmers, trail wavers, disc has a surface, sparkle stays crisp', () => {
  const rows = drawMods((ctx) => fairy.projectile(ctx, { x: 60, y: 60, r: 20, headingDeg: 0, time: 0.5, seed: 2, tongues: 1 }));
  // haze, trail outer, trail inner, trail twinkles, moon disc, then the clipped crescent and the
  // sparkle (the clip records rows of its own)
  const [haze, outer, inner, twinkles, disc, ...rest] = rows;
  assert.ok(rest.length >= 2);
  assert.ok(distorted(haze) && detailed(haze), 'the haze');
  assert.ok(distorted(outer), 'the trail ribbon');
  assert.ok(detailed(disc) && !distorted(disc), 'the moon surface');
  assert.ok(![inner, twinkles, ...rest].some((row) => distorted(row) || detailed(row)), 'crescent and sparkles stay crisp');
  assertEdged(rows, fairy.palette.gold);
});
