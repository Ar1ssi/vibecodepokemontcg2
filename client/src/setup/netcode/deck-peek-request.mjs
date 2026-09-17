/**
 * @file Design 012: maps a server deck peek (`peekDeck` socket reply) onto `openCardPicker`
 * arguments. Pure and DOM-free so it runs under `node --test`; `deck-peek.js` opens it.
 *
 * Own deck: pick any of the shown cards to put into your hand; the rest stay where they are.
 * Opponent's deck (rules off only): view only — the server refuses moves from another
 * player's zones.
 */

const plural = (count) => (count === 1 ? 'card' : 'cards');

/**
 * @param {object} input
 * @param {object[]} input.cards peeked cards, in deck order
 * @param {'you'|'them'} input.side whose deck
 * @param {boolean} input.fromTop
 * @param {(instanceIds: number[]) => unknown} input.onTake receives picked instanceIds in
 *   the order they were picked
 * @returns {object|null} openCardPicker options, or null when there is nothing to show
 */
export function buildDeckPeekPickerRequest({ cards, side, fromTop, onTake }) {
  const shown = Array.isArray(cards) ? cards.filter((c) => Number.isInteger(c?.instanceId)) : [];
  if (shown.length === 0) return null;

  const candidates = shown.map((card) => ({
    instanceId: card.instanceId,
    name: card.name || '',
    type: card.type || '',
    image: { src: card.src || '' },
  }));
  const where = `${fromTop === false ? 'Bottom' : 'Top'} ${shown.length} ${plural(shown.length)}`;

  if (side === 'them') {
    return {
      title: `${where} of your opponent's deck`,
      candidates,
      mode: 'browse',
      initialIndex: 0,
      minCount: 0,
      maxCount: 0,
    };
  }

  return {
    title: `${where} of your deck — pick any to put into your hand`,
    candidates,
    multiSelect: true,
    upTo: true,
    minCount: 0,
    maxCount: candidates.length,
    requiredCount: candidates.length,
    // The server moves the cards; the picker only reports the picks.
    pickOnly: true,
    onPick: (card) => onTake(card ? [card.instanceId] : []),
    onConfirm: (picked) => onTake((picked || []).map((card) => card.instanceId)),
  };
}
