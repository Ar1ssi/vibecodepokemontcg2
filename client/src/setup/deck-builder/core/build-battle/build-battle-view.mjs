// What the Build & Battle tab shows, derived from the session and the editor deck (design 051
// § Builder-tab controller). Pure: the DOM glue in native-deck-builder-build-battle.js renders it.

/** @returns {object} the editor's `{ [name]: { cards: [{ data, count }], totalCount } }` map for box deck rows. */
export function deckFromRows(rows = []) {
  const deck = {};
  for (const row of rows) {
    const count = Number(row?.qty) || 0;
    if (!row?.name || count <= 0) continue;
    const { qty: _qty, ...data } = row;
    const group = deck[row.name] || { cards: [], totalCount: 0 };
    group.cards.push({ data, count });
    group.totalCount += count;
    deck[row.name] = group;
  }
  return deck;
}

/** @returns {string} the library name of the deck built from one box. */
export function buildBattleDeckName(deckName, seed) {
  return `B&B ${deckName} #${seed}`;
}

/** @returns {string} "<Box name> · <Deck name> deck · Box #<seed>". */
export function boxHeadline(box, deckEntry, seed) {
  return `${box.name} · ${deckEntry.name} deck · Box #${seed}`;
}

function deckCountsById(deck) {
  const counts = new Map();
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      const id = variant?.data?.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + (Number(variant.count) || 0));
    }
  }
  return counts;
}

/** @returns {Map<string, number>} pool count minus deck count for every pool card id, never below 0. */
export function poolRemaining(deck, pool = []) {
  const inDeck = deckCountsById(deck);
  return new Map(
    pool.map(({ card, count }) => [card.id, Math.max(0, count - (inDeck.get(card.id) || 0))])
  );
}

/** @returns {string} the status line when the pool has no copy of `card` left. */
export function poolRefusalMessage(card, pool = []) {
  const entry = pool.find((item) => item.card?.id === card?.id);
  if (!entry) return `${card?.name || 'That card'} is not in your pool`;
  return `Only ${entry.count} ${card.name} in your pool`;
}

/**
 * @param {{isValid: boolean, errors: string[]}} result from `validateDeck`
 * @param {string[]} poolErrors from `validatePoolDeck`
 * @returns {object} the same result with the pool errors appended; valid only when both are.
 */
export function withPoolErrors(result, poolErrors = []) {
  if (!poolErrors.length) return result;
  return { ...result, isValid: false, errors: [...(result.errors || []), ...poolErrors] };
}
