/**
 * @file The seat token the server gave this tab for a public room (design 069).
 * Kept in sessionStorage so a reload in the same tab can reclaim the seat. Storage can be missing
 * or throw (private windows, blocked site data); then every call quietly does nothing.
 */

const KEY_PREFIX = 'ptcg.seatToken.';

const sessionStorageOrNull = () => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * @param {string} roomId
 * @param {Storage|null} [storage]
 * @returns {{ username: string, token: string }|null}
 */
export function readSeatToken(roomId, storage = sessionStorageOrNull()) {
  try {
    const stored = JSON.parse(storage?.getItem(KEY_PREFIX + roomId) ?? 'null');
    if (typeof stored?.username !== 'string' || typeof stored?.token !== 'string') return null;
    return { username: stored.username, token: stored.token };
  } catch {
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {string} username
 * @param {string} token
 * @param {Storage|null} [storage]
 */
export function writeSeatToken(roomId, username, token, storage = sessionStorageOrNull()) {
  try {
    storage?.setItem(KEY_PREFIX + roomId, JSON.stringify({ username, token }));
  } catch {
    // Without storage a reload just cannot reclaim the seat.
  }
}

/**
 * @param {string} roomId
 * @param {Storage|null} [storage]
 */
export function clearSeatToken(roomId, storage = sessionStorageOrNull()) {
  try {
    storage?.removeItem(KEY_PREFIX + roomId);
  } catch {
    // Nothing stored that could be cleared.
  }
}

/**
 * The token to send for this room, only when it was issued to this username.
 * @param {string} roomId
 * @param {string} username
 * @param {Storage|null} [storage]
 * @returns {string|null}
 */
export function seatTokenFor(roomId, username, storage = sessionStorageOrNull()) {
  const stored = readSeatToken(roomId, storage);
  return stored && stored.username === username ? stored.token : null;
}
