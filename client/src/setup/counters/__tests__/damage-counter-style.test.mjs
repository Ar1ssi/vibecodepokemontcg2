import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMAGE_COUNTER_TIERS,
  getDamageCounterTier,
} from '../damage-counter-style.mjs';

describe('getDamageCounterTier', () => {
  it('maps low damage to yellow/orange tiers', () => {
    assert.equal(getDamageCounterTier(10), 'dmg-tier-10');
    assert.equal(getDamageCounterTier(20), 'dmg-tier-10');
    assert.equal(getDamageCounterTier(30), 'dmg-tier-20');
    assert.equal(getDamageCounterTier(40), 'dmg-tier-30');
  });

  it('maps mid damage to deep orange and red tiers', () => {
    assert.equal(getDamageCounterTier(50), 'dmg-tier-40');
    assert.equal(getDamageCounterTier(70), 'dmg-tier-50');
    assert.equal(getDamageCounterTier(90), 'dmg-tier-50');
  });

  it('maps high damage to purple tier', () => {
    assert.equal(getDamageCounterTier(100), 'dmg-tier-100');
    assert.equal(getDamageCounterTier(250), 'dmg-tier-100');
  });

  it('handles invalid input safely', () => {
    assert.equal(getDamageCounterTier(''), 'dmg-tier-10');
    assert.equal(getDamageCounterTier(null), 'dmg-tier-10');
    assert.equal(getDamageCounterTier(undefined), 'dmg-tier-10');
  });

  it('exports a fixed tier list for class toggling', () => {
    assert.deepEqual(DAMAGE_COUNTER_TIERS, [
      'dmg-tier-10',
      'dmg-tier-20',
      'dmg-tier-30',
      'dmg-tier-40',
      'dmg-tier-50',
      'dmg-tier-100',
    ]);
  });
});
