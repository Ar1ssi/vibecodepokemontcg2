import test from 'node:test';
import assert from 'node:assert/strict';

import { litSideLight, moddedKit, unstyled } from '../_kit-mod.js';

test('moddedKit runs each drawing method under its mod, merged over the caller, and restores it', () => {
  const seen = [];
  const grain = () => {};
  const kit = moddedKit(
    { key: 'k', palette: { body: [1, 2, 3] }, body: (ctx) => seen.push(ctx.fxMod), grain },
    { dissolve: { edge: [9, 9, 9] } }
  );
  assert.ok(Object.isFrozen(kit));
  assert.equal(kit.key, 'k');
  assert.equal(kit.grain, grain, 'grain is not a drawing method');
  const ctx = { fxMod: { dissolve: { amount: 0.5 } } };
  const before = ctx.fxMod;
  kit.body(ctx);
  assert.deepEqual(seen[0], { dissolve: { amount: 0.5, edge: [9, 9, 9] } });
  assert.equal(ctx.fxMod, before);
});

test('moddedKit passes a missing context straight through', () => {
  const kit = moddedKit({ body: (ctx, x) => [ctx, x] }, { detail: { amount: 1 } });
  assert.deepEqual(kit.body(null, 4), [null, 4]);
});

test('unstyled clears the GPU style for its draw and restores it, even when draw throws', () => {
  const hint = { byKind: { radial: { id: 'smoke' } } };
  const ctx = { fxStyle: hint };
  assert.equal(unstyled(ctx, () => ctx.fxStyle), null);
  assert.equal(ctx.fxStyle, hint);
  assert.throws(() =>
    unstyled(ctx, () => {
      throw new Error('boom');
    })
  );
  assert.equal(ctx.fxStyle, hint);
});

test('litSideLight lights a shape from its left normal: an upright spire (stage -90) from stage +x (light 0)', () => {
  assert.equal(litSideLight(-90), 0);
  // Pointing right (0): its left normal is stage +y, down the screen: light angle -90.
  assert.equal(litSideLight(0), -90);
  assert.equal(litSideLight(undefined), -90);
});
