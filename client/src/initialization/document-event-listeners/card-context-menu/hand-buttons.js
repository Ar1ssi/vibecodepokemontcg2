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
import { dispatchServerRandomFaceDown } from '../../../setup/netcode/manual-card-dispatch.js';
import { mouseClick, systemState } from '../../../state.js';
import { gate } from './manual-deck-gate.js';
import { clickedCardIsFaceDown } from './face-down-card.js';

export const initializeHandButtons = () => {
  const lookHandButton = document.getElementById('lookHandButton');
  lookHandButton.addEventListener('click', () => {
    if (clickedCardIsFaceDown()) {
      lookAtCards(mouseClick.cardUser, systemState.initiator, 'hand');
    } else {
      stopLookingAtCards(mouseClick.cardUser, systemState.initiator, 'hand');
    }
  });

  const randomHandButton = document.getElementById('randomHandButton');
  randomHandButton.addEventListener('click', () => {
    if (dispatchServerRandomFaceDown(mouseClick.cardUser)) return;
    playRandomCardFaceDown(mouseClick.cardUser, systemState.initiator);
  });

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
