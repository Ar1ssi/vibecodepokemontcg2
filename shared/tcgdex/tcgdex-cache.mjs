// Persistent cache for TCGdex JSON responses, so Browse Sets, card search and
// in-game card enrichment (rules-state.mjs ensureCardData)
// do not refetch every set/series/card record on each page load (D102, D164).
// Backed by IndexedDB in the browser. Where IndexedDB is missing (node tests,
// some private windows) the cache is a pass-through to the network.

const DB_NAME = 'tcgdex-cache';
const STORE_NAME = 'json';
const KEY_VERSION = 'v1:';
const DAY_MS = 24 * 60 * 60 * 1000;

// Single set/card records almost never change once published; lists, series
// and search queries pick up new releases, so they expire sooner.
const RECORD_TTL_MS = 7 * DAY_MS;
const LIST_TTL_MS = 1 * DAY_MS;
const RECORD_PATH = /\/v2\/[a-z-]+\/(sets|cards)\/[^/?]+$/i;

export function ttlForUrl(url) {
  return RECORD_PATH.test(String(url)) ? RECORD_TTL_MS : LIST_TTL_MS;
}

async function fetchJsonFromNetwork(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbStore(indexedDbFactory = globalThis.indexedDB) {
  if (!indexedDbFactory) return null;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    const request = indexedDbFactory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    dbPromise = requestToPromise(request).catch((error) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  async function withStore(mode, action) {
    const db = await openDb();
    const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    return requestToPromise(action(store));
  }

  return {
    get: (key) => withStore('readonly', (store) => store.get(key)),
    set: (key, value) => withStore('readwrite', (store) => store.put(value, key)),
  };
}

// Returns fetchJson(url). Fresh entry → cached value. Missing or stale →
// network, then store. Network failure with a stale entry → stale value
// (better an old set list than an empty Browse Sets panel). Storage errors
// never fail a request; they only cost a cache miss.
export function createCachedFetchJson({
  store = createIndexedDbStore(),
  now = () => Date.now(),
  fetchNetwork = fetchJsonFromNetwork,
  ttlFor = ttlForUrl,
} = {}) {
  if (!store) return fetchNetwork;

  async function readEntry(key) {
    try {
      const entry = await store.get(key);
      return entry && typeof entry.savedAt === 'number' ? entry : null;
    } catch {
      return null;
    }
  }

  async function writeEntry(key, data) {
    try {
      await store.set(key, { savedAt: now(), data });
    } catch {
      // Quota full or storage blocked: serve uncached.
    }
  }

  return async function cachedFetchJson(url) {
    const key = KEY_VERSION + String(url);
    const entry = await readEntry(key);
    if (entry && now() - entry.savedAt < ttlFor(url)) return entry.data;

    try {
      const data = await fetchNetwork(url);
      await writeEntry(key, data);
      return data;
    } catch (error) {
      if (entry) return entry.data;
      throw error;
    }
  };
}

export const cachedFetchJson = createCachedFetchJson();
