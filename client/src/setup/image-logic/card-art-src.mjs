/**
 * @file The one place that answers "where does this card's art live?".
 *
 * Two card shapes reach the picker and they do not carry the URL the same way.
 * Legacy cards (`deck-constructor/card.js`) hold a built `<img>` in `image`.
 * A card that crossed the netcode boundary is a pure engine card instead:
 * `createCard` strips `image` on purpose (shared/engine/cards.mjs, Invariant 8 /
 * H2 — no DOM references in the engine) and keeps the URL as a bare `src`
 * string. Resolving from `image` alone left every authoritative slide with an
 * empty `src`, which is what the Starting Active carousel showed (PR #150).
 */

/**
 * @param {object|null|undefined} card legacy DOM card, pure engine card, or viewer candidate
 * @returns {string} image URL, or '' when the card carries none
 */
export function cardArtSrc(card) {
  if (!card) return '';
  if (card.image?.src) return card.image.src;
  if (typeof card.image === 'string') return card.image;
  return card.src || card.images?.small || '';
}
