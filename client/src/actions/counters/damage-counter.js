import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import {
  DAMAGE_COUNTER_MOTIONS,
  DAMAGE_COUNTER_TIERS,
  DAMAGE_DANGER_CLASS,
  counterMotionFor,
  getDamageCounterTier,
  isDangerDamage,
} from '../../setup/counters/damage-counter-style.mjs';
import { processAction } from '../../setup/general/process-action.js';
import { splitEmitAndTail } from '../../setup/general/sync-action-args.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { buildCardHint, resolveCardIndex } from '/shared/engine/zones/resolve-card-index.mjs';
import { isInFullView } from '../../setup/deck-constructor/hydrate-holo.js';

function resolveCounterTarget(user, zoneId, index, hint) {
  const zone = getZone(user, zoneId);
  const resolved = resolveCardIndex(zone, hint, index);
  const card = zone?.array?.[resolved];
  return {
    zone,
    index: resolved,
    card,
    hint: hint || buildCardHint(card),
  };
}

/**
 * Design 024 slice 3: the single funnel for a counter's look. `motion` replays
 * one of the keyframes in damage-counter.css — 'land' when the counter was
 * just created, 'bump' when its value changed. Re-adding a class the element
 * already carries does not restart a CSS animation, hence the forced reflow
 * between the remove and the add.
 *
 * @param {Element} damageCounter
 * @param {number|string} damageAmount
 * @param {'land'|'bump'|null} [motion]
 * @param {number|string|null} [hp] - printed HP, for the near-KO danger pulse
 */
const applyDamageCounterStyle = (damageCounter, damageAmount, motion = null, hp = null) => {
  damageCounter.classList.add('damage-counter');
  damageCounter.classList.remove(...DAMAGE_COUNTER_TIERS);
  damageCounter.classList.add(getDamageCounterTier(damageAmount));
  damageCounter.classList.toggle(
    DAMAGE_DANGER_CLASS,
    isDangerDamage(damageAmount, hp)
  );

  damageCounter.classList.remove(...DAMAGE_COUNTER_MOTIONS);
  if (!motion) return;
  // Forces the removal to take effect before the re-add, so the keyframe
  // replays on an element that already carried the class. On a not-yet-
  // appended counter this is a no-op and none is needed: the animation starts
  // when the node is inserted.
  void damageCounter.offsetWidth;
  damageCounter.classList.add(motion === 'land' ? 'fx-counter-land' : 'fx-counter-bump');
};

export const updateDamageCounter = (
  user,
  zoneId,
  index,
  damageAmount,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { index: resolved, card, hint } = resolveCounterTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'updateDamageCounter', [
      zoneId,
      resolved,
      damageAmount,
      hint,
    ]);
    return;
  }

  const damageCounter = card?.image?.damageCounter;
  if (card) {
    card.damage = Math.max(0, parseInt(damageAmount, 10) || 0);
  }
  if (!damageCounter) return;
  const changed = damageCounter.textContent != damageAmount;
  if (changed) {
    damageCounter.textContent = damageAmount;
  }
  applyDamageCounterStyle(
    damageCounter,
    damageAmount,
    counterMotionFor({ valueChanged: changed }),
    card?.hp
  );

  processAction(user, emit, 'updateDamageCounter', [
    zoneId,
    resolved,
    damageAmount,
    hint,
  ]);

  if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(
      new CustomEvent('rules-damage-changed', {
        detail: { user, zoneId, index: resolved, damage: card ? card.damage : damageAmount },
      })
    );
  }
};

export const removeDamageCounter = (
  user,
  zoneId,
  index,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { index: resolved, card: targetCard, hint } = resolveCounterTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'removeDamageCounter', [zoneId, resolved, hint]);
    return;
  }

  if (!targetCard) return;
  targetCard.damage = 0;
  //make sure targetCard exists (it won't exist if it's already been removed)
  if (targetCard.image?.damageCounter) {
    targetCard.image.damageCounter.removeEventListener(
      'input',
      targetCard.image.damageCounter.handleInput
    );
    targetCard.image.damageCounter.handleInput = null;
    targetCard.image.damageCounter.removeEventListener(
      'blur',
      targetCard.image.damageCounter.handleRemoveWrapper
    );
    targetCard.image.damageCounter.handleRemove = null;
    window.removeEventListener(
      'resize',
      targetCard.image.damageCounter.handleResize
    );
    targetCard.image.damageCounter.remove();
    targetCard.image.damageCounter = null;
  }

  processAction(user, emit, 'removeDamageCounter', [zoneId, resolved, hint]);

  if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(
      new CustomEvent('rules-damage-changed', {
        detail: { user, zoneId, index: resolved, damage: 0 },
      })
    );
  }
};

