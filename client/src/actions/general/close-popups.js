import {
  mouseClick,
  oppContainerDocument,
  selfContainerDocument,
} from '../../front-end.js';
import { refreshBoard } from '../../setup/sizing/refresh-board.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { startHoloAnimation } from '../../setup/deck-builder/core/holo.mjs';
import {
  playDeselectPop,
  makePopFrame,
} from '../../setup/image-logic/card-pop.mjs';
import {
  closeCardPreview,
  isCardPreviewOpen,
} from '../../setup/image-logic/full-view.js';

export const hideZoneElements = () => {
  const zonesToHide = [
    'deck',
    'discard',
    'attachedCards',
    'viewCards',
    'lostZone',
  ];

  zonesToHide.forEach((zoneId) => {
    selfContainerDocument.getElementById(zoneId).style.display = 'none';
    oppContainerDocument.getElementById(zoneId).style.display = 'none';
  });
};

const isOutsideZoneClick = (event, zone) => {
  if (!event) {
    return false;
  } else if (zone.element.contains(event.target)) {
    return false;
  } else if (zone.elementCover && zone.elementCover.contains(event.target)) {
    return false;
  } else if (event.target.id && event.target.id === 'fullImage') {
    return false;
  } else if (
    event.target.parentElement &&
    event.target.parentElement.id &&
    event.target.parentElement.id === 'fullImage'
  ) {
    return false;
  }
  return true;
};

export const hideZoneElementsIfEmpty = (event) => {
  const zoneIds = ['discard', 'lostZone', 'deck', 'attachedCards', 'viewCards'];
  const users = ['self', 'opp'];

  users.forEach((user) => {
    zoneIds.forEach((zoneId) => {
      const zone = getZone(user, zoneId);
      const outsideZoneClick = isOutsideZoneClick(event, zone);
      if (
        zone.getCount() === 0 ||
        (outsideZoneClick && !['attachedCards', 'viewCards'].includes(zoneId))
      ) {
        zone.element.style.display = 'none';
      } else if (
        zone.getCount() !== 0 &&
        ['attachedCards', 'viewCards'].includes(zoneId)
      ) {
        zone.element.style.display = 'block';
      }
    });
  });
};

export const deselectCard = () => {
  if (mouseClick.card) {
    mouseClick.card.image.classList.remove('highlight');
    mouseClick.selectingCard = false;

    const users = ['self', 'opp'];
    const zoneIds = ['active', 'bench'];

    users.forEach((user) => {
      zoneIds.forEach((zoneId) => {
        getZone(user, zoneId).array.forEach((card) => {
          card.image.classList.remove('selectHighlight');
        });
      });
    });
  }
};

export const closeFullView = (event) => {
  const fullViewElement =
    selfContainerDocument.querySelector('.full-view') ||
    oppContainerDocument.querySelector('.full-view');

  if (fullViewElement && (!event || !fullViewElement.contains(event.target))) {
    //use the !event as a guard for closeFullView to trigger when using the escape keybind
    // Primary (non-attached) image, used for the container width revert.
    const targetImage = Array.from(
      fullViewElement.querySelectorAll('img')
    )
      .filter((image) => !image.attached)[0];

    const revert = () => {
      // Hand any holo shine in the container back to the auto-sweep before the
      // classes/inline sizing revert. There can be more than one wrapper here —
      // an evolution stack keeps the base card hydrated under the evolved one.
      fullViewElement
        .querySelectorAll('.mat-holo')
        .forEach((wrapper) => startHoloAnimation(wrapper, { auto: true }));
      // Revert the styles. The inline transform is the pop's, not the layout's —
      // leaving it behind would keep the container translated off its mat slot.
      fullViewElement.classList.remove('full-view', 'dark-mode-5');
      fullViewElement
        .querySelector('.full-view-card')
        ?.classList.remove('full-view-card');
      fullViewElement.style.transform = '';
      fullViewElement.style.zIndex = '';
      fullViewElement.style.height = '';

      // Revert the position of the images
      const images = fullViewElement.querySelectorAll('img');
      images.forEach((image) => {
        image.classList.remove('default-rotation');
        if (image.attached) {
          image.style.position = 'absolute';
        }
      });

      if (targetImage) {
        const currentWidth = parseFloat(targetImage.clientWidth);
        const newWidth =
          currentWidth +
          (targetImage.clientWidth / 6) * targetImage.energyLayer;
        fullViewElement.style.width = newWidth + 'px';
      }
      fullViewElement.style.zIndex = '0';

      // Revert the z-indexes
      if (fullViewElement.parentElement) {
        fullViewElement.parentElement.style.zIndex = '0';
      }
      document.getElementById('stadium').style.zIndex = '0';
      refreshBoard();
    };

    // Shrink the enlarged view back down, then revert the layout once the
    // spring settles so the deselect reads as a pop rather than a snap.
    playDeselectPop(
      fullViewElement,
      makePopFrame(fullViewElement),
      revert
    );
  }
};

export const closePopups = (event) => {
  deselectCard();
  closeCardPreview(event);
  closeFullView(event);
  hideZoneElementsIfEmpty(event);
  document.getElementById('cardContextMenu').style.display = 'none';
};
