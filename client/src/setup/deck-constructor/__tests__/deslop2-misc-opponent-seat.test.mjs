import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardBackSrcFor, isRoomOpponent, opponentCardBackKey } from '../opponent-seat.mjs';

const state = (over) => ({
  cardBackSrc: 'own.png',
  p1OppCardBackSrc: 'p1opp.png',
  p2OppCardBackSrc: 'p2opp.png',
  isTwoPlayer: false,
  solo: false,
  ...over,
});

test('a room opponent uses the p2 slot, 1P play uses the p1 slot', () => {
  assert.equal(cardBackSrcFor(state({ isTwoPlayer: true }), 'opp'), 'p2opp.png');
  assert.equal(cardBackSrcFor(state(), 'opp'), 'p1opp.png');
});

test('a solo room sets isTwoPlayer but its far seat is still the p1 slot', () => {
  const solo = state({ isTwoPlayer: true, solo: true });
  assert.equal(isRoomOpponent(solo), false);
  assert.equal(opponentCardBackKey(solo), 'p1OppCardBackSrc');
  assert.equal(cardBackSrcFor(solo, 'opp'), 'p1opp.png');
});

test('the own side always uses the chosen card back', () => {
  assert.equal(cardBackSrcFor(state({ isTwoPlayer: true, solo: true }), 'self'), 'own.png');
});
