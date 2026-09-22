import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_COUNTER_STATES,
  getDeckCounterModel,
} from '../core/deck-counter.mjs';

test('an empty deck reads 0 / 60 and invites the user to start', () => {
  const model = getDeckCounterModel({ totalCards: 0, requiredCards: 60 });
  assert.equal(model.label, '0 / 60');
  assert.equal(model.state, DECK_COUNTER_STATES.EMPTY);
  assert.equal(model.percent, 0);
  assert.equal(model.remaining, 60);
  assert.equal(model.over, 0);
  assert.match(model.detail, /add cards/i);
});

test('a part-built deck reports how many cards are still to go', () => {
  const model = getDeckCounterModel({ totalCards: 45, requiredCards: 60 });
  assert.equal(model.label, '45 / 60');
  assert.equal(model.state, DECK_COUNTER_STATES.BUILDING);
  assert.equal(model.remaining, 15);
  assert.equal(model.percent, 75);
  assert.equal(model.detail, '15 cards to go');
});

test('the "to go" detail is singular at one card remaining', () => {
  assert.equal(
    getDeckCounterModel({ totalCards: 59, requiredCards: 60 }).detail,
    '1 card to go'
  );
});

test('a full, valid deck is complete and legal', () => {
  const model = getDeckCounterModel({
    totalCards: 60,
    requiredCards: 60,
    isValid: true,
    formatName: 'TCG',
  });
  assert.equal(model.state, DECK_COUNTER_STATES.COMPLETE);
  assert.equal(model.percent, 100);
  assert.equal(model.remaining, 0);
  assert.equal(model.isLegal, true);
  assert.equal(model.detail, 'Legal TCG deck');
});

test('a full deck that breaks another rule is complete but not legal', () => {
  const model = getDeckCounterModel({
    totalCards: 60,
    requiredCards: 60,
    isValid: false,
    errors: ['Deck must contain at least one Basic Pokémon.'],
  });
  assert.equal(model.state, DECK_COUNTER_STATES.COMPLETE);
  assert.equal(model.isLegal, false);
  assert.equal(model.detail, 'Deck must contain at least one Basic Pokémon.');
});

test('the deck-size error is not surfaced as the detail for a full deck', () => {
  // A size error on a full deck would be contradictory noise next to "60 / 60";
  // the counter itself already communicates size.
  const model = getDeckCounterModel({
    totalCards: 60,
    requiredCards: 60,
    isValid: false,
    errors: [
      'Deck must contain exactly 60 cards. Current total: 60.',
      'Pikachu has 5 copies (max 4).',
    ],
  });
  assert.equal(model.detail, 'Pikachu has 5 copies (max 4).');
});

test('a full deck that is invalid with no other reason still reads as illegal', () => {
  const model = getDeckCounterModel({
    totalCards: 60,
    requiredCards: 60,
    isValid: false,
    errors: ['Deck must contain exactly 60 cards. Current total: 60.'],
  });
  assert.equal(model.detail, 'Deck is not legal');
});

test('an over-full deck caps the bar at 100% and reports the overflow', () => {
  const model = getDeckCounterModel({ totalCards: 64, requiredCards: 60 });
  assert.equal(model.label, '64 / 60');
  assert.equal(model.state, DECK_COUNTER_STATES.OVER);
  assert.equal(model.percent, 100);
  assert.equal(model.over, 4);
  assert.equal(model.remaining, 0);
  assert.equal(model.detail, '4 cards over the limit');
});

test('the overflow detail is singular at one card over', () => {
  assert.equal(
    getDeckCounterModel({ totalCards: 61, requiredCards: 60 }).detail,
    '1 card over the limit'
  );
});

test('Pocket decks count to 20, not 60', () => {
  const model = getDeckCounterModel({
    totalCards: 20,
    requiredCards: 20,
    isValid: true,
    formatName: 'TCG Pocket',
  });
  assert.equal(model.label, '20 / 20');
  assert.equal(model.state, DECK_COUNTER_STATES.COMPLETE);
  assert.equal(model.detail, 'Legal TCG Pocket deck');
});

test('missing or junk input falls back to a sane 0 / 60', () => {
  for (const input of [
    undefined,
    {},
    { totalCards: null },
    { totalCards: 'x' },
  ]) {
    const model = getDeckCounterModel(input);
    assert.equal(model.label, '0 / 60');
    assert.equal(model.state, DECK_COUNTER_STATES.EMPTY);
    assert.equal(model.isLegal, false);
  }
});

test('a negative or fractional total is floored to a non-negative count', () => {
  assert.equal(getDeckCounterModel({ totalCards: -5 }).total, 0);
  assert.equal(getDeckCounterModel({ totalCards: 12.7 }).total, 12);
});
