// Card fronts this app serves itself, in place of TCGdex's image: TCG Live's own art
// (E:/tcglive_extract card bundles, card area cropped by the foil UV), for TCGdex cards whose
// image is League-stamped (bw1 Water–Darkness Energy) or missing (sm3.5 69–70, sve 001–024).
// Files mirror TCGdex's asset layout, `<root>/<series>/<set>/<localId>/{high,low}.webp`, so
// every `${image}/high.webp` consumer works unchanged.
export const CARD_ART_ROOT = '/src/assets/card-art';

const SERIES_BY_SET = { bw1: 'bw', 'sm3.5': 'sm', sve: 'sv' };

const CARD_ART_IDS = new Set([
  'bw1-107', // Water Energy
  'bw1-108', // Lightning Energy
  'bw1-109', // Psychic Energy
  'bw1-110', // Fighting Energy
  'bw1-111', // Darkness Energy
  'sm3.5-69', // Double Colorless Energy
  'sm3.5-70', // Warp Energy
  ...Array.from({ length: 24 }, (_, i) => `sve-${String(i + 1).padStart(3, '0')}`), // Basic Energy
]);

/** TCGdex-style image base (no `/high.webp`) for a card this app serves itself, else null. */
export function cardArtImageBase(id) {
  if (typeof id !== 'string' || !CARD_ART_IDS.has(id)) return null;
  const dash = id.lastIndexOf('-');
  const setId = id.slice(0, dash);
  return `${CARD_ART_ROOT}/${SERIES_BY_SET[setId]}/${setId}/${id.slice(dash + 1)}`;
}

/** A raw TCGdex card record ({ id, image, ... }) with its image swapped for ours when we have one. */
export function withCardArt(card) {
  const base = cardArtImageBase(card?.id);
  return base ? { ...card, image: base } : card;
}

/** `{ series, set, number }` for one of our card-art URLs (relative or absolute), else null. */
export function cardArtImageParts(src) {
  if (typeof src !== 'string' || !src) return null;
  let path;
  try {
    path = new URL(src, 'http://card-art.invalid').pathname;
  } catch {
    return null;
  }
  if (!path.startsWith(`${CARD_ART_ROOT}/`)) return null;
  const [series, set, number] = path.slice(CARD_ART_ROOT.length + 1).split('/');
  return series && set && number ? { series, set, number } : null;
}
