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

test('without IndexedDB the cache is a pass-through', () => {
  assert.equal(createIndexedDbStore(undefined), null);
  const fetchNetwork = async () => ({});
  assert.equal(createCachedFetchJson({ store: null, fetchNetwork }), fetchNetwork);
});
