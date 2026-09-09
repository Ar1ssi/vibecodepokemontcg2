import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setDealOrder,
  resetDealOrder,
  waitForDealOrder,
  getDealOrderStarter,
} from '../deal-order.js';

test('deal-order: starter round-trips through setDealOrder/getDealOrderStarter', () => {
  resetDealOrder();
  assert.equal(getDealOrderStarter(), null);
  setDealOrder([1, 2, 3], 'self');
  assert.equal(getDealOrderStarter(), 'self');
  resetDealOrder();
  assert.equal(getDealOrderStarter(), null);
});

test('deal-order: getDealOrderStarter rejects any value other than self/opp', () => {
  resetDealOrder();
  setDealOrder([1, 2, 3], 'nobody');
  assert.equal(getDealOrderStarter(), null);
  setDealOrder([1, 2, 3], null);
  assert.equal(getDealOrderStarter(), null);
});

test('deal-order: order and starter are independent — order still resolves when starter is absent', async () => {
  resetDealOrder();
  setDealOrder([4, 5, 6]);
  assert.deepEqual(await waitForDealOrder(), [4, 5, 6]);
  assert.equal(getDealOrderStarter(), null);
});

test('deal-order: resetDealOrder clears a stale starter before the next game', () => {
  resetDealOrder();
  setDealOrder([1], 'opp');
  assert.equal(getDealOrderStarter(), 'opp');
  resetDealOrder();
  setDealOrder([2], 'self');
  assert.equal(getDealOrderStarter(), 'self');
});
