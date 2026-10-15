// The baked Limitless dataset (design 069, schema v1): validation, indexing and a memoized loader.
// Built by scripts/limitless/build-meta-dataset.mjs into client/src/assets/meta/limitless-standard.json.

export const DATASET_VERSION = 1;
export const DATASET_URL = '/src/assets/meta/limitless-standard.json';
const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 28;

/** Placement weight (design 069 Option 5); a missing placing counts as 65+. */
export function placementWeight(placing) {
  if (!Number.isInteger(placing) || placing < 1) return 0.4;
  if (placing <= 8) return 1;
  if (placing <= 16) return 0.85;
  if (placing <= 32) return 0.7;
  if (placing <= 64) return 0.55;
  return 0.4;
}

export function recencyWeight(eventDate, newestDate) {
  const age = (Date.parse(newestDate) - Date.parse(eventDate)) / DAY_MS;
  if (!Number.isFinite(age) || age <= 0) return 1;
  return 0.5 ** (age / RECENCY_HALF_LIFE_DAYS);
}

/** `{ ok: true }` or `{ ok: false, reason }`; checks structure and every index the engine follows. */
export function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') return { ok: false, reason: 'not a JSON object' };
  if (dataset.version !== DATASET_VERSION) {
    return { ok: false, reason: `dataset version ${dataset.version}, expected ${DATASET_VERSION}` };
  }
  for (const field of ['events', 'archetypes', 'cards', 'lists']) {
    if (!Array.isArray(dataset[field])) return { ok: false, reason: `missing ${field}` };
  }
  if (!dataset.printIndex || typeof dataset.printIndex !== 'object') return { ok: false, reason: 'missing printIndex' };
  if (!dataset.lists.length) return { ok: false, reason: 'no decklists' };
  const cardCount = dataset.cards.length;
  const badCard = dataset.cards.findIndex(
    (card) => !card || typeof card.key !== 'string' || typeof card.name !== 'string' || typeof card.print !== 'string'
  );
  if (badCard >= 0) return { ok: false, reason: `card ${badCard} is malformed` };
  for (let i = 0; i < dataset.lists.length; i += 1) {
    const list = dataset.lists[i];
    if (!list || !Array.isArray(list.c) || list.c.length % 2 || !dataset.events[list.e]) {
      return { ok: false, reason: `list ${i} is malformed` };
    }
    if (list.a !== -1 && !dataset.archetypes[list.a]) return { ok: false, reason: `list ${i} has no archetype ${list.a}` };
    for (let j = 0; j < list.c.length; j += 2) {
      const idx = list.c[j];
      const count = list.c[j + 1];
      if (!Number.isInteger(idx) || idx < 0 || idx >= cardCount || !Number.isInteger(count) || count < 1) {
        return { ok: false, reason: `list ${i} has a bad card entry` };
      }
    }
  }
  return { ok: true };
}

/** Name lookup key: "Basic Fire Energy" and "Fire Energy" meet; accents and curly quotes flatten. */
export function nameKey(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^basic (?=\S+ energy$)/, '');
}

/**
 * Precomputes what every suggestion pass reads: per-list card maps, per-list weights (placement ×
 * recency) and each card's meta-wide weighted inclusion.
 */
export function indexDataset(dataset) {
  const newest = dataset.events.reduce((max, event) => (event.date > max ? event.date : max), '');
  const eventRecency = dataset.events.map((event) => recencyWeight(event.date, newest));
  const listCounts = dataset.lists.map((list) => {
    const counts = new Map();
    for (let j = 0; j < list.c.length; j += 2) counts.set(list.c[j], list.c[j + 1]);
    return counts;
  });
  const listWeights = dataset.lists.map((list) => placementWeight(list.p) * eventRecency[list.e]);
  const totalWeight = listWeights.reduce((sum, weight) => sum + weight, 0);
  const globalInclusion = new Float64Array(dataset.cards.length);
  listCounts.forEach((counts, i) => {
    for (const idx of counts.keys()) globalInclusion[idx] += listWeights[i];
  });
  if (totalWeight > 0) for (let i = 0; i < globalInclusion.length; i += 1) globalInclusion[i] /= totalWeight;

  const byName = new Map();
  dataset.cards.forEach((card, idx) => {
    const key = nameKey(card.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(idx);
  });
  const keyIndex = new Map(dataset.cards.map((card, idx) => [card.key, idx]));
  return { dataset, listCounts, listWeights, globalInclusion, byName, keyIndex };
}

let pending = null;

/**
 * Fetches, validates and indexes the dataset once per page. `fetchJson(url)` is injected (the
 * browser passes a fetch wrapper). A failure is returned, not thrown, and not memoized, so the
 * panel can offer a retry.
 * @returns {Promise<{ ok: true, index } | { ok: false, reason: string }>}
 */
export function loadMetaDataset(fetchJson, url = DATASET_URL) {
  if (pending) return pending;
  pending = (async () => {
    let dataset;
    try {
      dataset = await fetchJson(url);
    } catch (error) {
      return { ok: false, reason: `could not load tournament data (${error?.message || 'network error'})` };
    }
    const check = validateDataset(dataset);
    if (!check.ok) return { ok: false, reason: `tournament data is invalid: ${check.reason}` };
    return { ok: true, index: indexDataset(dataset) };
  })().then((result) => {
    if (!result.ok) pending = null;
    return result;
  });
  return pending;
}

/** Test seam: forget the memoized load. */
export function resetMetaDatasetCache() {
  pending = null;
}
