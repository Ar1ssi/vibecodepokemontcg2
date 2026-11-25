import test from 'node:test';
import assert from 'node:assert/strict';

import { matchManifestToCoins } from '../core/coin-image-manifest.mjs';

test('a coin whose description is a prefix of two different images is reported, not guessed', () => {
  const manifest = [
    { fileName: 'a.png', description: 'Silver Splotch Coin featuring Chansey' },
    { fileName: 'b.png', description: 'Silver Splotch Coin featuring Blissey' },
  ];
  const coins = [{ id: 'short', description: 'Silver Splotch Coin' }];
  const { matches, unmatched } = matchManifestToCoins(manifest, coins);
  assert.deepEqual(matches, []);
  assert.deepEqual(unmatched.map((coin) => coin.id), ['short']);
});

test('two descriptions of one image still match by prefix', () => {
  const manifest = [{ fileName: 'a.png', descriptions: ['Silver Splotch Coin featuring Chansey', 'Silver Splotch Coin featuring Chansey (reissue)'] }];
  const { matches } = matchManifestToCoins(manifest, [{ id: 'short', description: 'Silver Splotch Coin' }]);
  assert.deepEqual(matches, [{ coinId: 'short', fileName: 'a.png' }]);
});
