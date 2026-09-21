import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldResetBoardOnDeckData } from '../opp-board-reset.mjs';

test('opponent deck-data replay keeps the server-owned board', () => {
  assert.equal(shouldResetBoardOnDeckData('opp', { serverAuthoritative: true }), false);
});

test('opponent deck data still resets the board in legacy mode', () => {
  assert.equal(shouldResetBoardOnDeckData('opp', { serverAuthoritative: false }), true);
  assert.equal(shouldResetBoardOnDeckData('opp', undefined), true);
});

test('own deck data always resets the own board', () => {
  assert.equal(shouldResetBoardOnDeckData('self', { serverAuthoritative: true }), true);
});
