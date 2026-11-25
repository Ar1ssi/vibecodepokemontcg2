import test from 'node:test';
import assert from 'node:assert/strict';
import { localReadySeat, readyKeyOf } from '../ready-seat.mjs';

// updateReadyButtons checked hasDeckLoaded(initiator) while readyUp checks the 'self' seat in
// 2P, so a flipped mat made the Set Up button judge the opponent's deck.
test('in 2P the local seat is self even when the mat is flipped', () => {
  assert.equal(localReadySeat({ isTwoPlayer: true, initiator: 'opp' }), 'self');
  assert.equal(localReadySeat({ isTwoPlayer: true, initiator: 'self' }), 'self');
});

test('in one-player mode the local seat follows the initiator', () => {
  assert.equal(localReadySeat({ isTwoPlayer: false, initiator: 'opp' }), 'opp');
  assert.equal(localReadySeat({ isTwoPlayer: false, initiator: 'self' }), 'self');
});

test('readyKeyOf maps a seat to its ready flag', () => {
  assert.equal(readyKeyOf('self'), 'selfReady');
  assert.equal(readyKeyOf('opp'), 'oppReady');
});
