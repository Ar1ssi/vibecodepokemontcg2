import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCardHint,
  cardFaceSrc,
  resolveCardIndex,
} from '../resolve-card-index.mjs';

test('cardFaceSrc prefers src2 when hand is face-down', () => {
  const card = {
    image: { src: 'back.png', src2: 'face.png' },
    name: 'Pikachu',
  };
  assert.equal(cardFaceSrc(card), 'face.png');
});

test('resolveCardIndex finds card by src when relay index is stale', () => {
  const zone = {
    array: [
      { name: 'Fire Energy', image: { src: 'energy.png' } },
      { name: 'Raichu', image: { src: 'raichu.png' } },
    ],
  };
  const idx = resolveCardIndex(
    zone,
    { src: 'raichu.png', name: 'Raichu' },
    0
  );
  assert.equal(idx, 1);
});

test('resolveCardIndex keeps relay index when it still matches hint', () => {
  const zone = {
    array: [{ name: 'Pikachu', image: { src: 'pika.png' } }],
  };
  const idx = resolveCardIndex(
    zone,
    { src: 'pika.png', name: 'Pikachu' },
    0
  );
  assert.equal(idx, 0);
});

test('buildCardHint captures name and face src', () => {
  const hint = buildCardHint({
    name: 'Machoke',
    image: { src: 'back.png', src2: 'machoke.png' },
  });
  assert.deepEqual(hint, { src: 'machoke.png', name: 'Machoke' });
});
