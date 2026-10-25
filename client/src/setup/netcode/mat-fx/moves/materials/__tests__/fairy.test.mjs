// Design 076: the fairy kit's GPU modifiers. The soft light shimmers (distort + detail), a trail's
// ribbon wavers, the moon's disc takes a surface layer, sparkles stay crisp; every fill burns a
// drawer's dissolve at the kit's gold edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fairy } from '../fairy.js';
import { assertEdged, assertLift, detailed, distorted, drawMods, lit } from './fx-mod-rows.mjs';

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

test('fairy depth: the moon is a lit sphere floating over its trails, the haze stays on the cloth', () => {
  const rows = drawMods((ctx) => fairy.projectile(ctx, { x: 60, y: 60, r: 20, headingDeg: 0, time: 0.5, seed: 2, tongues: 1 }));
  const [haze, outer, , , disc] = rows;
  assertLift(haze, 0, 'haze');
  assert.ok(lit(outer) && lit(disc) && disc.volume.rim > 0);
  assertLift(outer, 0.05, 'trail');
  assertLift(disc, 0.12, 'moon');
  const twinkle = drawMods((ctx) => fairy.body(ctx, 50, 50, 20, 1, 1));
  assert.ok(lit(twinkle[0]));
  for (const row of twinkle) assertLift(row, 0.08, 'twinkle');
});
