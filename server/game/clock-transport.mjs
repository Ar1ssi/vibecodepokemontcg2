/**
 * @file Design 090: the homebrew clock's server side — one time-out timer per room, and the
 * `homebrewClock` snapshot pushed to the room after every clock change.
 */

import { msUntilFlag } from '../../shared/engine/homebrew-clock.mjs';

// A timer can fire a hair early; the room re-checks the clock and re-arms if time is left.
const FLAG_SLACK_MS = 25;

/**
 * @param {object} deps
 * @param {(roomId: string, payload: object) => void} deps.emitToRoom
 * @param {(gameRoom: object, roomId: string) => void} deps.onFlag runs the time-out
 * @param {Function} [deps.setTimer]
 * @param {Function} [deps.clearTimer]
 */
export function createClockTransport({ emitToRoom, onFlag, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const timers = new Map();

  const clear = (roomId) => {
    const timer = timers.get(roomId);
    if (timer == null) return;
    clearTimer(timer);
    timers.delete(roomId);
  };

  /** Pushes the room's clock and re-arms its time-out timer for the player now running. */
  const refresh = (gameRoom, roomId) => {
    clear(roomId);
    emitToRoom(roomId, gameRoom.clockPayload());
    const left = msUntilFlag(gameRoom.clock, gameRoom.now());
    if (left == null) return;
    const timer = setTimer(() => {
      timers.delete(roomId);
      onFlag(gameRoom, roomId);
    }, left + FLAG_SLACK_MS);
    timer?.unref?.();
    timers.set(roomId, timer);
  };

  return { refresh, clear, hasTimer: (roomId) => timers.has(roomId) };
}
