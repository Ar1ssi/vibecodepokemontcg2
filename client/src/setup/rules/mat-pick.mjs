/**
 * Helper logic for openMatPick in mat-picker.js.
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
  // Identical copies stacked in the hand share one click target (`stackKey`, see planMatToggle).
  return { card, img, targetEl, container, stackKey: card?.stackKey ?? null };
}

/**
 * What a click on `card` does to a multi-pick. A click on a card that is not picked picks it (while
 * the pick has room). A click on a picked card un-picks it, except that copies stacked in the hand
 * sit on one click target, so there it picks the next unpicked copy until the pick is full: without
 * that, the second copy of a stack could never be chosen. Pure.
 * @returns {{ add: any|null, remove: any|null }} the card to pick and the card to un-pick
 */
export function planMatToggle(entries, selected, card, maxCount) {
  const entry = (entries || []).find((e) => e.card === card);
  if (!entry) return { add: null, remove: null };
  if (!selected.has(card)) return selected.size >= maxCount ? { add: null, remove: null } : { add: card, remove: null };
  const copy =
    entry.stackKey && selected.size < maxCount
      ? entries.find((e) => e.stackKey === entry.stackKey && !selected.has(e.card))
      : null;
  return copy ? { add: copy.card, remove: null } : { add: null, remove: card };
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
