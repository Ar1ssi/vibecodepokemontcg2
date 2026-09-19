/**
 * @file Pure engine logic for duplicate card stacking in hand.
 * Strictly DOM-free; runs under node --test.
 */

export const DEFAULT_STACK_STEP_OFFSET_PX = 14;

/**
 * Returns true if a card can participate in duplicate hand stacking.
 *
 * @param {object} card
 * @param {object} [options]
 * @param {(card: object) => boolean} [options.isHidden]
 * @returns {boolean}
 */
export function isStackableCard(card, options = {}) {
  if (!card || typeof card !== 'object') return false;
  const isHidden = options.isHidden;
  if (typeof isHidden === 'function' && isHidden(card)) return false;
  if (card.isRedacted || card.hidden) return false;
  if (!card.name || typeof card.name !== 'string' || card.name.trim() === '')
    return false;
  return true;
}

/**
 * Returns the vertical pixel offset for a card layer in a stack.
 *
 * @param {number} layerIndex 0 for front, 1 for first card behind, etc.
 * @param {number} [stepOffsetPx=14]
 * @returns {number}
 */
export function getCardStackOffset(
  layerIndex,
  stepOffsetPx = DEFAULT_STACK_STEP_OFFSET_PX
) {
  if (typeof layerIndex !== 'number' || layerIndex <= 0) return 0;
  return Math.round(layerIndex * stepOffsetPx);
}

/**
 * Computes duplicate stack groups from an array of hand cards.
 *
 * Stable order: groups are placed in the order their first card appeared in the input list.
 *
 * @param {object[]} cards
 * @param {object} [options]
 * @param {(card: object) => boolean} [options.isHidden]
 * @param {number} [options.stepOffsetPx=14]
 * @returns {object[]} Array of stack descriptors
 */
export function computeHandStacks(cards, options = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const stepOffsetPx = options.stepOffsetPx ?? DEFAULT_STACK_STEP_OFFSET_PX;
  const groupOrder = [];
  const groupsByKey = new Map();

  let unstackableCounter = 0;

  for (const card of cards) {
    if (!card) continue;

    if (isStackableCard(card, options)) {
      const key = `name:${card.name}`;
      if (!groupsByKey.has(key)) {
        const group = { key, name: card.name, items: [] };
        groupsByKey.set(key, group);
        groupOrder.push(group);
      }
      groupsByKey.get(key).items.push(card);
    } else {
      unstackableCounter++;
      const key = `single:${unstackableCounter}`;
      const group = { key, name: card.name || '', items: [card] };
      groupsByKey.set(key, group);
      groupOrder.push(group);
    }
  }

  return groupOrder.map((group) => {
    const count = group.items.length;
    const isStack = count >= 2;

    const layeredCards = group.items.map((card, index) => {
      const isFront = index === 0;
      const layerIndex = index;
      const offsetPx = isFront
        ? 0
        : getCardStackOffset(layerIndex, stepOffsetPx);
      // Front card gets highest z-index so it paints on top of cards behind it
      const zIndex = isStack ? count + 1 - layerIndex : 1;

      return {
        card,
        layerIndex,
        isFront,
        offsetPx,
        zIndex,
      };
    });

    return {
      key: group.key,
      name: group.name,
      count,
      isStack,
      cards: layeredCards,
    };
  });
}
