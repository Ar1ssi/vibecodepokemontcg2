// Design 064: sampled SFX files are named `<key>.<hash8>.ogg`, so the hash makes them immutable
// and they may be cached despite the blanket "demo" no-store. manifest.json is NOT hashed and
// stays no-store, or a re-import would leave browsers pointing at deleted files.
const SFX_DIR = '/src/assets/sfx/';
const HASHED_OGG = /\.[0-9a-f]{8}\.ogg$/;

export const SFX_CACHE_CONTROL = 'public, max-age=86400';

/** @returns {string} the Cache-Control value for a request path. */
export function cacheControlFor(requestPath) {
  const p = typeof requestPath === 'string' ? requestPath : '';
  return p.startsWith(SFX_DIR) && HASHED_OGG.test(p) ? SFX_CACHE_CONTROL : 'no-store';
}
