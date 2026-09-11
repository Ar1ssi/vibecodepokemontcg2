import test from 'node:test';
import assert from 'node:assert/strict';
import { getOldCardType } from '../find-old-type.js';

test('getOldCardType resolves a mid-set Black & White era card by TCGdex id', () => {
  // bw1 (Black & White base set, TCGdex id) mirrors the BLW breakpoints.
  assert.equal(getOldCardType('bw1-47'), 'Pokémon');
});

test('getOldCardType continues the last known type at/beyond the final breakpoint instead of Unknown', () => {
  const result = getOldCardType('bw1-999');
  assert.notEqual(result, 'Unknown');
});

test('getOldCardType returns Unknown for a completely unrecognized set id', () => {
  assert.equal(getOldCardType('zzz1-1'), 'Unknown');
});
