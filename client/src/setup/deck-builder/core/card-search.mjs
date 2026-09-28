import { cachedFetchJson as fetchJson } from './tcgdex-cache.mjs';
import { tcgdexApiUrl } from '../../../../../shared/tcgdex/tcgdex-url.mjs';
import { printedRarity } from '../../../../../shared/engine/rules/card-classify.mjs';
const HUGE_RESULT_THRESHOLD = 2000;
const DETAIL_FETCH_LIMIT = 150;
const tcgdexSetReleaseDateCache = new Map();

function compareReleaseDate(a, b, direction = 'desc') {
  const dateA = String(a.set?.releaseDate || '');
  const dateB = String(b.set?.releaseDate || '');

  if (dateA && dateB && dateA !== dateB) {
    return direction === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  }

  if (dateA && !dateB) return direction === 'asc' ? 1 : -1;
  if (!dateA && dateB) return direction === 'asc' ? -1 : 1;

  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) {
    return direction === 'asc' ? nameCompare : -nameCompare;
  }

  const idCompare = String(a.id || '').localeCompare(String(b.id || ''));
  return direction === 'asc' ? idCompare : -idCompare;
}

function compareName(a, b, direction = 'asc') {
  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) {
    return direction === 'asc' ? nameCompare : -nameCompare;
  }

  const releaseDateCompare = compareReleaseDate(a, b, direction);
  if (releaseDateCompare !== 0) return releaseDateCompare;

  const idCompare = String(a.id || '').localeCompare(String(b.id || ''));
  return direction === 'asc' ? idCompare : -idCompare;
}

// Cards with no printed HP (Trainers, Energy) sort after every Pokémon in
// either direction, so an HP sort always leads with Pokémon.
function compareHp(a, b, direction = 'desc') {
  const hpA = Number.isFinite(a.hp) ? a.hp : null;
  const hpB = Number.isFinite(b.hp) ? b.hp : null;
  if (hpA !== hpB) {
    if (hpA === null) return 1;
    if (hpB === null) return -1;
    return direction === 'asc' ? hpA - hpB : hpB - hpA;
  }
  return compareName(a, b, 'asc');
}

// Collector numbers mix digits and letters ("TG12", "SWSH139", "24a"), so
// compare them the way they read, within the same set first.
function compareNumber(a, b, direction = 'asc') {
  const setCompare = compareReleaseDate(a, b, direction);
  if (String(a.set?.id || '') !== String(b.set?.id || '')) return setCompare;
  const numberCompare = String(a.number || '').localeCompare(String(b.number || ''), undefined, {
    numeric: true,
  });
  if (numberCompare !== 0) return direction === 'asc' ? numberCompare : -numberCompare;
  return compareName(a, b, 'asc');
}

export function applyLocalControls(cards = [], options = {}) {
  const { cardType = 'all', sortBy = 'releaseDate', sortDirection = 'desc' } = options;

  let filtered = [...cards];

  if (cardType === 'pocket') {
    filtered = filtered.filter((card) => String(card.image || '').includes('/tcgp/'));
  } else if (cardType === 'tcg') {
    filtered = filtered.filter((card) => !String(card.image || '').includes('/tcgp/'));
  }

  if (sortBy === 'name') {
    filtered.sort((a, b) => compareName(a, b, sortDirection));
  } else if (sortBy === 'hp') {
    filtered.sort((a, b) => compareHp(a, b, sortDirection));
  } else if (sortBy === 'number') {
    filtered.sort((a, b) => compareNumber(a, b, sortDirection));
  } else {
    filtered.sort((a, b) => compareReleaseDate(a, b, sortDirection));
  }

  return filtered;
}

function stripWildcards(value = '') {
  return String(value).replace(/^\*+|\*+$/g, '').trim();
}

// Transforms well-known user-facing suffixes into the form stored in the database.
// Must run before stripWildcards so that " *" (gold star) isn't consumed as a wildcard.
export function normalizeSearchQuery(term) {
  let t = String(term).trim();

  // E4 (Elite Four) variants → bare " 4" as stored in the database.
  // Standalone "E4" becomes "4" so the API's contains-match finds all " 4" Pokémon.
  if (/^E4$/i.test(t)) return '4';
  if (/ E4 LV\. X$/i.test(t)) return t.replace(/ E4 LV\. X$/i, ' 4');
  if (/ E4 LV\.X$/i.test(t)) return t.replace(/ E4 LV\.X$/i, ' 4');
  if (/ E4$/i.test(t)) return t.replace(/ E4$/i, ' 4');

  // Normalise LV.X (no space) → LV. X (with space) so queryCardsByName has one
  // consistent form to detect via /\bLV\. X$/i — works for both suffix and standalone.
  t = t.replace(/\bLV\.X$/i, 'LV. X');

  // Prism star variants → ◇
  // Standalone forms return "◇" directly so the API finds all prism star cards.
  if (/^(prism star|◇|\{\*\})$/i.test(t)) return '◇';
  if (/ prism star$/i.test(t)) return t.replace(/ prism star$/i, ' ◇');
  if (/ \{\*\}$/.test(t)) return t.replace(/ \{\*\}$/, ' ◇');

  // Gold star variants → Star
  // Standalone forms return "Star" directly so the API finds all gold star cards.
  // Note: bare "*" must be caught here before stripWildcards removes it entirely.
  if (/^(gold star|\*|☆)$/i.test(t)) return 'Star';
  if (/ gold star$/i.test(t)) return t.replace(/ gold star$/i, ' Star');
  if (/ \*$/.test(t)) return t.replace(/ \*$/, ' Star');
  if (/ ☆$/.test(t)) return t.replace(/ ☆$/, ' Star');

  // Delta species variants → δ
  // Standalone "delta" returns "δ" so the API finds all delta species cards.
  if (/^delta$/i.test(t)) return 'δ';
  if (/ delta$/i.test(t)) return t.replace(/ delta$/i, ' δ');

  return t;
}

