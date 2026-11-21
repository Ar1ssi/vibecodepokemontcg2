/**
 * @file What the homebrew clock panel shows (design 090). Pure.
 * Before the deal: the toggle (seated players) or its state (spectators). In play, with the clock
 * running: one row per seat, the local seat first, the running bank counted down from the last
 * snapshot. Otherwise hidden.
 */

import { formatClock } from '../../../../shared/engine/homebrew-clock.mjs';

export const CLOCK_LOW_MS = 30 * 1000;
export const CLOCK_TOGGLE_LABEL = 'Homebrew clock: 6:00 each, +15 s per turn';
export const CLOCK_TOGGLE_HINT = 'Runs when both decks have a homebrew card. Out of time loses.';

/**
 * @param {object} input
 * @param {object|null} input.snapshot the last `homebrewClock` payload for this room
 * @param {number} input.elapsedMs ms since that snapshot arrived
 * @param {boolean} input.dealt the room's cards are dealt (roomFormat)
 * @param {string} input.self this client's username ('' when spectating)
 * @param {boolean} input.spectator
 */
export function homebrewClockView({ snapshot, elapsedMs = 0, dealt = false, self = '', spectator = false }) {
  if (!snapshot) return { mode: 'hidden' };
  if (snapshot.active) return { mode: 'clock', rows: clockRows(snapshot, elapsedMs, self) };
  if (dealt) return { mode: 'hidden' };
  return {
    mode: 'toggle',
    checked: snapshot.enabled === true,
    disabled: spectator || !self,
    label: CLOCK_TOGGLE_LABEL,
    hint: CLOCK_TOGGLE_HINT,
  };
}

function clockRows(snapshot, elapsedMs, self) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const rows = players.map(({ playerId, username }) => {
    const banked = Number(snapshot.remaining?.[playerId]) || 0;
    const running = snapshot.runner === playerId;
    const ms = running ? Math.max(0, banked - Math.max(0, elapsedMs)) : banked;
    return {
      playerId,
      name: username === self ? 'You' : username,
      self: username === self,
      time: formatClock(ms),
      running,
      low: ms <= CLOCK_LOW_MS,
      out: snapshot.flagged === playerId,
    };
  });
  return rows.sort((a, b) => Number(b.self) - Number(a.self));
}
