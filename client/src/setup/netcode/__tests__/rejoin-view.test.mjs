import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isViewForRoom, shouldRequestViewOnJoin } from '../rejoin-view.mjs';

test('a seated rejoin into an authoritative game pulls the current view', () => {
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: true, rejoinedGame: true }), true);
});

test('a fresh join or a legacy room does not request a view', () => {
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: true, rejoinedGame: false }), false);
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: false, rejoinedGame: true }), false);
  assert.equal(shouldRequestViewOnJoin(undefined), false);
});

test('069: a view from another room, or after leaving, is dropped', () => {
  assert.equal(isViewForRoom({ gameId: 'room-a' }, 'room-a'), true);
  assert.equal(isViewForRoom({ gameId: 'room-a' }, 'room-b'), false);
  assert.equal(isViewForRoom({ gameId: 'room-a' }, ''), false);
  assert.equal(isViewForRoom({ gameId: 'room-a' }, null), false);
  assert.equal(isViewForRoom({ view: {} }, 'room-b'), true);
});
