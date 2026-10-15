/**
 * The TCG Live filter drawer applied to the Browse Sets tab (design 050).
 *
 * A set listing only knows each card's id, name, number, image and class, so
 * most filters need the card's full record. To keep that affordable, TCGdex
 * narrows each set first (`set.id=eq:<id>` plus the filters it understands)
 * and only the survivors are fetched in full and checked by applyCardFilters,
 * which stays the truth. Filters TCGdex cannot narrow are only checked on the
 * set the player opened, never on every set at once.
 *
 * Pure: the fetches are injected.
 */

import {
  applyCardFilters,
  buildTcgdexFilterParams,
  createEmptyFilters,
  hasActiveFilters,
} from './card-filters.mjs';

/** Most full card records one filter pass fetches. */
export const BROWSE_DETAIL_LIMIT = 300;
const DETAIL_CONCURRENCY = 8;

// The groups a set listing card can answer by itself. "In current deck"
// depends on the deck, which changes without refiltering, so the browser
// applies it at render time instead of here.
const LISTING_GROUPS = ['supertypes', 'sets'];

const withoutInDeck = (filters) => ({ ...createEmptyFilters(), ...filters, inDeck: false });

/** True when some active filter needs the full card record, not the listing. */
export function filtersNeedCardDetails(filters = {}) {
  const rest = withoutInDeck(filters);
  for (const group of LISTING_GROUPS) rest[group] = [];
  return hasActiveFilters(rest);
}

/**
 * True when one pass can cover every set in the tab: TCGdex can narrow the
 * query, or no full records are needed. Otherwise only the opened set is
 * covered, so a filter like "Has Ability" alone never fetches every card of
 * every set.
 */
export function filtersCoverEverySet(filters = {}) {
  const narrowable = Object.keys(buildTcgdexFilterParams(withoutInDeck(filters))).length > 0;
  return narrowable || !filtersNeedCardDetails(filters);
}

// Here a picked Expansion is one of the tab's sets, and some of those are
// synthetic (the Energy tab, Black Bolt / White Flare) with cards from other
// set ids. So picked sets choose which sets are scanned; a card's own set.id
// is never compared with them.
function pickedTabSets(filters, setIds) {
  const picked = Array.isArray(filters?.sets) ? filters.sets : [];
  return picked.length ? setIds.filter((setId) => picked.includes(setId)) : [...setIds];
}

/**
 * Which sets one filter pass covers (see filtersCoverEverySet), narrowed to the
 * picked Expansions; none when no set is open.
 */
export function scopeFilterSets({ filters = {}, setIds = [], expandedSetId = null } = {}) {
  const candidates = pickedTabSets(filters, setIds);
  if (filtersCoverEverySet(filters)) return candidates;
  return expandedSetId && candidates.includes(expandedSetId) ? [expandedSetId] : [];
}

async function mapWithLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Finds the cards of `setIds` that pass `filters` (except "In current deck").
 * Picked Expansions narrow `setIds` (see pickedTabSets); unpicked sets get no entry.
 *
 * @param {object} options
 * @param {string[]} options.setIds
 * @param {object} options.filters - card-filters.mjs state
 * @param {(params: object) => Promise<{id: string}[]>} options.fetchSummaries
 * @param {(setId: string) => Promise<object[]>} options.loadSetCards - listing cards
 * @param {(cardId: string) => Promise<object>} options.fetchDetail - normalized record
 * @param {number} [options.detailLimit]
 * @returns {Promise<{matches: Map<string, Set<string>>, candidateCount: number,
 *   checkedCount: number, truncated: boolean}>}
 */
export async function findSetFilterMatches({
  setIds = [],
  filters = {},
  fetchSummaries,
  loadSetCards,
  fetchDetail,
  detailLimit = BROWSE_DETAIL_LIMIT,
}) {
  const scanned = pickedTabSets(filters, setIds);
  const active = { ...withoutInDeck(filters), sets: [] };
  const params = buildTcgdexFilterParams(active);
  const narrowable = Object.keys(params).length > 0;
  const matches = new Map();

  if (!filtersNeedCardDetails(active)) {
    const lists = await Promise.all(scanned.map((setId) => loadSetCards(setId)));
    let count = 0;
    scanned.forEach((setId, index) => {
      const kept = applyCardFilters(lists[index] || [], active).map((card) => card.id);
      count += kept.length;
      matches.set(setId, new Set(kept));
    });
    return { matches, candidateCount: count, checkedCount: count, truncated: false };
  }

  const candidateLists = await Promise.all(
    scanned.map(async (setId) => {
      // Synthetic sets (`__...__` ids) have no TCGdex set.id to query by.
      const rows = narrowable && !String(setId).startsWith('__')
        ? await fetchSummaries({ ...params, 'set.id': `eq:${setId}` })
        : await loadSetCards(setId);
      return (rows || []).map((row) => row.id).filter(Boolean);
    })
  );

  const candidates = [];
  scanned.forEach((setId, index) => {
    matches.set(setId, new Set());
    for (const cardId of candidateLists[index]) candidates.push({ setId, cardId });
  });

  const toCheck = candidates.slice(0, detailLimit);
  const details = await mapWithLimit(toCheck, DETAIL_CONCURRENCY, async ({ cardId }) => {
    try {
      return await fetchDetail(cardId);
    } catch {
      return null;
    }
  });

  toCheck.forEach(({ setId, cardId }, index) => {
    const detail = details[index];
    if (detail && applyCardFilters([detail], active).length) matches.get(setId).add(cardId);
  });

  return {
    matches,
    candidateCount: candidates.length,
    checkedCount: toCheck.length,
    truncated: candidates.length > toCheck.length,
  };
}
