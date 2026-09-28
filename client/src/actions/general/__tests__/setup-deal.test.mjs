import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDealPlan } from '../setup-deal.mjs';

test('setupDealPlan: a Build & Battle deck of 40 deals 7 to hand and 4 Prizes', () => {
  assert.deepEqual(setupDealPlan(40, { format: 'build-battle' }), { hand: 7, prizes: 4 });
});

test('setupDealPlan: Standard, a missing format and an unknown one deal 6 Prizes', () => {
  assert.deepEqual(setupDealPlan(60, { format: 'tcg' }), { hand: 7, prizes: 6 });
  assert.deepEqual(setupDealPlan(60), { hand: 7, prizes: 6 });
  assert.deepEqual(setupDealPlan(60, { format: 'pocket' }), { hand: 7, prizes: 6 });
});

test('setupDealPlan: a short Build & Battle deck deals only what is left after the hand', () => {
  assert.deepEqual(setupDealPlan(10, { format: 'build-battle' }), { hand: 7, prizes: 3 });
  assert.deepEqual(setupDealPlan(3, { format: 'build-battle' }), { hand: 3, prizes: 0 });
});
