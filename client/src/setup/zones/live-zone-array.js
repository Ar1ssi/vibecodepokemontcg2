import { getZone } from './get-zone.js';
import {
  getAuthoritativeDeckCount,
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

/**
 * How many cards one side holds in one zone. A server view gives the deck as a count only (it is
 * redacted even for its owner), so the deck's array is always empty there and never the answer.
 *
 * @param {'self'|'opp'} user
 * @param {string} zoneId
 * @returns {number}
 */
export function liveZoneCount(user, zoneId) {
  if (zoneId === 'deck' && hasAuthoritativeView()) {
    return getAuthoritativeDeckCount(user === 'self' ? 'you' : 'them');
  }
  return liveZoneArray(user, zoneId).length;
}
