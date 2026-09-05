import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncLogExport,
  clearSyncLog,
  setSyncLogEnabled,
  summarizeCardHint,
  summarizeMoveCardParams,
  syncLog,
} from '../sync-logger.mjs';

test('summarizeCardHint includes name and syncInstance', () => {
  assert.equal(
    summarizeCardHint({ name: 'Popplio', syncInstance: 12, number: '37', set: 'SUM' }),
    'Popplio #12 n37 SUM'
  );
});

test('summarizeMoveCardParams extracts move summary fields', () => {
  const params = [
    'self',
    'hand',
    'active',
    2,
    undefined,
    'move',
    { moving: { name: 'Popplio', syncInstance: 5 }, isEvolution: false },
  ];
  const s = summarizeMoveCardParams(params);
  assert.equal(s.from, 'hand');
  assert.equal(s.to, 'active');
  assert.equal(s.index, 2);
  assert.equal(s.moving, 'Popplio #5');
});

test('compare lines align by client for diff tooling', () => {
  clearSyncLog();
  setSyncLogEnabled(true);
  syncLog({
    event: 'action.emit',
    dir: 'out',
    counters: { self: 1, opp: 0 },
    detail: { action: 'moveCardBundle', summary: 'hand[0] Popplio #5 →active' },
  });
  const payload = buildSyncLogExport({ username: 'Ash' });
  assert.equal(payload.compareHeader, 'client\tseq\tdir\tcounters\tevent\tdetail');
  assert.match(payload.compareLines[0], /^Ash\t1\tout\ts1\/o0\taction\.emit\t/);
  setSyncLogEnabled(false);
  clearSyncLog();
});
