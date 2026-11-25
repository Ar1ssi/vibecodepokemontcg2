import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homebrewClockView } from '../homebrew-clock-view.mjs';

// Design 090: the homebrew clock panel.

const players = [
  { playerId: 'p1', username: 'Ash' },
  { playerId: 'p2', username: 'Gary' },
];
const running = { roomId: 'r', enabled: true, active: true, runner: 'p2', remaining: { p1: 180000, p2: 40000 }, flagged: null, players };

test('no snapshot yet → hidden', () => {
  assert.equal(homebrewClockView({ snapshot: null }).mode, 'hidden');
});

test('before the deal a seated player gets the toggle; a spectator sees it disabled', () => {
  const idle = { ...running, active: false, runner: null, remaining: {} };
  assert.deepEqual(
    { ...homebrewClockView({ snapshot: idle, self: 'Ash' }), label: undefined, hint: undefined },
    { mode: 'toggle', checked: true, disabled: false, label: undefined, hint: undefined }
  );
  assert.equal(homebrewClockView({ snapshot: { ...idle, enabled: false }, self: 'Ash' }).checked, false);
  assert.equal(homebrewClockView({ snapshot: idle, self: '', spectator: true }).disabled, true);
});

test('dealt with the clock not running (toggle off or not homebrew) → hidden', () => {
  const idle = { ...running, active: false, runner: null, remaining: {} };
  assert.equal(homebrewClockView({ snapshot: idle, dealt: true, self: 'Ash' }).mode, 'hidden');
});

test('in play: own row first, the runner counted down locally, low time flagged', () => {
  const view = homebrewClockView({ snapshot: running, elapsedMs: 15000, dealt: true, self: 'Gary' });
  assert.equal(view.mode, 'clock');
  assert.deepEqual(
    view.rows.map(({ name, time, running: r, low }) => [name, time, r, low]),
    [
      ['You', '0:25', true, true],
      ['Ash', '3:00', false, false],
    ]
  );
});

test('the runner never shows below 0:00, and a flagged seat is marked out', () => {
  const view = homebrewClockView({ snapshot: { ...running, flagged: 'p2', runner: null, remaining: { p1: 180000, p2: 0 } }, elapsedMs: 99999, self: 'Ash' });
  assert.deepEqual(view.rows.map((r) => [r.name, r.time, r.out]), [
    ['You', '3:00', false],
    ['Gary', '0:00', true],
  ]);
  const late = homebrewClockView({ snapshot: running, elapsedMs: 99999, self: 'Ash' });
  assert.equal(late.rows[1].time, '0:00');
});
