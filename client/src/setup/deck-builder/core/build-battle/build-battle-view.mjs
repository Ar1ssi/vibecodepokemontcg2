// What the Build & Battle tab shows, derived from the session and the editor deck (design 051
// § Builder-tab controller). Pure: the DOM glue in native-deck-builder-build-battle.js renders it.

import {
  DECK_FORMAT_BUILD_BATTLE,
  DECK_FORMAT_TCG,
} from '../../../../../../shared/engine/formats.mjs';

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

/**
 * Rebuilds an editor deck from [cardId, count] pairs (I207). Ids missing from `cards` are
 * dropped, so a stored deck can never add a card the box did not hold.
 * @param {[string, number][]} counts
 * @param {object[]} cards every card the pair ids may name (pool, box deck, unlimited Energy)
 */
export function deckFromCardCounts(counts = [], cards = []) {
  const byId = new Map(cards.filter((card) => card?.id).map((card) => [card.id, card]));
  const rows = [];
  for (const [id, qty] of counts) {
    const card = byId.get(id);
    if (card) rows.push({ ...card, qty });
  }
  return deckFromRows(rows);
}

/**
 * The format a deck is played and first saved with: a saved record's own format wins, so a
 * Standard deck opened from My Decks in the Build & Battle tab keeps 6 Prizes; only an unsaved
 * deck in the Build & Battle tab is Build & Battle (I205: its first Save records that).
 * @returns {'tcg'|'build-battle'}
 */
export function deckLoadFormat({ isBuildBattle = false, recordedFormat = null, isUnsaved = true } = {}) {
  if (recordedFormat === DECK_FORMAT_BUILD_BATTLE) return DECK_FORMAT_BUILD_BATTLE;
  return isBuildBattle && isUnsaved ? DECK_FORMAT_BUILD_BATTLE : DECK_FORMAT_TCG;
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
