/**
 * @file Which authoritative rooms the periodic sweep in server.js ends. Pure, so the grace and
 * socket rules are testable without Socket.IO.
 */

import { isPublicRoomId } from '../../shared/lobby/public-rooms.mjs';

/**
 * A GameRoom is ended once no player or spectator socket is registered and it has been idle
 * longer than `graceMs` (Finding 5: a brief double-disconnect must not look abandoned).
 * Its roomInfo (seats, cached deck packets) is forgotten too when the Socket.IO room is empty,
 * so a late reconnect gets `server_restart` instead of a fresh empty game. Public rooms keep
 * roomInfo: their seats are released by planSweep (public-seat-flow.mjs).
 * @param {{ gameRooms: Map<string, object>, now: number, graceMs: number,
 *   socketCount: (roomId: string) => number }} input
 * @returns {{ roomId: string, forgetRoomInfo: boolean }[]}
 */
export function planRoomSweep({ gameRooms, now, graceMs, socketCount }) {
  const due = [];
  for (const [roomId, room] of gameRooms) {
    if (room.playerToSocket.size > 0 || room.spectatorSockets.size > 0) continue;
    if (!(now - room.lastActivityAt > graceMs)) continue;
    const forgetRoomInfo = !isPublicRoomId(roomId) && socketCount(roomId) === 0;
    due.push({ roomId, forgetRoomInfo });
  }
  return due;
}
