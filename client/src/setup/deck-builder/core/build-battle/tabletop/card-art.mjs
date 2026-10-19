// Where the tabletop fetches a remote image from (design 073). WebGL can only sample an image the
// page may read, and a cross-origin one needs a well-formed CORS answer. assets.tcgdex.net sends its
// Access-Control-Allow-Origin header twice ("*, *"), which browsers refuse, so its images come
// through the server's same-origin proxy first, then straight from the CDN should that fail.

export const CARD_ART_PROXY_PATH = '/api/card-art';
export const PROXIED_ART_HOSTS = Object.freeze(['assets.tcgdex.net']);

/**
 * @param {string} url an absolute image URL (or anything else, passed through)
 * @returns {string[]} the URLs to try, in order; empty for no URL
 */
export function artSources(url) {
  const value = String(url || '');
  if (!value) return [];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return [value];
  }
  if (parsed.protocol !== 'https:' || !PROXIED_ART_HOSTS.includes(parsed.hostname)) return [value];
  return [`${CARD_ART_PROXY_PATH}?url=${encodeURIComponent(parsed.href)}`, parsed.href];
}
