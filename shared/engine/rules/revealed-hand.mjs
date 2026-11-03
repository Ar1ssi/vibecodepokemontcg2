/**
 * @file Revealed cards stay revealed while they sit in their owner's hand.
 *
 * A card an effect reveals on its way into the hand (Ultra Ball's "reveal it, and put it into
 * your hand"), or a hand card an effect shows the other player (Lavender Town), is known to the
 * opponent from then on: `card.revealed` is set, so the opponent's view (view.mjs
 * redactOpponentZones) keeps it face up. The knowledge ends when the card leaves the hand —
 * a card that comes back (drawn, returned, shuffled in and redrawn) is unknown again.
 */

// A look only its own player had is not a reveal the opponent saw.
const opponentSaw = (event, ownerId) =>
  !event.peek && (event.revealedTo == null || event.revealedTo !== ownerId);

// Events that put named cards into a hand: each such card entered the hand this command,
// even when it was already there before (a hand shuffled into the deck and redrawn).
const HAND_ENTRY_EVENTS = new Set(['cardsDrawn', 'openingHandDealt', 'mulliganTaken', 'bonusDrawAwarded']);

const idsOf = (cards) =>
  (Array.isArray(cards) ? cards : [])
    .map((card) => (card != null && typeof card === 'object' ? card.instanceId : card))
    .filter((id) => id != null);

const handIdsOf = (state) => new Set(handCardsOf(state).map((card) => card.instanceId));

const handCardsOf = (state) =>
  Object.values(state?.players || {}).flatMap((player) => player?.zones?.hand || []);

/**
 * @param {object[]} events one command's events
 * @returns {{ revealed: Set<*>, entered: Set<*> }}
 */
function readEvents(events) {
  const revealed = new Set();
  const entered = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'cardsRevealed' && opponentSaw(event, event.playerId)) {
      for (const id of idsOf(event.cards)) revealed.add(id);
    } else if (HAND_ENTRY_EVENTS.has(event?.type)) {
      for (const id of idsOf(event.cards)) entered.add(id);
    } else if (event?.type === 'cardMoved' && event.to === 'hand' && event.instanceId != null) {
      entered.add(event.instanceId);
    }
  }
  return { revealed, entered };
}

/**
 * Settles `card.revealed` on every hand after a command: a card revealed this command and now in
 * a hand is marked; a hand card that entered the hand this command without a reveal, and a card
 * that left the hand carrying the hand's mark, lose it (an effect that turns the card face up where
 * it lands, such as Bother-Bot's revealed Prize, keeps its own). Cards that stayed in the hand keep what they had (a manual
 * reveal, an earlier effect's reveal).
 *
 * @param {object} before the state the command started from (not mutated)
 * @param {object} draft the state after the command (mutated)
 * @param {object[]} events the command's events
 * @param {(state: object, instanceId: *) => { card?: object, zoneId?: string } | null} findCard
 */
export function settleRevealedHandCards(before, draft, events, findCard) {
  const handBefore = handIdsOf(before);
  const { revealed, entered } = readEvents(events);
  for (const player of Object.values(draft?.players || {})) {
    for (const card of player?.zones?.hand || []) {
      const id = card.instanceId;
      if (revealed.has(id)) card.revealed = true;
      else if (card.revealed && (!handBefore.has(id) || entered.has(id))) delete card.revealed;
    }
  }
  if (typeof findCard !== 'function') return;
  const handAfter = handIdsOf(draft);
  const knownBefore = handCardsOf(before).filter((card) => card.revealed).map((card) => card.instanceId);
  for (const id of knownBefore) {
    if (handAfter.has(id)) continue;
    const found = findCard(draft, id);
    // A board card's face-down mark is the board's own (clearFaceDownOffBoard); prizes and the
    // rest must not inherit what the hand knew.
    if (found?.card?.revealed && !found.card.faceDown) delete found.card.revealed;
  }
}
