import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOLD_MS, HOLD_MS, holdFor } from '../fx-holds.mjs';

test('fx-holds: every hold is a non-negative finite number', () => {
  for (const [effect, ms] of Object.entries(HOLD_MS)) {
    assert.ok(Number.isFinite(ms) && ms >= 0, `${effect} has a bad hold: ${ms}`);
  }
});

test('fx-holds: holdFor reads the table and defaults unknown names', () => {
  assert.equal(holdFor('attack-banner'), HOLD_MS['attack-banner']);
  assert.equal(holdFor('nope'), DEFAULT_HOLD_MS);
  assert.equal(holdFor(undefined), DEFAULT_HOLD_MS);
});

test('fx-holds: the banner leads the lunge, which leads the damage pop', () => {
  // The whole point of the table: an attack must read name -> impact -> number.
  assert.ok(HOLD_MS['attack-banner'] > HOLD_MS.attack);
  assert.ok(HOLD_MS.attack > HOLD_MS.damage);
});

test('fx-holds: a table entry inherited from Object.prototype is not a hold', () => {
  assert.equal(holdFor('toString'), DEFAULT_HOLD_MS);
  assert.equal(holdFor('constructor'), DEFAULT_HOLD_MS);
});
