// Design 074 O9/D9: whether this page asked for the three.js board.
// The stored kill switch '0' beats every other source, so a broken 3D board can always be turned off.
export const BOARD3D_KEY = 'ptcg-board-3d';

const readStored = (storage) => {
  try {
    return storage?.getItem?.(BOARD3D_KEY) ?? null;
  } catch {
    return null;
  }
};

const readQuery = (search) => {
  try {
    return new URLSearchParams(typeof search === 'string' ? search : '').get('board');
  } catch {
    return null;
  }
};

/**
 * @param {string} [search] location.search
 * @param {Storage|null} [storage] localStorage-shaped; may be absent or throw
 * @param {{ defaultOn?: boolean }} [options]
 * @returns {boolean}
 */
export function isBoard3dRequested(search = '', storage = null, { defaultOn = false } = {}) {
  const stored = readStored(storage);
  if (stored === '0') return false;
  const query = readQuery(search);
  // `?board=iframe` beats a stored '1': it is how a late fallback reloads onto the iframe board.
  if (query === 'iframe') return false;
  if (stored === '1') return true;
  if (query === '3d') return true;
  return Boolean(defaultOn);
}

/** sessionStorage key a late fallback leaves for the reloaded page (board3d.js). */
export const BOARD3D_FALLBACK_KEY = 'ptcg-board-3d-fallback';

/**
 * Reads and clears the reason a late fallback reloaded this page with `?board=iframe`.
 * @param {Storage|null} [storage] sessionStorage-shaped; may be absent or throw
 * @returns {string|null}
 */
export function takeBoard3dFallback(storage = null) {
  try {
    const reason = storage?.getItem?.(BOARD3D_FALLBACK_KEY) ?? null;
    if (reason !== null) storage.removeItem(BOARD3D_FALLBACK_KEY);
    return reason || null;
  } catch {
    return null;
  }
}

/** The one chat line the reloaded page posts. */
export const board3dFallbackNotice = (reason) =>
  `3D board off: ${reason}; reload without ?board=iframe to retry`;
