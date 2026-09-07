import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldExecuteLocalRulesEffect,
  shouldEmitTurnStartDraw,
} from '../rules-local-effects.mjs';

test('shouldExecuteLocalRulesEffect: requires localPlay', () => {
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: true, localPlay: false, owner: 'self' }),
    false
  );
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: false, localPlay: false, owner: 'self' }),
    false
  );
});

test('shouldExecuteLocalRulesEffect: solo allows local play for either side', () => {
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: false, localPlay: true, owner: 'self' }),
    true
  );
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: false, localPlay: true, owner: 'opp' }),
    true
  );
});

test('shouldExecuteLocalRulesEffect: 2P only owner self with localPlay', () => {
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: true, localPlay: true, owner: 'self' }),
    true
  );
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: true, localPlay: true, owner: 'opp' }),
    false
  );
  assert.equal(
    shouldExecuteLocalRulesEffect({ isTwoPlayer: true, localPlay: false, owner: 'opp' }),
    false
  );
});

test('shouldEmitTurnStartDraw: 2P only self turn player emits', () => {
  assert.equal(shouldEmitTurnStartDraw({ isTwoPlayer: true, turnPlayer: 'self' }), true);
  assert.equal(shouldEmitTurnStartDraw({ isTwoPlayer: true, turnPlayer: 'opp' }), false);
  assert.equal(shouldEmitTurnStartDraw({ isTwoPlayer: false, turnPlayer: 'opp' }), true);
});
