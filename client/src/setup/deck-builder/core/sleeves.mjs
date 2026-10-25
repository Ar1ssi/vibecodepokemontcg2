// Card sleeves for the deck builder: the Pokémon Sleeve Database dump, with TCG Live's better scans
// (client/src/assets/sleeves/tcgl/, from scripts/import-tcgl-sleeves.py) swapped in wherever TCG Live
// has the same sleeve. Such an entry takes the `cs_*` id and lists the database ids it replaced in
// `aliases`, so decks saved under either id still resolve. The catalog is client/src/assets/catalogs/
// sleeves.json and loads on demand (design 073 § D): until `loadSleeveCatalog()` resolves, the getters
// below see an empty catalog.
import { loadCatalog, loadedCatalog } from './catalog-loader.mjs';

const CATALOG = 'sleeves';
const tcglSleeves = () => loadedCatalog(CATALOG) ?? [];

/** The sleeve catalog in memory; resolves once, and a failed load is retried next call. */
export const loadSleeveCatalog = () => loadCatalog(CATALOG).then(() => undefined);

export const sleeveCatalogLoaded = () => loadedCatalog(CATALOG) !== undefined;

export function getSleeves() {
  return tcglSleeves().map((sleeve) => ({ ...sleeve }));
}

export function getSleeveById(id) {
  const sleeve = tcglSleeves().find((entry) => entry.id === id || entry.aliases?.includes(id));
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
