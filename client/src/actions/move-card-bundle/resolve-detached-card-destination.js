// A Pokémon leaving play for the discard pile or Lost Zone (KO, manual
// discard) takes its attached Energy/Tools with it — real TCG rules never
// leave them behind for manual clean-up. Every other destination (hand,
// deck, etc.) still stages detached cards in the 'attachedCards' zone for
// the player to route by hand.
export const resolveDetachedCardDestination = (dZoneId) =>
  ['discard', 'lostZone'].includes(dZoneId) ? dZoneId : 'attachedCards';
