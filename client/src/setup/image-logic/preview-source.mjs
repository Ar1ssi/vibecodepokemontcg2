/**
 * @file Hide/restore of the board card a floating preview grows out of.
 *
 * The preview pops a clone over the card and hides the real one so two copies
 * never show. Whoever hides it must also restore it: the attack/ability
 * preview once hid the card and relied on a caller-supplied `onClosed` that
 * never un-hid it, leaving the card invisible on that client for the rest of
 * the game while the opponent still saw it.
 *
 * Pure and DOM-free (only touches `style.visibility`) so it runs under `node --test`.
 */

/**
 * @param {{ style: { visibility: string } }|null} sourceEl
 * @returns {() => void} restores the element's visibility; safe to call more than once
 */
export function hidePreviewSource(sourceEl) {
  if (!sourceEl?.style) return () => {};
  const previous = sourceEl.style.visibility === 'hidden' ? '' : sourceEl.style.visibility;
  sourceEl.style.visibility = 'hidden';
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    sourceEl.style.visibility = previous;
  };
}
