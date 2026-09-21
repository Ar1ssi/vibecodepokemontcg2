import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequestViewOnJoin } from '../rejoin-view.mjs';

test('a seated rejoin into an authoritative game pulls the current view', () => {
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: true, rejoinedGame: true }), true);
});

test('a fresh join or a legacy room does not request a view', () => {
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: true, rejoinedGame: false }), false);
  assert.equal(shouldRequestViewOnJoin({ serverAuthoritative: false, rejoinedGame: true }), false);
  assert.equal(shouldRequestViewOnJoin(undefined), false);
});
