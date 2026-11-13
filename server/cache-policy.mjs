// Cache-Control per request path (design 088).
// - Every response starts from `cacheControlFor`: `/api/` answers are computed per request and are
//   `no-store` unless their route says otherwise; every other page and file is `no-cache`, so the
//   browser keeps its copy but asks the server on each use and gets a bodiless 304 when nothing
//   changed. Visitors always see the current build.
// - A static file that is found and sent may be upgraded by `staticFileCacheControl`: a name that
//   carries a content hash never changes under that name, so the client bundle
//   (`/dist/app-<hash>.js`) is kept for a year and sampled SFX (`<key>.<hash8>.ogg`, design 064)
//   for a day. Only a file being sent gets this: a 404 for a hashed name must not be kept, because
//   a rollback serves that same name again.
const SFX_DIR = '/src/assets/sfx/';
const HASHED_OGG = /\.[0-9a-f]{8}\.ogg$/;
const BUNDLE_DIR = '/dist/';
const HASHED_BUNDLE_FILE = /-[0-9A-Z]{8}\.(?:js|css)(?:\.map)?$/;
const API_DIR = '/api/';

export const SFX_CACHE_CONTROL = 'public, max-age=86400';
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE_CONTROL = 'no-cache';
export const UNCACHED_CACHE_CONTROL = 'no-store';

const asPath = (requestPath) => (typeof requestPath === 'string' ? requestPath : '');

/** @returns {string} the Cache-Control every response to this path starts with. */
export function cacheControlFor(requestPath) {
  return asPath(requestPath).startsWith(API_DIR) ? UNCACHED_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL;
}

/**
 * @returns {string|null} the long-lived Cache-Control for a static file being sent from this path,
 *   or null when its name carries no content hash (the default from `cacheControlFor` stands).
 */
export function staticFileCacheControl(requestPath) {
  const p = asPath(requestPath);
  if (p.startsWith(SFX_DIR) && HASHED_OGG.test(p)) return SFX_CACHE_CONTROL;
  if (p.startsWith(BUNDLE_DIR) && HASHED_BUNDLE_FILE.test(p)) return IMMUTABLE_CACHE_CONTROL;
  return null;
}
