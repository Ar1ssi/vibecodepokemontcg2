// Design 078: the dragon kit's modifiers. Wavering plasma and a streaming energy grain ride the
// violet flame and the orb, the ember core stays crisp, the helix strands stay clean, and every
// fill names the magenta dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dragon } from '../dragon.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 90, width: 30, time: 0.4, seed: 3 });

test('dragon tongue: plasma warp and grain on the outer passes, warp only on the ember core', () => {
  for (const jag of [0, 1]) {
    const { ctx, recording } = modRecorder();
    dragon.tongue(ctx, TONGUE, { jag });
    const [body, mid, core] = recordedMods(recording);
    assert.ok(body.distort > 0 && body.detail > 0);
    assert.ok(mid.distort > 0 && mid.detail > 0);
    assert.ok(core.distort > 0 && core.detail === 0);
    for (const row of [body, mid, core]) assert.deepEqual(row.edge, [...dragon.palette.hot]);
    assert.ok(body.volume > 0 && mid.volume > 0 && core.volume === 0);
    assert.ok(mid.z > body.z && core.z > mid.z);
    assert.equal(ctx.fxMod, null);
    assert.equal(ctx.fxLift, null);
  }
});

test('dragon orb: a lit churning sphere, its helix strands lit tubes riding above it', () => {
  const { ctx, recording } = modRecorder();
  dragon.body(ctx, 50, 50, 30, 1, 1, 0.5);
  const [sphere, ...strands] = recordedMods(recording);
  assert.ok(sphere.distort > 0 && sphere.detail > 0 && sphere.volume > 0);
  assert.equal(strands.length, 2);
  for (const strand of strands) {
    assert.equal(strand.distort, 0);
    assert.equal(strand.detail, 0);
    assert.ok(strand.volume > 0 && strand.z > sphere.z);
    assert.deepEqual(strand.edge, [...dragon.palette.hot]);
  }
});

test('dragon projectile keeps a drawer dissolve and restores it after', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.6 } };
  ctx.fxMod = drawer;
  dragon.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 30, time: 0.3, seed: 2 });
  const rows = recordedMods(recording);
  assert.ok(rows.length > 10);
  for (const row of rows) assert.ok(Math.abs(row.dissolve.amount - 0.6) < 1e-6);
  assert.ok(recordedMods(recording)[0].distort > 0, 'the glow halo wavers');
  assert.equal(ctx.fxMod, drawer);
});
