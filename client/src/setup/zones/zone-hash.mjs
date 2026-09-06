/**
 * Per-card counter/status fingerprint. Damage counters, special conditions,
 * and ability-used markers are only ever stored on the DOM node
 * (card.image.damageCounter / .specialCondition / .abilityCounter) — never
 * on the Card data object — so without this they are completely invisible
 * to hashCardList. That let two boards silently diverge (different HP,
 * different status, different ability-used state) while the periodic
 * syncCheck still reported "in sync", because it only compared which cards
 * were present, never their counter/status state. Reading .textContent /
 * presence here is a plain property read (not a DOM API call), so this
 * still works against plain mock objects in tests.
 */
function hashCardCounters(c) {
  const damage = c?.image?.damageCounter?.textContent ?? '';
  const condition = c?.image?.specialCondition?.textContent ?? '';
  const abilityUsed = c?.image?.abilityCounter ? '1' : '0';
  return [damage, condition, abilityUsed].join('|');
}

/** Deterministic fingerprint of a zone's cards (identity + counter/status state, not image URLs). */
export function hashCardList(cards = []) {
  return cards
    .map((c) =>
      [
        c?.syncInstance ?? '',
        c?.name ?? '',
        c?.number ?? '',
        c?.set ?? '',
        hashCardCounters(c),
      ].join('|')
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
