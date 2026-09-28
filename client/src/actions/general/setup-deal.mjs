/** How many cards setup should deal from a deck of `deckCount`. */
export function setupDealPlan(deckCount, { handSize = 7, prizeSize = 6 } = {}) {
  const n = Math.max(0, Number(deckCount) || 0);
  const hand = Math.min(handSize, n);
  const prizes = Math.min(prizeSize, n - hand);
  return { hand, prizes };
}

/**
 * Whether setupPrizes plays its own deck-shuffle flight. Under server authority
 * the server deals only after the opening coin call, and its `deckShuffled`
 * events already animate through the FX queue behind the coin ceremony; the
 * local shuffle resumes on the same `dealOrder` message, so its flight would
 * play under the ceremony (or, on the 5-second fallback, under the call picker).
 */
export function setupShuffleAnimates({ isTwoPlayer = false, serverAuthoritative = false } = {}) {
  return !(isTwoPlayer && serverAuthoritative);
}
