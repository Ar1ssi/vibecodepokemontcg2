// Design 078: the stellar kit's modifiers. The cyan mist drifts like a nebula (warp and a fine
// grain), the faceted head only glints, the prismatic fringe stays a clean line, and every fill
// names the cyan dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { stellar } from '../stellar.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

test('stellar mist warps and mottles; the faceted head carries a faint grain, no warp', () => {
  const { ctx, recording } = modRecorder();
  stellar.glow(ctx, 50, 50, 40, 1);
  stellar.body(ctx, 50, 50, 20, 1, 1);
  const [mist, ...facets] = recordedMods(recording);
  assert.ok(mist.distort > 0 && mist.detail > 0);
  assert.equal(facets.length, 7, 'six facets and the core edge');
  for (const facet of facets) {
    assert.ok(facet.detail > 0 && facet.detail < mist.detail);
    assert.equal(facet.distort, 0, 'a crystal never wavers');
  }
  for (const row of [mist, ...facets]) assert.deepEqual(row.edge, [...stellar.palette.hot]);
  for (const facet of facets) assert.ok(facet.z > mist.z, 'the head rides above its mist');
  assert.equal(ctx.fxMod, null);
});

test('stellar fringe stays clean; a drawer dissolve survives the projectile', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.5 } };
  ctx.fxMod = drawer;
  stellar.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, seed: 2 });
  const rows = recordedMods(recording);
  assert.ok(rows.length > 8);
  for (const row of rows) assert.ok(Math.abs(row.dissolve.amount - 0.5) < 1e-6);
  assert.equal(ctx.fxMod, drawer);
});

test('stellar tongue: the fringe stroke carries no texture modules', () => {
  const { ctx, recording } = modRecorder();
  stellar.tongue(ctx, { x: 50, y: 50, angleDeg: 0, length: 60, width: 20, seed: 1 });
  const fringe = recordedMods(recording).at(-1);
  assert.equal(fringe.distort + fringe.detail, 0);
  assert.ok(fringe.volume > 0 && fringe.z > 0, 'the fringe is a lit tube standing off the crystal');
  assert.deepEqual(fringe.edge, [...stellar.palette.hot]);
  assert.equal(ctx.fxLift, null);
});
