import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  e2eDelayMs,
  e2eFixtureDeck,
  isE2eMode,
  stampE2eCard,
} from '../e2e-mode.mjs';

test('isE2eMode reads the query flag and localStorage key', () => {
  assert.equal(isE2eMode('?e2e=1'), true);
  assert.equal(isE2eMode('?foo=1'), false);
  const storage = { getItem: (key) => (key === 'ptcg-sim.e2e' ? '1' : null) };
  assert.equal(isE2eMode('', storage), true);
});

test('e2eFixtureDeck is 20 uniquely named Basics', () => {
  const deck = e2eFixtureDeck('Alpha');
  assert.equal(deck.length, 20);
  assert.equal(deck[0][1], 'Alpha 1');
  assert.equal(deck[19][2], 'Pokémon');
  assert.equal(new Set(deck.map((row) => row[1])).size, 20);
});

test('stampE2eCard makes ensureCardData / mulligan treat the card as a Basic', () => {
  const card = stampE2eCard({ name: 'Alpha 1' });
  assert.equal(card.hp, 60);
  assert.equal(card.stage, 'Basic');
  assert.equal(card.weakness, null);
  assert.equal(card.attacks[0].text, '');
});

test('e2eDelayMs collapses live waits only in e2e mode', () => {
  assert.equal(e2eDelayMs(2700), 2700);
});
