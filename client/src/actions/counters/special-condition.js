import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { applySpecialConditionStyle } from '../../setup/counters/special-condition-style-apply.js';
import {
  getSpecialConditionCode,
  setSpecialConditionCode,
} from '../../setup/counters/special-condition-code.mjs';
import { processAction } from '../../setup/general/process-action.js';
import { splitEmitAndTail } from '../../setup/general/sync-action-args.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { buildCardHint, resolveCardIndex } from '../../setup/zones/resolve-card-index.mjs';
import { isInFullView } from '../../setup/deck-constructor/hydrate-holo.js';

function resolveConditionTarget(user, zoneId, index, hint) {
  const zone = getZone(user, zoneId);
  const resolved = resolveCardIndex(zone, hint, index);
  const card = zone?.array?.[resolved];
  return { zone, index: resolved, card, hint: hint || buildCardHint(card) };
}

export const updateSpecialCondition = (
  user,
  zoneId,
  index,
  textContent,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { index: resolved, card, hint } = resolveConditionTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'updateSpecialCondition', [
      zoneId,
      resolved,
      textContent,
      hint,
    ]);
    return;
  }

  const specialCondition = card?.image?.specialCondition;
  if (card) {
    card.specialCondition = textContent || null;
  }
  if (!specialCondition) return;
  setSpecialConditionCode(specialCondition, textContent);
  applySpecialConditionStyle(specialCondition, textContent);

  processAction(user, emit, 'updateSpecialCondition', [
    zoneId,
    resolved,
    textContent,
    hint,
  ]);
};

export const removeSpecialCondition = (
  user,
  zoneId,
  index,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { index: resolved, card: targetCard, hint } = resolveConditionTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'removeSpecialCondition', [zoneId, resolved, hint]);
    return;
  }

  if (!targetCard) return;
  targetCard.specialCondition = null;
  //make sure targetCard exists (it won't exist if it's already been removed)
  if (targetCard.image?.specialCondition) {
    targetCard.image.specialCondition.removeEventListener(
      'input',
      targetCard.image.specialCondition.handleColor
    );
    targetCard.image.specialCondition.handleColor = null;
    targetCard.image.specialCondition.removeEventListener(
      'blur',
      targetCard.image.specialCondition.handleRemoveWrapper
    );
    targetCard.image.specialCondition.handleRemove = null;
    window.removeEventListener(
      'resize',
      targetCard.image.specialCondition.handleResize
    );
    targetCard.image.specialCondition.remove();
    targetCard.image.specialCondition = null;
  }

  processAction(user, emit, 'removeSpecialCondition', [zoneId, resolved, hint]);
};

export const addSpecialCondition = (
  user,
  zoneId,
  index,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { zone, index: resolved, card: targetCard, hint } = resolveConditionTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'addSpecialCondition', [zoneId, resolved, hint]);
    return;
  }

  if (!targetCard) return;
  targetCard.specialCondition = targetCard.specialCondition || '1';
  index = resolved;
  const targetRect = targetCard.image.getBoundingClientRect();
  const zoneElementRect = zone.element.getBoundingClientRect();

  let specialCondition = targetCard.image.specialCondition;
  //clean up existing event listeners
  if (specialCondition) {
    specialCondition.removeEventListener('input', specialCondition.handleColor);
    specialCondition.handleColor = null;
    specialCondition.removeEventListener(
      'blur',
      specialCondition.handleRemoveWrapper
    );
    specialCondition.handleRemove = null;
    window.removeEventListener('resize', specialCondition.handleResize);
  } else {
    if (user === 'self') {
      specialCondition = selfContainerDocument.createElement('div');
      specialCondition.className =
        systemState.initiator === 'self' ? 'self-circle' : 'opp-circle';
    } else {
      specialCondition = oppContainerDocument.createElement('div');
      specialCondition.className =
        systemState.initiator === 'self' ? 'opp-circle' : 'self-circle';
    }
    specialCondition.contentEditable = 'true';
    setSpecialConditionCode(specialCondition, 'P');
    applySpecialConditionStyle(specialCondition, 'P');
  }

  applySpecialConditionStyle(
    specialCondition,
    getSpecialConditionCode(specialCondition)
  );

  specialCondition.style.display = 'inline-block';
  specialCondition.style.left = `${targetRect.left - zoneElementRect.left}px`;
  specialCondition.style.top = `${targetRect.top - zoneElementRect.top + targetRect.height / 4}px`;
  zone.element.appendChild(specialCondition);

  if (isInFullView(targetCard.image)) {
    specialCondition.style.display = 'none';
  }

  specialCondition.style.width = `${targetRect.width / 3}px`;
  specialCondition.style.height = `${targetRect.width / 3}px`;
  specialCondition.style.lineHeight = `${targetRect.width / 3}px`;
  specialCondition.style.fontSize = `${targetRect.width / 4}px`;
  specialCondition.style.zIndex = '1';

  const handleColor = () => {
    updateSpecialCondition(
      user,
      zoneId,
      index,
      getSpecialConditionCode(specialCondition)
    );
  };

  const handleResize = () => {
    addSpecialCondition(user, zoneId, index, false);
  };

  const handleRemove = (fromBlurEvent = false) => {
    if (
      getSpecialConditionCode(specialCondition) === '' ||
      getSpecialConditionCode(specialCondition) === '0'
    ) {
      targetCard.image.specialCondition.removeEventListener(
        'input',
        targetCard.image.specialCondition.handleColor
      );
      specialCondition.handleColor = null;
      targetCard.image.specialCondition.removeEventListener(
        'blur',
        targetCard.image.specialCondition.handleRemoveWrapper
      );
      targetCard.image.specialCondition.handleRemove = null;
      window.removeEventListener(
        'resize',
        targetCard.image.specialCondition.handleResize
      );
      targetCard.image.specialCondition.remove();
      targetCard.image.specialCondition = null;

      if (fromBlurEvent) {
        removeSpecialCondition(user, zoneId, index);
      }
    }
  };
  specialCondition.handleColor = handleColor;
  specialCondition.addEventListener('input', handleColor);

  specialCondition.handleRemoveWrapper = () => handleRemove(true);
  specialCondition.addEventListener(
    'blur',
    specialCondition.handleRemoveWrapper
  );
  specialCondition.handleRemove = handleRemove;

  specialCondition.handleResize = handleResize;
  window.addEventListener('resize', handleResize);

  //save the specialCondition on the card
  targetCard.image.specialCondition = specialCondition;

  processAction(user, emit, 'addSpecialCondition', [zoneId, resolved, hint]);
};
