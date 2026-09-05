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
import { mouseClick, systemState } from '../../../front-end.js';

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

  // Attached-cards submenu: same zone-wide actions as the standalone
  // #attachedCards panel, but scoped to whichever side's card was right-clicked.
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
