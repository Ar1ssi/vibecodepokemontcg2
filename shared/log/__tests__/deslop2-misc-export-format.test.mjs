import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientSrc } from '../export-format.mjs';

test('clientSrc shortens a client id to eight characters', () => {
  assert.equal(clientSrc('abcdef1234567890'), 'c:abcdef12');
});

test('clientSrc does not throw on a client that never reported an id', () => {
  assert.equal(clientSrc(undefined), 'c:');
  assert.equal(clientSrc(null), 'c:');
});
