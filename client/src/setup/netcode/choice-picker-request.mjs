/**
 * @file Maps a server PendingChoice onto `openCardPicker` arguments.
 *
 * Pure and DOM-free so it runs under `node --test`; the browser adapter
 * (`choice-picker-adapter.js`) only forwards the result to the picker.
 */

const toCount = (value, fallback) =>
  Number.isInteger(value) && value >= 0 ? value : fallback;

/**
 * @param {object} choice PendingChoice from the authoritative view
 * @param {(selection: number[]) => unknown} onResolve receives chosen instanceIds
 * @returns {object|null} openCardPicker options, or null for a choice with no card options
 */
export function buildChoicePickerRequest(choice, onResolve) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  if (options.length === 0) return null;

  const candidates = options.map((opt) => ({
    instanceId: opt.instanceId,
    name: opt.name || '',
    type: opt.type || '',
    image: { src: opt.src || '' },
  }));
  const min = Math.min(toCount(choice.min, 1), candidates.length);
  const max = Math.max(1, Math.min(toCount(choice.max, 1), candidates.length));
  const multiSelect = max > 1;
  const upTo = min === 0;

  return {
    title: choice.prompt || 'Choose a card',
    candidates,
    multiSelect,
    requiredCount: max,
    minCount: min,
    maxCount: max,
    upTo,
    // The server moves the cards; the picker must only report the picks.
    pickOnly: true,
    onPick: (card) => onResolve(card ? [card.instanceId] : []),
    onConfirm: (cards) => onResolve(cards.map((card) => card.instanceId)),
  };
}
