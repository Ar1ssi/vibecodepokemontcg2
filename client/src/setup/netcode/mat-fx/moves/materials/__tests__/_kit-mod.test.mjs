import test from 'node:test';
import assert from 'node:assert/strict';

import { moddedKit } from '../_kit-mod.js';

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
