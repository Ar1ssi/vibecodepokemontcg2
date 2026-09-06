import { getZone } from './get-zone.js';
import { hashBoardSnapshot, SYNC_HASH_ZONES } from './zone-hash.mjs';

/** Fingerprint of one client's view of `user` zones (self or opp). */
export function hashUserBoard(user) {
  const zones = {};
  for (const id of SYNC_HASH_ZONES) {
    try {
      zones[id] = getZone(user, id);
    } catch {
      zones[id] = { array: [] };
    }
  }
  return hashBoardSnapshot(zones);
}
