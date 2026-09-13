/**
 * Helper logic for openMatPick in trainer-execution.js.
 * Handles DOM target resolution and click hit-testing for cards on the mat.
 *
 * When a card in play is holo-hydrated, card.image (the bare <img>) is nested
 * inside .mat-holo > .card__rotator, layered under .card__shine and .card__glare.
 * Clicking the card in the browser hits the shine/glare/rotator layer or the
 * surrounding .play-container, NOT the <img> directly.
 */

export function buildMatPickEntry(card, imageAnchorFn = null) {
  const img = card?.image || null;
  const anchor = imageAnchorFn
    ? imageAnchorFn(img)
    : (img?.parentElement?.closest?.('.mat-holo') ?? img);
  const targetEl = anchor || card?.wrapper || img;
  const container =
    img?.closest?.('.play-container') ||
    targetEl?.closest?.('.play-container') ||
    null;
  return { card, img, targetEl, container };
}

export function findMatPickHit(entries, eventTarget) {
  if (!entries || !eventTarget) return null;
  const hit = entries.find(
    (e) =>
      e.targetEl === eventTarget ||
      e.targetEl?.contains?.(eventTarget) ||
      e.img === eventTarget ||
      e.img?.contains?.(eventTarget) ||
      (e.container && (e.container === eventTarget || e.container.contains?.(eventTarget))) ||
      (eventTarget?.card && eventTarget.card === e.card) ||
      (eventTarget?.closest?.('.play-container') && e.container && eventTarget.closest('.play-container') === e.container)
  );
  return hit?.card || null;
}