// Determines how to search for a normalised term.
//
// Returns one of two plan shapes:
//   { type: 'stage', stage, baseName }  — use an API stage filter (e.g. LV.X)
//   { type: 'name',  queries }          — search by name, merging multiple queries
//                                         when the DB uses inconsistent suffix forms (EX, GX)
export function resolveSearchPlan(term) {
  // LV.X: API supports ?stage=LEVEL-UP, optionally combined with ?name for the base Pokémon.
  // \b matches a word boundary so both "Torterra LV. X" and standalone "LV. X" are caught.
  if (/\bLV\. X$/i.test(term)) {
    return { type: 'stage', stage: 'LEVEL-UP', baseName: term.replace(/\s*\bLV\. X$/i, '').trim() };
  }

  // EX / GX: the database uses both "-EX"/"-GX" and " EX"/" GX" inconsistently.
  // Search both forms and merge the results.
  if (/-EX$/i.test(term)) return { type: 'name', queries: [term, term.replace(/-EX$/i, ' EX')] };
  if (/ EX$/i.test(term)) return { type: 'name', queries: [term, term.replace(/ EX$/i, '-EX')] };
  if (/-GX$/i.test(term)) return { type: 'name', queries: [term, term.replace(/-GX$/i, ' GX')] };
  if (/ GX$/i.test(term)) return { type: 'name', queries: [term, term.replace(/ GX$/i, '-GX')] };

  return { type: 'name', queries: [term] };
}

// The same-origin TCGdex proxy refuses query strings longer than this
// (MAX_QUERY_LENGTH in server/tcgdex-proxy.mjs).
const MAX_QUERY_LENGTH = 300;

// Filter params dropped first when a query would be too long: the loosest
// narrowing goes first. The client filter still applies every one of them,
// so dropping a param only widens what TCGdex returns.
const PARAM_DROP_ORDER = [
  'rarity',
  'suffix',
  'retreat',
  'regulationMark',
  'trainerType',
  'energyType',
  'hp',
  'stage',
  'types',
  'legal.standard',
  'legal.expanded',
  'category',
];

/**
 * Builds the `/cards` query params for one summary fetch, dropping filter
 * params (never the name or stage) until the query fits the proxy's limit.
 */
export function buildSummaryQuery({ cardName, cardStage, params = {} } = {}) {
  const query = {};
  if (cardName) query.name = cardName;
  for (const [key, value] of Object.entries(params || {})) {
    if (typeof value === 'string' && value) query[key] = value;
  }
  // The LV.X plan searches by stage itself; it wins over a Stage filter.
  if (cardStage) query.stage = cardStage;

  const fits = () => new URLSearchParams(query).toString().length <= MAX_QUERY_LENGTH;
  for (const key of PARAM_DROP_ORDER) {
    if (fits()) break;
    if (key === 'stage' && cardStage) continue;
    delete query[key];
  }
  return query;
}

export async function fetchCardSummaries(options = {}) {
  const url = new URL(tcgdexApiUrl('/cards'));
  for (const [key, value] of Object.entries(buildSummaryQuery(options))) {
    url.searchParams.set(key, value);
  }
  const summaries = await fetchJson(url.toString());
  return Array.isArray(summaries) ? summaries : [];
}

function getSupertypeFromCategory(category = '') {
  if (!category) return 'Unknown';
  if (String(category).toLowerCase() === 'pokemon') return 'Pokémon';
  return category;
}

