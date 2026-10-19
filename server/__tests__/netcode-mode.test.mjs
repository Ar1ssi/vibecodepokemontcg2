import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readServerAuthoritative } from '../netcode-mode.mjs';

const ON = { serverAuthoritative: true, warning: null };
const OFF = { serverAuthoritative: false, warning: null };

test('server authority is on when SERVER_AUTHORITATIVE is unset or empty', () => {
  assert.deepEqual(readServerAuthoritative(undefined), ON);
  assert.deepEqual(readServerAuthoritative(''), ON);
  assert.deepEqual(readServerAuthoritative('  '), ON);
});

test('1, true, on and yes keep server authority on without a warning', () => {
  for (const value of ['1', 'true', 'on', 'yes', 'TRUE', ' Yes ']) {
    assert.deepEqual(readServerAuthoritative(value), ON, JSON.stringify(value));
  }
});

test('0, false, off and no opt out to the legacy relay', () => {
  for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' 0 ', 'False\n', 'OFF', ' No ']) {
    assert.deepEqual(readServerAuthoritative(value), OFF, JSON.stringify(value));
  }
});

test('an unrecognised value keeps server authority on and warns', () => {
  for (const value of ['2', 'disabled', 'legacy']) {
    const result = readServerAuthoritative(value);
    assert.equal(result.serverAuthoritative, true, value);
    assert.match(result.warning, /not recognised; server authority stays on/);
    assert.ok(result.warning.includes(JSON.stringify(value)), result.warning);
  }
});
