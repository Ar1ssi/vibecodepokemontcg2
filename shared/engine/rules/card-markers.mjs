/**
 * @file Printed markers TCGdex has no field for (I220): Tera, Team Plasma, Single/Rapid/Fusion
 * Strike, Baby, Prism Star, TAG TEAM, ACE SPEC. Trainer searches read them ("a Tera Pokémon", "a Single
 * Strike Supporter card", "a Baby Pokémon"). Looked up per printing in the generated table, like
 * the Ancient/Future tag (design 058); a card whose `subtypes` already name the marker
 * (pokemontcg.io data, enriched cards, tests) answers from that first.
 *
 * Pure: no DOM, no network.
 */

import { CARD_MARKERS } from './card-markers.generated.mjs';
import { canonicalCardId, printingIds } from './paradox-tags.mjs';

export const MARKERS = Object.freeze([
  'Tera',
  'Team Plasma',
  'Single Strike',
  'Rapid Strike',
  'Fusion Strike',
  'Baby',
  'Prism Star',
  'TAG TEAM',
  'ACE SPEC',
]);

const collapse = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const MARKER_BY_KEY = new Map(MARKERS.map((marker) => [collapse(marker), marker]));

// Table keys are TCGdex ids ("swsh9tg-TG18"); printingIds canonicalises to lowercase.
const MARKERS_BY_ID = new Map(Object.entries(CARD_MARKERS).map(([id, list]) => [id.toLowerCase(), list]));

function subtypeMarkers(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes : [];
  return subtypes.map((s) => MARKER_BY_KEY.get(collapse(s))).filter(Boolean);
}

/** The card's printed markers (a subset of MARKERS); [] when it has none or is unknown. */
export function cardMarkersOf(card) {
  if (!card || typeof card !== 'object') return [];
  const found = new Set(subtypeMarkers(card));
  for (const id of printingIds(card)) {
    for (const marker of MARKERS_BY_ID.get(canonicalCardId(id)) || []) found.add(marker);
  }
  return [...found];
}

export const hasCardMarker = (card, marker) => cardMarkersOf(card).includes(marker);

/**
 * A Team Plasma card (BW Plasma Storm–Plasma Blast and promos). Live server cards carry no
 * `subtypes`, so every reader asks here instead of matching "plasma" in a name (design 063,
 * audit F2). Plasma Energy (bw8-127, bw9-106, bw10-91) is in the table; its name also answers for
 * cards without an id (tests, e2e decks).
 */
export function isTeamPlasmaCard(card) {
  if (!card || typeof card !== 'object') return false;
  return hasCardMarker(card, 'Team Plasma') || /^plasma energy$/i.test(String(card.name || '').trim());
}
