/**
 * @file Whether each seated player of a public room is connected, and when a dropped seat is freed
 * (design 069). Pure: works on the server's roomInfo entry, whose `players` Set holds usernames.
 * Code rooms never get presence state; their seats are kept until an explicit leave.
 */

/** @typedef {{ socketId: string|null, disconnectedAt: number|null }} SeatPresence
 * `socketId` is the seat's last socket, kept after a drop so a release can clear what that
 * socket left behind (its cached deck exchange). */

const presenceOf = (room) => {
  if (!room.presence) room.presence = new Map();
  return room.presence;
};

/**
 * @param {{ presence?: Map<string, SeatPresence> }} room
 * @param {string} username
 * @param {string} socketId
 */
export function markSeatConnected(room, username, socketId) {
  presenceOf(room).set(username, { socketId, disconnectedAt: null });
}

/**
 * A no-op unless `socketId` is the seat's current socket: an old socket's disconnect can arrive
 * after the player already came back on a new one.
 * @param {{ players: Set<string>, presence?: Map<string, SeatPresence> }} room
 * @param {string} username
 * @param {string} socketId the socket that dropped
 * @param {number} now
 * @returns {boolean} whether the seat is now marked dropped
 */
export function markSeatDisconnected(room, username, socketId, now) {
  if (!room.players.has(username)) return false;
  const current = room.presence?.get(username);
  if (current && current.socketId !== socketId) return false;
  presenceOf(room).set(username, { socketId, disconnectedAt: now });
  return true;
}

/**
 * Drops everything this module and seat-token.mjs keep for a seat.
 * @param {{ presence?: Map<string, SeatPresence>, seatTokens?: Map<string, string> }} room
 * @param {string} username
 */
export function forgetSeat(room, username) {
  room.presence?.delete(username);
  room.seatTokens?.delete(username);
}

/**
 * The user's rule: a dropped seat is freed at once while the game is not set up, and after
 * `releaseMs` once it is.
 * @param {{ disconnectedAt: number|null, now: number, setUp: boolean, releaseMs: number }} input
 */
export function seatReleaseDue({ disconnectedAt, now, setUp, releaseMs }) {
  if (disconnectedAt === null || disconnectedAt === undefined) return false;
  if (!setUp) return true;
  return now - disconnectedAt >= releaseMs;
}

/**
 * @param {{ players: Set<string>, presence?: Map<string, SeatPresence> }} room
 * @param {number} now
 * @param {number} releaseMs
 * @param {boolean} setUp
 * @returns {string[]} seated usernames whose seat should be freed now
 */
export function releasableSeats(room, now, releaseMs, setUp) {
  if (!room?.presence) return [];
  return [...room.players].filter((username) =>
    seatReleaseDue({
      disconnectedAt: room.presence.get(username)?.disconnectedAt ?? null,
      now,
      setUp,
      releaseMs,
    })
  );
}

/**
 * @param {{ presence?: Map<string, SeatPresence> }} room
 * @param {string} username
 * @returns {boolean} false only while the seat's owner is known to be disconnected
 */
export function isSeatConnected(room, username) {
  const presence = room?.presence?.get(username);
  return !presence || presence.disconnectedAt === null;
}
