import { imageAnchor } from '../../setup/deck-constructor/hydrate-holo.js';

// this is only relevant for the active/bench, where there is a div container holding the pokemon and its attached cards
// this is for adjusting the size of the container holding the pokemon/attached cards and the counter of how many cards are attached,
// so future cards are appended in the right location
export const decreaseCardLayer = (movingCard) => {
  if (movingCard.type !== 'Pokémon') {
    // hostParent is `.play-container` — resolved through the holo wrapper if the
    // host Pokémon is holo-hydrated, so the container is sized correctly.
    const hostParent = imageAnchor(movingCard.image.relative).parentElement;
    movingCard.image.relative.energyLayer -= 1;
    //adjust width of container
    const adjustment = movingCard.image.relative.clientWidth / 6;
    const currentWidth = parseFloat(hostParent.clientWidth);
    const newWidth = currentWidth - adjustment;
    hostParent.style.width = newWidth + 'px';
  } else {
    movingCard.image.relative.layer -= 1;
  }
};
