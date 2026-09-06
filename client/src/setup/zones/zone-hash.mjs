/** Deterministic fingerprint of a zone's cards (identity, not image URLs). */
export function hashCardList(cards = []) {
  return cards
    .map((c) =>
      [c?.syncInstance ?? '', c?.name ?? '', c?.number ?? '', c?.set ?? ''].join(
        '|'
      )
    )
    .join(',');
}

/**
 * @param {Record<string, { array?: object[] }|object[]>} zones
 *   Map of zoneId → zone object or raw card array.
 */
export function hashBoardSnapshot(zones = {}) {
  return Object.keys(zones)
    .sort()
    .map((id) => {
      const value = zones[id];
      const cards = Array.isArray(value) ? value : value?.array;
      return `${id}:${hashCardList(cards)}`;
    })
    .join(';');
}

export const SYNC_HASH_ZONES = [
  'deck',
  'hand',
  'prizes',
  'active',
  'bench',
  'discard',
  'lostZone',
  'board',
  'stadium',
];
