import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isTreeVerified } from './green-trees.mjs';

const RECORD = 'aaa111\nbbb222\n';

test('a tree on the record is verified', () => {
  assert.equal(isTreeVerified('bbb222', RECORD), true);
});

test('a tree not on the record is not verified', () => {
  assert.equal(isTreeVerified('ccc333', RECORD), false);
});

test('an empty record verifies nothing', () => {
  assert.equal(isTreeVerified('aaa111', ''), false);
});

test('a missing tree hash is never verified', () => {
  assert.equal(isTreeVerified('', RECORD), false);
  assert.equal(isTreeVerified(undefined, RECORD), false);
});

test('CRLF record lines still match', () => {
  assert.equal(isTreeVerified('aaa111', 'aaa111\r\nbbb222\r\n'), true);
});
