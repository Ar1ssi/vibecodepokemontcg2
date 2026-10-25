import test from 'node:test';
import assert from 'node:assert/strict';

import { dissolveTail, mergeFxMods, withFxMod } from '../_mods.js';

test('mergeFxMods merges per module and keeps untouched modules', () => {
  const outer = { dissolve: { amount: 0.4 }, detail: { amount: 0.2 } };
  const merged = mergeFxMods(outer, { dissolve: { edge: [1, 2, 3] }, distort: { strength: 0.1 } });
  assert.deepEqual(merged, { dissolve: { amount: 0.4, edge: [1, 2, 3] }, detail: { amount: 0.2 }, distort: { strength: 0.1 } });
  assert.deepEqual(outer, { dissolve: { amount: 0.4 }, detail: { amount: 0.2 } }, 'outer is not mutated');
  assert.equal(mergeFxMods(null, null), null);
  assert.equal(mergeFxMods(outer, null), outer);
});

test('withFxMod layers over the caller and restores it, even when draw throws', () => {
  const ctx = { fxMod: { dissolve: { amount: 0.5 } } };
  const seen = withFxMod(ctx, { distort: { strength: 0.2 } }, () => ctx.fxMod);
  assert.deepEqual(seen, { dissolve: { amount: 0.5 }, distort: { strength: 0.2 } });
  assert.deepEqual(ctx.fxMod, { dissolve: { amount: 0.5 } });
  assert.throws(() =>
    withFxMod(ctx, { detail: { amount: 1 } }, () => {
      throw new Error('boom');
    })
  );
  assert.deepEqual(ctx.fxMod, { dissolve: { amount: 0.5 } });
  const bare = {};
  withFxMod(bare, { detail: { amount: 1 } }, () => assert.deepEqual(bare.fxMod, { detail: { amount: 1 } }));
  assert.equal(bare.fxMod, null);
});

test('dissolveTail ramps from `from` to the end; junk reads as whole', () => {
  assert.equal(dissolveTail(0.5), 0);
  assert.equal(dissolveTail(0.7), 0);
  assert.ok(Math.abs(dissolveTail(0.85) - 0.5) < 1e-9);
  assert.equal(dissolveTail(1), 1);
  assert.equal(dissolveTail(2), 1);
  assert.equal(dissolveTail(NaN), 0);
  assert.equal(dissolveTail(0.9, 1), 0);
});
