import {
  draw,
  handleViewButtonClick,
} from '../../../actions/zones/deck-actions.js';
import { shuffleAll } from '../../../actions/zones/general.js';
import { mouseClick, systemState } from '../../../state.js';
import { gate } from './manual-deck-gate.js';

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
