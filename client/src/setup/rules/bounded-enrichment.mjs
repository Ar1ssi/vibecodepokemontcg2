// The Starting Active picker must open even when card-data enrichment is slow or hangs
// (TCGdex fetches have no timeout of their own). Enrich all cards in parallel and stop
// waiting on any that outlast the bound; unenriched cards stay usable.

export const ENRICHMENT_BOUND_MS = 4000;

/**
 * Runs `enrich` on every card at once and resolves when all settle or `boundMs` passes,
 * whichever is first. Never rejects: a failed or late enrichment leaves its card as is.
 *
 * @param {object[]} cards
 * @param {(card: object) => Promise<unknown>} enrich
 * @param {number} [boundMs]
 * @returns {Promise<void>}
 */
export function enrichWithinBound(cards, enrich, boundMs = ENRICHMENT_BOUND_MS) {
  if (!Array.isArray(cards) || cards.length === 0) return Promise.resolve();
  let timer = null;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, boundMs);
  });
  const all = Promise.allSettled(
    cards.map((card) => {
      try {
        return Promise.resolve(enrich(card));
      } catch (error) {
        return Promise.reject(error);
      }
    })
  );
  return Promise.race([all, bound]).then(() => clearTimeout(timer));
}
