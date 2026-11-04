/**
 * @file The starter's turn-1 draw, after setup.
 *
 * Setup ends when every player has placed a Starting Active Pokémon; only then does the first
 * player draw for their turn. `setupGame` leaves the draw owed in `state.openingDrawPending`
 * (the starter's id) and this settle pays it in the command that puts the last Active down, so
 * the drawn card can never be chosen as the Active and arrives after the placement.
 */

const hasActive = (player) => (player?.zones?.active || []).length > 0;

/**
 * @param {object} draft the state after a command (mutated)
 * @param {{ events: object[] }} ctx
 */
export function settleOpeningDraw(draft, { events }) {
  const starter = draft?.openingDrawPending;
  if (starter == null) return;
  const players = Object.values(draft.players || {});
  const player = draft.players?.[starter];
  // Owed only on the starter's first turn; a state that moved past it no longer owes it.
  if (!player || draft.turn?.number !== 1 || draft.turn?.player !== starter) {
    delete draft.openingDrawPending;
    return;
  }
  if (players.length === 0 || !players.every(hasActive)) return;
  delete draft.openingDrawPending;
  const deck = player.zones?.deck || [];
  if (deck.length === 0) return;
  const [card] = deck.splice(0, 1);
  player.zones.hand.push(card);
  events.push({ type: 'cardsDrawn', playerId: starter, count: 1, cards: [{ instanceId: card.instanceId }] });
}
