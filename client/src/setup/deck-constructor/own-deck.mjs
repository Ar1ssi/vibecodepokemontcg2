// The deck this player loaded themselves. `selfDeckData` is also written by
// spectating and by replays, so leaving a room restores from this copy (I198).
export const rememberOwnDeck = (state, deckData, format) => {
  if (!state) return;
  state.ownDeck = deckData ? { deckData, format: format || 'tcg' } : null;
};

/** Puts the player's own deck (or nothing) back into the self slot after leaving a room. */
export const restoreOwnDeck = (state) => {
  if (!state) return;
  const own = state.ownDeck;
  state.selfDeckData = own?.deckData || '';
  if (own && state.deckFormat) state.deckFormat.self = own.format;
};
