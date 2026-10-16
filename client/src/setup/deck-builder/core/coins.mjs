// Coin catalog: 202 launch-era (Gen IX) + 737 historical (Gens I-VIII), in
// client/src/assets/catalogs/coins.json (a Bulbapedia scrape; normalize/rewrite with
// `node scripts/normalize-coin-catalog.mjs`). TCG Live's own coins (design 069) are a separate list
// with `cn_` ids, tcgl-coins.json; getCoinById resolves both.
//
// Both files load on demand (design 073 § D): until `loadCoinCatalog()` resolves, the getters
// below see an empty catalog. Callers that run before then wait for it (`coinCatalogLoaded`).

import { loadCatalog, loadedCatalog } from './catalog-loader.mjs';

const PHYSICAL = 'coins';
const TCGL = 'tcgl-coins';

const physicalCoins = () => loadedCatalog(PHYSICAL) ?? [];
const tcglCoins = () => loadedCatalog(TCGL) ?? [];

export const COIN_MATERIALS = ['gold', 'silver', 'metal', 'enamel', 'cardboard'];

/**
 * The first physical coin, the stable default for a player who has not picked one. Kept here so a
 * flip never waits for the catalog to name it; a test pins it to coins.json's first entry.
 */
export const DEFAULT_COIN = Object.freeze({
  id: 'PRC_Red_Primal_Groudon_Coin',
  url: 'src/assets/coins/PRC_Red_Primal_Groudon_Coin.png',
  thumb: 'src/assets/coins/PRC_Red_Primal_Groudon_Coin.png',
  name: 'Primal Groudon Coin',
  material: 'enamel',
});

/** Both coin catalogs in memory; resolves once, and a failed load is retried next call. */
export const loadCoinCatalog = () => Promise.all([loadCatalog(PHYSICAL), loadCatalog(TCGL)]).then(() => undefined);

export const coinCatalogLoaded = () => loadedCatalog(PHYSICAL) !== undefined && loadedCatalog(TCGL) !== undefined;

export function getCoins() {
  return physicalCoins().map((c) => ({ ...c }));
}

/** TCG Live's coins (picker group "TCG Live"), sorted by name; each carries `family`, its shader family. */
export function getTcglCoins() {
  return tcglCoins().map((c) => ({ ...c }));
}

/** True for a TCG Live coin: the coin stage draws it with its own materials. */
export function isTcglCoin(coin) {
  return tcglCoins().some((c) => c.id === coin?.id);
}

/** A physical or TCG Live coin by id (decks persist either), or null. */
export function getCoinById(id) {
  const coin = physicalCoins().find((c) => c.id === id) ?? tcglCoins().find((c) => c.id === id);
  return coin ? { ...coin } : null;
}

/** True when the coin's art is only a placeholder path (no downloaded scan). */
export function isPlaceholderCoin(coin) {
  return /\/coins\/bulbapedia\//.test(String(coin?.url ?? ''));
}

export function filterCoinsByName(coins = [], term = '') {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [...coins];
  return coins.filter((c) => String(c.name ?? '').toLowerCase().includes(needle));
}

/**
 * Faceted filter over a coin list. Every facet is optional; omitted/`'all'`
 * facets are ignored. Matching is case-insensitive for `material`/`region`.
 */
export function filterCoins(coins = [], { term = '', material = 'all', region = 'all', hasImage = false } = {}) {
  const needle = String(term || '').trim().toLowerCase();
  const mat = String(material || 'all').toLowerCase();
  const reg = String(region || 'all').toLowerCase();

  return coins.filter((coin) => {
    if (needle && !String(coin.name ?? '').toLowerCase().includes(needle)) return false;
    if (mat !== 'all' && String(coin.material ?? '').toLowerCase() !== mat) return false;
    if (reg !== 'all' && String(coin.region ?? '').toLowerCase() !== reg) return false;
    if (hasImage && isPlaceholderCoin(coin)) return false;
    return true;
  });
}

/**
 * Group coins that share a release into variant clusters.
 * Coins without a release are omitted. Sorted by variant count desc, then release.
 */
export function groupCoinsByRelease(coins = []) {
  const groups = new Map();
  for (const coin of coins) {
    const release = String(coin.release ?? '').trim();
    if (!release) continue;
    if (!groups.has(release)) {
      groups.set(release, {
        release,
        region: coin.region ?? '',
        releaseDate: coin.releaseDate ?? '',
        count: 0,
        coinIds: [],
      });
    }
    const group = groups.get(release);
    group.count += 1;
    group.coinIds.push(coin.id);
    if (!group.region && coin.region) group.region = coin.region;
    if (!group.releaseDate && coin.releaseDate) group.releaseDate = coin.releaseDate;
  }

  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.release.localeCompare(b.release)
  );
}

/** Aggregate counts for the catalog or a filtered subset. */
export function getCoinStats(coins = []) {
  const byMaterial = {};
  const byRegion = {};
  let placeholders = 0;

  for (const coin of coins) {
    const material = String(coin?.material ?? 'unknown');
    const region = String(coin?.region ?? 'unknown');
    byMaterial[material] = (byMaterial[material] ?? 0) + 1;
    byRegion[region] = (byRegion[region] ?? 0) + 1;
    if (isPlaceholderCoin(coin)) placeholders += 1;
  }

  return {
    total: coins.length,
    byMaterial,
    byRegion,
    releaseGroups: groupCoinsByRelease(coins).length,
    withImage: coins.length - placeholders,
    placeholders,
  };
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
