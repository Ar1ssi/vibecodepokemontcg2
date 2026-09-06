import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombinedSyncLogExport,
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

test('buildCombinedSyncLogExport merges clients into unified timeline', () => {
  const local = buildSyncLogExport(
    { username: 'Ash', roomId: 'room1' },
    [
      {
        seq: 1,
        t: 100,
        dir: 'out',
        selfCounter: 1,
        oppCounter: 0,
        event: 'action.emit',
        detail: { summary: 'hand[0] Popplio →active' },
      },
    ]
  );
  const remote = buildSyncLogExport(
    { username: 'Gary', roomId: 'room1' },
    [
      {
        seq: 1,
        t: 105,
        dir: 'in',
        selfCounter: 0,
        oppCounter: 1,
        event: 'action.recv',
        detail: { summary: 'hand[0] Popplio →active' },
      },
    ]
  );

  const combined = buildCombinedSyncLogExport(local, [remote]);
  assert.equal(combined.meta.combined, true);
  assert.equal(combined.meta.roomId, 'room1');
  assert.equal(combined.clients.length, 2);
  assert.equal(combined.timeline.length, 2);
  assert.equal(combined.timeline[0].who, 'Ash');
  assert.equal(combined.timeline[1].who, 'Gary');
  assert.equal(combined.compareLines.length, 2);
  assert.match(combined.compareLines[0], /^Ash\t/);
  assert.match(combined.compareLines[1], /^Gary\t/);
});
