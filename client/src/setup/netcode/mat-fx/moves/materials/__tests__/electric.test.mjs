// Design 078: the electric kit's modifiers and depth. A fast crackle jitter runs through the glow
// and the gold body; a bolt is a lit tube with its white centre riding above it and its halo
// below; the ball is a lit sphere in a fresnel shell; every fill names the cyan-white dissolve
// edge, and the caller's `fxMod` and `fxLift` come back untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

import { electric, wrapStrand } from '../electric.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 90, width: 24, time: 0.4, seed: 3 });
const BOLT = [[[10, 10], [40, 30], [70, 15], [100, 40]]];

test('electric jag: halo, body and centre stack upward; crackle on the halo and body only', () => {
  const { ctx, recording } = modRecorder();
  electric.tongue(ctx, TONGUE);
  const [halo, core, centre] = recordedMods(recording);
  assert.ok(halo.distort > 0 && core.distort > 0);
  assert.equal(centre.distort, 0);
  assert.ok(halo.z > 0 && core.z > halo.z && centre.z > core.z, 'each pass rides above the one under it');
  for (const row of [halo, core, centre]) {
    assert.equal(row.detail, 0, 'a thin jag carries no grain');
    assert.deepEqual(row.edge, [...electric.palette.edge]);
  }
  assert.equal(ctx.fxMod, null);
  assert.equal(ctx.fxLift, null);
});

test('electric bolt: a lit tube body and centre over an unlit halo, a filament wrapping it', () => {
  const { ctx, recording } = modRecorder();
  electric.jagStroke(ctx, BOLT, { width: 6 });
  const [glow, back, body, centre, front] = recordedMods(recording);
  assert.ok(glow.distort > 0, 'the halo carries the crackle');
  assert.equal(body.distort + centre.distort, 0, 'a warped read would smear the tube shading');
  assert.equal(glow.volume, 0, 'the halo stays a soft glow');
  assert.ok(body.volume > 0.5 && centre.volume > 0 && front.volume > 0);
  assert.ok(glow.z > 0 && body.z > glow.z && centre.z > body.z);
  assert.ok(back.z < body.z && front.z > centre.z, 'the filament passes behind the tube and in front of it');
  assert.equal(ctx.fxMod, null);
  assert.equal(ctx.fxLift, null);
});

test('electric bolt heights add to the drawer lift, which comes back after', () => {
  const { ctx, recording } = modRecorder();
  ctx.fxLift = { z: 0.5 };
  electric.jagStroke(ctx, BOLT, { width: 6 });
  for (const row of recordedMods(recording)) assert.ok(row.z > 0.5);
  // The recorder re-wraps a lift it is handed, so compare what it carries.
  assert.equal(ctx.fxLift.z, 0.5);
});

test('electric ball: a fresnel shell, a lit grained sphere, then the crackle on top', () => {
  const { ctx, recording } = modRecorder();
  electric.body(ctx, 50, 50, 30, 1, 1);
  const [shell, sphere, ...crackle] = recordedMods(recording);
  assert.ok(shell.volume > 0 && shell.detail === 0);
  assert.ok(sphere.volume > 0 && sphere.distort > 0 && sphere.detail > 0);
  assert.ok(sphere.z > shell.z);
  assert.equal(crackle.length, 2);
  for (const row of crackle) {
    assert.equal(row.distort + row.detail, 0);
    assert.ok(row.z > sphere.z);
  }
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

test('wrapStrand sways either side of the line and splits front from back runs', () => {
  const line = [[0, 0], [200, 0]];
  const { front, back } = wrapStrand(line, 10, 0);
  assert.ok(front.length > 0 && back.length > 0);
  for (const run of [...front, ...back]) {
    assert.ok(run.length > 1);
    for (const [x, y] of run) {
      assert.ok(x >= 0 && x <= 200);
      assert.ok(Math.abs(y) <= 7.5 + 1e-9, 'within 0.75 tube widths of the line');
    }
  }
  // One turn per 7 widths: 200 px of a 10 px tube is just under 3 turns, so 3 front runs.
  assert.equal(front.length, 3);
  // Runs join: each run starts where the last one ended.
  const all = [...front, ...back].sort((a, b) => a[0][0] - b[0][0]);
  for (let i = 1; i < all.length; i += 1) assert.deepEqual(all[i][0], all[i - 1].at(-1));
});

test('wrapStrand wraps nothing for junk input', () => {
  assert.deepEqual(wrapStrand([[0, 0]], 10), { front: [], back: [] });
  assert.deepEqual(wrapStrand(null, 10), { front: [], back: [] });
  assert.deepEqual(wrapStrand([[0, 0], [10, 0]], 0), { front: [], back: [] });
  assert.deepEqual(wrapStrand([[0, 0], [0, 0]], 5), { front: [], back: [] });
});
