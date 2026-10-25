import test from 'node:test';
import assert from 'node:assert/strict';

import { bug, buzz, silver } from '../bug.js';
import { fxModSpy } from './fx-mod-spy.mjs';

test('bug wings fill under a still membrane layer; the core sphere and veins stay clean', () => {
  const spy = fxModSpy();
  bug.body(spy.ctx, 100, 100, 30, 1, 1);
  const [wings, core] = spy.fills();
  assert.ok(wings.fxMod.detail.amount > 0);
  assert.equal(wings.fxMod.detail.speed, 0);
  assert.equal(core.fxMod.detail, undefined);
  assert.ok(spy.paints.filter((p) => p.op === 'stroke').every((s) => !s.fxMod.detail));
  assert.equal(spy.ctx.fxMod, null, 'fxMod restored');
});

test('a bug halo buzzes (fast distort); a silver streak streams powder on a fixed flow', () => {
  const halo = fxModSpy();
  bug.glow(halo.ctx, 0, 0, 40, 1);
  const [air] = halo.fills();
  assert.ok(air.fxMod.distort.strength > 0 && air.fxMod.distort.speed >= 2, 'a fast, fine shimmer');
  const streak = fxModSpy();
  const spec = { x: 0, y: 0, angleDeg: 200, length: 80, width: 30, time: 0, seed: 1 };
  silver.tongue(streak.ctx, spec, { alpha: 1, hot: 1 });
  const [powder] = streak.fills();
  assert.ok(powder.fxMod.detail.amount > 0 && powder.fxMod.detail.speed > 0);
  const turned = fxModSpy();
  silver.tongue(turned.ctx, { ...spec, angleDeg: 20 }, { alpha: 1, hot: 1 });
  assert.deepEqual(turned.fills()[0].fxMod, powder.fxMod, 'the flow does not turn with the streak');
  assert.equal(streak.ctx.fxMod, null);
});

test('dissolve edges from each palette: bug and buzz lime, silver its pale core; a drawer amount is kept', () => {
  for (const [kit, key] of [
    [bug, 'hot'],
    [buzz, 'hot'],
    [silver, 'core'],
  ]) {
    const outer = { dissolve: { amount: 0.2 } };
    const spy = fxModSpy(outer);
    kit.projectile(spy.ctx, { x: 0, y: 0, r: 20, headingDeg: 0, time: 0, seed: 0, tongues: 1 });
    const [first] = spy.fills();
    assert.deepEqual(first.fxMod.dissolve.edge, [...kit.palette[key]], kit.key);
    assert.equal(first.fxMod.dissolve.amount, 0.2);
    assert.equal(spy.ctx.fxMod, outer);
  }
});
