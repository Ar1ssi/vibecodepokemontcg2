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
import { dispatchServerCardMenu } from '../../../setup/netcode/manual-card-dispatch.js';
import { mouseClick, systemState } from '../../../state.js';

// A menu button acts through the server when the selected card is server-drawn
// (dispatchServerCardMenu), and runs its legacy local action otherwise.
const onMenuButton = (buttonId, localAction) => {
  document.getElementById(buttonId).addEventListener('click', () => {
    if (dispatchServerCardMenu(buttonId)) return;
    localAction();
  });
};

const changeSelectedCardType = (type) =>
  changeType(
    mouseClick.cardUser,
    systemState.initiator,
    mouseClick.zoneId,
    mouseClick.cardIndex,
    type
  );

// With a counter already on the card the button removes it; otherwise it uses the ability.
const removeAbilityCounterOrUseAbility = () => {
  if (mouseClick.card?.image?.abilityCounter) {
    mouseClick.card.image.abilityCounter.handleRemove();
    return;
  }
  useAbility(
    mouseClick.cardUser,
    systemState.initiator,
    mouseClick.zoneId,
    mouseClick.cardIndex,
    true,
    undefined,
    mouseClick.cardInstanceId
  );
};

export const initializeActiveAndBenchButtons = () => {
  onMenuButton('damageCounterButton', () =>
    addDamageCounter(mouseClick.cardUser, mouseClick.zoneId, mouseClick.cardIndex)
  );
  onMenuButton('specialConditionButton', () =>
    addSpecialCondition(
      mouseClick.cardUser,
      mouseClick.zoneId,
      mouseClick.cardIndex
    )
  );
  onMenuButton('abilityCounterButton', removeAbilityCounterOrUseAbility);
  onMenuButton('changeToEnergyButton', () => changeSelectedCardType('Energy'));
  onMenuButton('changeToToolButton', () => changeSelectedCardType('Trainer'));
  onMenuButton('changeToPokémonButton', () => changeSelectedCardType('Pokémon'));

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
