import test from 'node:test';
import assert from 'node:assert/strict';

import { parseImportActions } from '../parse-import-actions.js';

test('an empty or missing payload has no actions', () => {
  assert.deepEqual(parseImportActions(undefined), []);
  assert.deepEqual(parseImportActions(null), []);
  assert.deepEqual(parseImportActions('  \n'), []);
});

test('version markers are dropped and actions keep their order', () => {
  const text = JSON.stringify([
    { version: 2 },
    { user: 'self', action: 'draw', parameters: [] },
    { user: 'opp', action: { type: 'pass' } },
  ]);
  assert.deepEqual(
    parseImportActions(text).map((entry) => entry.action),
    ['draw', { type: 'pass' }]
  );
});

test('malformed JSON, a non-list, or a bad entry rejects the whole payload', () => {
  assert.throws(() => parseImportActions('{not json'));
  assert.throws(() => parseImportActions('{"user":"self"}'), /not a list/);
  assert.throws(() => parseImportActions('[null]'), /entry 0/);
  assert.throws(
    () => parseImportActions(JSON.stringify([{ user: 'self', action: 'draw' }, { action: 'draw' }])),
    /entry 1/
  );
  assert.throws(() => parseImportActions(JSON.stringify([{ user: 'self', action: 5 }])), /entry 0/);
});
