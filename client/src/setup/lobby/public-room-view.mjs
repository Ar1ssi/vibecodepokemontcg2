/**
 * @file What the Multiplayer tab's room list shows (design 069). Pure.
 */

import { DECK_FORMAT_BUILD_BATTLE, DECK_FORMAT_TCG } from '../../../../shared/engine/formats.mjs';

// Short chip labels; formats.mjs's labels carry deck size and Prizes.
const FORMAT_CHIPS = Object.freeze({
  [DECK_FORMAT_TCG]: 'Standard',
  [DECK_FORMAT_BUILD_BATTLE]: 'Build & Battle',
});

const STATUS_LABELS = Object.freeze({
  open: 'Open',
  waiting: 'Waiting for an opponent',
  full: 'Full',
  'in-game': 'In game',
});

// Server values index these maps, so never fall through to Object.prototype ('constructor').
const lookup = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null);

const playerName = (player) =>
  player.connected ? player.username : `${player.username} (reconnecting)`;

const playersLabel = (players) => {
  if (players.length === 0) return '';
  if (players.length === 1) return `${playerName(players[0])} is waiting`;
  return players.map(playerName).join(' vs ');
};

/**
 * @param {unknown} rooms the server's `lobbyRooms.rooms`
 * @param {(roomId: string) => string|null} [heldSeatName] the username this tab holds a seat
 *   token for in that room; a full room still offers that player "Rejoin"
 * @returns {{ id: string, name: string, statusLabel: string, playersLabel: string,
 *   formatLabel: string, spectatorsLabel: string, canJoin: boolean, joinLabel: string,
 *   canWatch: boolean }[]}
 */
export function publicRoomRows(rooms, heldSeatName = () => null) {
  if (!Array.isArray(rooms)) return [];
  return rooms
    .filter((room) => room && typeof room.id === 'string' && lookup(STATUS_LABELS, room.status))
    .map((room) => {
      const players = Array.isArray(room.players)
        ? room.players.filter((player) => typeof player?.username === 'string')
        : [];
      const spectators = Number.isInteger(room.spectators) ? room.spectators : 0;
      const heldName = heldSeatName(room.id);
      const holdsSeat = players.some((player) => player.username === heldName);
      return {
        id: room.id,
        name: String(room.name ?? room.id),
        statusLabel: STATUS_LABELS[room.status],
        playersLabel: playersLabel(players),
        formatLabel: lookup(FORMAT_CHIPS, room.format) ?? '',
        spectatorsLabel: spectators > 0 ? `${spectators} watching` : '',
        canJoin: holdsSeat || room.status === 'open' || room.status === 'waiting',
        joinLabel: holdsSeat ? 'Rejoin' : 'Join',
        canWatch: room.status !== 'open',
      };
    });
}

const REJECT_MESSAGES = Object.freeze({
  name_taken: 'Someone in this room is already using that name.\nPick another username.',
  seat_released:
    'Your seat was released while you were disconnected.\nPick a room to play again.',
  // Design 074 D7: a solo room has one player, who plays both seats.
  solo_room: 'That room is a solo game.\nPick another room.',
  solo_needs_authority:
    'Solo games through the server need server authority, which is off here.\nPlaying on the local board instead.',
});
const DEFAULT_REJECT_MESSAGE = 'Room is full.\nWatch the game instead, or pick another room.';

/** @param {unknown} reason the server's `roomReject.reason` */
export function roomRejectMessage(reason) {
  return lookup(REJECT_MESSAGES, reason) ?? DEFAULT_REJECT_MESSAGE;
}

/** Rejections that mean this player no longer holds the seat they are sitting in. */
export function rejectEndsSeat(reason) {
  return reason === 'seat_released' || reason === 'name_taken';
}
