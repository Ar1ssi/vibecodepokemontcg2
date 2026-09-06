import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toHighResCardImageUrl } from '../card-image-url.mjs';

test('toHighResCardImageUrl upgrades TCGdex low.webp to high.webp', () => {
  assert.equal(
    toHighResCardImageUrl('https://assets.tcgdex.net/en/me/me02/056/low.webp'),
    'https://assets.tcgdex.net/en/me/me02/056/high.webp'
  );
});

test('toHighResCardImageUrl leaves TCGdex high.webp unchanged', () => {
  const src = 'https://assets.tcgdex.net/en/me/me02/056/high.webp';
  assert.equal(toHighResCardImageUrl(src), src);
});

test('toHighResCardImageUrl adds pokemontcg.io _hires', () => {
  assert.equal(
    toHighResCardImageUrl('https://images.pokemontcg.io/base1/4.png'),
    'https://images.pokemontcg.io/base1/4_hires.png'
  );
});

test('toHighResCardImageUrl leaves pokemontcg.io _hires unchanged', () => {
  const src = 'https://images.pokemontcg.io/base1/4_hires.png';
  assert.equal(toHighResCardImageUrl(src), src);
});

test('toHighResCardImageUrl returns empty input unchanged', () => {
  assert.equal(toHighResCardImageUrl(''), '');
  assert.equal(toHighResCardImageUrl(), '');
});
