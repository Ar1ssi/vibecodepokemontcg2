import { getZone } from './get-zone.js';
import {
  getAuthoritativeStadiumArray,
  getAuthoritativeZoneArray,
  hasAuthoritativeView,
} from '../netcode/apply-view.js';

/**
 * One side's live cards in one zone. Design 002 I24: legacy getZone's zoneArrays are never
 * populated under server-authoritative rendering (I15) — once the renderer has applied at least
 * one view, that view (cached in apply-view.js) is the real live source; before that (legacy/1P
 * mode, or before the first view arrives), legacy getZone is still correct and is the fallback.
 *
 * @param {'self'|'opp'} user
 * @param {string} zoneId
 * @returns {object[]}
 */
export function liveZoneArray(user, zoneId) {
  if (hasAuthoritativeView()) {
    const side = user === 'self' ? 'you' : 'them';
    return zoneId === 'stadium'
      ? getAuthoritativeStadiumArray()
      : getAuthoritativeZoneArray(side, zoneId);
  }
  return getZone(user, zoneId)?.array || [];
}
