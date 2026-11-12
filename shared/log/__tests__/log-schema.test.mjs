import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, LEVELS, LEVEL_RANK, CATEGORIES, LOG_FORMAT } from '../log-schema.mjs';

test('schema constants', () => {
  assert.equal(LOG_FORMAT, 1);
  assert.deepEqual([...LEVELS], ['error', 'warn', 'info', 'debug', 'trace']);
  assert.equal(LEVEL_RANK.trace, 4);
  assert.equal(CATEGORIES.length, 21);
  assert.equal(LIMITS.floodPerSec, 60);
  assert.equal(LIMITS.clientRing.maxBytes, 4194304);
});

test('LIMITS is deep-frozen', () => {
  assert.ok(Object.isFrozen(LIMITS));
  assert.ok(Object.isFrozen(LIMITS.clientRing));
  assert.ok(Object.isFrozen(CATEGORIES));
  assert.throws(() => {
    'use strict';
    LIMITS.clientRing.maxBytes = 1;
  }, TypeError);
});
