import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cardImage,
  cardPreviewImage,
  createNameSearch,
  sideOf,
} from '../native-deck-builder-shared-logic.js';

test('sideOf names the opponent only for opp', () => {
  assert.equal(sideOf('opp'), 'opp');
  assert.equal(sideOf('self'), 'self');
  assert.equal(sideOf(undefined), 'self');
  assert.equal(sideOf('anything else'), 'self');
});

test('cardImage prefers the size asked for, then small, then the single image, then nothing', () => {
  assert.equal(cardImage({ images: { small: 's', large: 'l' } }, 'large'), 'l');
  assert.equal(cardImage({ images: { small: 's' } }, 'large'), 's');
  assert.equal(cardImage({ image: 'one' }, 'large'), 'one');
  assert.equal(cardImage({ images: { large: 'l' } }), '');
  assert.equal(cardImage({}), '');
  assert.equal(cardImage(null), '');
});

const tile = (previewImage, imgSrc) => ({
  dataset: { previewImage },
  querySelector: (selector) => (selector === 'img' && imgSrc ? { src: imgSrc } : null),
});

test('cardPreviewImage: the tile data attribute wins, then the card art, then the tile image', () => {
  const card = { images: { large: 'card-large', small: 'card-small' } };
  assert.equal(cardPreviewImage(tile('tile-data', 'tile-img'), card), 'tile-data');
  assert.equal(cardPreviewImage(tile(undefined, 'tile-img'), card), 'card-large');
  assert.equal(cardPreviewImage(tile(undefined, 'tile-img'), { image: 'card-one' }), 'card-one');
  assert.equal(cardPreviewImage(tile(undefined, 'tile-img'), null), 'tile-img');
  assert.equal(cardPreviewImage(tile(undefined, null), null), undefined);
});

test('createNameSearch asks once per name, even for concurrent asks', async () => {
  const asked = [];
  const searchByName = createNameSearch(async ({ term }) => {
    asked.push(term);
    return { results: [`${term}-card`] };
  });
  const [first, second] = await Promise.all([searchByName('Pikachu'), searchByName('Pikachu')]);
  assert.deepEqual(first, ['Pikachu-card']);
  assert.deepEqual(second, ['Pikachu-card']);
  await searchByName('Pikachu');
  await searchByName('Eevee');
  assert.deepEqual(asked, ['Pikachu', 'Eevee']);
});

test('createNameSearch forgets a failed search so the next ask retries it', async () => {
  let calls = 0;
  const searchByName = createNameSearch(async () => {
    calls += 1;
    if (calls === 1) throw new Error('proxy busy');
    return { results: ['ok'] };
  });
  await assert.rejects(searchByName('Mew'), /proxy busy/);
  // The eviction runs on the rejection's microtask turn; a retry after it must reach the network.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await searchByName('Mew'), ['ok']);
  assert.equal(calls, 2);
});
