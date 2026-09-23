import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tcgdexImageUrl } from '../tcgdex-image-url.mjs';

test('modern TCGdex ids map to the TCGdex CDN', () => {
  assert.equal(tcgdexImageUrl('sv06-106'), 'https://assets.tcgdex.net/en/sv/sv06/106/high.webp');
  assert.equal(tcgdexImageUrl('me04-020'), 'https://assets.tcgdex.net/en/me/me04/020/high.webp');
  assert.equal(tcgdexImageUrl('me02.5-142'), 'https://assets.tcgdex.net/en/me/me02.5/142/high.webp');
  assert.equal(tcgdexImageUrl('sv10.5w-084'), 'https://assets.tcgdex.net/en/sv/sv10.5w/084/high.webp');
  assert.equal(tcgdexImageUrl('mee-011'), 'https://assets.tcgdex.net/en/me/mee/011/high.webp');
});

test('language lowercases into the path', () => {
  assert.equal(tcgdexImageUrl('sv01-187', 'FR'), 'https://assets.tcgdex.net/fr/sv/sv01/187/high.webp');
});

test('legacy pokemontcg.io ids and junk are left alone', () => {
  for (const id of ['sv1-5', 'swsh9-100', 'ecard3-24', 'sm3-112a', '', null, undefined]) {
    assert.equal(tcgdexImageUrl(id), null);
  }
});
