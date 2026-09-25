import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalTcgdexPath,
  createTcgdexProxy,
  ttlForTcgdexPath,
} from '../tcgdex-proxy.mjs';

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const next = typeof responses === 'function' ? responses(url) : responses.shift();
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => next.body ?? '' };
  };
  return { impl, calls };
}

test('canonicalTcgdexPath allows card/set/series reads and sorts the query', () => {
  assert.equal(canonicalTcgdexPath('/v2/en/cards/xy7-97', {}), '/v2/en/cards/xy7-97');
  assert.equal(canonicalTcgdexPath('/v2/en/sets/sv03.5', {}), '/v2/en/sets/sv03.5');
  assert.equal(
    canonicalTcgdexPath('/v2/en/cards', { stage: 'Basic', name: 'Groudon EX' }),
    '/v2/en/cards?name=Groudon+EX&stage=Basic'
  );
});

test('canonicalTcgdexPath rejects other paths, languages and non-string queries', () => {
  assert.equal(canonicalTcgdexPath('/v2/en/cards/a/b', {}), null);
  assert.equal(canonicalTcgdexPath('/v2/fr/cards/xy7-97', {}), null);
  assert.equal(canonicalTcgdexPath('/v2/en/../secret', {}), null);
  assert.equal(canonicalTcgdexPath('/v2/en/cards', { name: ['a', 'b'] }), null);
  assert.equal(canonicalTcgdexPath('/v2/en/cards', { name: 'x'.repeat(400) }), null);
});

test('ttlForTcgdexPath keeps single records longer than lists', () => {
  assert.ok(ttlForTcgdexPath('/v2/en/cards/xy7-97') > ttlForTcgdexPath('/v2/en/cards?name=N'));
});

test('a cached card is fetched upstream once across many requests', async () => {
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: '{"id":"xy7-97"}' }));
  const proxy = createTcgdexProxy({ fetchImpl: impl });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => proxy.get('/v2/en/cards/xy7-97'))
  );
  await proxy.get('/v2/en/cards/xy7-97');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://api.tcgdex.net/v2/en/cards/xy7-97');
  for (const r of results) assert.deepEqual([r.status, r.body], [200, '{"id":"xy7-97"}']);
});

test('upstream concurrency is capped', async () => {
  let active = 0;
  let peak = 0;
  const impl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { status: 200, text: async () => '{}' };
  };
  const proxy = createTcgdexProxy({ fetchImpl: impl, concurrency: 3 });
  await Promise.all(Array.from({ length: 12 }, (_, i) => proxy.get(`/v2/en/cards/c-${i}`)));
  assert.equal(peak, 3);
});

test('a block (403) starts a cooldown that stops upstream calls until it ends', async () => {
  let t = 0;
  const { impl, calls } = fakeFetch([
    { status: 403, body: 'blocked' },
    { status: 200, body: '{}' },
  ]);
  const proxy = createTcgdexProxy({ fetchImpl: impl, now: () => t });
  const first = await proxy.get('/v2/en/cards/a-1');
  assert.equal(first.status, 502);
  assert.equal(first.cacheControl, 'no-store');
  assert.equal((await proxy.get('/v2/en/cards/a-2')).status, 502);
  assert.equal(calls.length, 1);
  t += 31_000;
  assert.equal((await proxy.get('/v2/en/cards/a-2')).status, 200);
  assert.equal(calls.length, 2);
});

test('an expired entry is served stale when upstream fails', async () => {
  let t = 0;
  const { impl } = fakeFetch([{ status: 200, body: '{"v":1}' }, new Error('network down')]);
  const proxy = createTcgdexProxy({ fetchImpl: impl, now: () => t });
  await proxy.get('/v2/en/cards?name=N');
  t += 7 * 60 * 60 * 1000;
  const stale = await proxy.get('/v2/en/cards?name=N');
  assert.deepEqual([stale.status, stale.body], [200, '{"v":1}']);
});

test('404s are cached briefly; network errors are not cached', async () => {
  const { impl, calls } = fakeFetch([
    { status: 404, body: '{"error":"not found"}' },
    new Error('reset'),
    { status: 200, body: '{}' },
  ]);
  const proxy = createTcgdexProxy({ fetchImpl: impl });
  assert.equal((await proxy.get('/v2/en/cards/missing')).status, 404);
  assert.equal((await proxy.get('/v2/en/cards/missing')).status, 404);
  assert.equal((await proxy.get('/v2/en/cards/flaky')).status, 502);
  assert.equal((await proxy.get('/v2/en/cards/flaky')).status, 200);
  assert.equal(calls.length, 3);
});

test('the cache is bounded (LRU)', async () => {
  const { impl } = fakeFetch(() => ({ status: 200, body: '{}' }));
  const proxy = createTcgdexProxy({ fetchImpl: impl, maxEntries: 2 });
  await proxy.get('/v2/en/cards/a');
  await proxy.get('/v2/en/cards/b');
  await proxy.get('/v2/en/cards/c');
  assert.equal(proxy.size(), 2);
});
