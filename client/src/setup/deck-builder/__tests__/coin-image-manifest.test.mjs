import test from 'node:test';
import assert from 'node:assert/strict';

import {
  absoluteImageUrl,
  buildManifest,
  imageFileName,
  matchManifestToCoins,
  normalizeMatchText,
  parseCoinTables,
  wikiImageUrl,
} from '../core/coin-image-manifest.mjs';

test('absoluteImageUrl absolutises protocol- and page-relative sources', () => {
  assert.equal(
    absoluteImageUrl('//archives.bulbagarden.net/media/upload/c/cb/Coin.png'),
    'https://archives.bulbagarden.net/media/upload/c/cb/Coin.png'
  );
  assert.equal(
    absoluteImageUrl('/media/upload/c/cb/Coin.png'),
    'https://bulbapedia.bulbagarden.net/media/upload/c/cb/Coin.png'
  );
  assert.equal(absoluteImageUrl(''), '');
  assert.equal(absoluteImageUrl('not-a-url.png'), '');
});

test('wikiImageUrl strips thumbnail scaling', () => {
  assert.equal(
    wikiImageUrl(
      'https://archives.bulbagarden.net/media/upload/thumb/c/cb/SP_Silver_Chansey_Coin.png/120px-SP_Silver_Chansey_Coin.png'
    ),
    'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'
  );
});

test('imageFileName decodes, drops the NNNpx- prefix, sanitises and defaults an extension', () => {
  assert.equal(
    imageFileName(
      'https://x/media/upload/thumb/c/cb/SP_Silver_Chansey_Coin.png/120px-SP_Silver_Chansey_Coin.png'
    ),
    'SP_Silver_Chansey_Coin.png'
  );
  assert.equal(imageFileName('https://x/a/My%20Coin.jpg'), 'My_Coin.jpg');
  assert.equal(imageFileName('https://x/a/Coin'), 'Coin.png');
  assert.equal(imageFileName('https://x/a/../../evil.png'), 'evil.png');
  assert.equal(imageFileName(''), '');
});

test('parseCoinTables extracts image + Description from each coin table', () => {
  const html = [
    '<table class="roundy" width="60%"><tbody><tr>',
    '<td rowspan="3"><img src="https://archives.bulbagarden.net/media/upload/thumb/c/cb/SP_Silver_Chansey_Coin.png/120px-SP_Silver_Chansey_Coin.png"></td>',
    '<td>Release date <b>October 20, 1996</b></td></tr><tr><td>Region Japan</td></tr>',
    '<tr><td>Release Starter Deck</td></tr>',
    '<tr><td>Description: Regular-sized, Silver Splotch Holofoil Coin featuring Chansey</td></tr>',
    '</tbody></table>',
    '<table class="roundy"><tbody><tr><td>no image here</td></tr></tbody></table>',
  ].join('');
  const entries = parseCoinTables(html);
  assert.equal(entries.length, 1);
  assert.match(entries[0].imageUrl, /120px-SP_Silver_Chansey_Coin\.png$/);
  assert.equal(
    entries[0].description,
    'Regular-sized, Silver Splotch Holofoil Coin featuring Chansey'
  );
  assert.deepEqual(parseCoinTables(''), []);
});

test('buildManifest dedupes, filters non-coin images and carries description', () => {
  const rows = [
    { name: 'Chansey', description: 'Silver Chansey', imageUrl: '//archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png' },
    { name: 'Chansey dupe', description: 'Silver Chansey', imageUrl: 'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png' },
    { name: 'Bulbapedia logo', description: '', imageUrl: '//archives.bulbagarden.net/media/upload/logo.png' },
    { name: 'No image', description: 'X', imageUrl: '' },
    null,
  ];
  const manifest = buildManifest(rows);
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].fileName, 'SP_Silver_Chansey_Coin.png');
  assert.deepEqual(manifest[0].descriptions, ['Silver Chansey']);
  assert.equal(
    manifest[0].sourceUrl,
    'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'
  );
  assert.equal(buildManifest(rows, { requireCoinInName: false }).length, 2);
  assert.deepEqual(buildManifest([]), []);
});

test('buildManifest keeps every description that shares one scan', () => {
  const shared = '//archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png';
  const manifest = buildManifest([
    { description: 'Variant C/G/M', imageUrl: shared },
    { description: 'Variant C/G', imageUrl: shared },
  ]);
  assert.equal(manifest.length, 1);
  assert.deepEqual(manifest[0].descriptions, ['Variant C/G/M', 'Variant C/G']);

  const { matches } = matchManifestToCoins(manifest, [
    { id: 'a', description: 'Variant C/G/M' },
    { id: 'b', description: 'Variant C/G' },
  ]);
  assert.deepEqual(matches, [
    { coinId: 'a', fileName: 'SP_Silver_Chansey_Coin.png' },
    { coinId: 'b', fileName: 'SP_Silver_Chansey_Coin.png' },
  ]);
});

test('normalizeMatchText ignores case, punctuation and whitespace', () => {
  assert.equal(normalizeMatchText('Coin featuring Chansey, C/G/M!'), 'coin featuring chansey c g m');
  assert.equal(normalizeMatchText(''), '');
  assert.equal(normalizeMatchText(undefined), '');
});

test('matchManifestToCoins matches by exact then prefix description', () => {
  const manifest = [
    { fileName: 'a.png', description: 'Silver Splotch Coin featuring Chansey' },
    { fileName: 'b.png', description: 'Gold Cracked Ice Coin featuring Chansey' },
  ];
  const coins = [
    { id: 'exact', description: 'Silver Splotch Coin featuring Chansey' },
    { id: 'prefix', description: 'Gold Cracked Ice Coin featuring Chansey; later reissued' },
    { id: 'none', description: 'Blue Confetti Coin featuring Starmie' },
    { id: 'no-desc' },
  ];
  const { matches, unmatched } = matchManifestToCoins(manifest, coins);
  assert.deepEqual(matches, [
    { coinId: 'exact', fileName: 'a.png' },
    { coinId: 'prefix', fileName: 'b.png' },
  ]);
  assert.deepEqual(unmatched.map((c) => c.id), ['none', 'no-desc']);
  assert.deepEqual(matchManifestToCoins([], coins).matches, []);
});
