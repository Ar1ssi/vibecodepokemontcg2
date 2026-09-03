import {
  draw,
  handleViewButtonClick,
} from '../../../actions/zones/deck-actions.js';
import { shuffleAll } from '../../../actions/zones/general.js';
import { mouseClick, systemState } from '../../../front-end.js';
import { manualDeckActionAllowed } from '../../../setup/rules/rules-state.mjs';
import { appendMessage } from '../../../setup/chatbox/append-message.js';

// Gate a manual (human-triggered) deck action through the rules layer.
// Parsed card-effect flows call the shared action functions directly.
function gate(actionKey, initiator) {
  const check = manualDeckActionAllowed(actionKey);
  if (!check.allowed) {
    appendMessage(initiator, '⛔ ' + check.reason, 'announcement', false);
    return false;
  }
  return true;
}

export const initializeDeckButtons = () => {
  const shuffleDeckButton = document.getElementById('shuffleDeckButton');
  shuffleDeckButton.addEventListener('click', () => {
    if (!gate('shuffleDeck', systemState.initiator)) return;
    shuffleAll(mouseClick.cardUser, systemState.initiator, 'deck');
  });

  const drawButton = document.getElementById('drawButton');
  drawButton.addEventListener('click', () => {
    if (!gate('draw', systemState.initiator)) return;
    draw(mouseClick.cardUser, systemState.initiator);
  });

  const viewTopButton = document.getElementById('viewTopButton');
  viewTopButton.addEventListener('click', () => {
    if (!gate('viewDeck', systemState.initiator)) return;
    handleViewButtonClick(mouseClick.cardUser, systemState.initiator, true);
  });

  const viewBottomButton = document.getElementById('viewBottomButton');
  viewBottomButton.addEventListener('click', () => {
    if (!gate('viewDeck', systemState.initiator)) return;
    handleViewButtonClick(mouseClick.cardUser, systemState.initiator, false);
  });
};
