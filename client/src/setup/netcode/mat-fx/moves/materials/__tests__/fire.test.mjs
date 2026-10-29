// Design 078: the fire kit's modifiers. Heat haze and a rising grain ride the flame body, the
// white-hot core stays crisp, every fill names the orange dissolve edge, and the caller's
// `fxMod` (a drawer's dissolve) survives the draw untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fire } from '../fire.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 });

test('fire tongue: haze and grain on the body and mid passes, haze only on the core', () => {
  const { ctx, recording } = modRecorder();
  fire.tongue(ctx, TONGUE);
  const [body, mid, core] = recordedMods(recording);
  assert.ok(body.distort > 0 && body.detail > 0);
  assert.ok(mid.distort > 0 && mid.detail > 0);
  assert.ok(core.distort > 0 && core.detail === 0, 'the white-hot filament keeps clean');
  assert.ok(body.distort > core.distort, 'haze is strongest where the flame is widest');
  assert.ok(body.volume > 0 && mid.volume > 0 && core.volume === 0, 'the outer flame is lit, the core glows');
  assert.ok(body.z > 0 && mid.z > body.z && core.z > mid.z, 'the core rides above the body');
  for (const row of [body, mid, core]) {
    assert.deepEqual(row.edge, [...fire.palette.body]);
    assert.equal(row.dissolve.amount, 0, 'a kit never dissolves on its own');
  }
  assert.equal(ctx.fxMod, null);
});

test('fire body and glow: the sphere churns with grain, the halo only wavers', () => {
  const { ctx, recording } = modRecorder();
  fire.body(ctx, 50, 50, 20, 1, 1);
  fire.glow(ctx, 50, 50, 40, 0.5);
  const [body, glow] = recordedMods(recording);
  assert.ok(body.distort > 0 && body.detail > 0 && body.volume > 0);
  assert.ok(glow.distort > 0 && glow.detail === 0 && glow.volume === 0);
  assert.ok(body.z > glow.z);
  assert.equal(ctx.fxMod, null);
  assert.equal(ctx.fxLift, null);
});

test('fire projectile keeps a drawer dissolve and restores it after', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.4 } };
  ctx.fxMod = drawer;
  fire.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, time: 0.3, seed: 2 });
  const rows = recordedMods(recording);
  assert.ok(rows.length > 10);
  for (const row of rows) {
    assert.ok(Math.abs(row.dissolve.amount - 0.4) < 1e-6);
    assert.deepEqual(row.edge, [...fire.palette.body]);
  }
  assert.equal(ctx.fxMod, drawer);
  assert.deepEqual(drawer, { dissolve: { amount: 0.4 } }, 'the caller object is not mutated');
});

test('a tinted fire burns its edge in the tint', () => {
  const { ctx, recording } = modRecorder();
  const blue = fire.withPalette({ ...fire.palette, body: [40, 90, 255] });
  blue.glow(ctx, 50, 50, 30, 1);
  assert.deepEqual(recordedMods(recording)[0].edge, [40, 90, 255]);
});
