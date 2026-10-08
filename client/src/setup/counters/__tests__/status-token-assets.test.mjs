import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_TOKEN_BACK,
  STATUS_TOKEN_FRONT,
  isStatusTokenType,
} from '../status-token-assets.mjs';

describe('status token assets', () => {
  it('points poison and burn at the TCG Live badges', () => {
    assert.match(STATUS_TOKEN_FRONT['status-poison'], /poison-badge\.webp$/);
    assert.match(STATUS_TOKEN_FRONT['status-burn'], /burn-badge\.webp$/);
  });

  it('uses Bulbapedia Coin_Back_TM as the shared back', () => {
    assert.match(STATUS_TOKEN_BACK, /coin-back-tm\.png$/);
  });

  it('identifies token types', () => {
    assert.equal(isStatusTokenType('status-poison'), true);
    assert.equal(isStatusTokenType('status-burn'), true);
    assert.equal(isStatusTokenType('status-asleep'), false);
  });
});
