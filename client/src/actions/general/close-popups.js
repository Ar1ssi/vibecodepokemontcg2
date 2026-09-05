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
  popHostFor,
  makePopFrame,
} from '../../setup/image-logic/card-pop.mjs';

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
    // Primary (non-attached) image, used both for the width revert and to pick
    // the deselect-pop transform host (holo wrapper vs. the .full-view container).
    const targetImage = Array.from(
      fullViewElement.querySelectorAll('img')
    )
      .filter((image) => !image.attached)[0];

    const revert = () => {
      // If this was a holo card, hand the shine back to the auto-sweep before
      // the container's classes/inline sizing revert.
      const matHoloWrapper = fullViewElement.closest('.mat-holo');
      if (matHoloWrapper) {
        startHoloAnimation(matHoloWrapper, { auto: true });
      }
      // Revert the styles
      fullViewElement.classList.remove('full-view', 'dark-mode-5');
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
    if (targetImage) {
      playDeselectPop(popHostFor(targetImage), makePopFrame(targetImage), revert);
    } else {
      revert();
    }
  }
};

export const closePopups = (event) => {
  deselectCard();
  closeFullView(event);
  hideZoneElementsIfEmpty(event);
  document.getElementById('cardContextMenu').style.display = 'none';
};
