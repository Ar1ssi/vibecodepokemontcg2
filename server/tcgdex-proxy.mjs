// Same-origin proxy for the TCGdex REST API (D164).
//
// Browsers used to call api.tcgdex.net directly: ~60+ requests per deck load per player.
// TCGdex's Cloudflare bot detection blocks bursts like that, and the block surfaces in the
// browser as a CORS failure, so every card stayed unenriched (no stage, attacks or
// trainerType; the server answered every play with card_data_pending). Routing through
// here means one upstream fetch per card across every player, a capped upstream burst,
// and no cross-origin request for Cloudflare to block in the browser.

export const TCGDEX_UPSTREAM = 'https://api.tcgdex.net';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Single card/set records almost never change once published; lists and searches pick up
// new releases. Mirrors ttlForUrl in shared/tcgdex/tcgdex-cache.mjs.
const RECORD_TTL_MS = 7 * DAY_MS;
const LIST_TTL_MS = 6 * HOUR_MS;
const NOT_FOUND_TTL_MS = 1 * HOUR_MS;
// After TCGdex blocks or rate-limits us, uncached requests fail fast for this long instead
// of prolonging the block with more traffic.
const COOLDOWN_MS = 30 * 1000;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;

const ALLOWED_PATH = /^\/v2\/en\/(cards|sets|series)(\/[A-Za-z0-9._%-]{1,64})?$/;
const RECORD_PATH = /^\/v2\/en\/(cards|sets|series)\/[^/]+$/;
const MAX_QUERY_LENGTH = 300;

/**
 * Validates a proxied request and builds its canonical cache key.
 * @param {string} path Path after the proxy mount, e.g. "/v2/en/cards/xy7-97".
 * @param {Record<string, unknown>} query Parsed query string.
 * @returns {string|null} Canonical "path?sorted-query", or null when not allowed.
 */
export function canonicalTcgdexPath(path, query = {}) {
  if (typeof path !== 'string' || !ALLOWED_PATH.test(path)) return null;
  const params = new URLSearchParams();
  for (const key of Object.keys(query || {}).sort()) {
    const value = query[key];
    if (typeof value !== 'string') return null;
    params.append(key, value);
  }
  const qs = params.toString();
  if (qs.length > MAX_QUERY_LENGTH) return null;
  return qs ? `${path}?${qs}` : path;
}

export function ttlForTcgdexPath(canonical) {
  return RECORD_PATH.test(canonical) ? RECORD_TTL_MS : LIST_TTL_MS;
}

function isBlockStatus(status) {
  return status === 403 || status === 429 || status === 503;
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {number} [options.maxEntries] LRU bound on cached responses.
 * @param {number} [options.concurrency] Upstream requests in flight at once.
 * @returns {{ get(canonical: string): Promise<{status: number, body: string, cacheControl: string}>, size(): number }}
 */
export function createTcgdexProxy({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  maxEntries = 5000,
  concurrency = 4,
} = {}) {
  const cache = new Map(); // canonical -> { status, body, expiresAt }
  const inFlight = new Map(); // canonical -> Promise<entry>
  const waiting = [];
  let active = 0;
  let cooldownUntil = 0;

  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  async function withSlot(task) {
    if (active >= concurrency) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  async function fetchUpstream(key) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${TCGDEX_UPSTREAM}${key}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'PTCG-sim/1.0' },
        signal: controller.signal,
      });
      const body = await res.text();
      return { status: res.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }

  function unavailable(stale) {
    if (stale) return { status: stale.status, body: stale.body, cacheControl: 'no-store' };
    return { status: 502, body: '{"error":"tcgdex_unavailable"}', cacheControl: 'no-store' };
  }

  async function load(key, stale) {
    if (now() < cooldownUntil) return unavailable(stale);
    let upstream;
    try {
      upstream = await withSlot(() => fetchUpstream(key));
    } catch {
      return unavailable(stale);
    }
    if (upstream.status === 200) {
      const ttl = ttlForTcgdexPath(key);
      remember(key, { status: 200, body: upstream.body, expiresAt: now() + ttl });
      return { status: 200, body: upstream.body, cacheControl: 'public, max-age=3600' };
    }
    if (upstream.status === 404) {
      remember(key, { status: 404, body: upstream.body, expiresAt: now() + NOT_FOUND_TTL_MS });
      return { status: 404, body: upstream.body, cacheControl: 'no-store' };
    }
    if (isBlockStatus(upstream.status)) cooldownUntil = now() + COOLDOWN_MS;
    return unavailable(stale);
  }

  return {
    async get(key) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) {
        remember(key, hit);
        const cacheControl = hit.status === 200 ? 'public, max-age=3600' : 'no-store';
        return { status: hit.status, body: hit.body, cacheControl };
      }
      if (inFlight.has(key)) return inFlight.get(key);
      const stale = hit?.status === 200 ? hit : null;
      const promise = load(key, stale).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
    size: () => cache.size,
  };
}

/** Express handler for `app.get('/api/tcgdex/*', ...)`. */
export function tcgdexProxyHandler(proxy, mount = '/api/tcgdex') {
  return async (req, res) => {
    const key = canonicalTcgdexPath(req.path.slice(mount.length), req.query);
    if (!key) {
      res.status(400).json({ error: 'path_not_allowed' });
      return;
    }
    const result = await proxy.get(key);
    res.setHeader('Cache-Control', result.cacheControl);
    res.type('application/json').status(result.status).send(result.body);
  };
}
