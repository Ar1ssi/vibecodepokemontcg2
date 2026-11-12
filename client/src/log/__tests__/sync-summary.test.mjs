import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeCardHint,
  summarizeDecision,
  summarizeMoveCardParams,
  summarizeMoveParamsLine,
} from '../sync-summary.mjs';

test('summarizeCardHint includes name and syncInstance', () => {
  assert.equal(
    summarizeCardHint({ name: 'Popplio', syncInstance: 12, number: '37', set: 'SUM' }),
    'Popplio #12 n37 SUM'
  );
  assert.equal(summarizeCardHint(null), null);
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
  assert.deepEqual(summarizeMoveCardParams([]), {});
});

test('summarizeMoveParamsLine renders the destination or the target', () => {
  const plain = ['self', 'hand', 'active', 2, undefined, 'move', { moving: { name: 'Popplio', syncInstance: 5 } }];
  assert.equal(summarizeMoveParamsLine(plain), 'hand[2] Popplio #5 →active');
  const attach = ['self', 'hand', 'active', 0, 1, 'attach', { moving: { name: 'Fire Energy', syncInstance: 10 }, target: { name: 'Charizard', syncInstance: 5 } }];
  assert.equal(summarizeMoveParamsLine(attach), 'hand[0] Fire Energy #10 →target:Charizard #5');
});

test('summarizeDecision formats moveCardBundle', () => {
  const params = ['opp', 'hand', 'active', 0, undefined, 'move', { moving: { name: 'Pikachu', syncInstance: 3 }, isEvolution: false }];
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
    { moving: { name: 'Fire Energy', syncInstance: 10 }, target: { name: 'Charizard', syncInstance: 5 } },
  ];
  const result = summarizeDecision('moveCardBundle', params);
  assert.ok(result.includes('Fire Energy'));
  assert.ok(result.includes('attach'));
  assert.ok(result.includes('Charizard'));
});

test('summarizeDecision formats simple actions', () => {
  assert.equal(summarizeDecision('attack', [1]), 'attack[1]');
  assert.equal(summarizeDecision('retreat', []), 'retreat');
  assert.equal(summarizeDecision('pass', []), 'pass');
  assert.equal(summarizeDecision('draw', ['self', 3]), 'draw[3]');
});

test('summarizeDecision formats useAbility', () => {
  const result = summarizeDecision('useAbility', ['opp', 'bench', 2, { name: 'Mew ex', syncInstance: 7 }]);
  assert.ok(result.includes('useAbility'));
  assert.ok(result.includes('Mew ex'));
  assert.ok(result.includes('bench'));
});

test('summarizeDecision falls back to action name for unknown actions', () => {
  assert.equal(summarizeDecision('customAction', []), 'customAction');
});
