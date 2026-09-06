/**
 * Pure state manager for Card data models.
 * Decouples card state (damage, special condition, ability usage, attachments)
 * from DOM elements, providing a pure data source-of-truth.
 */

export function getCardDamage(card) {
  if (!card) return 0;
  if (typeof card.damage === 'number') return card.damage;
  if (card.image?.damageCounter?.textContent) {
    return parseInt(card.image.damageCounter.textContent || '0', 10) || 0;
  }
  return 0;
}

export function setCardDamage(card, amount) {
  if (!card) return;
  const num = Math.max(0, parseInt(amount, 10) || 0);
  card.damage = num;
  return num;
}

export function getCardSpecialCondition(card) {
  if (!card) return null;
  if (card.specialCondition !== undefined && card.specialCondition !== null) {
    return card.specialCondition;
  }
  return card.image?.specialCondition?.textContent ?? null;
}

export function setCardSpecialCondition(card, condition) {
  if (!card) return;
  card.specialCondition = condition || null;
  return card.specialCondition;
}

export function getCardAbilityUsed(card) {
  if (!card) return false;
  if (typeof card.abilityUsed === 'boolean') return card.abilityUsed;
  return !!card.image?.abilityCounter;
}

export function setCardAbilityUsed(card, used) {
  if (!card) return;
  card.abilityUsed = !!used;
  return card.abilityUsed;
}

export function getCardParent(card, zoneCards = []) {
  if (!card) return null;
  if (card.parentCard) return card.parentCard;
  if (card.image?.relative) {
    if (card.image.relative.card) return card.image.relative.card;
    const parent = zoneCards.find((c) => c !== card && c?.image === card.image.relative);
    if (parent) return parent;
  }
  return null;
}

export function setCardAttachment(childCard, parentCard) {
  if (!childCard) return;
  childCard.attached = !!parentCard;
  childCard.parentCard = parentCard || null;
  childCard.parentCardId = parentCard?.cardId ?? parentCard?.syncInstance ?? null;
  if (childCard.image) {
    childCard.image.attached = !!parentCard;
    if (parentCard?.image) {
      childCard.image.relative = parentCard.image;
    } else if (!parentCard) {
      childCard.image.relative = null;
    }
  }
  if (parentCard) {
    if (!Array.isArray(parentCard.attachedCards)) {
      parentCard.attachedCards = [];
    }
    if (!parentCard.attachedCards.includes(childCard)) {
      parentCard.attachedCards.push(childCard);
    }
  }
}

export function removeCardAttachment(childCard) {
  if (!childCard) return;
  if (childCard.parentCard && Array.isArray(childCard.parentCard.attachedCards)) {
    const idx = childCard.parentCard.attachedCards.indexOf(childCard);
    if (idx >= 0) {
      childCard.parentCard.attachedCards.splice(idx, 1);
    }
  }
  childCard.attached = false;
  childCard.parentCard = null;
  childCard.parentCardId = null;
  if (childCard.image) {
    childCard.image.attached = false;
    childCard.image.relative = null;
  }
}

export function resetCardState(card) {
  if (!card) return;
  card.damage = 0;
  card.specialCondition = null;
  card.abilityUsed = false;
  removeCardAttachment(card);
  if (Array.isArray(card.attachedCards)) {
    card.attachedCards.length = 0;
  }
}
