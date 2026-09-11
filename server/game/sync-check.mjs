import { hashZoneMap, SYNC_HASH_ZONES } from '../../shared/engine/zones/zone-hash.mjs';

/**
 * @file Pure desync-detection comparison (design 002 slice 3.11).
 * The client periodically sends its own per-zone board hashes; the server
 * compares them against `hashStateZones(gameRoom.state, playerId)` and names
 * the first zone that disagrees, so recovery (the existing slice-1.1
 * peer-log catch-up) has something concrete to act on.
 */

/**
 * Drops zones the client can never legitimately hash from a server-side
 * zone map before it's compared against the client's report. `deck` is
 * redacted to `{ count }` even for its own owner (design O4-A / I5), so a
 * per-card `deck` hash from the client would never match the server's real
 * deck and would falsely report a desync on every heartbeat (design 002
 * I24). The client applies the matching exclusion in
 * `client/src/setup/netcode/sync-check.js`'s `PLAYER_ZONES`.
 *
 * @param {Record<string, string>|null} zones
 * @returns {Record<string, string>|null}
 */
export function excludeOwnerSecretZones(zones) {
  if (!zones) return zones;
  const rest = { ...zones };
  delete rest.deck;
  return rest;
}

/**
 * @param {Record<string, string>|null} serverZones
 * @param {Record<string, string>|null|undefined} clientZones
 * @returns {string|null} the first zoneId whose hash disagrees, or null if all match.
 */
export function findFirstDivergentZone(serverZones, clientZones) {
  if (!serverZones) return null;
  const client =
    clientZones && typeof clientZones === 'object' ? clientZones : {};
  for (const zoneId of Object.keys(serverZones).sort()) {
    if (client[zoneId] !== serverZones[zoneId]) {
      return zoneId;
    }
  }
  return null;
}

// Zones the client hashes from its own view: everything in SYNC_HASH_ZONES
// except deck (redacted to { count } even for its owner) — the exact set the
// client's computeSyncCheckZones (client/src/setup/netcode/sync-check.js) builds.
const VIEW_HASH_PLAYER_ZONES = SYNC_HASH_ZONES.filter(
  (zoneId) => zoneId !== 'stadium' && zoneId !== 'deck'
);

/**
 * Per-zone hashes of what the owner can actually see — `viewFor(state,
 * playerId)`, not raw state. The client can only hash its own view, which
 * redacts unrevealed prizes to `{ instanceId }`; hashing the server's real
 * prize cards instead made `prizes` diverge on every heartbeat of every
 * server-authoritative game, and each false desync started a peer-log
 * catch-up whose 5s timeout posted "The game may be out of sync".
 *
 * @param {object|null} view `gameRoom.getView(playerId)`
 * @returns {Record<string, string>|null}
 */
export function hashOwnerViewZones(view) {
  if (!view?.you?.zones) return null;
  const zones = { stadium: view.stadium ? [view.stadium] : [] };
  for (const zoneId of VIEW_HASH_PLAYER_ZONES) {
    const cards = view.you.zones[zoneId];
    zones[zoneId] = Array.isArray(cards) ? cards : [];
  }
  return hashZoneMap(zones);
}
