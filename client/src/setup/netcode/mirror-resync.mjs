/**
 * @file Turns a rejected mirror move into the resync the console already promised.
 *
 * A relayed move is applied against this client's mirror of the peer's zones. When the
 * relayed index no longer identifies the card the hint names, `move-card-bundle.js`
 * refuses the move — right, since applying it would move the wrong card — but it only
 * logged "requesting resync" and returned: the zone stayed diverged, and the only thing
 * that put it right was the player reloading the page.
 *
 * The recovery chain for this exists end to end already. The client reports per-zone board
 * hashes (`sync-check.js`), the server names the first zone that disagrees and emits
 * `desync`, and the client's `desync` handler replays the peer's action log from where it
 * left off. But the only thing that ever sent those hashes was
 * `startSyncCheckHeartbeat`, gated on `systemState.serverAuthoritative` — so a legacy 2P
 * game, whose moves arrive through exactly the relay path that aborts here, had no desync
 * detection at all.
 *
 * So the abort sites now report the divergence they have already detected. DOM-free: the
 * zone source is injected (`get-zone.js` pulls in `state.js`).
 */

import { computeSyncCheckZones, emitSyncCheck } from './sync-check.js';

/**
 * One diverged mirror typically rejects a burst of moves (the peer keeps acting on a zone
 * this client has already lost track of). Reporting each one would put the server through
 * compare → desync → peer-log replay over and over for a single divergence.
 */
export const MIRROR_RESYNC_MIN_INTERVAL_MS = 5000;

/** Never reported before — a game's first divergence must go out, whatever the clock says. */
const NEVER = Number.NEGATIVE_INFINITY;
let lastReportAt = NEVER;

/** @internal test seam */
export function resetMirrorResyncThrottle() {
  lastReportAt = NEVER;
}

/**
 * Reports this client's own zones to the server for comparison, so a divergence the abort
 * path has already detected becomes the existing automatic recovery instead of a manual
 * reload.
 *
 * @param {object} options
 * @param {{ emit?: Function }|null} options.socket
 * @param {string} options.roomId
 * @param {(user: string, zoneId: string) => { array?: object[] }} options.getZoneFn
 *   The zone source this client actually renders from — legacy `getZone`, or the view
 *   accessor under server authority.
 * @param {string} [options.zoneId] The zone the rejected move was reading, for the log only.
 * @param {string} [options.reason]
 * @param {number} [options.now] Test seam.
 * @param {number} [options.minIntervalMs] Test seam.
 * @returns {{ sent: boolean, reason: string, zones?: Record<string, string>, zoneId?: string }}
 */
export function reportMirrorDesync({
  socket,
  roomId,
  getZoneFn,
  zoneId = '',
  reason = 'mirror_abort',
  now = Date.now(),
  minIntervalMs = MIRROR_RESYNC_MIN_INTERVAL_MS,
} = {}) {
  if (!socket || typeof socket.emit !== 'function') {
    return { sent: false, reason: 'no_socket' };
  }
  if (!roomId) return { sent: false, reason: 'no_room' };
  if (typeof getZoneFn !== 'function') {
    return { sent: false, reason: 'no_zone_source' };
  }
  if (now - lastReportAt < minIntervalMs) {
    return { sent: false, reason: 'throttled' };
  }

  // The same per-zone shape the server compares against
  // `hashOwnerViewZones(gameRoom.getView(playerId))` — this player's own zones. `deck` is
  // excluded by the helper (owner-secret even from its owner, I24).
  //
  // No `stateVersion`: under authority the heartbeat skips the compare when the version it
  // hashed has already moved on (I42, a stale-by-design false positive). Here the
  // divergence is not a guess — a move was just refused — so the compare is the point.
  const zones = computeSyncCheckZones('self', getZoneFn);
  const sent = emitSyncCheck({ socket, roomId, zones });
  if (sent) lastReportAt = now;
  return { sent, zones, zoneId, reason };
}
