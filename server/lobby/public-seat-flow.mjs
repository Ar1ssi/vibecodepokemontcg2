/**
 * @file The seat decisions server.js makes for public rooms (design 069). Pure, so the join,
 * reconnect and release rules are testable without sockets.
 */

import { isPublicRoomId } from '../../shared/lobby/public-rooms.mjs';
import { checkSeatClaim } from './seat-token.mjs';
import { releasableSeats } from './seat-presence.mjs';

/**
 * @param {{ room: object, username: string, token?: unknown, isSpectator: boolean,
 *   seatsFull: boolean }} input  `seatsFull`: no seat is free for a new player
 * @returns {{ action: 'seat'|'spectate'|'reject', reason?: 'full'|'name_taken', issueToken: boolean }}
 */
export function decideJoin({ room, username, token, isSpectator, seatsFull }) {
  if (isSpectator) return { action: 'spectate', issueToken: false };
  const claim = checkSeatClaim(room, username, token);
  if (claim === 'taken') return { action: 'reject', reason: 'name_taken', issueToken: false };
  if (claim === 'owner') return { action: 'seat', issueToken: false };
  if (seatsFull) return { action: 'reject', reason: 'full', issueToken: false };
  return { action: 'seat', issueToken: true };
}

/**
 * A seated player's socket came back. A released seat is not handed back: the opponent was
 * already told the player left, and the deck exchange went with the seat.
 * @param {{ room: object|null|undefined, username: string, token?: unknown }} input
 * @returns {{ action: 'seat'|'reject', reason?: 'name_taken'|'seat_released' }}
 */
export function decideReconnect({ room, username, token }) {
  const claim = checkSeatClaim(room, username, token);
  if (claim === 'new') return { action: 'reject', reason: 'seat_released' };
  if (claim === 'taken') return { action: 'reject', reason: 'name_taken' };
  return { action: 'seat' };
}

/**
 * @param {{ roomInfo: Map<string, object>, now: number, releaseMs: number,
 *   isSetUp: (roomId: string) => boolean }} input
 * @returns {{ roomId: string, username: string }[]} the seats to free now
 */
export function planSweep({ roomInfo, now, releaseMs, isSetUp }) {
  const due = [];
  for (const [roomId, room] of roomInfo) {
    if (!isPublicRoomId(roomId)) continue;
    for (const username of releasableSeats(room, now, releaseMs, isSetUp(roomId))) {
      due.push({ roomId, username });
    }
  }
  return due;
}

/**
 * Trailing-edge debounce with one pending timer: calls while one is pending fold into it.
 * @param {number} ms
 * @param {() => void} fn
 * @param {{ setTimeout: Function }} [timers]
 * @returns {() => void}
 */
export function createDebouncer(ms, fn, timers = globalThis) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    timers.setTimeout(() => {
      pending = false;
      fn();
    }, ms);
  };
}
