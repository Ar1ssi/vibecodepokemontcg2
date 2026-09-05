import { closePopups } from '../../actions/general/close-popups.js';
import { moveCardBundle } from '../../actions/move-card-bundle/move-card-bundle.js';
import { moveToDeckTop } from '../../actions/zones/deck-actions.js';
import {
  mouseClick,
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { getZone } from '../zones/get-zone.js';
import { fullViewHost } from '../deck-constructor/hydrate-holo.js';
import { identifyCard } from './click-events.js';
import { findZoneCardIndex } from './zone-card-lookup.js';
import { appendMessage } from '../chatbox/append-message.js';

const popupContainers = [
  'lostZone',
  'discard',
  'deck',
  'attachedCards',
  'viewCards',
];

const ZONE_SELECTOR =
  '#deck, #hand, #active, #bench, #prizes, #discard, #lostZone';
const zoneOf = (el) => el?.closest?.(ZONE_SELECTOR);

export const dragStart = (event) => {
  if (systemState.isReplay && !systemState.isTwoPlayer) {
    return;
  }
  event.target.classList.add('high-zIndex');
  if (event.target.attached) {
    event.target.style.opacity = '0';
  } else {
    event.target.style.opacity = '0.6';
  }
  if (!event.target.attached) {
    event.target.parentElement.querySelectorAll('img').forEach((image) => {
      if (image.attached) {
        image.style.opacity = '0.2';
      }
    });
  }

  closePopups(event);
  identifyCard(event);

  event.target.classList.add('dragging');

  if (popupContainers.includes(mouseClick.zoneId)) {
    getZone(mouseClick.cardUser, mouseClick.zoneId).element.style.opacity = '0';
  }
  const dragHost = fullViewHost(event.target);
  if (dragHost?.classList.contains('full-view')) {
    mouseClick.playContainer = dragHost;
    mouseClick.playContainerParent = dragHost.parentElement;
    mouseClick.playContainer.style.opacity = '0';
  }
};

export const dragOver = (event) => {
  if (systemState.isReplay && !systemState.isTwoPlayer) {
    return;
  }
  event.preventDefault();
  const blockedClasses = ['self-circle', 'opp-circle', 'self-tab', 'opp-tab']; //need to turn off pointerevents for these to allow the drop to be triggered from card images
  if (
    blockedClasses.some((className) =>
      event.target.classList.contains(className)
    )
  ) {
    event.target.style.pointerEvents = 'none';
  }
  if (popupContainers.includes(mouseClick.zoneId)) {
    getZone(mouseClick.cardUser, mouseClick.zoneId).element.style.zIndex = '-2';
  }
  if (event.target.classList.contains('full-view')) {
    mouseClick.playContainer.style.zIndex = '-1';
    mouseClick.playContainerParent.style.zIndex = '-1';
  }
  let draggedImage =
    document.querySelector('.dragging') ||
    selfContainerDocument.querySelector('.dragging') ||
    oppContainerDocument.querySelector('.dragging');

  const targetIsNotOwnContainer = event.target !== zoneOf(draggedImage);
  const targetIsContainer = event.target.tagName === 'DIV';
  const cardIsAttached = draggedImage.attached;
  const targetIsActiveOrBench = ['active', 'bench'].includes(event.target.id);
  const targetParentIsActiveOrBench = ['active', 'bench'].includes(
    zoneOf(event.target)?.id
  );
  const targetNotItself = event.target !== draggedImage;
  const targetIsAttached = event.target.attached;
  const cardIsFromActiveOrBench = ['active', 'bench'].includes(
    zoneOf(draggedImage)?.id
  );
  const targetParentParentIsNotOwnContainer =
    zoneOf(event.target) !== zoneOf(draggedImage);

  const movingValidCardToContainer =
    targetIsContainer &&
    targetIsNotOwnContainer &&
    (!cardIsAttached || !targetIsActiveOrBench);
  const attachingValidCard =
    targetParentIsActiveOrBench &&
    targetNotItself &&
    !targetIsAttached &&
    (targetParentParentIsNotOwnContainer || cardIsAttached);
  const targetIsNotPlayContainer =
    !event.target.classList.contains('full-view') &&
    !event.target.classList.contains('play-container');

  if (
    targetIsNotPlayContainer &&
    (movingValidCardToContainer || attachingValidCard)
  ) {
    if (event.target.id === 'board') {
      event.target.classList.add('highlightBox');
    } else {
      event.target.classList.add('highlight');
    }
  }

  const targetParentIsNotOwnContainer =
    zoneOf(event.target) !== zoneOf(draggedImage);
  const targetParentIsContainer = zoneOf(event.target) !== null;

  if (
    targetIsNotPlayContainer &&
    targetParentIsContainer &&
    (!targetParentIsActiveOrBench ||
      (cardIsFromActiveOrBench && !cardIsAttached))
  ) {
    if (
      targetParentIsActiveOrBench &&
      cardIsFromActiveOrBench &&
      targetParentParentIsNotOwnContainer
    ) {
      zoneOf(event.target)?.classList.add('highlightBox');
    } else if (!targetParentIsActiveOrBench && targetParentIsNotOwnContainer) {
      const zone = zoneOf(event.target);
      if (zone?.parentElement?.id === 'board') {
        zone.classList.add('highlightBox');
      } else if (zone) {
        zone.classList.add('highlight');
      }
    }
  }
};

export const dragLeave = (event) => {
  event.target.classList.remove('highlight', 'highlightBox');
  zoneOf(event.target)?.classList.remove('highlight', 'highlightBox');
  event.target.parentElement?.classList.remove('highlight', 'highlightBox');
};

export const dragEnd = (event) => {
  const enablePointerEvents = (containerDocument, classNames) => {
    const counters = containerDocument.getElementsByClassName(...classNames);
    for (let i = 0; i < counters.length; i++) {
      counters[i].style.pointerEvents = 'auto';
    }
  };

  const classList = ['self-circle', 'opp-circle', 'self-tab', 'opp-tab'];
  enablePointerEvents(selfContainerDocument, classList);
  enablePointerEvents(oppContainerDocument, classList);

  event.target.classList.remove('dragging');
  zoneOf(event.target)?.classList.remove('highlight', 'highlightBox');
  event.target.parentElement?.classList.remove('highlight', 'highlightBox');

  event.target.classList.remove('high-zIndex');
  event.target.style.opacity = '1';
  if (event.target.parentElement) {
    event.target.parentElement.querySelectorAll('img').forEach((image) => {
      if (image.attached) {
        image.style.opacity = '1';
      }
    });
  }

  if (popupContainers.includes(mouseClick.zoneId)) {
    getZone(mouseClick.cardUser, mouseClick.zoneId).element.style.opacity = '1';
    getZone(mouseClick.cardUser, mouseClick.zoneId).element.style.zIndex =
      '9999';
  }
  if (mouseClick.playContainer) {
    mouseClick.playContainer.style.opacity = '1';
    mouseClick.playContainer.style.zIndex = '2';
    mouseClick.playContainerParent.style.zIndex = mouseClick.playContainer
      .parentElement
      ? '2'
      : '0';
    document.getElementById('stadium').style.zIndex = mouseClick.playContainer
      .parentElement
      ? '-1'
      : '0'; //crucial line to bring stadium z-index back to 0 if the pokemon is completely put out of play
    mouseClick.playContainer = false;
    mouseClick.playContainerParent = false;
  }
};

export const drop = (event) => {
  event.preventDefault();

  const blockedClasses = ['self-circle', 'opp-circle', 'self-tab', 'opp-tab'];
  if (
    blockedClasses.some((className) =>
      event.target.classList.contains(className)
    )
  ) {
    event.target.style.pointerEvents = 'none';
  }

  event.target.classList.remove('highlight', 'highlightBox');
  zoneOf(event.target)?.classList.remove('highlight', 'highlightBox');
  event.target.parentElement?.classList.remove('highlight', 'highlightBox');

  let draggedImage =
    document.querySelector('.dragging') ||
    selfContainerDocument.querySelector('.dragging') ||
    oppContainerDocument.querySelector('.dragging');
  //reset opacity of attached cards
  draggedImage.parentElement.querySelectorAll('img').forEach((image) => {
    if (image.attached) {
      image.style.opacity = '1';
    }
  });

  const targetIsNotPlayContainer =
    !event.target.classList.contains('full-view') &&
    !event.target.classList.contains('play-container');
  const notSpectator = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );

  //make sure only card images can trigger drop (that's why we check for a unique property called layer);
  if (
    notSpectator &&
    targetIsNotPlayContainer &&
    draggedImage.layer !== undefined &&
    (!event.target.attached || event.target.tagName === 'DIV')
  ) {
    let dZoneId;
    let targetIndex;
    // if target image exists and it isn't itself
    if (
      event.target.tagName === 'IMG' &&
      event.target !== draggedImage[0] &&
      ['active', 'bench'].includes(zoneOf(event.target)?.id)
    ) {
      dZoneId = zoneOf(event.target)?.id;
      targetIndex = findZoneCardIndex(
        getZone(event.target.user, dZoneId),
        event.target
      );
    } else if (event.target.tagName === 'IMG') {
      dZoneId = zoneOf(event.target)?.id;
    } else {
      dZoneId = event.target.id;
    }

    if (
      (mouseClick.zoneId !== dZoneId || draggedImage.attached) &&
      (!draggedImage.attached ||
        !['active', 'bench'].includes(dZoneId) ||
        targetIndex !== undefined)
    ) {
      if (dZoneId === 'deckCover') {
        // Gate the manual deck drop through the rules layer.
        const deckCheck = manualDeckActionAllowed('moveToDeck');
        if (!deckCheck.allowed) {
          appendMessage(
            systemState.initiator,
            '⛔ ' + deckCheck.reason,
            'announcement',
            false
          );
        } else {
        moveToDeckTop(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          mouseClick.cardIndex
        );
        }
      } else {
        moveCardBundle(
          mouseClick.cardUser,
          systemState.initiator,
          mouseClick.zoneId,
          dZoneId,
          mouseClick.cardIndex,
          targetIndex,
          'move'
        );
      }
    }
  }
  event.stopPropagation();
};
