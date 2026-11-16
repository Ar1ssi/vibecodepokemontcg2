import test from 'node:test';
import assert from 'node:assert/strict';
import { log, logStats, clientId, onEntry } from '../client-log.js';

test('client log counts entries, has a hex clientId, and survives bad listeners', () => {
  assert.match(clientId, /^[0-9a-f]{16}$/);
  const before = logStats().entries;
  const seen = [];
  const off = onEntry((e) => seen.push(e));
  const offBad = onEntry(() => {
    throw new Error('listener');
  });
  log.info('user', 'mark', { note: 'x' });
  off();
  offBad();
  assert.equal(logStats().entries, before + 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ev, 'mark');
});
