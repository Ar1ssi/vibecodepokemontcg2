import { getZone } from '../zones/get-zone.js';
import {
  closeCardPicker,
  getCardPickerMode,
  isCardPickerOpen,
  openCarouselViewer,
} from './card-picker.js';

export const isDiscardPileViewerOpen = () =>
  isCardPickerOpen() && getCardPickerMode() === 'browse';

export const closeDiscardPileViewer = (event) => {
  if (getCardPickerMode() === 'browse') {
    closeCardPicker(event);
  }
};

export const openDiscardPileViewer = async (user, startIndex = null) => {
  const zone = getZone(user, 'discard');
  const cards = zone.array;
  if (!cards.length) return;

  const initialIndex =
    startIndex == null
      ? cards.length - 1
      : Math.max(0, Math.min(startIndex, cards.length - 1));

  await openCarouselViewer({
    title: 'Discard Pile',
    candidates: cards,
    initialIndex,
  });
};
