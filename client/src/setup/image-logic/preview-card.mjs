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
 * Pure and DOM-free so it runs under `node --test`.
 */

// The clicked target may be the card <img> itself or a layer of the holo
// wrapper around it; either way, find the <img> carrying the card data.
const stampedImageOf = (target) => {
  if (!target) return null;
  if (target.card) return target;
  const holoImage = target.closest?.('.mat-holo')?.querySelector?.('img');
  return holoImage?.card ? holoImage : null;
};

// A face-down card reaches the client with neither a name nor art.
const isRedacted = (cardData) => !cardData?.name && !cardData?.src;

export const resolvePreviewCard = (legacyCard, target) => {
  if (legacyCard?.image) return legacyCard;

  const image = stampedImageOf(target);
  if (!image || isRedacted(image.card)) return null;
  return { ...image.card, image, user: image.user };
};
