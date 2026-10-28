// GET /api/card-image?url= (design 074 D8): card art for WebGL textures from hosts that do not
// send CORS headers. Same validation shape as /api/mat-image, plus a body cap and an in-memory LRU.

const DAY_MS = 24 * 60 * 60 * 1000;
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

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ProxyError(413, 'image too large');
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new ProxyError(413, 'image too large');
    return buffer;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ProxyError(413, 'image too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function createLru(maxEntries, now) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      if (now() - entry.storedAt > DAY_MS) return null;
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
  res.status(200).send(body);
}

/**
 * @param {{ fetchImpl?: typeof fetch, allowedHosts: Set<string>, now?: () => number,
 *           maxEntries?: number, maxBodyBytes?: number, timeoutMs?: number }} options
 * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
 */
export function createCardImageHandler({
  fetchImpl = globalThis.fetch,
  allowedHosts,
  now = Date.now,
  maxEntries = 100,
  maxBodyBytes = 6 * 1024 * 1024,
  timeoutMs = 10_000,
} = {}) {
  if (!(allowedHosts instanceof Set)) throw new TypeError('createCardImageHandler needs an allowedHosts Set');
  const cache = createLru(maxEntries, now);

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
      if (!upstream.ok) throw new ProxyError(502, 'upstream error');
      const contentType = upstream.headers?.get?.('content-type') || '';
      if (!/^image\//i.test(contentType)) throw new ProxyError(502, 'upstream is not an image');
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
      const cached = cache.get(target.href);
      if (cached) {
        sendImage(res, cached);
        return;
      }
      const image = await fetchImage(target, controller.signal);
      cache.set(target.href, image);
      sendImage(res, image);
    } catch (error) {
      if (error instanceof ProxyError) {
        res.status(error.status).send(error.message);
      } else if (isAbort(error)) {
        res.status(504).send('upstream timeout');
      } else {
        res.status(502).send('fetch failed');
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
