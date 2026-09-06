/** How many cards setup should deal from a deck of `deckCount`. */
export function setupDealPlan(deckCount, { handSize = 7, prizeSize = 6 } = {}) {
  const n = Math.max(0, Number(deckCount) || 0);
  const hand = Math.min(handSize, n);
  const prizes = Math.min(prizeSize, n - hand);
  return { hand, prizes };
}
