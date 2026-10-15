import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_PREFS,
  acceptKey,
  dismissKey,
  lockKey,
  normalizeSuggestPrefs,
  prunePrefs,
  restoreKey,
  samePrefs,
  steeringCounts,
  toggleGoal,
  unlockKey,
} from '../prefs.mjs';

test('normalizeSuggestPrefs turns garbage into empty prefs', () => {
  for (const raw of [undefined, null, 'x', 42, [], { locked: 'no', goals: {} }]) {
    assert.deepEqual(normalizeSuggestPrefs(raw), { locked: [], accepted: [], dismissed: [], goals: [] });
  }
});

test('normalizeSuggestPrefs drops non-strings, duplicates, unknown goals; overlaps resolve locked > accepted > dismissed', () => {
  const prefs = normalizeSuggestPrefs({
    locked: ['t:a', 't:a', 7, ''],
    accepted: ['t:a', 't:b'],
    dismissed: ['t:b', 't:c'],
    goals: ['setup', 'nonsense', 'setup', 'budget'],
  });
  assert.deepEqual(prefs, { locked: ['t:a'], accepted: ['t:b'], dismissed: ['t:c'], goals: ['setup', 'budget'] });
});

test('each list is capped at 200, keeping the newest', () => {
  const keys = Array.from({ length: 250 }, (_, i) => `t:${i}`);
  const prefs = normalizeSuggestPrefs({ dismissed: keys });
  assert.equal(prefs.dismissed.length, 200);
  assert.equal(prefs.dismissed[0], 't:50');
});

test('latest action wins: dismiss then accept leaves the key only in accepted', () => {
  const prefs = acceptKey(dismissKey(EMPTY_PREFS, 't:iono'), 't:iono');
  assert.deepEqual(prefs, { locked: [], accepted: ['t:iono'], dismissed: [], goals: [] });
  const locked = lockKey(prefs, 't:iono');
  assert.deepEqual([locked.locked, locked.accepted], [['t:iono'], []]);
  assert.deepEqual(unlockKey(locked, 't:iono').locked, []);
  assert.deepEqual(restoreKey(dismissKey(EMPTY_PREFS, 't:x'), 't:x').dismissed, []);
  assert.deepEqual(acceptKey(EMPTY_PREFS, ''), normalizeSuggestPrefs(EMPTY_PREFS));
});

test('toggleGoal adds then removes, ignores unknown goals', () => {
  const on = toggleGoal(EMPTY_PREFS, 'setup');
  assert.deepEqual(on.goals, ['setup']);
  assert.deepEqual(toggleGoal(on, 'setup').goals, []);
  assert.deepEqual(toggleGoal(on, 'bogus').goals, ['setup']);
});

test('prunePrefs: removed accepted cards become dismissed, stale locks drop, dismissed stays', () => {
  const prefs = { locked: ['t:keep', 't:gone'], accepted: ['t:tried', 't:still'], dismissed: ['t:old'], goals: ['draw'] };
  assert.deepEqual(prunePrefs(prefs, new Set(['t:keep', 't:still'])), {
    locked: ['t:keep'],
    accepted: ['t:still'],
    dismissed: ['t:old', 't:tried'],
    goals: ['draw'],
  });
  const unchanged = prunePrefs(prefs, ['t:keep', 't:gone', 't:tried', 't:still']);
  assert.ok(samePrefs(unchanged, prefs));
});

test('samePrefs and steeringCounts', () => {
  assert.ok(samePrefs(EMPTY_PREFS, undefined));
  assert.ok(!samePrefs(EMPTY_PREFS, toggleGoal(EMPTY_PREFS, 'draw')));
  assert.deepEqual(steeringCounts({ locked: ['a'], accepted: ['b', 'c'], dismissed: [] }), {
    locked: 1,
    accepted: 2,
    dismissed: 0,
  });
});

test('review #3: prunePrefs clears a dismissed key the player put in the deck anyway', () => {
  const prefs = { locked: [], accepted: [], dismissed: ['t:iono', 't:switch'], goals: [] };
  assert.deepEqual(prunePrefs(prefs, new Set(['t:iono'])).dismissed, ['t:switch']);
});
