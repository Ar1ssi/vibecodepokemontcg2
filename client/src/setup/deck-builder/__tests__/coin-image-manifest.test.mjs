import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManifest,
  imageFileName,
  wikiImageUrl,
} from '../core/coin-image-manifest.mjs';

test('wikiImageUrl absolutises and un-scales thumbnail URLs', () => {
  assert.equal(
    wikiImageUrl('//archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'),
    'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'
  );
  assert.equal(
    wikiImageUrl(
      'https://archives.bulbagarden.net/media/upload/thumb/c/cb/SP_Silver_Chansey_Coin.png/120px-SP_Silver_Chansey_Coin.png'
    ),
    'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'
  );
  assert.equal(
    wikiImageUrl('/media/upload/c/cb/Coin.png'),
    'https://bulbapedia.bulbagarden.net/media/upload/c/cb/Coin.png'
  );
  assert.equal(wikiImageUrl(''), '');
  assert.equal(wikiImageUrl('not-a-url.png'), '');
});

test('imageFileName decodes, sanitises and defaults an extension', () => {
  assert.equal(
    imageFileName('https://x/media/upload/c/cb/SP_Silver_Chansey_Coin.png'),
    'SP_Silver_Chansey_Coin.png'
  );
  assert.equal(imageFileName('https://x/a/My%20Coin.jpg'), 'My_Coin.jpg');
  assert.equal(imageFileName('https://x/a/Coin'), 'Coin.png');
  assert.equal(imageFileName('https://x/a/../../evil.png'), 'evil.png');
  assert.equal(imageFileName(''), '');
});

test('buildManifest dedupes, filters non-coin images and tolerates bad rows', () => {
  const rows = [
    { name: 'Chansey', release: 'Starter Deck', imageUrl: '//archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png' },
    { name: 'Chansey (dupe)', release: 'Starter Deck', imageUrl: 'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png' },
    { name: 'Bulbapedia logo', release: '', imageUrl: '//archives.bulbagarden.net/media/upload/logo.png' },
    { name: 'No image', release: 'X', imageUrl: '' },
    null,
  ];
  const manifest = buildManifest(rows);
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].fileName, 'SP_Silver_Chansey_Coin.png');
  assert.equal(manifest[0].name, 'Chansey');
  assert.equal(
    manifest[0].sourceUrl,
    'https://archives.bulbagarden.net/media/upload/c/cb/SP_Silver_Chansey_Coin.png'
  );
});

test('buildManifest keeps non-coin images when filtering is disabled', () => {
  const rows = [{ name: 'Logo', release: '', imageUrl: '//x/logo.png' }];
  assert.equal(buildManifest(rows).length, 0);
  assert.equal(buildManifest(rows, { requireCoinInName: false }).length, 1);
  assert.deepEqual(buildManifest([]), []);
});
