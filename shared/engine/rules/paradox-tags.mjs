/**
 * @file Ancient / Future tags (design 058). Scarlet & Violet Paradox cards print an "Ancient" or
 * "Future" tag that Professor Sada's Vitality, Techno Radar, Reboot Pod, Awakening Drum, the
 * Booster Energy Capsules, Iron Crown ex and Iron Thorns ex read. TCGdex has no field for it, so
 * the tag is looked up per printing in the generated table; a card whose `subtypes` already name
 * the tag (pokemontcg.io data, enriched cards, tests) answers from that first.
 *
 * The tag belongs to the printing, not the species: sv01 Great Tusk ex and sv07 Koraidon print
 * none. Never fall back to the card name.
 *
 * Pure: no DOM, no network.
 */

import { PARADOX_TAGS } from './paradox-tags.generated.mjs';
import { buildSetCardIdCandidates, extractTcgdexIdFromImageUrl } from './legacy-set-ids.mjs';

const TAG_BY_TOKEN = { ancient: 'Ancient', future: 'Future' };

/**
 * One spelling per Scarlet & Violet printing, as the table keys it: pokemontcg.io "sv4-86",
 * "sv4pt5-53" and "svp-67" become TCGdex "sv04-086", "sv04.5-053" and "svp-067". Other ids are
 * returned lowercased and trimmed.
 */
export function canonicalCardId(id) {
  const raw = String(id ?? '').trim().toLowerCase();
  const sv = raw.match(/^sv(\d{1,2})(pt5|\.5)?-(\d+)$/);
  if (sv) return `sv${sv[1].padStart(2, '0')}${sv[2] ? '.5' : ''}-${sv[3].padStart(3, '0')}`;
  const promo = raw.match(/^svp-(\d+)$/);
  if (promo) return `svp-${promo[1].padStart(3, '0')}`;
  return raw;
}

function subtypeTag(card) {
  const subtypes = Array.isArray(card?.subtypes)
    ? card.subtypes
    : String(card?.subtypes ?? '').split(',');
  for (const subtype of subtypes) {
    const tag = TAG_BY_TOKEN[String(subtype ?? '').trim().toLowerCase()];
    if (tag) return tag;
  }
  return null;
}

function imageSources(card) {
  const image = card?.image;
  return [
    card?.src,
    typeof image === 'string' ? image : image?.src,
    card?.imageURL,
    card?.images?.small,
    card?.images?.large,
  ].filter((src) => typeof src === 'string' && src);
}

/** Every TCGdex-style id a card-shaped object may carry (id, tcgId, image URL, set + number). */
export function printingIds(card) {
  const ids = [card?.id, card?.tcgId];
  for (const src of imageSources(card)) ids.push(extractTcgdexIdFromImageUrl(src));
  const set = card?.set && typeof card.set === 'object' ? card.set.id : card?.set;
  const number = card?.number ?? card?.localId;
  if (set && number != null && number !== '') ids.push(...buildSetCardIdCandidates(set, number));
  return ids.filter((id) => typeof id === 'string' && id);
}

/** The printed Paradox tag of a card: 'Ancient', 'Future', or null. */
export function paradoxTagOf(card) {
  if (!card || typeof card !== 'object') return null;
  const fromSubtypes = subtypeTag(card);
  if (fromSubtypes) return fromSubtypes;
  for (const id of printingIds(card)) {
    const tag = PARADOX_TAGS[canonicalCardId(id)];
    if (tag) return tag;
  }
  return null;
}

export const isAncientCard = (card) => paradoxTagOf(card) === 'Ancient';

export const isFutureCard = (card) => paradoxTagOf(card) === 'Future';

/** `subtypes` plus the card's Paradox tag when it has one the array does not already name. */
export function withParadoxSubtype(subtypes, card) {
  const list = Array.isArray(subtypes) ? [...subtypes] : [];
  const tag = paradoxTagOf({ ...card, subtypes: list });
  if (!tag || list.some((s) => String(s).trim().toLowerCase() === tag.toLowerCase())) return list;
  return [...list, tag];
}
