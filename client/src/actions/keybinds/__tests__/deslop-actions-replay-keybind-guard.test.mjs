import test from 'node:test';
import assert from 'node:assert/strict';
import { isKeydownBlockedByReplay } from '../replay-keybind-guard.mjs';

// Mirrors the allow-list shape in setup/general/replay-block.js for a replay in progress.
const allowed = new Set(['KeyZ', 'z', 'Shift', 'ShiftLeft']);
const blockedDuringReplay = (type, value) => {
  assert.equal(type, 'keybind');
  return !allowed.has(value);
};

test('a key that is not on the replay allow-list is blocked', () => {
  assert.equal(
    isKeydownBlockedByReplay({ key: 'n', code: 'KeyN' }, blockedDuringReplay),
    true
  );
});

// The old guard read `blocked(key) && !blocked(code)` and so returned only for the allowed
// physical key and never for a plain disallowed one.
test('a disallowed key whose code is also disallowed is blocked even with Alt held', () => {
  assert.equal(
    isKeydownBlockedByReplay(
      { key: 'ß', code: 'KeyS', altKey: true },
      blockedDuringReplay
    ),
    true
  );
});

test('an allow-listed key passes', () => {
  assert.equal(
    isKeydownBlockedByReplay({ key: 'z', code: 'KeyZ' }, blockedDuringReplay),
    false
  );
});

test('macOS Alt+Z (key rewritten to a symbol) still passes through its code', () => {
  assert.equal(
    isKeydownBlockedByReplay(
      { key: 'Ω', code: 'KeyZ', altKey: true },
      blockedDuringReplay
    ),
    false
  );
});
