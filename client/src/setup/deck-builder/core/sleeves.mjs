// Card sleeves for the deck builder: TCG Live's own sleeves, imported from the game extract by
// scripts/import-tcgl-sleeves.py into client/src/assets/catalogs/tcgl-sleeves.json and
// client/src/assets/sleeves/tcgl/. The catalog loads on demand (design 073 § D): until
// `loadSleeveCatalog()` resolves, the getters below see an empty catalog.
import { loadCatalog, loadedCatalog } from './catalog-loader.mjs';

const CATALOG = 'tcgl-sleeves';
const tcglSleeves = () => loadedCatalog(CATALOG) ?? [];

/** The sleeve catalog in memory; resolves once, and a failed load is retried next call. */
export const loadSleeveCatalog = () => loadCatalog(CATALOG).then(() => undefined);

export const sleeveCatalogLoaded = () => loadedCatalog(CATALOG) !== undefined;

export function getSleeves() {
  return tcglSleeves().map((sleeve) => ({ ...sleeve }));
}

export function getSleeveById(id) {
  const sleeve = tcglSleeves().find((entry) => entry.id === id);
  return sleeve ? { ...sleeve } : null;
}

export function filterSleevesByName(sleeves = [], term = '') {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [...sleeves];
  return sleeves.filter((sleeve) => String(sleeve.name || '').toLowerCase().includes(needle));
}

/**
 * The catalog with the ids the player owns first (design 057: the Elite Trainer Box collection),
 * each group in its original order. Items carry `id`; a missing or empty owned list keeps the order.
 */
export function ownedFirst(items = [], ownedIds = []) {
  const owned = new Set(ownedIds || []);
  if (!owned.size) return [...items];
  return [...items.filter((item) => owned.has(item.id)), ...items.filter((item) => !owned.has(item.id))];
}
