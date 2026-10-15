/**
 * @file What the Multiplayer tab's room list shows for each public room (design 069). Pure.
 */

import { PUBLIC_ROOMS } from '../../shared/lobby/public-rooms.mjs';
import { isSeatConnected } from './seat-presence.mjs';

/**
 * @typedef {{
 *   id: string, name: string,
 *   players: { username: string, connected: boolean }[],
 *   spectators: number,
 *   format: string|null,
 *   status: 'open'|'waiting'|'full'|'in-game',
 * }} PublicRoomSummary
 */

const statusFor = (seatedCount, inGame) => {
  if (seatedCount === 0) return 'open';
  if (seatedCount === 1) return 'waiting';
  return inGame ? 'in-game' : 'full';
};

/**
 * @param {{ id: string, name: string, room?: object|null, inGame?: boolean }} input
 *   `room` is the roomInfo entry (absent until someone joins); `inGame` is true once the server
 *   has seen the game set up.
 * @returns {PublicRoomSummary}
 */
export function describePublicRoom({ id, name, room = null, inGame = false }) {
  const usernames = room ? [...room.players].slice(0, 2) : [];
  return {
    id,
    name,
    players: usernames.map((username) => ({ username, connected: isSeatConnected(room, username) })),
    spectators: room ? room.spectators.size : 0,
    format: room?.format?.format ?? null,
    status: statusFor(usernames.length, inGame),
  };
}

/**
 * @param {{ roomInfo: Map<string, object>, isInGame: (roomId: string) => boolean }} input
 * @returns {{ rooms: PublicRoomSummary[] }} every public room, in list order
 */
export function buildLobbySnapshot({ roomInfo, isInGame }) {
  return {
    rooms: PUBLIC_ROOMS.map(({ id, name }) =>
      describePublicRoom({ id, name, room: roomInfo.get(id) ?? null, inGame: isInGame(id) })
    ),
  };
}
