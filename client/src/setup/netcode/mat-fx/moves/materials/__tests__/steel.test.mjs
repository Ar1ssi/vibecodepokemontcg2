// Design 076: the steel kit's modifiers. Metal stays rigid: no warp on the blade, a slow brushed
// grain on its body, a faint cool shimmer in the halo, a clean specular line, and every fill
// names the cool-blue dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { steel } from '../steel.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const BLADE = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 90, width: 20, time: 0.4, seed: 3 });

test('steel blade: shimmer in the halo, brushed grain on the body, the specular line clean', () => {
  const { ctx, recording } = modRecorder();
  steel.tongue(ctx, BLADE);
  const [halo, body, specular] = recordedMods(recording);
  assert.ok(halo.distort > 0 && halo.detail === 0);
  assert.ok(body.detail > 0 && body.distort === 0, 'the blade itself never wavers');
  assert.equal(specular.distort + specular.detail, 0);
  for (const row of [halo, body, specular]) assert.deepEqual(row.edge, [...steel.palette.edge]);
  assert.equal(body.volume, 0, 'the brushed gradient runs across the blade, so it keeps its own lighting');
  assert.ok(halo.z > 0 && body.z > halo.z && specular.z > body.z);
  assert.equal(ctx.fxMod, null);
  assert.equal(ctx.fxLift, null);
});

test('steel sphere: brushed grain, no warp; the rim stroke clean', () => {
  const { ctx, recording } = modRecorder();
  steel.body(ctx, 50, 50, 30, 1, 1);
  const [sphere, rim] = recordedMods(recording);
  assert.ok(sphere.detail > 0 && sphere.distort === 0 && sphere.volume > 0);
  assert.equal(rim.distort + rim.detail, 0);
  assert.ok(rim.volume > 0 && rim.z > sphere.z);
});

test('steel projectile and sigil keep a drawer dissolve and restore it after', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.2 } };
  ctx.fxMod = drawer;
  steel.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, time: 0.3, seed: 2 });
  steel.sigil(ctx, 60, 60, 40, 0.5);
  for (const row of recordedMods(recording)) {
    assert.ok(Math.abs(row.dissolve.amount - 0.2) < 1e-6);
    assert.deepEqual(row.edge, [...steel.palette.edge]);
  }
  assert.equal(ctx.fxMod, drawer);
});
