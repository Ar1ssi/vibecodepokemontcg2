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
  if (stored === '1') return true;
  const query = readQuery(search);
  if (query === '3d') return true;
  if (query === 'iframe') return false;
  return Boolean(defaultOn);
}
