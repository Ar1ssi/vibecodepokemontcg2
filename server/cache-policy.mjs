// Cache-Control per request path (design 088).
// - Files whose name carries a content hash never change under that name, so browsers keep them
//   without asking: the client bundle (`/dist/app-<hash>.js`) for a year, sampled SFX
//   (`<key>.<hash8>.ogg`, design 064) for a day.
// - Every other page and file is `no-cache`: the browser keeps its copy but asks the server on each
//   use, and gets a bodiless 304 when nothing changed. Visitors always see the current build.
// - `/api/` answers are computed per request and stay `no-store` unless their route says otherwise.
const SFX_DIR = '/src/assets/sfx/';
const HASHED_OGG = /\.[0-9a-f]{8}\.ogg$/;
const BUNDLE_DIR = '/dist/';
const HASHED_BUNDLE_FILE = /-[0-9A-Z]{8}\.(?:js|css)(?:\.map)?$/;
const API_DIR = '/api/';

export const SFX_CACHE_CONTROL = 'public, max-age=86400';
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE_CONTROL = 'no-cache';
export const UNCACHED_CACHE_CONTROL = 'no-store';

/** @returns {string} the Cache-Control value for a request path. */
export function cacheControlFor(requestPath) {
  const p = typeof requestPath === 'string' ? requestPath : '';
  if (p.startsWith(SFX_DIR) && HASHED_OGG.test(p)) return SFX_CACHE_CONTROL;
  if (p.startsWith(BUNDLE_DIR) && HASHED_BUNDLE_FILE.test(p)) return IMMUTABLE_CACHE_CONTROL;
  if (p.startsWith(API_DIR)) return UNCACHED_CACHE_CONTROL;
  return REVALIDATE_CACHE_CONTROL;
}
