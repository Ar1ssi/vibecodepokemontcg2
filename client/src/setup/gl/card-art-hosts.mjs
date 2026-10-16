// Card art hosts verified (2026-09-15) to answer with CORS headers, so their images can be a
// CSS mask (holo.mjs) or a WebGL texture without tainting. Everything else goes through the
// server's /api/card-image proxy (design 074 D8).
export const CARD_ART_CORS_HOSTS = new Set([
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'limitlesstcg.nyc3.digitaloceanspaces.com',
  'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
  'ptcgsim.online',
]);

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

const parseAbsolute = (src) => {
  try {
    return new URL(src);
  } catch {
    return null;
  }
};

export function isCorsVerifiedHost(url) {
  if (typeof url !== 'string' || !url) return false;
  const parsed = parseAbsolute(url);
  if (!parsed) return false;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return CARD_ART_CORS_HOSTS.has(parsed.hostname);
}

const isSameOrigin = (parsed) => {
  const origin = globalThis.location?.origin;
  return Boolean(origin) && parsed.origin === origin;
};

/**
 * Where a texture loader should fetch `src` from: verified hosts, same-origin paths and
 * data:/blob: URLs load directly; any other remote image is rewritten to the proxy.
 * @param {string} src
 * @param {{ proxyPath?: string }} [options]
 * @returns {string}
 */
export function textureUrlFor(src, { proxyPath = '/api/card-image' } = {}) {
  if (typeof src !== 'string' || !src) return src;
  const absolute = src.startsWith('//') ? `https:${src}` : src;
  if (!ABSOLUTE_URL.test(absolute)) return src;
  const parsed = parseAbsolute(absolute);
  if (!parsed) return src;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return src;
  if (CARD_ART_CORS_HOSTS.has(parsed.hostname) || isSameOrigin(parsed)) return src;
  return `${proxyPath}?url=${encodeURIComponent(absolute)}`;
}