export function normalizeTcgdexCard(card) {
  const imageBase = card.image || '';
  const image = imageBase ? `${imageBase}/high.webp` : '';

  return {
    id: card.id,
    name: card.name,
    supertype: getSupertypeFromCategory(card.category),
    stage: card.stage || '',
    number: card.localId || '',
    set: {
      id: card.set?.id || '',
      name: card.set?.name || '',
      releaseDate: card.set?.releaseDate || '',
    },
    images: {
      small: image,
      large: image,
    },
    image,
    rarity: printedRarity(card),
    // Printed Pokémon types ('Fire', 'Water', …) and the Trainer subtype
    // ('Item' | 'Supporter' | 'Stadium' | 'Tool'). Both drive the builder's
    // Live-style filter pills.
    types: Array.isArray(card.types) ? card.types : [],
    trainerType: card.trainerType || '',
    // "Normal" | "Special" (Energy cards only); read by the deck-legality
    // Basic-Energy exemption and rule-box classification.
    energyType: card.energyType || '',
    // Read by the TCG Live filter drawer (card-filters.mjs, design 050).
    hp: Number.isFinite(card.hp) ? card.hp : null,
    retreat: Number.isFinite(card.retreat) ? card.retreat : null,
    weaknesses: Array.isArray(card.weaknesses)
      ? card.weaknesses.map((weakness) => weakness?.type).filter(Boolean)
      : [],
    abilities: Array.isArray(card.abilities)
      ? card.abilities.map((ability) => ability?.name).filter(Boolean)
      : [],
    regulationMark: card.regulationMark || '',
    legal: {
      standard: card.legal?.standard === true,
      expanded: card.legal?.expanded === true,
    },
    suffix: card.suffix || '',
    _provider: 'tcgdex',
  };
}


async function hydrateTcgdexSetReleaseDates(cards = []) {
  const uniqueSetIds = [...new Set(cards.map((card) => card?.set?.id).filter(Boolean))];
  const missingSetIds = uniqueSetIds.filter((setId) => !tcgdexSetReleaseDateCache.has(setId));

  await Promise.all(
    missingSetIds.map(async (setId) => {
      try {
        const setData = await fetchJson(tcgdexApiUrl(`/sets/${setId}`));
        tcgdexSetReleaseDateCache.set(setId, setData?.releaseDate || '');
      } catch {
        tcgdexSetReleaseDateCache.set(setId, '');
      }
    })
  );

  return cards.map((card) => ({
    ...card,
    set: {
      ...card.set,
      releaseDate: card?.set?.releaseDate || tcgdexSetReleaseDateCache.get(card?.set?.id) || '',
    },
  }));
}

/**
 * Searches TCGdex by card name, by filter params, or both (design 050).
 *
 * `params` come from card-filters.mjs's buildTcgdexFilterParams: TCGdex narrows
 * with them and the caller re-applies the full filter set to the result. With
 * no name and no params there is nothing to ask for, so nothing is fetched.
 *
 * `detailedCount` < `totalSummaries` means the detail cap cut the list short.
 */
export async function queryCards({ term = '', params = {} } = {}) {
  const cleanName = stripWildcards(normalizeSearchQuery(String(term)));
  const hasParams = Object.keys(params || {}).length > 0;
  if (!cleanName && !hasParams) {
    return {
      results: [],
      totalSummaries: 0,
      detailedCount: 0,
      term: cleanName,
      isHugeResultSet: false,
    };
  }

  let allSummaries = [];

  if (!cleanName) {
    allSummaries = await fetchCardSummaries({ params });
  } else {
    const plan = resolveSearchPlan(cleanName);
    if (plan.type === 'stage') {
      allSummaries = await fetchCardSummaries({
        cardName: plan.baseName,
        cardStage: plan.stage,
        params,
      });
    } else {
      const seen = new Set();
      for (const query of plan.queries) {
        const summaries = await fetchCardSummaries({ cardName: query, params });
        for (const s of summaries) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            allSummaries.push(s);
          }
        }
      }
    }
  }

  if (allSummaries.length > HUGE_RESULT_THRESHOLD) {
    return {
      results: [],
      totalSummaries: allSummaries.length,
      detailedCount: 0,
      term: cleanName,
      isHugeResultSet: true,
    };
  }

  const summariesToFetch = allSummaries.slice(0, DETAIL_FETCH_LIMIT);

  const detailedCards = await Promise.all(
    summariesToFetch.map(async (summary) => {
      try {
        const detail = await fetchJson(tcgdexApiUrl(`/cards/${summary.id}`));
        return normalizeTcgdexCard(detail);
      } catch {
        return null;
      }
    })
  );

  const validCards = detailedCards.filter((card) => card && card.image);

  const hydratedCards = await hydrateTcgdexSetReleaseDates(validCards);

  return {
    results: hydratedCards,
    totalSummaries: allSummaries.length,
    detailedCount: summariesToFetch.length,
    term: cleanName,
    isHugeResultSet: false,
  };
}

/** One card's full TCGdex record, normalized like a search result. */
export async function fetchCardDetail(cardId) {
  const detail = await fetchJson(tcgdexApiUrl(`/cards/${encodeURIComponent(cardId)}`));
  return normalizeTcgdexCard(detail);
}

/** Name-only search, for callers with no filters (the rules debug menu). */
export function queryCardsByName(term = '') {
  return queryCards({ term });
}
