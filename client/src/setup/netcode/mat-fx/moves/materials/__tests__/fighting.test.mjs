// Design 078: the fighting and aura kits' modifiers. A shock streak is rigid (grain only, no
// warp), the impact disc and the ki sphere ripple and churn, the rings and swirls stay clean, and
// every fill names the kit's dissolve edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { aura, fighting } from '../fighting.js';
import { modRecorder, recordedMods } from './kit-mod-probe.mjs';

const STREAK = Object.freeze({ x: 50, y: 50, angleDeg: 0, length: 80, width: 20, time: 0.4, seed: 3 });

test('shock streak: grain on the body pass only, never a warp', () => {
  for (const kit of [fighting, aura]) {
    const { ctx, recording } = modRecorder();
    kit.tongue(ctx, STREAK);
    const [body, mid, centre] = recordedMods(recording);
    assert.ok(body.detail > 0);
    assert.equal(body.distort + mid.distort + centre.distort, 0);
    assert.equal(mid.detail + centre.detail, 0);
    for (const row of [body, mid, centre]) assert.deepEqual(row.edge, [...kit.palette.hot]);
    assert.ok(body.z > 0 && mid.z > body.z && centre.z > mid.z, 'the centre rides above the body');
    assert.equal(ctx.fxMod, null);
    assert.equal(ctx.fxLift, null);
  }
});

test('impact disc: the hot disc ripples and churns; its three rings stay clean', () => {
  const { ctx, recording } = modRecorder();
  fighting.body(ctx, 50, 50, 30, 1, 1);
  const [disc, ...rings] = recordedMods(recording);
  assert.ok(disc.distort > 0 && disc.detail > 0 && disc.volume > 0);
  assert.equal(rings.length, 3);
  for (const ring of rings) {
    assert.equal(ring.distort + ring.detail, 0);
    assert.ok(ring.volume > 0 && ring.z > disc.z, 'the rings are lit tubes above the disc');
  }
});

test('ki sphere churns; its swirl arcs stay clean', () => {
  const { ctx, recording } = modRecorder();
  aura.body(ctx, 50, 50, 30, 1, 1);
  const [sphere, ...swirl] = recordedMods(recording);
  assert.ok(sphere.distort > 0 && sphere.detail > 0 && sphere.volume > 0);
  assert.equal(swirl.length, 2);
  for (const arc of swirl) {
    assert.equal(arc.distort + arc.detail, 0);
    assert.ok(arc.volume > 0 && arc.z > sphere.z);
  }
});

test('fighting projectile and sigil keep a drawer dissolve and restore it after', () => {
  const { ctx, recording } = modRecorder();
  const drawer = { dissolve: { amount: 0.5 } };
  ctx.fxMod = drawer;
  fighting.projectile(ctx, { x: 60, y: 60, r: 14, headingDeg: 0, time: 0.3, seed: 2 });
  fighting.sigil(ctx, 60, 60, 40, 0.5);
  const rows = recordedMods(recording);
  assert.ok(rows.length > 5);
  for (const row of rows) assert.ok(Math.abs(row.dissolve.amount - 0.5) < 1e-6);
  assert.equal(ctx.fxMod, drawer);
});
