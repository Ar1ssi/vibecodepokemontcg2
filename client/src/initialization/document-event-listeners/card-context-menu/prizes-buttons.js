import {
  hideCards,
  lookAtCards,
  revealCards,
  stopLookingAtCards,
} from '../../../actions/general/reveal-and-hide.js';
import { shufflePrizesToDeckBottom } from '../../../actions/zones/prizes-actions.js';
import { shuffleZone } from '../../../actions/zones/shuffle-zone.js';
import { mouseClick, systemState } from '../../../state.js';
import { gate } from './manual-deck-gate.js';
import { clickedCardIsFaceDown } from './face-down-card.js';

export const initializePrizesButtons = () => {
  const shufflePrizesButton = document.getElementById('shufflePrizesButton');
  shufflePrizesButton.addEventListener('click', () => {
    shuffleZone(mouseClick.cardUser, systemState.initiator, 'prizes');
  });

  const lookPrizesButton = document.getElementById('lookPrizesButton');
  lookPrizesButton.addEventListener('click', () => {
    if (clickedCardIsFaceDown()) {
      lookAtCards(mouseClick.cardUser, systemState.initiator, 'prizes');
    } else {
      stopLookingAtCards(mouseClick.cardUser, systemState.initiator, 'prizes');
    }
  });

  const revealHidePrizesButton = document.getElementById(
    'revealHidePrizesButton'
  );
  revealHidePrizesButton.addEventListener('click', () => {
    if (clickedCardIsFaceDown()) {
      revealCards(mouseClick.cardUser, systemState.initiator, 'prizes');
    } else {
      hideCards(mouseClick.cardUser, systemState.initiator, 'prizes');
    }
  });

  const shufflePrizesToDeckBottomButton = document.getElementById(
    'shufflePrizesToDeckBottomButton'
  );
  shufflePrizesToDeckBottomButton.addEventListener('click', () => {
    if (!gate('moveToDeck', systemState.initiator)) return;
    shufflePrizesToDeckBottom(mouseClick.cardUser, systemState.initiator);
  });
};