export const addDamageCounter = (
  user,
  zoneId,
  index,
  damageAmount,
  emitOrHint = true,
  maybeEmit
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const { zone, index: resolved, card: targetCard, hint } = resolveCounterTarget(
    user,
    zoneId,
    index,
    hintIn
  );
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'addDamageCounter', [
      zoneId,
      resolved,
      damageAmount,
      hint,
    ]);
    return;
  }

  if (!targetCard) return;
  const numericAmount = Math.max(0, parseInt(damageAmount ? damageAmount : '10', 10) || 0);
  targetCard.damage = numericAmount;
  index = resolved;
  const targetRect = targetCard.image.getBoundingClientRect();
  const zoneElementRect = zone.element.getBoundingClientRect();

  let damageCounter = targetCard.image.damageCounter;
  // Only a counter that did not exist yet animates here — see counterMotionFor.
  const isNewCounter = !damageCounter;
  //clean up existing event listeners
  if (damageCounter) {
    damageCounter.removeEventListener('input', damageCounter.handleInput);
    damageCounter.handleInput = null;
    damageCounter.removeEventListener(
      'blur',
      damageCounter.handleRemoveWrapper
    );
    damageCounter.handleRemove = null;
    window.removeEventListener('resize', damageCounter.handleResize);
  } else {
    if (user === 'self') {
      damageCounter = selfContainerDocument.createElement('div');
      damageCounter.className =
        systemState.initiator === 'self' ? 'self-circle' : 'opp-circle';
    } else {
      damageCounter = oppContainerDocument.createElement('div');
      damageCounter.className =
        systemState.initiator === 'self' ? 'opp-circle' : 'self-circle';
    }
    damageCounter.contentEditable = 'true';
    damageCounter.textContent = damageAmount ? damageAmount : '10';
  }

  applyDamageCounterStyle(
    damageCounter,
    damageCounter.textContent,
    counterMotionFor({ isNew: isNewCounter }),
    targetCard.hp
  );

  damageCounter.style.display = 'inline-block';
  damageCounter.style.left = `${targetRect.left - zoneElementRect.left + targetRect.width / 1.5}px`;
  damageCounter.style.top = `${targetRect.top - zoneElementRect.top + targetRect.height / 4}px`;
  zone.element.appendChild(damageCounter);

  if (isInFullView(targetCard.image)) {
    damageCounter.style.display = 'none';
  }
  //adjust size of the circle based on card size
  damageCounter.style.width = `${targetRect.width / 3}px`;
  damageCounter.style.height = `${targetRect.width / 3}px`;
  damageCounter.style.lineHeight = `${targetRect.width / 3}px`;
  damageCounter.style.fontSize = `${targetRect.width / 6}px`;
  damageCounter.style.zIndex = '1';

  const handleInput = () => {
    updateDamageCounter(user, zoneId, index, damageCounter.textContent);
  };

  const handleResize = () => {
    addDamageCounter(user, zoneId, index, false, false);
  };

  const handleRemove = (fromBlurEvent = false) => {
    //the reason the code below is repeated in removeDamageCounter is because it's difficult to get reference to the damage counter element when it's being removed through moving (i.e., move to hand)
    //since targetCard.image is already defined here, it's easier to deal with the removal on both sides separately when it's automatic removal, while still having the blur event function for manual removal.
    if (
      targetCard.image.damageCounter.textContent.trim() === '' ||
      targetCard.image.damageCounter.textContent <= 0
    ) {
      targetCard.image.damageCounter.removeEventListener(
        'input',
        targetCard.image.damageCounter.handleInput
      );
      targetCard.image.damageCounter.handleInput = null;
      targetCard.image.damageCounter.removeEventListener(
        'blur',
        targetCard.image.damageCounter.handleRemoveWrapper
      );
      targetCard.image.damageCounter.handleRemove = null;
      window.removeEventListener(
        'resize',
        targetCard.image.damageCounter.handleResize
      );
      targetCard.image.damageCounter.remove();
      targetCard.image.damageCounter = null;
      //manual removal
      if (fromBlurEvent) {
        removeDamageCounter(user, zoneId, index);
      }
    }
  };

  damageCounter.addEventListener('input', handleInput);
  damageCounter.handleInput = handleInput;

  damageCounter.handleRemoveWrapper = () => handleRemove(true);
  damageCounter.addEventListener('blur', damageCounter.handleRemoveWrapper);
  damageCounter.handleRemove = handleRemove;

  damageCounter.handleResize = handleResize;
  window.addEventListener('resize', handleResize);

  //save the damageCounter on the card
  targetCard.image.damageCounter = damageCounter;

  processAction(user, emit, 'addDamageCounter', [
    zoneId,
    resolved,
    damageAmount,
    hint,
  ]);

  if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(
      new CustomEvent('rules-damage-changed', {
        detail: { user, zoneId, index: resolved, damage: targetCard.damage },
      })
    );
  }
};
