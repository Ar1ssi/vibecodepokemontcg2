// Refcounted texture cache, free of three.js so it runs under node:test. gl-textures.js
// supplies `load` (url, options) → Promise<texture> and `dispose(texture)`.
// One load per key while anything holds it; the last release disposes it, after `graceMs` when
// set (a card leaving the board and coming back — a KO, a search, a re-render — reuses its texture
// instead of decoding and uploading it again). A failed load rejects every waiter and leaves no
// entry behind, so the next acquire tries again.

const keyFor = (url, colorSpace) => `${colorSpace}|${url}`;

/**
 * @param {{ load: (url: string, options: { colorSpace: string }) => Promise<unknown>,
 *           dispose?: (texture: unknown) => void, graceMs?: number,
 *           setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} deps
 */
export function createTextureCacheCore({
  load,
  dispose = () => {},
  graceMs = 0,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  if (typeof load !== 'function') throw new TypeError('createTextureCacheCore needs a load function');
  const entries = new Map();

  const evict = (key, entry) => {
    if (entries.get(key) === entry) entries.delete(key);
  };

  function acquire(url, { colorSpace = 'srgb' } = {}) {
    if (typeof url !== 'string' || !url) {
      return Promise.reject(new TypeError('texture url must be a non-empty string'));
    }
    const key = keyFor(url, colorSpace);
    let entry = entries.get(key);
    // Released but still in its grace: held again, it stays.
    if (entry && entry.timer !== null) {
      clearTimer(entry.timer);
      entry.timer = null;
    }
    if (!entry) {
      entry = { refs: 0, texture: null, promise: null, timer: null };
      const created = entry;
      entry.promise = Promise.resolve()
        .then(() => load(url, { colorSpace }))
        .then(
          (texture) => {
            created.texture = texture;
            if (created.refs <= 0) {
              evict(key, created);
              dispose(texture);
            }
            return texture;
          },
          (error) => {
            evict(key, created);
            throw error;
          }
        );
      entries.set(key, entry);
    }
    entry.refs += 1;
    return entry.promise;
  }

  function release(url, { colorSpace = 'srgb' } = {}) {
    const key = keyFor(url, colorSpace);
    const entry = entries.get(key);
    if (!entry || entry.refs <= 0) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    // Still loading: the load's own settle disposes it once it sees no holders.
    if (!entry.texture) return;
    if (!(graceMs > 0)) {
      entries.delete(key);
      dispose(entry.texture);
      return;
    }
    if (entry.timer !== null) return;
    entry.timer = setTimer(() => {
      entry.timer = null;
      if (entry.refs > 0 || entries.get(key) !== entry) return;
      entries.delete(key);
      dispose(entry.texture);
    }, graceMs);
  }

  return { acquire, release, size: () => entries.size };
}
