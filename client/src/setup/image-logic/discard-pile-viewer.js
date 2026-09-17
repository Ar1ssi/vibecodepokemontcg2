import { getZone } from '../zones/get-zone.js';
import {
  getAuthoritativeZoneArray,
  hasAuthoritativeView,
} from '../netcode/apply-view.js';
import { isAuthoritativeDispatchActive } from '../netcode/authoritative-dispatch.js';
import {
  closeCardPicker,
  getCardPickerMode,
  isCardPickerOpen,
  openCarouselViewer,
} from './card-picker.js';
import { resolveViewerIndex, toViewerCards } from './discard-pile-source.mjs';

export const isDiscardPileViewerOpen = () =>
  isCardPickerOpen() && getCardPickerMode() === 'browse';

export const closeDiscardPileViewer = (event) => {
  if (getCardPickerMode() === 'browse') {
    closeCardPicker(event);
  }
};

/**
 * I57: the discard pile of a server-drawn board lives in the authoritative view, not in the
 * legacy zone array (which stays empty there), so the viewer reads whichever source is live.
 *
 * @param {string} user 'self' | 'opp'
 * @returns {object[]} cards the picker can render, bottom of the pile first
 */
const discardPileCards = (user) => {
  if (isAuthoritativeDispatchActive() && hasAuthoritativeView()) {
    return toViewerCards(
      getAuthoritativeZoneArray(user === 'self' ? 'you' : 'them', 'discard')
    );
  }
  return getZone(user, 'discard').array;
};

/**
 * @param {string} user 'self' | 'opp'
 * @param {number|null} [startIndex] zone index to open on
 * @param {number|null} [instanceId] server id of the clicked card, when there is one
 */
export const openDiscardPileViewer = async (
  user,
  startIndex = null,
  instanceId = null
) => {
  const cards = discardPileCards(user);
  const initialIndex = resolveViewerIndex(cards, { startIndex, instanceId });
  if (initialIndex < 0) return;

  await openCarouselViewer({
    title: 'Discard Pile',
    candidates: cards,
    initialIndex,
  });
};
