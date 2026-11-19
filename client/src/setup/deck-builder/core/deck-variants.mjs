/**
 * Every `{ data, count }` variant of a builder deck (`{ [name]: { cards: [...] } }`) in deck order.
 * Tolerates a missing deck, a group without cards and a null variant; callers read what they need.
 * @returns {object[]}
 */
export function deckVariants(deck) {
  if (!deck || typeof deck !== 'object') return [];
  return Object.values(deck).flatMap((group) => (Array.isArray(group?.cards) ? group.cards : []));
}
