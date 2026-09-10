import { imageAnchor } from '../../setup/deck-constructor/hydrate-holo.js';
import { getEnergyTokenFront } from './energy-token-assets.mjs';

// this is only relevant for the active/bench, where there is a div container holding the pokemon and its attached cards
// this is for adjusting the size of the container holding the pokemon/attached cards and the counter of how many cards are attached,
// so future cards are appended in the right location
export const decreaseCardLayer = (movingCard) => {
  if (movingCard.type !== 'Pokémon') {
    movingCard.image.relative.energyLayer -= 1;
    // Energy tokens are small badges that never grew the host container at
    // attach time (attach-card.js) — only the old flat-card side-cascade did,
    // so only that case shrinks it back.
    const isToken =
      movingCard.type === 'Energy' && getEnergyTokenFront(movingCard) != null;
    if (!isToken) {
      // hostParent is `.play-container` — resolved through the holo wrapper if the
      // host Pokémon is holo-hydrated, so the container is sized correctly.
      const hostParent = imageAnchor(movingCard.image.relative).parentElement;
      const adjustment = movingCard.image.relative.clientWidth / 6;
      const currentWidth = parseFloat(hostParent.clientWidth);
      const newWidth = currentWidth - adjustment;
      hostParent.style.width = newWidth + 'px';
    }
  } else {
    movingCard.image.relative.layer -= 1;
  }
};
