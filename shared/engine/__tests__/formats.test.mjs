import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_FORMAT_BUILD_BATTLE,
  DECK_FORMAT_TCG,
  DECK_FORMAT_VALUES,
  OPENING_HAND_SIZE,
  deckFormatsMatch,
  formatMismatchMessage,
  isDeckFormat,
  prizeCountForFormat,
  prizesTakenFor,
} from '../formats.mjs';

test('the two deck formats are the only known values', () => {
  assert.deepEqual(DECK_FORMAT_VALUES, ['tcg', 'build-battle']);
  assert.equal(isDeckFormat(DECK_FORMAT_TCG), true);
  assert.equal(isDeckFormat(DECK_FORMAT_BUILD_BATTLE), true);
  for (const value of ['pocket', '', null, undefined, 6, 'TCG', {}]) {
    assert.equal(isDeckFormat(value), false, String(value));
  }
});

test('Build & Battle deals 4 Prizes, Standard 6, anything unknown 6 (pokemon.com Prerelease rules)', () => {
  assert.equal(prizeCountForFormat('build-battle'), 4);
  assert.equal(prizeCountForFormat('tcg'), 6);
  assert.equal(prizeCountForFormat('pocket'), 6);
  assert.equal(prizeCountForFormat(undefined), 6);
  assert.equal(OPENING_HAND_SIZE, 7);
});

test('the deal-time mismatch chat line names each player and their deck format (I202)', () => {
  assert.equal(
    formatMismatchMessage([
      { username: 'Ash', format: 'build-battle' },
      { username: 'Gary', format: 'pocket' },
    ]),
    'Deck formats differ (Ash: Build & Battle (40 cards, 4 Prizes); Gary: Standard (60 cards, 6 Prizes)). ' +
      'Both players must use the same format — load a matching deck and press Set Up again.'
  );
});

test('formats match after unknown values read as Standard', () => {
  assert.equal(deckFormatsMatch('tcg', 'tcg'), true);
  assert.equal(deckFormatsMatch('tcg', undefined), true);
  assert.equal(deckFormatsMatch('pocket', 'tcg'), true);
  assert.equal(deckFormatsMatch('build-battle', 'build-battle'), true);
  assert.equal(deckFormatsMatch('build-battle', 'tcg'), false);
  assert.equal(deckFormatsMatch(undefined, 'build-battle'), false);
});

test('Prizes taken count down from the format\'s starting Prizes (I203)', () => {
  assert.equal(prizesTakenFor(4, 'build-battle'), 0);
  assert.equal(prizesTakenFor(1, 'build-battle'), 3);
  assert.equal(prizesTakenFor(4, 'tcg'), 2);
  assert.equal(prizesTakenFor(6, undefined), 0);
  assert.equal(prizesTakenFor(7, 'tcg'), 0);
});
