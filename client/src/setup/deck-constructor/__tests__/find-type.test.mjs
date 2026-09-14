import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardType } from '../find-type.js';

test('getCardType resolves a mid-set Black & White era Pokémon', () => {
  // BLW (Black & White base set): cards 1-91 are Pokémon.
  assert.equal(getCardType('BLW', '47'), 'Pokémon');
});

test('getCardType resolves cards in every bucket of a Black & White set', () => {
  // BLW: 92-104 Trainer, 105-112 Energy, 113-115 Pokémon (secret rares).
  assert.equal(getCardType('BLW', '100'), 'Trainer');
  assert.equal(getCardType('BLW', '108'), 'Energy');
  assert.equal(getCardType('BLW', '114'), 'Pokémon');
});

test('getCardType continues the last known type at/beyond the final breakpoint instead of Unknown', () => {
  // BLW's table ends at {116: 'Pokémon'} — card 116 itself, and anything
  // beyond it, used to fall through to 'Unknown' because no entry describes
  // what comes after the highest listed breakpoint.
  assert.equal(getCardType('BLW', '116'), 'Pokémon');
  assert.equal(getCardType('BLW', '200'), 'Pokémon');
});

test('getCardType returns Unknown for a set not in any era table', () => {
  assert.equal(getCardType('ZZZ', '1'), 'Unknown');
});
