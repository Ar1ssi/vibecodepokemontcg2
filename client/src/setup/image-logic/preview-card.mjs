/**
 * The card a double-click preview should show.
 *
 * Legacy-rendered cards are found through the per-player zone arrays
 * (`mouseClick.card`). In a server-authoritative game those arrays are never
 * populated — `apply-view.js` renders straight from server views and stamps
 * the card's data on the <img> as `img.card` instead — so the legacy lookup
 * comes back empty and the preview used to silently do nothing. This falls
 * back to that stamped data, paired with the clicked <img>, which is all the
 * preview needs (art, name, holo effect, owning side).
 *
 * The click does not always land on the card itself. Damage counters,
 * special-condition markers and "ability used" tabs are <div>s appended to the
 * ZONE element (`reconcileDamageOverlay` in apply-view.js, `addDamageCounter`
 * in actions/counters) and absolutely positioned on top of the card, so a
 * double-click on a damaged Pokémon targets a counter and finds no stamped
 * <img>. Both renderers keep a back-reference on the card it marks
 * (`img.damageCounter` / `.specialCondition` / `.abilityCounter`), which is how
 * those clicks resolve back to their card.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

import { zoneOf } from './drop-zone.mjs';

// The slot each renderer stores a created overlay element in, on the card it
// is drawn over.
const OVERLAY_SLOTS = ['damageCounter', 'specialCondition', 'poisonMarker', 'burnMarker', 'abilityCounter'];

const imagesIn = (element) => Array.from(element?.querySelectorAll?.('img') ?? []);

// The card a counter overlay belongs to, matched by element identity rather
// than geometry: the overlay is a sibling inside the zone and the card keeps
// the only reference to it.
const owningImageOf = (target) =>
  imagesIn(target?.parentElement).find((image) =>
    OVERLAY_SLOTS.some((slot) => image[slot] === target)
  ) ?? null;

// A click on zone decoration (a mat plate, the empty slot itself) in a zone
// holding exactly one card. Several cards is a guess, so it stays unresolved.
const loneImageOfZone = (target) => {
  const images = imagesIn(zoneOf(target));
  return images.length === 1 ? images[0] : null;
};

// The clicked target may be the card <img> itself or a layer of the holo
// wrapper around it; either way, find the <img> carrying the card data.
const stampedImageOf = (target) => {
  if (!target) return null;
  if (target.card) return target;
  const holoImage = target.closest?.('.mat-holo')?.querySelector?.('img');
  if (holoImage?.card) return holoImage;
  for (const candidate of [owningImageOf(target), loneImageOfZone(target)]) {
    if (candidate?.card) return candidate;
  }
  return null;
};

// A face-down card reaches the client with neither a name nor art.
const isRedacted = (cardData) => !cardData?.name && !cardData?.src;

export const resolvePreviewCard = (legacyCard, target) => {
  if (legacyCard?.image) return legacyCard;

  const image = stampedImageOf(target);
  if (!image || isRedacted(image.card)) return null;
  // The foil wrapper (with its fetched rarity) lives around the <img>, not on img.card;
  // without it the preview rebuilds the card as a plain, foil-less image.
  const wrapper = image.closest?.('.mat-holo') ?? undefined;
  return { ...image.card, image, user: image.user, wrapper };
};
