/**
 * Which zones the authoritative renderer owns the DOM for (D11).
 *
 * In a server-authoritative 2P game, `apply-view.js` draws every card these
 * zones hold from the server's view. The legacy move path still runs for its
 * zone-array bookkeeping (rules gates read those arrays), but if it also
 * appended its own <img>s the zone would show every card twice — once per
 * renderer (I48). The deck is absent on purpose: the server sends it as a bare
 * `{count}`, so the legacy deck and its cover are the only rendering it has.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */
export const SERVER_RENDERED_ZONES = [
  'hand',
  'prizes',
  'active',
  'bench',
  'discard',
  'lostZone',
  'board',
];

/**
 * True when the legacy renderer must not put a card into `zoneId`'s DOM,
 * because the authoritative renderer already draws that zone.
 *
 * @param {string} zoneId
 * @param {{ serverAuthoritative?: boolean, isTwoPlayer?: boolean }} [systemState]
 */
export const legacyDomSuppressed = (zoneId, systemState) =>
  Boolean(systemState?.serverAuthoritative && systemState?.isTwoPlayer) &&
  SERVER_RENDERED_ZONES.includes(zoneId);
