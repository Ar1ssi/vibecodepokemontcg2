// Design 078: the normal kit's modifiers. Pressure light breathes: a slow warp and grain in the
// body and the tongue's hot pass, the white core pass and the rings clean, and every fill names
// the gold dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { normal } from '../normal.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 80, width: 24, time: 0.4, seed: 3 });

test('normal tongue: warp and grain on the hot pass, the core pass clean', () => {
  const { ctx, recording } = modRecorder();
  normal.tongue(ctx, TONGUE);
  const [hot, core] = recordedMods(recording);
  assert.ok(hot.distort > 0 && hot.detail > 0);
  assert.equal(core.distort + core.detail, 0);
  for (const row of [hot, core]) assert.deepEqual(row.edge, [...normal.palette.body]);
  assert.ok(hot.volume > 0 && core.volume === 0);
  assert.ok(core.z > hot.z);
  assert.equal(ctx.fxMod, null);
  assert.equal(ctx.fxLift, null);
});

test('normal projectile: body and glow breathe, the rings stay clean, a drawer dissolve survives', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.7 } };
  ctx.fxMod = drawer;
  normal.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, time: 0.3, seed: 2 });
  const [glow, body, ...rings] = recordedMods(recording);
  assert.ok(glow.distort > 0 && glow.detail === 0);
  assert.ok(body.distort > 0 && body.detail > 0 && body.volume > 0);
  assert.equal(rings.length, 2);
  for (const ring of rings) {
    assert.equal(ring.distort + ring.detail, 0);
    assert.ok(ring.volume > 0 && ring.z > body.z, 'the rings orbit above the body');
  }
  for (const row of [glow, body, ...rings]) assert.ok(Math.abs(row.dissolve.amount - 0.7) < 1e-6);
  assert.equal(ctx.fxMod, drawer);
});
