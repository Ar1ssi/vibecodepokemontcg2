import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { COIN_MATERIALS, getCoinById, getCoins, getTcglCoins, isTcglCoin } from '../core/coins.mjs';

// The TCG Live picker group (design 069) next to the physical catalog, whose ids decks persist (D84).
const clientRoot = new URL('../../../../', import.meta.url);
const stageCoins = JSON.parse(readFileSync(new URL('src/assets/coins/tcgl/coins.json', clientRoot), 'utf8')).coins;

test('TCG Live coins resolve by id, and physical ids still resolve to the physical coin', () => {
  const tcgl = getTcglCoins();
  assert.ok(tcgl.length > 0);
  const absol = getCoinById('cn_absolmega_slvi');
  assert.equal(absol?.name, 'Mega Absol: Silver Ice');
  assert.equal(absol.family, 'Cracked Ice');
  const physical = getCoins()[0];
  assert.deepEqual(getCoinById(physical.id), physical);
  assert.equal(getCoinById('no-such-coin'), null);
});

test('no TCG Live id collides with a physical coin id', () => {
  const physicalIds = new Set(getCoins().map((coin) => coin.id));
  for (const coin of getTcglCoins()) assert.ok(!physicalIds.has(coin.id), coin.id);
});

test('isTcglCoin tells the two groups apart and tolerates nothing', () => {
  assert.equal(isTcglCoin({ id: 'cn_absolmega_slvi' }), true);
  assert.equal(isTcglCoin(getCoins()[0]), false);
  assert.equal(isTcglCoin(null), false);
});

test('every picker coin is drawable by the coin stage and has its thumbnail on disk', () => {
  for (const coin of getTcglCoins()) {
    assert.ok(Object.hasOwn(stageCoins, coin.id), `${coin.id} is not in coins.json`);
    assert.ok(existsSync(new URL(coin.thumb, clientRoot)), `${coin.id}: ${coin.thumb} is missing`);
    assert.equal(coin.url, coin.thumb);
    assert.ok(COIN_MATERIALS.includes(coin.material), `${coin.id}: material ${coin.material}`);
    assert.ok(coin.name && !/[<>]/.test(coin.name), `${coin.id}: name ${coin.name}`);
  }
});

test('the picker group is sorted by name', () => {
  const names = getTcglCoins().map((coin) => coin.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
});
