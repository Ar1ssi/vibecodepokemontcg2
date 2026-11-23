/**
 * @file Maps a server PendingChoice onto `openCardPicker` arguments.
 *
 * Pure and DOM-free so it runs under `node --test`; the browser adapter
 * (`choice-picker-adapter.js`) only forwards the result to the picker.
 */

const toCount = (value, fallback) =>
  Number.isInteger(value) && value >= 0 ? value : fallback;

/**
 * The picker's ALL tab: every card of the pile the pick is made from (`choice.zoneView`, the
 * searched deck or a discard pile), in pile order. A pickable card is the same object as its
 * VALID candidate, so a pick made under either tab is the same pick.
 *
 * @returns {object[]|null} null when there is no pile or it adds nothing to the options
 */
function wholePileCandidates(zoneView, candidates) {
  const cards = Array.isArray(zoneView?.cards) ? zoneView.cards : [];
  if (cards.length <= candidates.length) return null;
  const byId = new Map(candidates.map((card) => [card.instanceId, card]));
  return cards.map(
    (card) =>
      byId.get(card.instanceId) ?? {
        instanceId: card.instanceId,
        name: card.name || '',
        type: card.type || '',
        image: { src: card.src || '' },
      }
  );
}

/**
 * @param {object} choice PendingChoice from the authoritative view
 * @param {(selection: number[]) => unknown} onResolve receives chosen instanceIds
 * @param {{cardBackSrc?: string}} [opts] image shown for blind (`faceDown`) options
 * @returns {object|null} openCardPicker options, or null for a choice with no card options
 */
export function buildChoicePickerRequest(choice, onResolve, { cardBackSrc = '' } = {}) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  if (options.length === 0) return null;

  const candidates = options.map((opt) =>
    opt.faceDown
      ? { instanceId: opt.instanceId, name: 'Face-down card', type: '', image: { src: cardBackSrc } }
      : {
          instanceId: opt.instanceId,
          name: opt.name || '',
          type: opt.type || '',
          image: { src: opt.src || '' },
        }
  );
  const allCandidates = wholePileCandidates(choice.zoneView, candidates);
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
    ...(allCandidates ? { allCandidates } : {}),
    // The server moves the cards; the picker must only report the picks.
    pickOnly: true,
    onPick: (card) => onResolve(card ? [card.instanceId] : []),
    onConfirm: (cards) => onResolve(cards.map((card) => card.instanceId)),
  };
}
