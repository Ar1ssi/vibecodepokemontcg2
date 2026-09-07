import { systemState } from '../../state.js';
import { processAction } from '../../setup/general/process-action.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { addAbilityCounter } from '../counters/ability-counter.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { addSpecialCondition } from '../counters/special-condition.js';

export const rotateCard = (
  user,
  zoneId,
  index,
  single = false,
  rotationAngle = null,
  emit = true
) => {
  if (typeof rotationAngle === 'boolean') {
    emit = rotationAngle;
    rotationAngle = null;
  }
  const zone = getZone(user, zoneId);
  const rotatingImage = zone?.array?.[index]?.image;
  if (!rotatingImage) return;

  const currentRotation =
    parseInt(rotatingImage.style.transform.replace(/[^0-9-]/g, '')) || 0;
  const newRotation =
    typeof rotationAngle === 'number'
      ? rotationAngle
      : (currentRotation + 90) % 360;

  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'rotateCard', [zoneId, index, single, newRotation]);
    return;
  }

  rotatingImage.style.transform = `rotate(${newRotation}deg)`;

  if (['bench'].includes(zoneId)) {
    rotatingImage.parentElement.style.marginRight = '3%';
    rotatingImage.parentElement.style.marginLeft = '2%';
  }
  if ([0, 180].includes(newRotation)) {
    rotatingImage.parentElement.style.marginRight = '1%';
    rotatingImage.parentElement.style.marginLeft = '0%';
  }
  if (!single) {
    rotatingImage.parentElement.querySelectorAll('img').forEach((image) => {
      if (image !== rotatingImage && image.type === 'Pokémon') {
        const currentRotation =
          parseInt(image.style.transform.replace(/[^0-9-]/g, '')) || 0;
        const newRotation = (currentRotation + 90) % 360;
        image.style.transform = `rotate(${newRotation}deg)`;
      }
    });
  } else {
    if ([90].includes(newRotation)) {
      rotatingImage.PokémonBreak = true;
    } else {
      rotatingImage.style.transform = 'rotate(0deg)';
      rotatingImage.PokémonBreak = false;
    }
  }
  //update any damagecounters/specialconditions/abilitycounters
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

  processAction(user, emit, 'rotateCard', [zoneId, index, single, newRotation]);
};

export const resetRotation = (targetImage) => {
  const currentRotation =
    parseInt(targetImage.style.transform.replace(/[^0-9-]/g, '')) || 0;
  if (currentRotation !== 0) {
    targetImage.parentElement.querySelectorAll('img').forEach((image) => {
      image.style.transform = 'rotate(0deg)';
    });
  }
  targetImage.parentElement.style.marginRight = '1%';
  targetImage.parentElement.style.marginLeft = '0%';
};

export const syncRotation = (card, targetImage) => {
  const currentRotation =
    parseInt(targetImage.style.transform.replace(/[^0-9-]/g, '')) || 0;
  let rotationOffset = 0;
  if (targetImage.PokémonBreak) {
    rotationOffset++;
  }
  if (card.type === 'Trainer') {
    rotationOffset--;
    card.image.parentElement.style.marginRight = '2%';
  }
  card.image.style.transform = `rotate(${currentRotation - 90 * rotationOffset}deg)`;
};
