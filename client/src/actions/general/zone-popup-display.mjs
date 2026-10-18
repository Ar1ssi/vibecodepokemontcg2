/**
 * @file What a click does to a zone list popup's `display` (close-popups.js
 * hideZoneElementsIfEmpty). Pure, so it runs under `node --test`.
 *
 * The pile viewers (deck, discard, Lost Zone) close on an outside click and whenever they are
 * empty. "Empty" counts the cards the zone renders as well as its legacy array: under server
 * authority the arrays are never filled (design 002 I24), so the array alone closed a Lost Zone
 * viewer in the same click that opened it. The look/move panels (viewCards, attachedCards) stay
 * open on outside clicks while their legacy array holds cards (their legacy flows fill it).
 */

const STICKY_ZONES = ['attachedCards', 'viewCards'];

/**
 * @param {{ zoneId: string, arrayCount: number, renderedCount: number, outsideClick: boolean }} input
 * @returns {'none'|'block'|null} the display to set, or null to leave it as it is
 */
export function zonePopupDisplay({ zoneId, arrayCount, renderedCount, outsideClick }) {
  const sticky = STICKY_ZONES.includes(zoneId);
  const count = sticky
    ? Number(arrayCount) || 0
    : Math.max(Number(arrayCount) || 0, Number(renderedCount) || 0);
  if (count === 0) return 'none';
  if (sticky) return 'block';
  return outsideClick ? 'none' : null;
}
