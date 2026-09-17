import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombinedDecisionLogExport,
  buildDecisionLogExport,
  clearDecisionLog,
  logDecisionEntry,
  setDecisionLogEnabled,
  summarizeDecision,
} from '../decision-logger.mjs';

test('summarizeDecision formats moveCardBundle', () => {
  const params = [
    'opp',
    'hand',
    'active',
    0,
    undefined,
    'move',
    { moving: { name: 'Pikachu', syncInstance: 3 }, isEvolution: false },
  ];
  const result = summarizeDecision('moveCardBundle', params);
  assert.ok(result.includes('Pikachu'));
  assert.ok(result.includes('hand'));
  assert.ok(result.includes('move'));
  assert.ok(result.includes('active'));
});

test('summarizeDecision formats moveCardBundle with target', () => {
  const params = [
    'opp',
    'hand',
    'active',
    0,
    1,
    'attach',
    {
      moving: { name: 'Fire Energy', syncInstance: 10 },
      target: { name: 'Charizard', syncInstance: 5 },
    },
  ];
  const result = summarizeDecision('moveCardBundle', params);
  assert.ok(result.includes('Fire Energy'));
  assert.ok(result.includes('attach'));
  assert.ok(result.includes('Charizard'));
});

test('summarizeDecision formats attack', () => {
  assert.equal(summarizeDecision('attack', [1]), 'attack[1]');
});

test('summarizeDecision formats retreat', () => {
  assert.equal(summarizeDecision('retreat', []), 'retreat');
});

test('summarizeDecision formats pass', () => {
  assert.equal(summarizeDecision('pass', []), 'pass');
});

test('summarizeDecision formats useAbility', () => {
  const params = ['opp', 'bench', 2, { name: 'Mew ex', syncInstance: 7 }];
  const result = summarizeDecision('useAbility', params);
  assert.ok(result.includes('useAbility'));
  assert.ok(result.includes('Mew ex'));
  assert.ok(result.includes('bench'));
});

test('summarizeDecision formats draw', () => {
  assert.equal(summarizeDecision('draw', ['self', 3]), 'draw[3]');
});

test('summarizeDecision falls back to action name for unknown actions', () => {
  assert.equal(summarizeDecision('customAction', []), 'customAction');
});

test('logDecisionEntry records entries with correct fields', () => {
  clearDecisionLog();
  setDecisionLogEnabled(true);
  logDecisionEntry({
    player: 'self',
    action: 'retreat',
    parameters: [],
    counters: { self: 5, opp: 3 },
    turn: 4,
  });
  const exported = buildDecisionLogExport({ username: 'Ash' });
  assert.equal(exported.entries.length, 1);
  const entry = exported.entries[0];
  assert.equal(entry.player, 'self');
  assert.equal(entry.action, 'retreat');
  assert.equal(entry.summary, 'retreat');
  assert.equal(entry.selfCounter, 5);
  assert.equal(entry.oppCounter, 3);
  assert.equal(entry.turn, 4);
  assert.equal(typeof entry.t, 'number');
  assert.equal(typeof entry.seq, 'number');
  setDecisionLogEnabled(false);
  clearDecisionLog();
});

test('logDecisionEntry is gated by enabled flag', () => {
  clearDecisionLog();
  setDecisionLogEnabled(false);
  logDecisionEntry({ player: 'self', action: 'pass' });
  assert.equal(buildDecisionLogExport().entries.length, 0);
});

test('compare lines include player and turn columns', () => {
  clearDecisionLog();
  setDecisionLogEnabled(true);
  logDecisionEntry({
    player: 'opp',
    action: 'attack',
    parameters: [0],
    counters: { self: 2, opp: 4 },
    turn: 3,
  });
  const payload = buildDecisionLogExport({ username: 'Gary' });
  assert.equal(
    payload.compareHeader,
    'client\tseq\tplayer\tcounters\tturn\taction\tsummary'
  );
  assert.match(
    payload.compareLines[0],
    /^Gary\t\d+\topp\ts2\/o4\tt3\tattack\tattack\[0\]$/
  );
  setDecisionLogEnabled(false);
  clearDecisionLog();
});

test('buildCombinedDecisionLogExport merges clients into unified timeline', () => {
  const local = buildDecisionLogExport(
    { username: 'Ash', roomId: 'room1' },
    [
      {
        seq: 1,
        t: 100,
        player: 'self',
        action: 'retreat',
        summary: 'retreat',
        selfCounter: 1,
        oppCounter: 0,
        turn: 2,
      },
    ]
  );
  const remote = buildDecisionLogExport(
    { username: 'Gary', roomId: 'room1' },
    [
      {
        seq: 1,
        t: 105,
        player: 'self',
        action: 'attack',
        summary: 'attack[0]',
        selfCounter: 0,
        oppCounter: 1,
        turn: 2,
      },
    ]
  );

  const combined = buildCombinedDecisionLogExport(local, [remote]);
  assert.equal(combined.meta.combined, true);
  assert.equal(combined.meta.roomId, 'room1');
  assert.equal(combined.clients.length, 2);
  assert.equal(combined.timeline.length, 2);
  assert.equal(combined.timeline[0].who, 'Ash');
  assert.equal(combined.timeline[0].player, 'self');
  assert.equal(combined.timeline[0].action, 'retreat');
  assert.equal(combined.timeline[1].who, 'Gary');
  assert.equal(combined.timeline[1].action, 'attack');
  assert.equal(combined.compareLines.length, 2);
});

test('clearDecisionLog resets entries and sequence', () => {
  clearDecisionLog();
  setDecisionLogEnabled(true);
  logDecisionEntry({ player: 'self', action: 'pass' });
  logDecisionEntry({ player: 'opp', action: 'draw', parameters: ['opp', 1] });
  assert.equal(buildDecisionLogExport().entries.length, 2);
  clearDecisionLog();
  assert.equal(buildDecisionLogExport().entries.length, 0);
  logDecisionEntry({ player: 'self', action: 'pass' });
  const entries = buildDecisionLogExport().entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].seq, 1);
  setDecisionLogEnabled(false);
  clearDecisionLog();
});
