// Design 076: the electric kit's modifiers. A fast, fine crackle jitter runs through the glow
// and the yellow core, the white centre stays a clean line, the ball gets a charge grain, and
// every fill names the cyan-white dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { electric } from '../electric.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 90, width: 24, time: 0.4, seed: 3 });

test('electric jag: crackle jitter on the halo and core, the white centre clean', () => {
  const { ctx, recording } = modRecorder();
  electric.tongue(ctx, TONGUE);
  const [halo, core, centre] = recordedMods(recording);
  assert.ok(halo.distort > 0 && core.distort > 0);
  assert.equal(centre.distort, 0);
  for (const row of [halo, core, centre]) {
    assert.equal(row.detail, 0, 'a thin jag carries no grain');
    assert.deepEqual(row.edge, [...electric.palette.edge]);
  }
  assert.equal(ctx.fxMod, null);
});

test('electric bolt strokes jitter the glow and core, not the centre', () => {
  const { ctx, recording } = modRecorder();
  electric.jagStroke(ctx, [[[10, 10], [40, 30], [70, 15], [100, 40]]], { width: 6 });
  const [glow, core, centre] = recordedMods(recording);
  assert.ok(glow.distort > 0 && core.distort > 0);
  assert.equal(centre.distort, 0);
  assert.equal(ctx.fxMod, null);
});

test('electric ball: the sphere carries charge grain; the crackle strokes stay clean', () => {
  const { ctx, recording } = modRecorder();
  electric.body(ctx, 50, 50, 30, 1, 1);
  const [sphere, ...crackle] = recordedMods(recording);
  assert.ok(sphere.distort > 0 && sphere.detail > 0);
  assert.equal(crackle.length, 2);
  for (const row of crackle) assert.equal(row.distort + row.detail, 0);
});

test('electric projectile keeps a drawer dissolve and restores it after', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.3 } };
  ctx.fxMod = drawer;
  electric.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, time: 0.3, seed: 2 });
  for (const row of recordedMods(recording)) {
    assert.ok(Math.abs(row.dissolve.amount - 0.3) < 1e-6);
    assert.deepEqual(row.edge, [...electric.palette.edge]);
  }
  assert.equal(ctx.fxMod, drawer);
});
