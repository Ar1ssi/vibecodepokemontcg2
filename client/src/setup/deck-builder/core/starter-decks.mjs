// Starter decks (Mega Battle Decks + Pokémon TCG Live starter decks), seeded into My Decks.
// Gengar/Diancie: Bulbapedia Mega Battle Deck lists, resolved card data baked by hand into
// client/src/assets/catalogs/starter-deck-catalog.json (`bakedLists`), which also holds the seven
// decks' names and cosmetics (`decks`). TCG Live decks: official lists from pokemon.com (March 2026
// starter strategies + Pitch Black battle pass), built into starter-decks.json by
// scripts/generate-starter-decks.mjs.
//
// Both files load on demand (design 073 § D): until `loadStarterDecks()` resolves, the getters
// below see no decks.
import { loadCatalog, loadedCatalog } from './catalog-loader.mjs';

const HAND_KEPT = 'starter-deck-catalog';
const GENERATED = 'starter-decks';

/** Both starter-deck files in memory; resolves once, and a failed load is retried next call. */
export const loadStarterDecks = () =>
  Promise.all([loadCatalog(HAND_KEPT), loadCatalog(GENERATED)]).then(() => undefined);

export const starterDecksLoaded = () =>
  loadedCatalog(HAND_KEPT) !== undefined && loadedCatalog(GENERATED) !== undefined;

/** Each starter deck's `key`, `name`, `sleeveId`, `coinId`, `sprites` and optional `matId`. */
export function getStarterDeckCatalog() {
  return loadedCatalog(HAND_KEPT)?.decks ?? [];
}

/** Card rows (`{ ...card, qty }`) per starter deck key. */
export function getStarterDecks() {
  return {
    ...loadedCatalog(HAND_KEPT)?.bakedLists,
    ...loadedCatalog(GENERATED),
  };
}
