import { addAbilityCounter } from '../counters/ability-counter.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { addSpecialCondition } from '../counters/special-condition.js';

/** Redraws every counter overlay in a zone after cards in it changed size, place or rotation. */
export const refreshZoneCounters = (user, zoneId, zone) => {
  for (let i = 0; i < zone.getCount(); i++) {
    const image = zone.array[i].image;
    if (image.damageCounter) {
      addDamageCounter(user, zoneId, i, false, false);
    }
    if (image.specialCondition) {
      addSpecialCondition(user, zoneId, i, false);
    }
    if (image.abilityCounter) {
      addAbilityCounter(user, zoneId, i);
    }
  }
};

export const updateCounters = (
  user,
  movingCard,
  oZoneId,
  oZone,
  dZoneId,
  dZone
) => {
  const zonesWithAttachedCards = ['active', 'bench', 'attachedCards'];
  const counterZones = ['active', 'bench', 'discard', 'attachedCards'];
  // deal with damage counters
  if (movingCard.image.damageCounter) {
    //redefine index of movingCard because its index could have changed due to attached cards.
    const index = dZone.array.findIndex((card) => card === movingCard);

    if (zonesWithAttachedCards.includes(dZoneId)) {
      addDamageCounter(user, dZoneId, index, false, false);
    } else {
      movingCard.image.damageCounter.textContent = '0';
      movingCard.image.damageCounter.handleRemove();
    }
  }
  if (movingCard.image.abilityCounter) {
    //redefine index of movingCard because its index could have changed due to attached cards.
    const index = dZone.array.findIndex((card) => card === movingCard);

    if (zonesWithAttachedCards.includes(dZoneId)) {
      addAbilityCounter(user, dZoneId, index);
    } else {
      movingCard.image.abilityCounter.handleRemove(false);
    }
  }
  //remove special conditions if the pokemon is no longer in the active
  if (movingCard.image.specialCondition && !['active'].includes(dZoneId)) {
    movingCard.image.specialCondition.textContent = '0';
    movingCard.image.specialCondition.handleRemove();
  }
  //update damage counter placements on all cards from the same origin/destination zones
  if (counterZones.includes(oZoneId)) {
    refreshZoneCounters(user, oZoneId, oZone);
  }
  if (counterZones.includes(dZoneId)) {
    refreshZoneCounters(user, dZoneId, dZone);
  }
};
