import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAction, isReplayActive } from '../action-event.mjs';

test('createAction constructs standard Action event with type, payload, timestamp', () => {
  const before = Date.now();
  const action = createAction('moveCardBundle', 'self', ['hand', 'bench', 0, false, 'move']);
  const after = Date.now();

  assert.equal(action.type, 'moveCardBundle');
  assert.equal(action.user, 'self');
  assert.deepEqual(action.payload, ['hand', 'bench', 0, false, 'move']);
  assert.ok(action.timestamp >= before && action.timestamp <= after);
  // Backwards compatibility
  assert.equal(action.action, 'moveCardBundle');
  assert.deepEqual(action.parameters, ['hand', 'bench', 0, false, 'move']);
  assert.equal(action.emit, true);
});

test('isReplayActive returns true when any replay flag is active', () => {
  assert.equal(isReplayActive({}), false);
  assert.equal(isReplayActive({ syncReplaying: true }), true);
  assert.equal(isReplayActive({ isCatchingUp: true }), true);
  assert.equal(isReplayActive({ isReplay: true }), true);
});
