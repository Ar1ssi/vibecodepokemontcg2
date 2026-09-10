import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  e2eDelayMs,
  e2eFixtureDeck,
  isE2eMode,
  multiplayerLocksRulesEnabled,
  stampE2eCard,
} from '../e2e-mode.mjs';

test('isE2eMode reads the query flag and localStorage key once the server arms it', () => {
  assert.equal(isE2eMode('?e2e=1', null, true), true);
  assert.equal(isE2eMode('?foo=1', null, true), false);
  const storage = { getItem: (key) => (key === 'ptcg-sim.e2e' ? '1' : null) };
  assert.equal(isE2eMode('', storage, true), true);
});

// The bridge is a scripting API over the local player's own board, and `?e2e=1` is typeable
// by any visitor, so the server decides whether it may arm at all. Without that, the client
// half is inert no matter what the URL or localStorage says.
test('isE2eMode is inert unless the server armed the bridge', () => {
  assert.equal(isE2eMode('?e2e=1', null, false), false);
  const storage = { getItem: (key) => (key === 'ptcg-sim.e2e' ? '1' : null) };
  assert.equal(isE2eMode('', storage, false), false);
  // No window and no explicit flag (the Node test environment) must not arm it either.
  assert.equal(isE2eMode('?e2e=1'), false);
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

test('multiplayerLocksRulesEnabled forces rules on for real multiplayer, exempts e2e', () => {
  assert.equal(multiplayerLocksRulesEnabled(true, false), true);
  assert.equal(multiplayerLocksRulesEnabled(true, true), false);
  assert.equal(multiplayerLocksRulesEnabled(false, false), false);
  assert.equal(multiplayerLocksRulesEnabled(false, true), false);
});
