// Pre-fetches every card of a saved deck into the persistent TCGdex cache
// (shared/tcgdex/tcgdex-cache.mjs), so the next game resolves the deck's stages,
// attacks and Tool/Energy types locally instead of fetching 60 cards at deal time.

// Low and sequential per worker: this runs while the user is still in the builder, and a
// burst is exactly what got TCGdex/Cloudflare to block direct card lookups (D164).
const WARM_CONCURRENCY = 2;

/**
 * Unique TCGdex card ids in a deck-builder deck ({ [name]: { cards: [{ data, count }] } }).
 * @param {object} deck
 * @returns {string[]}
 */
export function deckCardIds(deck = {}) {
  const ids = new Set();
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      const id = variant?.data?.id;
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * @param {object} deck Deck-builder deck.
 * @param {(id: string) => Promise<unknown>} fetchDetail Cached detail fetch; failures are
 *   ignored — a card that misses here is simply fetched again at deal time.
 * @returns {Promise<number>} How many ids were attempted.
 */
export async function warmDeckCardCache(deck, fetchDetail) {
  const ids = deckCardIds(deck);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await fetchDetail(id);
      } catch {
        /* best effort */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, ids.length) }, worker));
  return ids.length;
}
