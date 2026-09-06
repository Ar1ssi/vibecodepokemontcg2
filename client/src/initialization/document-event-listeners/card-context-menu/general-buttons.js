import {
  hideShortcut,
  revealShortcut,
} from '../../../actions/general/reveal-and-hide.js';
import {
  moveToBoard,
  moveToDeckBottom,
  moveToDeckTop,
  shuffleIntoDeck,
  switchWithDeckTop,
} from '../../../actions/zones/deck-actions.js';
import {
  mouseClick,
  systemState,
} from '../../../state.js';
import { manualDeckActionAllowed } from '../../../setup/rules/rules-state.mjs';
import { appendMessage } from '../../../setup/chatbox/append-message.js';

// Gate a manual (human-triggered) deck action through the rules layer.
function gate(actionKey, initiator) {
  const check = manualDeckActionAllowed(actionKey);
  if (!check.allowed) {
    appendMessage(initiator, '⛔ ' + check.reason, 'announcement', false);
    return false;
  }
  return true;
}

export const initializeGeneralButtons = () => {
  const moveToTopButton = document.getElementById('moveToTopButton');
  moveToTopButton.addEventListener('click', () => {
    if (!gate('moveToDeck', systemState.initiator)) return;
    moveToDeckTop(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const moveToBottomButton = document.getElementById('moveToBottomButton');
  moveToBottomButton.addEventListener('click', () => {
    if (!gate('moveToDeck', systemState.initiator)) return;
    moveToDeckBottom(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const switchWithTopButton = document.getElementById('switchWithTopButton');
  switchWithTopButton.addEventListener('click', () => {
    if (!gate('switchWithDeck', systemState.initiator)) return;
    switchWithDeckTop(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const shuffleIntoDeckButton = document.getElementById(
    'shuffleIntoDeckButton'
  );
  shuffleIntoDeckButton.addEventListener('click', () => {
    if (!gate('moveToDeck', systemState.initiator)) return;
    shuffleIntoDeck(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const moveToBoardButton = document.getElementById('moveToBoardButton');
  moveToBoardButton.addEventListener('click', () =>
    moveToBoard(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex
    )
  );

  const revealHideButton = document.getElementById('revealHideButton');
  revealHideButton.addEventListener('click', () => {
    if (
      [
        systemState.cardBackSrc,
        systemState.p1OppCardBackSrc,
        systemState.p2OppCardBackSrc,
      ].includes(mouseClick.card.image.src)
    ) {
      revealShortcut(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex
      );
    } else {
      hideShortcut(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex
      );
    }
  });
};
