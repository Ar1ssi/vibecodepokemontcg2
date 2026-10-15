/**
 * @file The seat token the server gave this tab for a public room (design 069).
 * Kept in sessionStorage so a reload in the same tab can reclaim the seat, and mirrored in memory
 * so a dropped connection can reclaim it even when storage is missing or throws (private windows,
 * blocked site data).
 */

const KEY_PREFIX = 'ptcg.seatToken.';
const memory = new Map();

const isSeatToken = (value) =>
  typeof value?.username === 'string' && typeof value?.token === 'string';

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
  let stored = null;
  try {
    stored = JSON.parse(storage?.getItem(KEY_PREFIX + roomId) ?? 'null');
  } catch {
    stored = null;
  }
  if (!isSeatToken(stored)) stored = memory.get(roomId) ?? null;
  return stored ? { username: stored.username, token: stored.token } : null;
}

/**
 * @param {string} roomId
 * @param {string} username
 * @param {string} token
 * @param {Storage|null} [storage]
 */
export function writeSeatToken(roomId, username, token, storage = sessionStorageOrNull()) {
  memory.set(roomId, { username, token });
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
  memory.delete(roomId);
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
