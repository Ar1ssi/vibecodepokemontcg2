import test from 'node:test';
import assert from 'node:assert/strict';

import { rememberOwnDeck, restoreOwnDeck } from '../own-deck.mjs';

const rows = [['4', 'Pikachu', 'Pokémon', 'https://example.com/pikachu.png', '25', 'base1', 'base1-58']];

const makeState = () => ({ selfDeckData: '', ownDeck: null, deckFormat: { self: 'tcg' } });

test('leaving a room restores the deck the player loaded, not an empty slot (I198)', () => {
  const state = makeState();
  rememberOwnDeck(state, rows, 'build-battle');
  state.selfDeckData = '';
  state.deckFormat.self = 'tcg';

  restoreOwnDeck(state);

  assert.deepEqual(state.selfDeckData, rows);
  assert.equal(state.deckFormat.self, 'build-battle');
});

test('a spectated deck in the self slot is replaced by the player own deck on leave', () => {
  const state = makeState();
  rememberOwnDeck(state, rows, 'tcg');
  state.selfDeckData = [['60', 'Someone else', 'Pokémon', '', null, null, null]];

  restoreOwnDeck(state);

  assert.deepEqual(state.selfDeckData, rows);
});

test('with no deck ever loaded, leaving clears the self slot and keeps the format', () => {
  const state = makeState();
  state.selfDeckData = [['60', 'Spectated', 'Pokémon', '', null, null, null]];
  state.deckFormat.self = 'build-battle';

  restoreOwnDeck(state);

  assert.equal(state.selfDeckData, '');
  assert.equal(state.deckFormat.self, 'build-battle');
});

test('an empty load forgets the own deck; a missing format reads as Standard', () => {
  const state = makeState();
  rememberOwnDeck(state, rows);
  assert.equal(state.ownDeck.format, 'tcg');
  rememberOwnDeck(state, '');
  assert.equal(state.ownDeck, null);
  assert.doesNotThrow(() => restoreOwnDeck(null));
  assert.doesNotThrow(() => rememberOwnDeck(undefined, rows));
});
