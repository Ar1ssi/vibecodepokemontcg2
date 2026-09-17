/**
 * @file I57: where the discard-pile viewer's cards come from.
 *
 * Under server authority the legacy discard zone array is empty (D12/D36), so the viewer has
 * to read the discard out of the authoritative view instead. Both sources are normalized to
 * the shape `card-picker.js` renders (`image.src`, `name`), and the card the player clicked
 * is located by `instanceId` rather than by a legacy zone index, which means nothing there.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

/**
 * @param {object[]} viewCards discard cards from the authoritative view, bottom card first
 * @returns {object[]} picker candidates in the same order
 */
export function toViewerCards(viewCards) {
  if (!Array.isArray(viewCards)) return [];
  return viewCards.map((card) => ({
    instanceId: card.instanceId,
    name: card.name || '',
    type: card.type || '',
    rarity: card.rarity,
    image: { src: card.src || '' },
  }));
}

/**
 * The slide the viewer opens on: the clicked card when it can be identified, else the given
 * index, else the top of the pile (the last card). Always inside the list.
 *
 * @param {object[]} cards viewer candidates
 * @param {{ startIndex?: number|null, instanceId?: number|null }} [target]
 * @returns {number} index into `cards`, or -1 when there is nothing to show
 */
export function resolveViewerIndex(cards, target = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return -1;

  const { startIndex = null, instanceId = null } = target;
  if (instanceId != null) {
    const byInstance = cards.findIndex((card) => card?.instanceId === instanceId);
    if (byInstance >= 0) return byInstance;
  }
  if (!Number.isInteger(startIndex)) return cards.length - 1;
  return Math.max(0, Math.min(startIndex, cards.length - 1));
}
