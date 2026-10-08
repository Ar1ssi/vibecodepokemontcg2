// Detects a Pokémon newly unable to retreat by diffing the view: the engine emits no event
// for it (design 064 slice 4b), but `cannotRetreatUntilTurn` rides on every board card.

const isRetreatLocked = (card, turnNumber) =>
  Number.isFinite(card?.cannotRetreatUntilTurn) && card.cannotRetreatUntilTurn >= turnNumber;

/**
 * @param {Set<number>} prevIds instanceIds locked in the previous view
 * @param {object[]} actives every Active Pokémon in the new view
 * @param {number} turnNumber the new view's turn number
 * @returns {{ next: Set<number>, added: number[] }} `next` is the locked set now; `added` the
 *   ids locked now but not in `prevIds`
 */
export function newlyRetreatLocked(prevIds, actives, turnNumber) {
  const next = new Set();
  const added = [];
  if (!Array.isArray(actives)) return { next, added };
  for (const card of actives) {
    if (card?.instanceId == null || !isRetreatLocked(card, turnNumber)) continue;
    next.add(card.instanceId);
    if (!prevIds?.has(card.instanceId)) added.push(card.instanceId);
  }
  return { next, added };
}
