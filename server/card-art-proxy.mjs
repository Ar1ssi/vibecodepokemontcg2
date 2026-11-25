// Same-origin proxy for the card art the tabletop opening draws in WebGL (design 073).
//
// WebGL can only sample an image the page is allowed to read, which for another origin means a
// well-formed CORS answer. assets.tcgdex.net sends its Access-Control-Allow-Origin header twice
// ("*, *"); browsers refuse that, so those card faces came out blank. The server fetches them
// instead: the bytes are the CDN's, the origin is ours. Only that host and only its card-image
// and set-logo paths, no redirects, a size cap read as it streams, a byte-bounded LRU so a box's
// cards are fetched once, misses remembered for an hour, a cool-down when the CDN pushes back,
// and a bounded queue, so nobody can turn the server into a firehose at TCGdex.

import { BodyTooLargeError, createFailureLog, createLimiter, readCapped } from './upstream-limits.mjs';

export const CARD_ART_HOSTS = new Set(['assets.tcgdex.net']);

// /<lang>/<series>/<set>/<card>/(high|low).<ext> and /<lang>/<series>/<set>/(logo|symbol).<ext>
const ART_PATH =
  /^\/[a-z]{2,4}(?:-[a-z]{2})?\/[a-z0-9]{1,12}\/[a-z0-9.]{1,16}\/(?:[A-Za-z0-9-]{1,16}\/(?:high|low)|logo|symbol)\.(?:webp|png|jpe?g)$/;
const IMAGE_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_URL_LENGTH = 300;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
// After TCGdex blocks or rate-limits us, uncached requests fail fast for this long.
const COOLDOWN_MS = 30 * 1000;
const MAX_WAITING = 48;

/**
 * @param {unknown} raw the `url` query value
 * @returns {string|null} the normalised https URL when it names card art on an allowed host
 */
export function parseCardArtUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !CARD_ART_HOSTS.has(url.hostname)) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;
  if (!ART_PATH.test(url.pathname)) return null;
  return url.href;
}

const isPushBack = (status) => status === 403 || status === 429 || status === 503;

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {number} [options.maxBytes] the cache's byte budget
 * @param {number} [options.maxImageBytes] the largest image passed through
 * @param {number} [options.concurrency] upstream requests in flight at once
 * @param {number} [options.maxWaiting] requests that may queue for a slot; more are turned away
 * @param {number} [options.timeoutMs]
 * @param {(line: string) => void} [options.log] told once when the CDN starts failing or pushing back, and once when it recovers
 * @returns {{get(href: string): Promise<{status: number, type?: string, body?: Buffer}>,
 *   bytes(): number, size(): number}}
 */
export function createCardArtProxy({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  maxBytes = 64 * 1024 * 1024,
  maxImageBytes = MAX_IMAGE_BYTES,
  concurrency = 6,
  maxWaiting = MAX_WAITING,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const cache = new Map(); // href -> { type, body }
  const missing = new Map(); // href -> expiresAt (a 404 remembered)
  const inFlight = new Map(); // href -> Promise<result>
  const limiter = createLimiter(concurrency, { maxWaiting });
  const outage = createFailureLog(log);
  let cachedBytes = 0;
  let cooldownUntil = 0;

  function remember(href, entry) {
    const old = cache.get(href);
    if (old) {
      cache.delete(href);
      cachedBytes -= old.body.length;
    }
    if (entry.body.length > maxBytes) return;
    cache.set(href, entry);
    cachedBytes += entry.body.length;
    while (cachedBytes > maxBytes) {
      const [oldest, evicted] = cache.entries().next().value;
      cache.delete(oldest);
      cachedBytes -= evicted.body.length;
    }
  }

  function rememberMissing(href) {
    missing.delete(href);
    missing.set(href, now() + NOT_FOUND_TTL_MS);
    // Bounded like the image cache, by count: a miss costs a few bytes.
    while (missing.size > 4096) missing.delete(missing.keys().next().value);
  }

  async function fetchUpstream(href) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(href, {
        headers: { Accept: 'image/webp,image/png,image/jpeg', 'User-Agent': 'PTCG-sim/1.0' },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (res.status !== 200) {
        await res.body?.cancel?.().catch(() => {});
        return { status: res.status === 404 ? 404 : 502, upstream: res.status };
      }
      const type = String(res.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!IMAGE_TYPES.has(type)) return { status: 502 };
      const body = await readCapped(res, maxImageBytes);
      if (body.length === 0) return { status: 502 };
      return { status: 200, type, body };
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) outage.failed('fetch', `card art: upstream fetch failed (${error?.message ?? error})`);
      return { status: error?.name === 'AbortError' ? 504 : 502 };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function load(href) {
    if (now() < cooldownUntil) return { status: 503 };
    if (limiter.saturated()) return { status: 503 };
    const result = await limiter.run(() => fetchUpstream(href));
    if (result.status === 200) {
      outage.recovered('card art: upstream answering again');
      remember(href, { type: result.type, body: result.body });
    } else if (result.status === 404) {
      rememberMissing(href);
    } else if (isPushBack(result.upstream)) {
      cooldownUntil = now() + COOLDOWN_MS;
      outage.failed(`status-${result.upstream}`, `card art: upstream answered ${result.upstream}; no upstream requests for ${COOLDOWN_MS / 1000} s`);
    }
    return { status: result.status, type: result.type, body: result.body };
  }

  return {
    async get(href) {
      const hit = cache.get(href);
      if (hit) {
        remember(href, hit);
        return { status: 200, type: hit.type, body: hit.body };
      }
      const gone = missing.get(href);
      if (gone !== undefined) {
        if (gone > now()) return { status: 404 };
        missing.delete(href);
      }
      if (inFlight.has(href)) return inFlight.get(href);
      const promise = load(href).finally(() => inFlight.delete(href));
      inFlight.set(href, promise);
      return promise;
    },
    bytes: () => cachedBytes,
    size: () => cache.size,
  };
}

/** Express handler for `app.get('/api/card-art', ...)`: `?url=<card art URL>`. */
export function cardArtProxyHandler(proxy) {
  return async (req, res) => {
    const href = parseCardArtUrl(req.query.url);
    if (!href) {
      res.status(400).type('text/plain').send('url not allowed');
      return;
    }
    const result = await proxy.get(href);
    if (result.status !== 200) {
      res.setHeader('Cache-Control', 'no-store');
      if (result.status === 503) res.setHeader('Retry-After', '30');
      res.status(result.status).type('text/plain').send('card art unavailable');
      return;
    }
    // A card's art never changes at its URL.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(result.type).send(result.body);
  };
}
