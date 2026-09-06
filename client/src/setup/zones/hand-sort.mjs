/** True when a board card matches a decklist row (name + optional number/set/id). */
export function cardMatchesDeckEntry(card, entry) {
  if (!card || !entry) return false;
  const [, name, , , number, set, tcgId] = entry;
  if (card.name !== name) return false;
  if (number && card.number && String(card.number) !== String(number)) {
    return false;
  }
  if (set && card.set && card.set !== set) return false;
  if (tcgId && card.id && card.id !== tcgId) return false;
  return true;
}

/**
 * Deterministic zone sort keyed by decklist row order and quantity.
 * Both clients must produce identical array order given the same deckData.
 */
export function sortCardsByDeckList(cards, deckData) {
  if (!cards?.length) return [];
  if (!deckData?.length) return [...cards];

  const used = new Set();
  const sorted = [];

  for (const entry of deckData) {
    const quantity = parseInt(entry[0], 10) || 1;
    let matched = 0;
    const candidates = cards
      .filter((card) => !used.has(card) && cardMatchesDeckEntry(card, entry))
      .sort((a, b) => {
        const aVal = a.syncInstance ?? a.cardId;
        const bVal = b.syncInstance ?? b.cardId;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return aVal - bVal;
        }
        return String(aVal ?? '').localeCompare(String(bVal ?? ''));
      });
    for (const card of candidates) {
      sorted.push(card);
      used.add(card);
      matched++;
      if (matched >= quantity) break;
    }
  }

  for (const card of cards) {
    if (!used.has(card)) sorted.push(card);
  }

  return sorted;
}
