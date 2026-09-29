// Loads one box's baked data on demand (design 054 § Generated data): the set module the box's
// packs draw from and the box module (decks, groups, Trainer pools). The only module that imports
// `sets/` or `boxes/`, always with `import()`, so the tab never loads 42 sets it will not show.

import { BUILD_BATTLE_BOXES, getBuildBattleBox } from './box-catalog.mjs';

const TCGDEX_ASSETS = 'https://assets.tcgdex.net/en';

const defaultImporter = (path) => import(path);

// Memoized per importer: tests pass their own and never share the browser's cache.
const cachesByImporter = new WeakMap();

const cacheFor = (importer) => {
  if (!cachesByImporter.has(importer)) cachesByImporter.set(importer, new Map());
  return cachesByImporter.get(importer);
};

/** @returns {string} the id of the set a card id belongs to (`swsh9tg-TG01` → `swsh9tg`). */
export function setIdOfCardId(cardId) {
  const id = String(cardId ?? '');
  const cut = id.lastIndexOf('-');
  return cut > 0 ? id.slice(0, cut) : '';
}

/**
 * Set module rows → the SetCards the rest of the tab uses (design 051's shape): TCGdex art from
 * the set's series, id and localId unless the row carries its own `images`; `set` from `SET`.
 * @param {{id: string, name: string, series: string, subsets?: Record<string, {name: string}>}} setInfo
 * @param {object[]} rows
 */
export function hydrateSetCards(setInfo, rows = []) {
  return rows.map((row) => {
    const setId = setIdOfCardId(row.id);
    const base = `${TCGDEX_ASSETS}/${setInfo.series}/${setId}/${row.localId}`;
    const images = row.images || { small: `${base}/low.webp`, large: `${base}/high.webp` };
    const card = {
      id: row.id,
      name: row.name,
      supertype: row.supertype,
      localId: row.localId,
      image: images.large,
      images,
      set: { id: setId, name: setInfo.subsets?.[setId]?.name || setInfo.name, releaseDate: '' },
      rarity: row.rarity,
      category: row.category,
      stage: row.stage,
      types: row.types,
      hp: row.hp,
    };
    return row.subset ? { ...card, subset: row.subset } : card;
  });
}

/**
 * The box module → `BoxData`: its card rows by id and the structures that name them. Fixed decks
 * become full rows with `qty`, as 051's `BUILD_BATTLE_DECKS` were.
 */
export function hydrateBoxData(raw = {}) {
  const cardsById = new Map((raw.cards || []).map((card) => [card.id, card]));
  const toRows = (entries = []) =>
    entries.filter((entry) => cardsById.has(entry.id)).map(({ id, qty }) => ({ ...cardsById.get(id), qty }));
  const decks = raw.decks
    ? Object.fromEntries(Object.entries(raw.decks).map(([key, entries]) => [key, toRows(entries)]))
    : null;
  return {
    kind: raw.kind,
    cardsById,
    decks,
    promos: raw.promos || null,
    groups: raw.groups || null,
    common: raw.common || [],
    trainers: raw.trainers || [],
    energySwaps: raw.energySwaps || [],
    energyNeeds: raw.energyNeeds || {},
  };
}

function toLoadedBox(box, setModule, boxModule) {
  const setInfo = setModule?.SET;
  const rows = setModule?.default;
  if (!setInfo || setInfo.id !== box.setId || !Array.isArray(rows)) {
    throw new Error(`set module ${box.setId} is malformed`);
  }
  const data = hydrateBoxData(boxModule?.default);
  if (data.kind !== box.kind) throw new Error(`box module ${box.key} holds ${data.kind}, not ${box.kind}`);
  return { box, setInfo, cards: hydrateSetCards(setInfo, rows), data };
}

/**
 * @param {string} boxKey
 * @param {{importer?: (path: string) => Promise<object>}} [options] tests stub the imports
 * @returns {Promise<{box: object, setInfo: object, cards: object[], data: object}>} memoized per
 *   key; an unknown key rejects `Error('unknown box')`, a failed import rejects with its error and
 *   is not kept, so a retry imports again.
 */
export function loadBoxData(boxKey, { importer = defaultImporter } = {}) {
  const box = getBuildBattleBox(boxKey);
  if (!box) return Promise.reject(new Error('unknown box'));
  const cache = cacheFor(importer);
  if (cache.has(box.key)) return cache.get(box.key);
  const loading = Promise.all([
    importer(`./sets/${box.setId}.generated.mjs`),
    importer(`./boxes/${box.key}.generated.mjs`),
  ]).then(([setModule, boxModule]) => toLoadedBox(box, setModule, boxModule));
  cache.set(box.key, loading);
  loading.catch(() => cache.delete(box.key));
  return loading;
}

const knownSetIds = () => new Set(BUILD_BATTLE_BOXES.map((box) => box.setId));

/**
 * One baked set on its own, for products that are not a Build & Battle box (the Elite Trainer
 * Box, design 057): only sets some box bakes exist under `sets/`.
 * @param {string} setId
 * @param {{importer?: (path: string) => Promise<object>}} [options] tests stub the imports
 * @returns {Promise<{setInfo: object, cards: object[]}>} memoized per set; an unbaked set rejects
 *   `Error('unknown set')`, a failed import rejects with its error and is not kept.
 */
export function loadSetData(setId, { importer = defaultImporter } = {}) {
  if (typeof setId !== 'string' || !knownSetIds().has(setId)) {
    return Promise.reject(new Error('unknown set'));
  }
  const cache = cacheFor(importer);
  const key = `set:${setId}`;
  if (cache.has(key)) return cache.get(key);
  const loading = importer(`./sets/${setId}.generated.mjs`).then((setModule) => {
    const setInfo = setModule?.SET;
    const rows = setModule?.default;
    if (!setInfo || setInfo.id !== setId || !Array.isArray(rows)) {
      throw new Error(`set module ${setId} is malformed`);
    }
    return { setInfo, cards: hydrateSetCards(setInfo, rows) };
  });
  cache.set(key, loading);
  loading.catch(() => cache.delete(key));
  return loading;
}
