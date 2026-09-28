/**
 * @file Who may send a room-format action, and whether the format is still open (design 053). Pure.
 */

/**
 * Refuses a `roomFormatAction` unless it comes from one of exactly two seated players, from the
 * socket that holds that seat. A username alone is not proof: in authoritative mode the engine
 * room's socket map must name this socket for that player.
 *
 * @param {object} input
 * @param {{ roomId: string, username: string }|null} input.seat what this socket joined as
 * @param {string} [input.requestRoomId] the room the action names
 * @param {{ players: Set<string> }|null} input.room the roomInfo entry
 * @param {{ socketToPlayer: Map<string, string>,
 *   getPlayerIdByUsername: (username: string) => string|null }|null} [input.gameRoom]
 * @param {string} input.socketId
 * @returns {string|null} a refusal reason, or null when the sender may act
 */
export function roomFormatSeatRefusal({ seat, requestRoomId, room, gameRoom = null, socketId }) {
  if (!seat || !room || requestRoomId !== seat.roomId) return 'not_seated';
  if (!room.players.has(seat.username)) return 'not_seated';
  // Legacy relay can list a third player on reconnect; the choice belongs to a two-seat room.
  if (room.players.size !== 2) return 'not_seated';
  if (!gameRoom) return null;
  const playerId = gameRoom.getPlayerIdByUsername(seat.username);
  if (!playerId || gameRoom.socketToPlayer.get(socketId) !== playerId) return 'not_seated';
  return null;
}

/**
 * The format locks once the opening coin call opens: the deal check has already passed, and the
 * cards follow the call without a second check.
 *
 * @param {{ turnOrder?: object|null, state?: { turn?: { phase?: string } } }|null} gameRoom
 */
export function roomFormatLocked(gameRoom) {
  if (!gameRoom) return false;
  if (gameRoom.turnOrder) return true;
  const phase = gameRoom.state?.turn?.phase;
  return Boolean(phase) && phase !== 'setup';
}
