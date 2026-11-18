import {
  boardMirror,
  oppContainerDocument,
  selfContainerDocument,
} from '../../initialization/global-variables/containers.js';
import { socket, systemState } from '../../initialization/global-variables/global-variables.js';
import { emitRequestView } from '../../setup/netcode/cmd-emitter.js';
import { refreshBoard } from '../../setup/sizing/refresh-board.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { setStadiumFacing } from '../../setup/zones/stadium-facing.mjs';
import { lookAtCards, stopLookingAtCards } from './reveal-and-hide.js';
import { applyBoardFlip } from './board-flip-state.mjs';

export const flipBoard = () => {
  // Design 074 D7: a solo room never swaps its sides; the server redraws the board from the
  // other seat (socket-event-listeners.js clears the old perspective when that view lands).
  if (systemState.solo) {
    const { requestNearSeat } = applyBoardFlip(systemState);
    emitRequestView({ socket, roomId: systemState.roomId, nearSeat: requestNearSeat });
    return;
  }
  const boardElement = selfContainerDocument.getElementById('board');
  const oppBoardElement = oppContainerDocument.getElementById('board');
  const viewCardsElement = selfContainerDocument.getElementById('viewCards');
  const oppViewCardsElement = oppContainerDocument.getElementById('viewCards');

  if (systemState.initiator === 'self') {
    if (
      systemState.isTwoPlayer ||
      (!systemState.isTwoPlayer &&
        document.getElementById('hideHandCheckbox').checked)
    ) {
      lookAtCards('opp', '', 'hand', false, true);
      stopLookingAtCards('self', '', 'hand', false, true);
    }
  } else {
    if (
      systemState.isTwoPlayer ||
      (!systemState.isTwoPlayer &&
        document.getElementById('hideHandCheckbox').checked)
    ) {
      lookAtCards('self', '', 'hand', false, true);
      stopLookingAtCards('opp', '', 'hand', false, true);
    }
  }

  viewCardsElement.classList.toggle('flip-image');
  oppViewCardsElement.classList.toggle('flip-image');

  const toggleClasses = (element, class1, class2) => {
    element.classList.toggle(class1);
    element.classList.toggle(class2);
  };

  toggleClasses(boardMirror.hosts.self, 'self', 'opp');
  toggleClasses(boardMirror.hosts.opp, 'opp', 'self');
  applyBoardFlip(systemState);
  toggleClasses(boardElement, 'self-board', 'opp-board');
  toggleClasses(oppBoardElement, 'opp-board', 'self-board');
  const colorToggledButtonIds = [
    'attackButton',
    'retreatButton',
    'healButton',
    'switchButton',
    'attachButton',
    'searchButton',
    'abilityButton',
    'energyRedirectButton',
    'undoButton',
    'FREEBUTTON',
    'p2AttackButton',
    'p2RetreatButton',
    'p2HealButton',
    'p2SwitchButton',
    'p2AttachButton',
    'p2SearchButton',
    'p2AbilityButton',
    'p2EnergyRedirectButton',
    'p2PassButton',
    'p2FREEBUTTON',
    'p2SetupButton',
    'p2ResetButton',
  ];
  // The replay board has no local Set Up / Reset buttons to recolor.
  if (!systemState.isReplay) colorToggledButtonIds.push('setupButton', 'resetButton');
  for (const buttonId of colorToggledButtonIds) {
    toggleClasses(document.getElementById(buttonId), 'self-color', 'opp-color');
  }

  const users = ['self', 'opp'];
  const textIds = [
    'deckText',
    'discardText',
    'lostZoneText',
    'handText',
    'sortHandText',
    'sortHandCheckbox',
  ];
  const zoneIds = ['deck', 'discard', 'lostZone', 'attachedCards', 'viewCards'];
  const buttonContainers = [
    'viewCardsButtonContainer',
    'attachedCardsButtonContainer',
  ];
  const headerIds = ['attachedCardsHeader', 'viewCardsHeader'];

  for (const user of users) {
    const userDocument =
      user === 'self' ? selfContainerDocument : oppContainerDocument;

    for (const textId of textIds) {
      const text = userDocument.getElementById(textId);
      text.classList.toggle('self-text');
      text.classList.toggle('opp-text');
    }
    for (const zoneId of zoneIds) {
      const element = userDocument.getElementById(zoneId);
      element.classList.toggle('self-view');
      element.classList.toggle('opp-view');
    }
    for (const buttonContainerId of buttonContainers) {
      const container = userDocument.getElementById(buttonContainerId);
      container.classList.toggle('self-zone-button-container');
      container.classList.toggle('opp-zone-button-container');
    }
    for (const headerId of headerIds) {
      const header = userDocument.getElementById(headerId);
      header.classList.toggle('self-header');
      header.classList.toggle('opp-header');
      if (header.textContent === 'Move attached cards') {
        header.textContent = 'Opponent moving cards...';
      } else if (header.textContent === 'Opponent moving cards...') {
        header.textContent = 'Move attached cards';
      }
    }
  }

  const selfCircleElements = selfContainerDocument.querySelectorAll(
    '.self-circle, .opp-circle'
  );
  const oppCircleElements = oppContainerDocument.querySelectorAll(
    '.self-circle, .opp-circle'
  );

  selfCircleElements.forEach((element) => {
    element.classList.toggle('self-circle');
    element.classList.toggle('opp-circle');
  });
  oppCircleElements.forEach((element) => {
    element.classList.toggle('self-circle');
    element.classList.toggle('opp-circle');
  });

  // Flip the stadium
  const stadiumZone = getZone('', 'stadium');
  if (stadiumZone.array[0]) {
    setStadiumFacing(
      stadiumZone.element,
      stadiumZone.array[0].image.user !== systemState.initiator
    );
  }
  refreshBoard();
};
