import { resetImage } from '../../setup/image-logic/reset-image.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { resetRotation } from '../general/rotate-card.js';
import { moveCard } from './move-card.js';
import {
  unhydrateHolo,
  hydrateHolo,
  imageAnchor,
} from '../../setup/deck-constructor/hydrate-holo.js';

export const evolveCard = (
  user,
  initiator,
  movingCard,
  targetCard,
  dZoneId,
  dZone
) => {
  resetImage(movingCard.image);
  unhydrateHolo(movingCard);
  // insert as a sibling of the base's anchor (the `.mat-holo` wrapper if the
  // base Pokémon is holo-hydrated) so the evolved card lands in `.play-container`,
  // not inside the overflow-hidden `.card__rotator`. The base card keeps its
  // holofoil — only this incoming card is de-wrapped above, then re-hydrated
  // at the end of this function.
  imageAnchor(targetCard.image).after(movingCard.image);
  targetCard.image.relative = movingCard.image;
  targetCard.attached = true;
  targetCard.parentCard = movingCard;
  targetCard.parentCardId = movingCard.cardId ?? movingCard.syncInstance ?? null;
  movingCard.isEvolution = true;
  if (!Array.isArray(movingCard.attachedCards)) movingCard.attachedCards = [];
  if (!movingCard.attachedCards.includes(targetCard)) movingCard.attachedCards.push(targetCard);

  // Pure data transfer
  movingCard.damage = targetCard.damage || 0;
  targetCard.damage = 0;
  targetCard.specialCondition = null;
  movingCard.specialCondition = null;
  targetCard.abilityUsed = false;

  //if counters exists, link the textcontent with the new Pokémon card
  if (targetCard.image.damageCounter) {
    addDamageCounter(user, dZoneId, dZone.getCount() - 1, false, false);
    movingCard.image.damageCounter.textContent =
      targetCard.image.damageCounter.textContent;
    //remove once opponent is finished with it
    targetCard.image.damageCounter.textContent = '0';
    targetCard.image.damageCounter.handleRemove();
  }
  if (targetCard.image.specialCondition) {
    targetCard.image.specialCondition.textContent = '0';
    targetCard.image.specialCondition.handleRemove();
  }
  if (targetCard.image.abilityCounter) {
    targetCard.image.abilityCounter.handleRemove(false);
  }
  //rotate card back to normal if it's not
  resetRotation(targetCard.image);

  //reset container width (since cards are being re-attached)
  const newWidth = parseFloat(movingCard.image.clientWidth);
  imageAnchor(targetCard.image).parentElement.style.width = newWidth + 'px';

  // set relative of all of targetCard's attached cards to movingCard
  dZone.array.forEach((card) => {
    if (card.parentCard === targetCard || card.image?.relative === targetCard.image) {
      card.parentCard = movingCard;
      card.parentCardId = movingCard.cardId ?? movingCard.syncInstance ?? null;
      if (card.image) card.image.relative = movingCard.image;
      if (!movingCard.attachedCards.includes(card)) movingCard.attachedCards.push(card);
    }
  });
  //move the cards to the new host
  for (let i = 0; i < dZone.array.length; i++) {
    const card = dZone.array[i];
    if (card.image === movingCard.image) {
      break;
    } else if (card.image.relative === movingCard.image) {
      resetImage(card.image);
      card.image.attached = true;
      const targetIndex = dZone.array.findIndex(
        (card) => card.image === movingCard.image
      );
      moveCard(user, initiator, dZoneId, dZoneId, i, targetIndex);
      i--;
    }
  }

  // the evolved card is settled into the container now — give it its holofoil
  // wrapper (no-op for common/non-holo cards). Runs after the re-attach loop so
  // the <img> is in its final position and clientWidth/Height are valid.
  hydrateHolo(movingCard);
};
