import { getZone } from '../zones/get-zone.js';
import {
  closeCardPicker,
  isCardPickerOpen,
  openCarouselViewer,
} from './card-picker.js';

export const isDiscardPileViewerOpen = isCardPickerOpen;

export const closeDiscardPileViewer = (event) => {
  closeCardPicker(event);
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
