import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COIN_MATERIALS,
  filterCoins,
  getCoinStats,
  getCoins,
  groupCoinsByRelease,
  isPlaceholderCoin,
} from '../core/coins.mjs';

test('isPlaceholderCoin distinguishes placeholder paths from real art', () => {
  assert.equal(isPlaceholderCoin({ url: 'src/assets/coins/bulbapedia/X.jpg' }), true);
  assert.equal(isPlaceholderCoin({ url: 'src/assets/coins/PRC_Red.png' }), false);
  assert.equal(isPlaceholderCoin({ url: 'https://archives.bulbagarden.net/a.png' }), false);
  assert.equal(isPlaceholderCoin(null), false);
  assert.equal(isPlaceholderCoin({}), false);
});

test('filterCoins applies every facet together and ignores "all"', () => {
  const coins = getCoins();
  const gold = filterCoins(coins, { material: 'gold' });
  assert.ok(gold.length > 0);
  assert.ok(gold.every((c) => c.material === 'gold'));

  const japanGold = filterCoins(coins, { material: 'gold', region: 'Japan' });
  assert.ok(japanGold.every((c) => c.material === 'gold' && c.region === 'Japan'));
  assert.ok(japanGold.length <= gold.length);

  const term = filterCoins(coins, { term: 'Pikachu' });
  assert.ok(term.every((c) => c.name.toLowerCase().includes('pikachu')));

  assert.equal(filterCoins(coins, {}).length, coins.length);
  assert.equal(filterCoins(coins, { material: 'all', region: 'all' }).length, coins.length);
});

test('filterCoins hasImage drops placeholder-only coins', () => {
  const coins = getCoins();
  const withImage = filterCoins(coins, { hasImage: true });
  assert.ok(withImage.length > 0 && withImage.length < coins.length);
  assert.ok(withImage.every((c) => !isPlaceholderCoin(c)));
});

test('filterCoins handles empty and malformed input without throwing', () => {
  assert.deepEqual(filterCoins([]), []);
  assert.deepEqual(filterCoins(undefined), []);
  const malformed = [{ id: 'a', name: undefined, material: undefined, region: undefined }];
  assert.equal(filterCoins(malformed, { material: 'gold' }).length, 0);
  assert.equal(filterCoins(malformed, { region: 'Japan' }).length, 0);
  assert.equal(filterCoins(malformed, { hasImage: true }).length, 1);
});

test('groupCoinsByRelease aggregates variant counts and skips releaseless coins', () => {
  const coins = [
    { id: 'a', name: 'A', release: 'Starter Deck', region: 'Japan', releaseDate: 'October 20, 1996' },
    { id: 'b', name: 'B', release: 'Starter Deck', region: 'Japan', releaseDate: 'October 20, 1996' },
    { id: 'c', name: 'C', release: 'Gym', region: 'Japan', releaseDate: 'April 26, 1998' },
    { id: 'd', name: 'D' },
  ];
  const groups = groupCoinsByRelease(coins);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].release, 'Starter Deck');
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].coinIds, ['a', 'b']);
  assert.equal(groups[0].region, 'Japan');
  assert.equal(groups[1].count, 1);
  assert.deepEqual(groupCoinsByRelease([]), []);
  assert.deepEqual(groupCoinsByRelease(undefined), []);
});

test('getCoinStats counts materials, regions and image coverage', () => {
  const coins = [
    { id: 'a', material: 'gold', region: 'Japan', url: 'https://x/a.png' },
    { id: 'b', material: 'gold', region: 'Japan', url: 'src/assets/coins/bulbapedia/b.jpg' },
    { id: 'c', material: 'metal' },
  ];
  const stats = getCoinStats(coins);
  assert.equal(stats.total, 3);
  assert.equal(stats.byMaterial.gold, 2);
  assert.equal(stats.byMaterial.metal, 1);
  assert.equal(stats.byRegion.Japan, 2);
  assert.equal(stats.byRegion.unknown, 1);
  assert.equal(stats.withImage, 2);
  assert.equal(stats.placeholders, 1);
  assert.equal(stats.releaseGroups, 0);

  const empty = getCoinStats([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.withImage, 0);
});

test('catalog materials are all declared', () => {
  for (const coin of getCoins()) {
    assert.ok(COIN_MATERIALS.includes(coin.material), coin.id);
  }
});
