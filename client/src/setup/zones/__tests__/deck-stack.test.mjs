import test from 'node:test';
import assert from 'node:assert/strict';

import { deckStackLayers, DEFAULT_MAX_COUNT, DEFAULT_MAX_LAYERS } from '../deck-stack.mjs';

test('0 cards -> 0 layers', () => {
  assert.equal(deckStackLayers(0), 0);
});

test('1 card -> 1 layer', () => {
  assert.equal(deckStackLayers(1), 1);
});

test('maxCount cards -> maxLayers layers', () => {
  assert.equal(deckStackLayers(DEFAULT_MAX_COUNT), DEFAULT_MAX_LAYERS);
});

test('above maxCount clamps to maxLayers', () => {
  assert.equal(deckStackLayers(DEFAULT_MAX_COUNT + 40), DEFAULT_MAX_LAYERS);
});

test('monotonic in count', () => {
  let prev = deckStackLayers(0);
  for (let count = 1; count <= DEFAULT_MAX_COUNT + 10; count++) {
    const layers = deckStackLayers(count);
    assert.ok(layers >= prev, `layers dropped at count=${count}`);
    prev = layers;
  }
});

test('non-finite/negative count -> 0 layers, no throw', () => {
  assert.equal(deckStackLayers(NaN), 0);
  assert.equal(deckStackLayers(-3), 0);
  assert.equal(deckStackLayers(undefined), 0);
});

test('custom maxCount/maxLayers respected', () => {
  assert.equal(deckStackLayers(10, { maxCount: 10, maxLayers: 5 }), 5);
  assert.equal(deckStackLayers(5, { maxCount: 10, maxLayers: 5 }), 3);
});
