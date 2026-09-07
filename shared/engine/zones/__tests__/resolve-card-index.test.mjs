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
  assert.equal(hint.src, 'machoke.png');
  assert.equal(hint.name, 'Machoke');
});

test('resolveCardIndex prefers relay index for duplicate face URLs', () => {
  const zone = {
    array: [
      { name: 'Dark Energy', image: { src: 'dark.png' } },
      { name: 'Dark Energy', image: { src: 'dark.png' } },
      { name: 'Dark Energy', image: { src: 'dark.png' } },
    ],
  };
  const hint = { src: 'dark.png', name: 'Dark Energy' };
  assert.equal(resolveCardIndex(zone, hint, 2), 2);
  assert.equal(resolveCardIndex(zone, hint, 1), 1);
});

test('buildCardHint captures cardId', () => {
  const hint = buildCardHint({
    name: 'Mewtwo',
    cardId: 'c_42',
    image: { src: 'mewtwo.png' },
  });
  assert.equal(hint.cardId, 'c_42');
  assert.equal(hint.name, 'Mewtwo');
});

test('resolveCardIndex resolves by cardId hint', () => {
  const cardA = { name: 'Pikachu', cardId: 'c_1', image: { src: 'pika.png' } };
  const cardB = { name: 'Pikachu', cardId: 'c_2', image: { src: 'pika.png' } };
  const zone = { array: [cardA, cardB] };
  const hint = { cardId: 'c_2' };
  assert.equal(resolveCardIndex(zone, hint, 0), 1);
});

test('resolveCardIndex resolves by cardId string fallbackIndex', () => {
  const cardA = { name: 'Charmander', cardId: 'c_10', image: { src: 'char.png' } };
  const cardB = { name: 'Squirtle', cardId: 'c_11', image: { src: 'squirt.png' } };
  const zone = { array: [cardA, cardB] };
  assert.equal(resolveCardIndex(zone, null, 'c_11'), 1);
});

test('resolveCardIndex resolves by Card object fallbackIndex', () => {
  const cardA = { name: 'Bulbasaur', cardId: 'c_20' };
  const cardB = { name: 'Ivysaur', cardId: 'c_21' };
  const zone = { array: [cardA, cardB] };
  assert.equal(resolveCardIndex(zone, null, cardB), 1);
});
