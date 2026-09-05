import {
  stopLookingAtCards,
  playRandomCardFaceDown,
  lookAtCards,
} from '../../../actions/general/reveal-and-hide.js';
import {
  discardAndDraw,
  shuffleAndDraw,
  shuffleBottomAndDraw,
} from '../../../actions/zones/hand-actions.js';
import { mouseClick, systemState } from '../../../state.js';
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

export const initializeHandButtons = () => {
  const lookHandButton = document.getElementById('lookHandButton');
  lookHandButton.addEventListener('click', () => {
    if (
      [
        systemState.cardBackSrc,
        systemState.p1OppCardBackSrc,
        systemState.p2OppCardBackSrc,
      ].includes(mouseClick.card.image.src)
    ) {
      lookAtCards(mouseClick.cardUser, systemState.initiator, 'hand');
    } else {
      stopLookingAtCards(mouseClick.cardUser, systemState.initiator, 'hand');
    }
  });

  const randomHandButton = document.getElementById('randomHandButton');
  randomHandButton.addEventListener('click', () =>
    playRandomCardFaceDown(mouseClick.cardUser, systemState.initiator)
  );

  const discardHandButton = document.getElementById('discardHandButton');
  discardHandButton.addEventListener('click', () => {
    if (!gate('discardAndDraw', systemState.initiator)) return;
    discardAndDraw(mouseClick.cardUser, systemState.initiator);
  });

  const shuffleHandButton = document.getElementById('shuffleHandButton');
  shuffleHandButton.addEventListener('click', () => {
    if (!gate('shuffleAndDraw', systemState.initiator)) return;
    shuffleAndDraw(mouseClick.cardUser, systemState.initiator);
  });

  const shuffleHandBottomButton = document.getElementById(
    'shuffleHandBottomButton'
  );
  shuffleHandBottomButton.addEventListener('click', () => {
    if (!gate('shuffleBottomAndDraw', systemState.initiator)) return;
    shuffleBottomAndDraw(mouseClick.cardUser, systemState.initiator);
  });
};
