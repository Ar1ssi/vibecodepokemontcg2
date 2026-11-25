/**
 * Positions and sizes a damage counter on its card. Pure geometry: it never touches the card's
 * damage, so a window resize can re-run it without rewriting the model.
 *
 * @param {HTMLElement} damageCounter
 * @param {{left: number, top: number, width: number, height: number}} cardRect
 * @param {{left: number, top: number}} zoneRect
 * @param {boolean} hidden - the card is in full view, which draws its own counters
 */
export const layoutDamageCounter = (
  damageCounter,
  cardRect,
  zoneRect,
  hidden
) => {
  const circleSize = `${cardRect.width / 3}px`;
  damageCounter.style.display = hidden ? 'none' : 'inline-block';
  damageCounter.style.left = `${cardRect.left - zoneRect.left + cardRect.width / 1.5}px`;
  damageCounter.style.top = `${cardRect.top - zoneRect.top + cardRect.height / 4}px`;
  damageCounter.style.width = circleSize;
  damageCounter.style.height = circleSize;
  damageCounter.style.lineHeight = circleSize;
  damageCounter.style.fontSize = `${cardRect.width / 6}px`;
  damageCounter.style.zIndex = '1';
};
