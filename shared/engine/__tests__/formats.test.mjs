import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_FORMAT_BUILD_BATTLE,
  DECK_FORMAT_TCG,
  DECK_FORMAT_VALUES,
  OPENING_HAND_SIZE,
  formatMismatchMessage,
  isDeckFormat,
  prizeCountForFormat,
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

test('the format mismatch chat line names the player and their deck format', () => {
  assert.equal(
    formatMismatchMessage('Ash', 'build-battle'),
    "Ash's deck is Build & Battle (40 cards, 4 Prizes); both players must use the same format"
  );
  assert.equal(
    formatMismatchMessage('Gary', 'tcg'),
    "Gary's deck is Standard (60 cards, 6 Prizes); both players must use the same format"
  );
  assert.equal(
    formatMismatchMessage('Gary', 'pocket'),
    "Gary's deck is Standard (60 cards, 6 Prizes); both players must use the same format"
  );
});
