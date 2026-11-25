// Same-origin proxy for the TCGdex REST API (D164).
//
// Browsers used to call api.tcgdex.net directly: ~60+ requests per deck load per player.
// TCGdex's Cloudflare bot detection blocks bursts like that, and the block surfaces in the
// browser as a CORS failure, so every card stayed unenriched (no stage, attacks or
// trainerType; the server answered every play with card_data_pending). Routing through
// here means one upstream fetch per card across every player, a capped upstream burst,
// and no cross-origin request for Cloudflare to block in the browser.

import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

import { createFailureLog, createLimiter } from './upstream-limits.mjs';

export const TCGDEX_UPSTREAM = 'https://api.tcgdex.net';

const gzipAsync = promisify(gzip);
// Smaller bodies gain too little from compression to be worth the CPU.
export const GZIP_MIN_BYTES = 1024;

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
// A canonical key's path: a resource list (/v2/en/cards) or one record of it (/v2/en/cards/xy7-97).
const KEY_PATH = /^\/v2\/en\/(cards|sets|series)(?:\/([^/]+))?$/;
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

/**
 * Splits a canonical key once, for everything that needs to know what it asks for.
 * @param {string} canonical a key from canonicalTcgdexPath
 * @returns {{ path: string, params: [string, string][], resource: 'cards'|'sets'|'series'|null, id: string|null }}
 *   `id` is null for a list; `resource` is null for a path outside the three resources.
 */
export function parseTcgdexKey(canonical) {
  const [path, query = ''] = String(canonical).split('?');
  const match = KEY_PATH.exec(path);
  return { path, params: [...new URLSearchParams(query)], resource: match?.[1] ?? null, id: match?.[2] ?? null };
}

export function ttlForTcgdexPath(canonical) {
  return parseTcgdexKey(canonical).id === null ? LIST_TTL_MS : RECORD_TTL_MS;
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
 * @param {(line: string) => void} [options.log] Told once when TCGdex starts failing or blocking, and once when it recovers.
 * @returns {{ get(canonical: string): Promise<{status: number, body: string, cacheControl: string, gzip: (() => Promise<Buffer>)|null}>, size(): number }}
 */
export function createTcgdexProxy({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  maxEntries = 5000,
  concurrency = 4,
  log = () => {},
} = {}) {
  const cache = new Map(); // canonical -> { status, body, expiresAt, gzipped? }
  const inFlight = new Map(); // canonical -> Promise<entry>
  const limiter = createLimiter(concurrency);
  const outage = createFailureLog(log);
  let cooldownUntil = 0;

  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  // Compresses an entry's body once; a failed attempt is forgotten so the next request retries.
  function gzipOnce(entry) {
    entry.gzipped ??= gzipAsync(entry.body).catch((error) => {
      entry.gzipped = null;
      throw error;
    });
    return entry.gzipped;
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
    if (stale)
      return {
        status: stale.status,
        body: stale.body,
        cacheControl: 'no-store',
        gzip: null,
      };
    return {
      status: 502,
      body: '{"error":"tcgdex_unavailable"}',
      cacheControl: 'no-store',
      gzip: null,
    };
  }

  async function load(key, stale) {
    if (now() < cooldownUntil) return unavailable(stale);
    let upstream;
    try {
      upstream = await limiter.run(() => fetchUpstream(key));
    } catch (error) {
      outage.failed('unreachable', `tcgdex proxy: upstream unreachable (${error.message})`);
      return unavailable(stale);
    }
    if (upstream.status === 200 || upstream.status === 404) outage.recovered('tcgdex proxy: upstream answering again');
    if (upstream.status === 200) {
      const ttl = ttlForTcgdexPath(key);
      const entry = {
        status: 200,
        body: upstream.body,
        expiresAt: now() + ttl,
      };
      remember(key, entry);
      return {
        status: 200,
        body: upstream.body,
        cacheControl: 'public, max-age=3600',
        gzip: () => gzipOnce(entry),
      };
    }
    if (upstream.status === 404) {
      remember(key, {
        status: 404,
        body: upstream.body,
        expiresAt: now() + NOT_FOUND_TTL_MS,
      });
      return {
        status: 404,
        body: upstream.body,
        cacheControl: 'no-store',
        gzip: null,
      };
    }
    if (isBlockStatus(upstream.status)) cooldownUntil = now() + COOLDOWN_MS;
    outage.failed(
      `status-${upstream.status}`,
      `tcgdex proxy: upstream answered ${upstream.status}${isBlockStatus(upstream.status) ? `; no upstream requests for ${COOLDOWN_MS / 1000} s` : ''}`
    );
    return unavailable(stale);
  }

  return {
    async get(key) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) {
        remember(key, hit);
        if (hit.status !== 200) {
          return {
            status: hit.status,
            body: hit.body,
            cacheControl: 'no-store',
            gzip: null,
          };
        }
        return {
          status: 200,
          body: hit.body,
          cacheControl: 'public, max-age=3600',
          gzip: () => gzipOnce(hit),
        };
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
    res.setHeader('Vary', 'Accept-Encoding');
    res.type('application/json').status(result.status);
    if (
      result.gzip &&
      Buffer.byteLength(result.body) >= GZIP_MIN_BYTES &&
      req.acceptsEncodings('gzip') === 'gzip'
    ) {
      try {
        const zipped = await result.gzip();
        res.setHeader('Content-Encoding', 'gzip');
        res.send(zipped);
        return;
      } catch {
        // Compression failed: the plain body below still answers the request.
      }
    }
    res.send(result.body);
  };
}
