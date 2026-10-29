// Design 078: the dark kit's GPU modifiers. A slash's crimson halo smoulders (distort and detail
// along the blade) while the black blade stays crisp; the haze and the pulse ripples waver;
// every fill burns a drawer's dissolve at the kit's crimson edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dark } from '../dark.js';
import { assertEdged, assertLift, detailed, distorted, drawMods, lit } from './fx-mod-rows.mjs';

const rad = (deg) => (deg * Math.PI) / 180;

test('dark slash: the halo smoulders along the blade; blade and edge line stay crisp', () => {
  const rows = drawMods((ctx) => dark.tongue(ctx, { x: 50, y: 50, angleDeg: 30, length: 80, width: 20, time: 0.4, seed: 3 }));
  assert.equal(rows.length, 3, 'halo, blade, edge line');
  const [halo, blade, line] = rows;
  assert.ok(distorted(halo) && detailed(halo));
  assert.ok(Math.abs(halo.detail.angle - rad(30)) < 1e-6, 'flowing along the blade');
  assert.ok(![blade, line].some((row) => distorted(row) || detailed(row)));
  assertEdged(rows, dark.palette.hot);
});

test('dark pulse: the ripple bands waver, the core and spark do not; the haze is detailed', () => {
  const rows = drawMods((ctx) => dark.body(ctx, 50, 50, 30, 1, 1));
  // core, 3 dark bands, 3 crimson bands, spark
  assert.equal(rows.length, 8);
  assert.ok(!distorted(rows[0]) && !distorted(rows[7]));
  assert.ok(rows.slice(1, 7).every(distorted));
  assertEdged(rows, dark.palette.hot);
  const haze = drawMods((ctx) => dark.glow(ctx, 50, 50, 40, 1));
  assert.ok(distorted(haze[0]) && detailed(haze[0]));
});

test('dark depth: the pulse core is a glossy lit sphere over its ripples; the blade stands over its halo', () => {
  const rows = drawMods((ctx) => dark.body(ctx, 50, 50, 30, 1, 1));
  const core = rows[0];
  assert.ok(lit(core) && core.volume.spec > 0);
  assert.ok(rows.slice(1, 7).every((row) => row.lift > 0 && row.lift < core.lift), 'ripples under the core');
  const [halo, blade, edge] = drawMods((ctx) => dark.tongue(ctx, { x: 50, y: 50, angleDeg: 30, length: 80, width: 20, time: 0.4, seed: 3 }));
  assert.ok(lit(blade) && lit(edge) && !lit(halo));
  assert.ok(blade.lift > halo.lift && edge.lift > blade.lift);
  assertLift(drawMods((ctx) => dark.glow(ctx, 50, 50, 40, 1))[0], 0, 'haze on the cloth');
});
