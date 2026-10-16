// Same-origin proxy for the card art the tabletop opening draws in WebGL (design 073).
//
// WebGL can only sample an image the page is allowed to read, which for another origin means a
// well-formed CORS answer. assets.tcgdex.net sends its Access-Control-Allow-Origin header twice
// ("*, *"); browsers refuse that, so those card faces came out blank. The server fetches them
// instead: the bytes are the CDN's, the origin is ours. Only that host, only image paths, no
// redirects, a size cap, and a byte-bounded LRU so a box's cards are fetched once.

export const CARD_ART_HOSTS = new Set(['assets.tcgdex.net']);

const ART_PATH = /^\/[A-Za-z0-9._/-]{1,200}\.(webp|png|jpe?g)$/i;
const IMAGE_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_URL_LENGTH = 300;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
  if (!ART_PATH.test(url.pathname) || url.pathname.includes('..') || url.pathname.includes('//')) return null;
  return url.href;
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.maxBytes] the cache's byte budget
 * @param {number} [options.maxImageBytes] the largest image passed through
 * @param {number} [options.concurrency] upstream requests in flight at once
 * @param {number} [options.timeoutMs]
 * @returns {{get(href: string): Promise<{status: number, type?: string, body?: Buffer}>,
 *   bytes(): number, size(): number}}
 */
export function createCardArtProxy({
  fetchImpl = globalThis.fetch,
  maxBytes = 64 * 1024 * 1024,
  maxImageBytes = MAX_IMAGE_BYTES,
  concurrency = 6,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  const cache = new Map(); // href -> { type, body }
  const inFlight = new Map(); // href -> Promise<result>
  const waiting = [];
  let active = 0;
  let cachedBytes = 0;

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

  async function fetchUpstream(href) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(href, {
        headers: { Accept: 'image/webp,image/png,image/jpeg', 'User-Agent': 'PTCG-sim/1.0' },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (res.status !== 200) return { status: res.status === 404 ? 404 : 502 };
      const type = String(res.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!IMAGE_TYPES.has(type)) return { status: 502 };
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxImageBytes) return { status: 502 };
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0 || body.length > maxImageBytes) return { status: 502 };
      return { status: 200, type, body };
    } catch (error) {
      return { status: error?.name === 'AbortError' ? 504 : 502 };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function load(href) {
    const result = await withSlot(() => fetchUpstream(href));
    if (result.status === 200) remember(href, { type: result.type, body: result.body });
    return result;
  }

  return {
    async get(href) {
      const hit = cache.get(href);
      if (hit) {
        remember(href, hit);
        return { status: 200, type: hit.type, body: hit.body };
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
      res.status(result.status).type('text/plain').send('card art unavailable');
      return;
    }
    // A card's art never changes at its URL.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(result.type).send(result.body);
  };
}
