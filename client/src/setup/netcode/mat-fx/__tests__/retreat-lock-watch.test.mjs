import test from 'node:test';
import assert from 'node:assert/strict';
import { newlyRetreatLocked } from '../retreat-lock-watch.mjs';
import { cuesFor } from '../sfx-cues.mjs';

const locked = (instanceId, until) => ({ instanceId, cannotRetreatUntilTurn: until });

test('a freshly locked Active is added', () => {
  const { next, added } = newlyRetreatLocked(new Set(), [locked(1, 5)], 5);
  assert.deepEqual(added, [1]);
  assert.deepEqual([...next], [1]);
});

test('an already-known lock is not added again', () => {
  const { next, added } = newlyRetreatLocked(new Set([1]), [locked(1, 5)], 5);
  assert.deepEqual(added, []);
  assert.deepEqual([...next], [1]);
});

test('an expired lock clears', () => {
  const { next, added } = newlyRetreatLocked(new Set([1]), [locked(1, 4)], 5);
  assert.deepEqual(added, []);
  assert.equal(next.size, 0);
});

test('missing, null and string fields are not locked', () => {
  const actives = [{ instanceId: 1 }, locked(2, null), locked(3, '5')];
  const { next, added } = newlyRetreatLocked(new Set(), actives, 5);
  assert.deepEqual(added, []);
  assert.equal(next.size, 0);
});

test('only the locked one of two actives is added', () => {
  const { added } = newlyRetreatLocked(new Set(), [{ instanceId: 1 }, locked(2, 6)], 5);
  assert.deepEqual(added, [2]);
});

test('empty actives yield an empty set', () => {
  const { next, added } = newlyRetreatLocked(new Set([1]), [], 5);
  assert.equal(next.size, 0);
  assert.deepEqual(added, []);
});

test('retreat-lock-applied sounds retreat-lock-intro', () => {
  assert.deepEqual(cuesFor('retreat-lock-applied', {}), [
    { key: 'retreat-lock-intro', gain: 0.7, delayMs: 0 },
  ]);
});
