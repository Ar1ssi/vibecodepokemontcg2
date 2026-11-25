// GET /api/card-image?url= (design 074 D8): card art for WebGL textures from hosts that do not
// send CORS headers. Same validation shape as /api/mat-image, plus a body cap and an in-memory LRU.

import { BodyTooLargeError, createFailureLog, readCapped } from './upstream-limits.mjs';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOT_FOUND_TTL_MS = HOUR_MS;
// Never svg or html: the bytes are served from this origin, where a script inside them would run.
const IMAGE_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CACHE_CONTROL = 'public, max-age=86400';

class ProxyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isAbort = (error) => error?.name === 'AbortError' || error?.name === 'TimeoutError';

function parseTarget(raw) {
  if (!raw || typeof raw !== 'string') throw new ProxyError(400, 'missing url');
  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new ProxyError(400, 'invalid url');
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new ProxyError(400, 'invalid url');
  }
  return target;
}

function assertAllowed(url, allowedHosts) {
  if (!allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new ProxyError(403, 'host not allowed');
  }
}

function createLru(maxEntries, now, ttlMs) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      if (now() - entry.storedAt > ttlMs) return null;
      entries.set(key, entry);
      return entry;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { ...value, storedAt: now() });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
  };
}

function sendImage(res, { body, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(body);
}

/**
 * @param {{ fetchImpl?: typeof fetch, allowedHosts: Set<string>, now?: () => number,
 *           maxEntries?: number, maxBodyBytes?: number, timeoutMs?: number,
 *           log?: (line: string) => void }} options
 * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
 */
export function createCardImageHandler({
  fetchImpl = globalThis.fetch,
  allowedHosts,
  now = Date.now,
  maxEntries = 100,
  maxBodyBytes = 6 * 1024 * 1024,
  timeoutMs = 10_000,
  log = () => {},
} = {}) {
  if (!(allowedHosts instanceof Set)) throw new TypeError('createCardImageHandler needs an allowedHosts Set');
  const cache = createLru(maxEntries, now, DAY_MS);
  const misses = createLru(maxEntries, now, NOT_FOUND_TTL_MS);
  const outage = createFailureLog(log);

  async function fetchImage(target, signal) {
    let url = target;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const upstream = await fetchImpl(url.href, {
        headers: { 'User-Agent': 'PTCG-sim/1.0' },
        redirect: 'manual',
        signal,
      });
      if (REDIRECT_STATUSES.has(upstream.status)) {
        const location = upstream.headers?.get?.('location');
        if (!location) throw new ProxyError(502, 'redirect without location');
        try {
          url = new URL(location, url.href);
        } catch {
          throw new ProxyError(502, 'invalid redirect');
        }
        assertAllowed(url, allowedHosts);
        continue;
      }
      if (upstream.status === 404) {
        misses.set(target.href, {});
        throw new ProxyError(404, 'image not found');
      }
      if (!upstream.ok) throw new ProxyError(502, 'upstream error');
      const contentType = String(upstream.headers?.get?.('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!IMAGE_TYPES.has(contentType)) throw new ProxyError(502, 'upstream is not an image');
      return { contentType, body: await readCapped(upstream, maxBodyBytes) };
    }
    throw new ProxyError(502, 'too many redirects');
  }

  return async function cardImageHandler(req, res) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const target = parseTarget(req.query?.url);
      assertAllowed(target, allowedHosts);
      if (misses.get(target.href)) throw new ProxyError(404, 'image not found');
      const cached = cache.get(target.href);
      if (cached) {
        sendImage(res, cached);
        return;
      }
      const image = await fetchImage(target, controller.signal);
      cache.set(target.href, image);
      outage.recovered('card image: upstream answering again');
      sendImage(res, image);
    } catch (error) {
      if (error instanceof ProxyError) {
        res.status(error.status).send(error.message);
      } else if (error instanceof BodyTooLargeError) {
        res.status(413).send('image too large');
      } else if (isAbort(error)) {
        res.status(504).send('upstream timeout');
      } else {
        outage.failed('fetch', `card image: upstream fetch failed (${error?.message ?? error})`);
        res.status(502).send('fetch failed');
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
