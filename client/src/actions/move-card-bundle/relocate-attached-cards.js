import { mouseClick } from '../../state.js';
import { resetImage } from '../../setup/image-logic/reset-image.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { moveCard } from './move-card.js';

export const relocateAttachedCards = (
  user,
  initiator,
  movingCard,
  oZoneId,
  oZone,
  dZoneId,
  dZone
) => {
  for (let i = 0; i < oZone.getCount(); i++) {
    const image = oZone.array[i].image;
    if (image === movingCard.image) {
      break;
    }
    const card = oZone.array[i];
    if (image.relative === movingCard.image || card.parentCard === movingCard) {
      resetImage(image);
      //moving to active or bench
      if (['active', 'bench'].includes(dZoneId)) {
        image.attached = true;
        card.attached = true;
        card.parentCard = movingCard;
        const targetIndex = dZone.array.findIndex(
          (c) => c === movingCard || c.image === movingCard.image
        );
        moveCard(user, initiator, oZoneId, dZoneId, i, targetIndex);
      } else {
        if (
          card.type === 'Pokémon' &&
          (movingCard.damage > 0 || movingCard.image?.damageCounter)
        ) {
          const dmg = movingCard.damage || parseInt(movingCard.image?.damageCounter?.textContent || '0', 10) || 0;
          card.damage = dmg;
          addDamageCounter(user, oZoneId, i, false, false);
          if (image.damageCounter) {
            image.damageCounter.textContent = String(dmg);
          }
        }
        getZone(user, 'attachedCards').element.style.display = 'block';
        moveCard(user, initiator, oZoneId, 'attachedCards', i);
        mouseClick.isActiveZone = oZoneId === 'active';
      }
      i--;
    }
  }
};
