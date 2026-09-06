import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { addAbilityCounter } from '../counters/ability-counter.js';
import { addDamageCounter } from '../counters/damage-counter.js';
import { addSpecialCondition } from '../counters/special-condition.js';
import { unhydrateHolo } from '../../setup/deck-constructor/hydrate-holo.js';

export const initializeActiveBenchCard = (user, movingCard, dZoneId, dZone) => {
  if (!movingCard.type2) {
    movingCard.type2 = movingCard.type;
  }
  movingCard.type = 'Pokémon'; //auto change cards to pokemon if played straight onto active or bench
  const container =
    user === 'self'
      ? selfContainerDocument.createElement('div')
      : oppContainerDocument.createElement('div');
  if (movingCard.image.PokémonBreak && ['active', 'bench'].includes(dZoneId)) {
    container.style.marginRight = '3%';
    container.style.marginLeft = '2%';
  }
  container.className = 'play-container';
  container.style.zIndex = '0';
  dZone.element.appendChild(container);
  unhydrateHolo(movingCard);
  container.appendChild(movingCard.image);

  // delete the container if it's empty
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.removedNodes.length > 0) {
        for (const removedNode of mutation.removedNodes) {
          // Preview now clones instead of reparenting. An empty slot should
          // always be discarded — including when moveCard reparents the <img>
          // into a new play-container (the node stays `isConnected` there).
          if (removedNode.closest?.('.card-preview-overlay')) continue;
          if (
            removedNode.nodeName === 'IMG' &&
            container.getElementsByTagName('img').length === 0
          ) {
            if (container.parentElement) {
              container.parentElement.style.zIndex = '0';
            }
            container.remove();
          }
        }
        if (['bench'].includes(dZoneId)) {
          const selectedBenchZone = getZone(user, 'bench');
          for (let i = 0; i < selectedBenchZone.getCount(); i++) {
            const image = selectedBenchZone.array[i].image;
            if (image.damageCounter) {
              addDamageCounter(user, 'bench', i, false, false);
            }
            if (image.abilityCounter) {
              addAbilityCounter(user, 'bench', i);
            }
          }
        }
        if (['active'].includes(dZoneId)) {
          const selectedActiveZone = getZone(user, 'active');
          for (let i = 0; i < selectedActiveZone.getCount(); i++) {
            const image = selectedActiveZone.array[i].image;
            if (image.damageCounter) {
              addDamageCounter(user, 'active', i, false, false);
            }
            if (image.specialCondition) {
              addSpecialCondition(user, 'active', i, false);
            }
            if (image.abilityCounter) {
              addAbilityCounter(user, 'active', i);
            }
          }
        }
      }
    });
  });

  const config = { childList: true };
  observer.observe(container, config);

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (
        entry.target.parentElement &&
        entry.target.parentElement.id === 'bench'
      ) {
        for (let i = 0; i < dZone.getCount(); i++) {
          const image = dZone.array[i].image;
          if (image.damageCounter) {
            addDamageCounter(user, 'bench', i, false, false);
          }
          if (image.abilityCounter) {
            addAbilityCounter(user, 'bench', i);
          }
        }
      }
    });
  });
  resizeObserver.observe(container);
};
