import { addDamageCounter } from '../../../actions/counters/damage-counter.js';
import { addSpecialCondition } from '../../../actions/counters/special-condition.js';
import { useAbility } from '../../../actions/counters/use-ability.js';
import { changeType } from '../../../actions/general/change-type.js';
import {
  discardAll,
  shuffleAll,
  lostZoneAll,
  handAll,
  leaveAll,
} from '../../../actions/zones/general.js';
import { openAttachedCardsPanel } from '../../../setup/image-logic/full-view.js';
import { mouseClick, systemState } from '../../../state.js';

export const initializeActiveAndBenchButtons = () => {
  const damageCounterButton = document.getElementById('damageCounterButton');
  damageCounterButton.addEventListener('click', () => {
    addDamageCounter(
      mouseClick.cardUser,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const specialConditionButton = document.getElementById(
    'specialConditionButton'
  );
  specialConditionButton.addEventListener('click', () => {
    addSpecialCondition(
      mouseClick.cardUser,
      mouseClick.zoneId,
      mouseClick.cardIndex
    );
  });

  const abilityCounterButton = document.getElementById('abilityCounterButton');
  abilityCounterButton.addEventListener('click', () => {
    if (mouseClick.card.image.abilityCounter) {
      mouseClick.card.image.abilityCounter.handleRemove();
    } else {
      useAbility(
        mouseClick.cardUser,
        systemState.initiator,
        mouseClick.zoneId,
        mouseClick.cardIndex
      );
    }
  });

  const changeToEnergyButton = document.getElementById('changeToEnergyButton');
  changeToEnergyButton.addEventListener('click', () => {
    changeType(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex,
      'Energy'
    );
  });
  const changeToToolButton = document.getElementById('changeToToolButton');
  changeToToolButton.addEventListener('click', () => {
    changeType(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex,
      'Trainer'
    );
  });
  const changeToPokémonButton = document.getElementById(
    'changeToPokémonButton'
  );
  changeToPokémonButton.addEventListener('click', () => {
    changeType(
      mouseClick.cardUser,
      systemState.initiator,
      mouseClick.zoneId,
      mouseClick.cardIndex,
      'Pokémon'
    );
  });

  // View the play-container panel (Pokémon + attached cards in a row).
  const viewAttachedCardsButton = document.getElementById(
    'viewAttachedCardsButton'
  );
  viewAttachedCardsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!mouseClick.card?.image) return;
    document.getElementById('cardContextMenu').style.display = 'none';
    openAttachedCardsPanel(mouseClick.card.image, mouseClick.card);
  });

  // Attached-cards submenu: bulk actions on cards in the #attachedCards zone.
  const attachedDiscardButton = document.getElementById('attachedDiscardButton');
  attachedDiscardButton.addEventListener('click', () =>
    discardAll(mouseClick.cardUser, systemState.initiator, 'attachedCards')
  );

  const attachedShuffleButton = document.getElementById('attachedShuffleButton');
  attachedShuffleButton.addEventListener('click', () =>
    shuffleAll(mouseClick.cardUser, systemState.initiator, 'attachedCards')
  );

  const attachedLostZoneButton = document.getElementById('attachedLostZoneButton');
  attachedLostZoneButton.addEventListener('click', () =>
    lostZoneAll(mouseClick.cardUser, systemState.initiator, 'attachedCards')
  );

  const attachedHandButton = document.getElementById('attachedHandButton');
  attachedHandButton.addEventListener('click', () =>
    handAll(mouseClick.cardUser, systemState.initiator, 'attachedCards')
  );

  const attachedLeaveButton = document.getElementById('attachedLeaveButton');
  attachedLeaveButton.addEventListener('click', () =>
    leaveAll(mouseClick.cardUser, systemState.initiator, 'attachedCards')
  );
};
