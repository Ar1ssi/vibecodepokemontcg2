import { mouseClick, systemState } from '../../../state.js';

// True when the right-clicked card shows any player's card back.
export const clickedCardIsFaceDown = () =>
  [
    systemState.cardBackSrc,
    systemState.p1OppCardBackSrc,
    systemState.p2OppCardBackSrc,
  ].includes(mouseClick.card.image.src);
