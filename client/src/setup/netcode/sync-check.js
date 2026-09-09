/**
 * @file Desync-detection heartbeat (design 002 slice 3.11).
 * Sends this client's own per-zone board hashes to the server on an
 * interval so it can compare them against `hashStateZones(gameRoom.state,
 * playerId)` and name the first zone that disagrees. Recovery reuses the
 * existing slice-1.1 peer-log catch-up (peer-log-catchup.js) rather than a
 * second mechanism. Slice 1.3 deleted the old dead heartbeat/stubs; this one
 * calls something real.
 */
import {
  hashZoneMap,
  SYNC_HASH_ZONES,
} from '../../../../shared/engine/zones/zone-hash.mjs';
import {
  getAuthoritativeZoneArray,
  getAuthoritativeStadiumArray,
} from './apply-view.js';

export const SYNC_CHECK_INTERVAL_MS = 30000;

// `deck` is excluded here (and by the server's matching filter in
// server/game/sync-check.mjs) on top of the `stadium` exclusion: under
// server-authoritative rendering the view redacts deck contents even from
// its own owner (design O4-A / I5), so this client can never produce a real
// per-card deck hash — comparing it would be a permanent false positive, not
// a real desync signal (design 002 I24).
const PLAYER_ZONES = SYNC_HASH_ZONES.filter(
  (zoneId) => zoneId !== 'stadium' && zoneId !== 'deck'
);

/**
 * Zone accessor matching legacy `getZone`'s `(user, zoneId) => { array }`
 * shape, but sourced from the authoritative renderer's own last-applied view
 * (design 002 I24) instead of legacy's `zoneArrays`, which are never
 * populated under server-authoritative rendering (I15). This heartbeat only
 * ever runs while `serverAuthoritative` is on, so the view source is always
 * live by the time it fires.
 *
 * @param {string} user 'self' | 'opp'
 * @param {string} zoneId
 * @returns {{ array: object[] }}
 */
export function viewBackedGetZone(user, zoneId) {
  const side = user === 'self' ? 'you' : 'them';
  const array =
    zoneId === 'stadium'
      ? getAuthoritativeStadiumArray()
      : getAuthoritativeZoneArray(side, zoneId);
  return { array };
}

/**
 * Builds the per-zone hash map for one side ('self' or 'opp'), the same
 * shape `hashStateZones(gameRoom.state, playerId)` produces server-side.
 *
 * @param {string} user
 * @param {(user: string, zoneId: string) => { array?: object[] }} getZoneFn
 * @returns {Record<string, string>}
 */
export function computeSyncCheckZones(user, getZoneFn) {
  const zones = { stadium: getZoneFn(user, 'stadium').array || [] };
  for (const zoneId of PLAYER_ZONES) {
    zones[zoneId] = getZoneFn(user, zoneId).array || [];
  }
  return hashZoneMap(zones);
}

/**
 * @param {object} options
 * @param {object} options.socket
 * @param {string} options.roomId
 * @param {Record<string, string>} options.zones
 * @returns {boolean}
 */
export function emitSyncCheck({ socket, roomId, zones }) {
  if (!socket || typeof socket.emit !== 'function' || !roomId) return false;
  socket.emit('syncCheck', { roomId, zones });
  return true;
}

/**
 * Edge case row 24: a desync notification that arrives while the slice-1.1
 * peer-log catch-up is already in flight must not start a second recovery —
 * the in-flight one already covers it.
 *
 * @param {object} options
 * @param {boolean} options.isCatchingUp Already replaying a peer-log catch-up.
 * @param {boolean} options.peerLogRequestPending A requestPeerLog is awaiting a reply.
 * @returns {boolean}
 */
export function shouldTriggerDesyncRecovery({
  isCatchingUp,
  peerLogRequestPending,
}) {
  return !isCatchingUp && !peerLogRequestPending;
}
