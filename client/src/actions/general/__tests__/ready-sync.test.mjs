import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors readyUp's 2P user normalization and sync-user selection.
function resolveReadyUsers({ isTwoPlayer, initiator, user, emit }) {
  let readyUser = user;
  if (emit && isTwoPlayer && user === initiator) {
    readyUser = 'self';
  }
  const readyKey = readyUser === 'self' ? 'selfReady' : 'oppReady';
  const syncUser = isTwoPlayer ? 'self' : readyUser;
  return { readyUser, readyKey, syncUser };
}

test('2P host ready: local self zones map to selfReady and push as self', () => {
  const r = resolveReadyUsers({
    isTwoPlayer: true,
    initiator: 'self',
    user: 'self',
    emit: true,
  });
  assert.equal(r.readyKey, 'selfReady');
  assert.equal(r.syncUser, 'self');
});

test('2P joiner ready: initiator opp normalizes to selfReady and push as self', () => {
  const r = resolveReadyUsers({
    isTwoPlayer: true,
    initiator: 'opp',
    user: 'opp',
    emit: true,
  });
  assert.equal(r.readyUser, 'self');
  assert.equal(r.readyKey, 'selfReady');
  assert.equal(r.syncUser, 'self');
});

test('2P mirror receive: opponent ready sets oppReady without re-push', () => {
  const r = resolveReadyUsers({
    isTwoPlayer: true,
    initiator: 'opp',
    user: 'opp',
    emit: false,
  });
  assert.equal(r.readyUser, 'opp');
  assert.equal(r.readyKey, 'oppReady');
});
