/**
 * @file Timed attack effects on in-play Pokémon (design 031).
 *
 * An attack that changes how later damage works ("During your opponent's next turn, this
 * Pokémon has no Weakness") leaves a marker on the root card: `card.attackMarkers =
 * [{ kind, untilTurn, topId, sourceAttack, ...params }]`. A marker counts only while its
 * Pokémon is Active, its turn window is open, and the Pokémon has not evolved since
 * (`topId` is the top card when the marker landed). Retreat, switch and Knock Out clear them.
 * Also reads the immunity wording ("This attack's damage isn't affected by ...").
 * Pure: no state beyond the card passed in, no randomness.
 */

import { topPokemonCard } from './evolved-pokemon.mjs';

/**
 * @param {object} card In-play root card
 * @param {object} marker `{ kind, untilTurn, topId?, sourceAttack?, ...params }`
 */
export function addAttackMarker(card, marker) {
  if (!card || !marker?.kind) return;
  card.attackMarkers = [...(card.attackMarkers || []), marker];
}

export function clearAttackMarkers(card) {
  if (card) delete card.attackMarkers;
}

/**
 * Markers still in force on an Active Pokémon. The caller checks the card is Active.
 * @param {object} card In-play root card
 * @param {{ turnNumber: number, zoneCards?: object[] }} options `zoneCards` holds the stack
 * @returns {object[]}
 */
export function liveAttackMarkers(card, { turnNumber, zoneCards = [] } = {}) {
  const markers = card?.attackMarkers;
  if (!Array.isArray(markers) || markers.length === 0) return [];
  const topId = topPokemonCard(zoneCards, card)?.instanceId;
  return markers.filter(
    (marker) =>
      marker.untilTurn >= turnNumber && (marker.topId == null || marker.topId === topId)
  );
}

export function hasMarker(markers, kind) {
  return (markers || []).some((marker) => marker.kind === kind);
}

const REMINDER_ONLY = /\(don't apply weakness and resistance for benched pokémon\.?\)/g;

/**
 * Immunity wording on an attack's own damage.
 * @param {string} text Printed attack effect text
 * @returns {{ ignoreWeakness: boolean, ignoreResistance: boolean, ignoreDefenderEffects: boolean }|null}
 */
export function parseDamageImmunity(text) {
  const lower = String(text || '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/pokemon/g, 'pokémon')
    .replace(REMINDER_ONLY, '');
  const clauses = [
    ...lower.matchAll(/damage (?:isn't|is not) affected by ([^.]*)/g),
    ...lower.matchAll(/don't apply ([^.]*)/g),
  ].map((m) => m[1]);
  if (clauses.length === 0) return null;
  const immunity = {
    ignoreWeakness: clauses.some((c) => /\bweakness\b/.test(c)),
    ignoreResistance: clauses.some((c) => /\bresistance\b/.test(c)),
    ignoreDefenderEffects: clauses.some((c) => /\beffects on\b/.test(c)),
  };
  return Object.values(immunity).some(Boolean) ? immunity : null;
}

// ── marker templates ─────────────────────────────────────────────────────────
// Same shape as rules/attack-steps.mjs TEMPLATES: anchored on a normalized, gate-stripped
// sentence ("this pokémon" = the attacker, "your opponent's active pokémon" = the defender).
// `window`: 'opponentNextTurn' (turn + 1), 'yourNextTurn' (turn + 2), 'whileActive'.
export const MARKER_TEMPLATES = [
  [
    /^(?:during your opponent's next turn, this pokémon has no weakness|this pokémon has no weakness during your opponent's next turn)$/,
    () => ({
      type: 'atkAddMarker',
      target: 'self',
      window: 'opponentNextTurn',
      marker: { kind: 'noWeakness' },
    }),
  ],
];

/**
 * @param {'opponentNextTurn'|'yourNextTurn'|'whileActive'} window
 * @param {number} turnNumber The attacking turn
 * @returns {number}
 */
export function markerUntilTurn(window, turnNumber) {
  // Game state round-trips through JSON, which turns Infinity into null.
  if (window === 'whileActive') return Number.MAX_SAFE_INTEGER;
  return turnNumber + (window === 'yourNextTurn' ? 2 : 1);
}
