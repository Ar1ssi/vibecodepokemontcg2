import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichWithinBound } from '../bounded-enrichment.mjs';

test('enrichWithinBound: resolves after a hung enrichment instead of waiting forever', async () => {
  const hung = new Promise(() => {});
  const started = Date.now();
  await enrichWithinBound([{ n: 1 }, { n: 2 }], () => hung, 50);
  assert.ok(Date.now() - started < 1000);
});

test('enrichWithinBound: enriches every card and survives a rejecting one', async () => {
  const seen = [];
  await enrichWithinBound(
    [{ n: 1 }, { n: 2 }, { n: 3 }],
    async (card) => {
      seen.push(card.n);
      if (card.n === 2) throw new Error('fetch failed');
    },
    1000
  );
  assert.deepEqual(seen.sort(), [1, 2, 3]);
});

test('enrichWithinBound: survives a synchronous throw and empty input', async () => {
  await enrichWithinBound([{ n: 1 }], () => {
    throw new Error('sync');
  }, 1000);
  await enrichWithinBound([], () => assert.fail('no cards'), 1000);
  await enrichWithinBound(null, () => assert.fail('no cards'), 1000);
});

test('enrichWithinBound: runs enrichments in parallel, not one after another', async () => {
  const started = Date.now();
  await enrichWithinBound(
    [1, 2, 3, 4],
    () => new Promise((resolve) => setTimeout(resolve, 100)),
    2000
  );
  assert.ok(Date.now() - started < 300);
});
