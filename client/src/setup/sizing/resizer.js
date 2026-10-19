import { addAbilityCounter } from '../../actions/counters/ability-counter.js';
import { addDamageCounter } from '../../actions/counters/damage-counter.js';
import { addSpecialCondition } from '../../actions/counters/special-condition.js';
import { getZone } from '../zones/get-zone.js';
import { imageAnchor } from '../deck-constructor/hydrate-holo.js';
import { scaleEnergyCountBadges } from '../../actions/move-card-bundle/energy-token-row.mjs';

/**
 * Rescales the px offsets of the cards in a zone by `ratio` and redraws their counters.
 * `refreshBoard` calls it with 1 to re-settle the Active and Bench after a reorder.
 */
export const adjustCards = (user, zoneId, ratio) => {
  const zone = getZone(user, zoneId);
  zone.array.forEach((card) => {
    if (card.image.attached) {
      if (card.type === 'Pokémon') {
        const oldBottom = parseFloat(card.image.style.bottom);
        const newBottom = oldBottom * ratio;
        card.image.style.bottom = `${newBottom}px`;
      } else {
        const oldLeft = parseFloat(card.image.style.left);
        const newLeft = oldLeft * ratio;
        card.image.style.left = `${newLeft}px`;
      }
    } else {
      const baseWidth = parseFloat(card.image.clientWidth);
      const adjustment = parseFloat(card.image.clientWidth / 6);
      const energyLayer = card.image.energyLayer || 0;
      const newWidth = (baseWidth + energyLayer * adjustment) * ratio;
      // Size the `.play-container`, resolved through the holo wrapper when the
      // card is hydrated — the <img>'s own parent is then `.card__rotator`, and
      // writing a px width there squashes the card inside its wrapper.
      if (Number.isFinite(newWidth) && newWidth > 0) {
        imageAnchor(card.image).parentElement.style.width = `${newWidth}px`;
      }
      scaleEnergyCountBadges(card.image, ratio);
    }
    if (card.image.damageCounter) {
      const index = zone.array.findIndex((loopCard) => loopCard === card);
      addDamageCounter(user, zoneId, index, false, false);
    }
    if (card.image.specialCondition) {
      const index = zone.array.findIndex((loopCard) => loopCard === card);
      addSpecialCondition(user, zoneId, index, false);
    }
    if (card.image.abilityCounter) {
      const index = zone.array.findIndex((loopCard) => loopCard === card);
      addAbilityCounter(user, zoneId, index);
    }
  });
};
