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
  const damage =
    typeof c?.damage === 'number' && c.damage > 0
      ? String(c.damage)
      : (c?.image?.damageCounter?.textContent ?? '');
  const condition = c?.specialCondition ?? c?.image?.specialCondition?.textContent ?? '';
  const abilityUsed =
    typeof c?.abilityUsed === 'boolean'
      ? (c.abilityUsed ? '1' : '0')
      : (c?.image?.abilityCounter ? '1' : '0');
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
 * Per-zone fingerprint map (zoneId -> hash) — the same data `hashBoardSnapshot`
 * joins into one string, kept separate so a sync check can name the first
 * *specific* zone that diverged instead of only "somewhere on the board"
 * (design 002 slice 3.11).
 *
 * @param {Record<string, { array?: object[] }|object[]>} zones
 *   Map of zoneId → zone object or raw card array.
 * @returns {Record<string, string>}
 */
export function hashZoneMap(zones = {}) {
  const map = {};
  for (const id of Object.keys(zones).sort()) {
    const value = zones[id];
    const cards = Array.isArray(value) ? value : value?.array;
    map[id] = hashCardList(cards);
  }
  return map;
}

/**
 * @param {Record<string, { array?: object[] }|object[]>} zones
 *   Map of zoneId → zone object or raw card array.
 */
export function hashBoardSnapshot(zones = {}) {
  const map = hashZoneMap(zones);
  return Object.keys(map)
    .map((id) => `${id}:${map[id]}`)
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
