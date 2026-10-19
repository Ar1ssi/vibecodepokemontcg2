import { systemState } from '../../state.js';

export const determineDeckData = (user) => {
  let deckData;
  if (user === 'self') {
    deckData = systemState.selfDeckData;
  } else {
    // A solo room's far deck is the solo "alt" deck (design 074 D7).
    deckData =
      !systemState.isTwoPlayer || systemState.solo
        ? systemState.p1OppDeckData
        : systemState.p2OppDeckData;
  }
  return deckData;
};
