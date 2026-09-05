import { resetImage } from '../../setup/image-logic/reset-image.js';
import {
  unhydrateHolo,
  imageAnchor,
} from '../../setup/deck-constructor/hydrate-holo.js';
import { syncRotation } from '../general/rotate-card.js';
import { moveCard } from './move-card.js';

export const attachCard = (
  user,
  initiator,
  movingCard,
  targetCard,
  dZoneId,
  dZone
) => {
  //figure out where card is coming from-same parent or different? being reattached or evolve?
  const nonEvolveAttachment =
    movingCard.image.target === 'on' ||
    !movingCard.image.parentElement.classList.contains('play-container');
  // format the card so it's attached to targetImage
  resetImage(movingCard.image);

  movingCard.image.attached = true;
  movingCard.image.target = 'on';
  movingCard.image.relative = targetCard.image;
  movingCard.image.style.position = 'absolute';

  let layer;
  if (movingCard.type !== 'Pokémon') {
    // hostParent is the element that owns the target card in the zone DOM
    // (`.play-container`) — the `.mat-holo` wrapper if the Pokémon is
    // holo-hydrated, otherwise the bare <img>. Sizing siblings against this
    // keeps the target card's holofoil intact (it is NOT de-wrapped).
    const hostParent = imageAnchor(targetCard.image).parentElement;
    const adjustment = targetCard.image.clientWidth / 6;
    targetCard.image.energyLayer += 1;
    layer = targetCard.image.energyLayer;
    movingCard.image.style.left = `${layer * adjustment}px`;

    //adjust width of container
    const currentWidth = parseFloat(hostParent.clientWidth);
    const newWidth = currentWidth + adjustment;
    hostParent.style.width = newWidth + 'px';
  } else {
    const adjustment = targetCard.image.clientWidth / 15;
    targetCard.image.layer += 1;
    layer = targetCard.image.layer;
    movingCard.image.style.bottom = `${layer * adjustment}px`;
  }
  movingCard.image.style.zIndex -= layer;

  unhydrateHolo(movingCard);
  // insert as a sibling of the target's anchor (the wrapper if holo-hydrated)
  // so the energy lands inside `.play-container`, not inside the overflow-hidden
  // `.card__rotator`. `movingCard.image.relative` stays the target's <img>.
  imageAnchor(targetCard.image).after(movingCard.image);
  //rotate tool/energy to the same orientation of card
  syncRotation(movingCard, targetCard.image);

  // move tools to the back of the image, index cannot be zero to prevent being called when evolving Pokémon
  if (movingCard.type === 'Energy' && nonEvolveAttachment) {
    for (let i = 0; i < dZone.getCount() - 1; i++) {
      if (
        dZone.array[i].image.relative === movingCard.image.relative &&
        !['Pokémon', 'Energy'].includes(dZone.array[i].type)
      ) {
        const targetIndex = dZone.array.findIndex(
          (card) => card.image === movingCard.image.relative
        );
        moveCard(user, initiator, dZoneId, dZoneId, i, targetIndex);
        i--;
      }
      if (dZone.array[i] === movingCard) {
        break;
      }
    }
  }
};
