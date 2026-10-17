import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCachedFetchJson,
  createIndexedDbStore,
  ttlForUrl,
} from '../core/tcgdex-cache.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const SET_URL = 'https://api.tcgdex.net/v2/en/sets/sv01';
const SERIES_URL = 'https://api.tcgdex.net/v2/en/series/sv';

function memoryStore() {
  const map = new Map();
  return { map, get: async (key) => map.get(key), set: async (key, value) => void map.set(key, value) };
}

function harness({ store = memoryStore(), responses = {} } = {}) {
  const clock = { t: 1_000_000 };
  const calls = [];
  const fetchNetwork = async (url) => {
    calls.push(url);
    const response = responses[url];
    if (response instanceof Error) throw response;
    return response;
  };
  const fetchJson = createCachedFetchJson({ store, now: () => clock.t, fetchNetwork });
  return { fetchJson, calls, clock, store, responses };
}

test('single set/card records keep 7 days, lists and queries 1 day', () => {
  assert.equal(ttlForUrl(SET_URL), 7 * DAY_MS);
  assert.equal(ttlForUrl('https://api.tcgdex.net/v2/en/cards/sv01-001'), 7 * DAY_MS);
  assert.equal(ttlForUrl(SERIES_URL), DAY_MS);
  assert.equal(ttlForUrl('https://api.tcgdex.net/v2/en/cards?category=Energy'), DAY_MS);
  assert.equal(ttlForUrl('https://api.tcgdex.net/v2/en/cards?name=pikachu'), DAY_MS);
});

test('second request within TTL is served from the store, not the network', async () => {
  const h = harness({ responses: { [SET_URL]: { id: 'sv01' } } });
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  h.clock.t += 6 * DAY_MS;
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  assert.equal(h.calls.length, 1);
});

test('stale entry is refetched and replaced', async () => {
  const h = harness({ responses: { [SERIES_URL]: { sets: 1 } } });
  await h.fetchJson(SERIES_URL);
  h.clock.t += DAY_MS + 1;
  h.responses[SERIES_URL] = { sets: 2 };
  assert.deepEqual(await h.fetchJson(SERIES_URL), { sets: 2 });
  assert.equal(h.calls.length, 2);
});

test('network failure falls back to a stale entry', async () => {
  const h = harness({ responses: { [SERIES_URL]: { sets: 1 } } });
  await h.fetchJson(SERIES_URL);
  h.clock.t += 30 * DAY_MS;
  h.responses[SERIES_URL] = new Error('offline');
  assert.deepEqual(await h.fetchJson(SERIES_URL), { sets: 1 });
});

test('network failure with no entry rejects with the network error', async () => {
  const h = harness({ responses: { [SET_URL]: new Error('Request failed (500)') } });
  await assert.rejects(h.fetchJson(SET_URL), /Request failed \(500\)/);
});

test('failed requests are not cached', async () => {
  const h = harness({ responses: { [SET_URL]: new Error('offline') } });
  await assert.rejects(h.fetchJson(SET_URL));
  h.responses[SET_URL] = { id: 'sv01' };
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  assert.equal(h.calls.length, 2);
});

test('broken storage degrades to plain network fetches', async () => {
  const brokenStore = {
    get: async () => {
      throw new Error('blocked');
    },
    set: async () => {
      throw new Error('QuotaExceededError');
    },
  };
  const h = harness({ store: brokenStore, responses: { [SET_URL]: { id: 'sv01' } } });
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  assert.equal(h.calls.length, 2);
});

test('malformed stored entries are ignored', async () => {
  const store = memoryStore();
  store.map.set(`v1:${SET_URL}`, 'garbage');
  const h = harness({ store, responses: { [SET_URL]: { id: 'sv01' } } });
  assert.deepEqual(await h.fetchJson(SET_URL), { id: 'sv01' });
  assert.equal(h.calls.length, 1);
});

test('without IndexedDB the cache skips the store and fetches the network', async () => {
  assert.equal(createIndexedDbStore(undefined), null);
  const calls = [];
  const fetchNetwork = async (url) => {
    calls.push(url);
    return { url };
  };
  const fetchJson = createCachedFetchJson({ store: null, fetchNetwork });
  assert.deepEqual(await fetchJson(SET_URL), { url: SET_URL });
  assert.deepEqual(calls, [SET_URL]);
});

// Holds each network call open until the test settles it, so two calls can overlap.
function gatedNetwork() {
  const calls = [];
  const open = new Map();
  const fetchNetwork = (url) => {
    calls.push(url);
    return new Promise((resolve, reject) => {
      open.set(url, [...(open.get(url) || []), { resolve, reject }]);
    });
  };
  const settle = (url, outcome) => {
    for (const waiter of open.get(url) || []) {
      if (outcome instanceof Error) waiter.reject(outcome);
      else waiter.resolve(outcome);
    }
    open.delete(url);
  };
  return { calls, fetchNetwork, settle };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('concurrent calls for one URL share one network lookup and one object', async () => {
  const network = gatedNetwork();
  const fetchJson = createCachedFetchJson({ store: memoryStore(), now: () => 0, fetchNetwork: network.fetchNetwork });
  const first = fetchJson(SET_URL);
  const second = fetchJson(SET_URL);
  await flush();
  network.settle(SET_URL, { id: 'sv01' });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(network.calls.length, 1);
  assert.equal(a, b);
});

test('concurrent calls for different URLs each hit the network', async () => {
  const network = gatedNetwork();
  const fetchJson = createCachedFetchJson({ store: memoryStore(), now: () => 0, fetchNetwork: network.fetchNetwork });
  const first = fetchJson(SET_URL);
  const second = fetchJson(SERIES_URL);
  await flush();
  assert.deepEqual(network.calls, [SET_URL, SERIES_URL]);
  network.settle(SET_URL, { id: 'sv01' });
  network.settle(SERIES_URL, { sets: 1 });
  await Promise.all([first, second]);
});

test('a call after the shared lookup settles is served from the store', async () => {
  const network = gatedNetwork();
  const fetchJson = createCachedFetchJson({ store: memoryStore(), now: () => 0, fetchNetwork: network.fetchNetwork });
  const first = fetchJson(SET_URL);
  await flush();
  network.settle(SET_URL, { id: 'sv01' });
  await first;
  assert.deepEqual(await fetchJson(SET_URL), { id: 'sv01' });
  assert.equal(network.calls.length, 1);
});

test('a failed shared lookup is not remembered: the next call retries the network', async () => {
  const network = gatedNetwork();
  const fetchJson = createCachedFetchJson({ store: memoryStore(), now: () => 0, fetchNetwork: network.fetchNetwork });
  const first = fetchJson(SET_URL);
  const second = fetchJson(SET_URL);
  await flush();
  network.settle(SET_URL, new Error('offline'));
  await assert.rejects(first, /offline/);
  await assert.rejects(second, /offline/);
  assert.equal(network.calls.length, 1);
  const retry = fetchJson(SET_URL);
  await flush();
  network.settle(SET_URL, { id: 'sv01' });
  assert.deepEqual(await retry, { id: 'sv01' });
  assert.equal(network.calls.length, 2);
});

test('without a store, concurrent calls for one URL share one network lookup', async () => {
  const network = gatedNetwork();
  const fetchJson = createCachedFetchJson({ store: null, fetchNetwork: network.fetchNetwork });
  const first = fetchJson(SET_URL);
  const second = fetchJson(SET_URL);
  await flush();
  network.settle(SET_URL, { id: 'sv01' });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(network.calls.length, 1);
  assert.equal(a, b);
});
