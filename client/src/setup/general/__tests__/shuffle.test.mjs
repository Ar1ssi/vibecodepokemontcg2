import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rearrangeArray, shuffleIndices } from '../shuffle.js';
import {
  buildCardHint,
  resolveCardIndex,
} from '../../../../../shared/engine/zones/resolve-card-index.mjs';

const card = (i) => ({ cardId: `c_${i}`, syncInstance: i, name: `card${i}`, image: { src: `s${i}` } });
const deckOf = (n) => Array.from({ length: n }, (_, i) => card(i));

test('rearrangeArray applies an exact permutation and reports it', () => {
  const deck = deckOf(4);
  const [a, b, c, d] = deck;
  assert.equal(rearrangeArray(deck, [2, 0, 3, 1]), true);
  assert.deepEqual(deck, [c, a, d, b]);
});

test('rearrangeArray keeps every card when the permutation is one short', () => {
  const deck = deckOf(5);
  const before = new Set(deck);
  assert.equal(rearrangeArray(deck, [3, 1, 0, 2]), false);
  assert.equal(deck.length, 5);
  assert.deepEqual(new Set(deck), before);
  assert.equal(deck[4].cardId, 'c_4', 'unreferenced card keeps its place after the permuted ones');
});

test('rearrangeArray leaves no holes when the permutation is longer than the zone', () => {
  const deck = deckOf(3);
  assert.equal(rearrangeArray(deck, [3, 2, 0, 1]), false);
  assert.equal(deck.length, 3);
  assert.ok(deck.every(Boolean));
});

test('rearrangeArray ignores repeated and non-integer indices', () => {
  const deck = deckOf(3);
  assert.equal(rearrangeArray(deck, [1, 1, 'x']), false);
  assert.deepEqual(deck.map((c) => c.cardId), ['c_1', 'c_0', 'c_2']);
});

test('rearrangeArray with an empty permutation keeps the zone intact', () => {
  const deck = deckOf(3);
  assert.equal(rearrangeArray(deck, []), false);
  assert.deepEqual(deck.map((c) => c.cardId), ['c_0', 'c_1', 'c_2']);
});

test('rearrangeArray on an empty zone with an empty permutation is exact', () => {
  const deck = [];
  assert.equal(rearrangeArray(deck, []), true);
  assert.deepEqual(deck, []);
});

test('rearrangeArray accepts shuffleIndices output as exact', () => {
  const deck = deckOf(10);
  assert.equal(rearrangeArray(deck, shuffleIndices(10)), true);
  assert.equal(new Set(deck.map((c) => c.cardId)).size, 10);
});

// Replays ptcg-sync-log_combined_test_1789066196357.json (room "test"):
// Ultra Ball relayed shuffleZone(41) before its deck->hand move, so the mirror
// applied a 41-permutation to 42 cards; after one draw, Buddy-Buddy Poffin's
// 40-permutation met a 39-card mirror. Before the fix the first shuffle
// dropped a card and the second left an undefined slot at index 5, so
// resolving Dratini (past the slot) threw and the move was silently lost.
test('mirror survives the logged shuffle-before-move sequence without losing or holing cards', () => {
  const mirror = deckOf(42);
  const ultraBallPick = mirror[6];

  const ultraBallPermutation = Array.from({ length: 41 }, (_, i) => 40 - i);
  rearrangeArray(mirror, ultraBallPermutation);
  assert.equal(mirror.length, 42, 'short permutation drops no card');
  mirror.splice(resolveCardIndex({ array: mirror }, buildCardHint(ultraBallPick), 6), 1);

  mirror.shift();
  assert.equal(mirror.length, 40);
  mirror.pop(); // the logged mirror was one card short by the time Poffin shuffled

  const poffinPermutation = [
    18, 27, 21, 6, 19, 39, 33, 24, 9, 1, 36, 14, 32, 37, 4, 2, 23, 3, 29, 20,
    7, 31, 12, 22, 11, 13, 30, 5, 26, 28, 8, 10, 0, 16, 25, 15, 34, 35, 17, 38,
  ];
  const survivors = new Set(mirror);
  rearrangeArray(mirror, poffinPermutation);

  assert.equal(mirror.length, 39, 'long permutation adds no slot');
  assert.ok(mirror.every(Boolean), 'no undefined slots');
  assert.deepEqual(new Set(mirror), survivors);
  mirror.forEach((c, i) => {
    assert.equal(resolveCardIndex({ array: mirror }, buildCardHint(c), 0), i);
  });
});
