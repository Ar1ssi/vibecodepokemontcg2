import { openCarouselViewer } from './card-picker.js';
import { orderAttachedForCarousel } from './carousel-order.mjs';

// Attached Energy is rendered on the mat as a small round token (attach-card.js swaps image.src to
// the icon and stashes the full card art in dataset.energyCardSrc) — show the real card art in the
// carousel slide, then revert automatically since we never touch the board's own <img>, just a
// read-only stand-in object here.
export const attachedSlidesOf = (card) =>
  (card?.attachedCards || []).map((attached) => {
    const fullArtSrc = attached.image?.dataset?.energyCardSrc;
    return fullArtSrc ? { ...attached, image: { src: fullArtSrc } } : attached;
  });

/**
 * A card and its attached Energy/Tools in the carousel (PTCG Live-style): slide N sits to the
 * right of slide N+1, so the attached cards go before the card, which the viewer opens on.
 * Read-only: dragging one out means closing first.
 *
 * @param {object} card a preview card (`resolvePreviewCard`) with `.attachedCards`
 */
export const openAttachedCardsCarousel = (card) => {
  const attachedSlides = attachedSlidesOf(card);
  return openCarouselViewer({
    title: card?.name || 'Attached Cards',
    candidates: [...orderAttachedForCarousel(attachedSlides), card],
    initialIndex: attachedSlides.length,
  });
};
