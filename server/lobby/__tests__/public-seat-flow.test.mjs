import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDebouncer, decideJoin, decideReconnect, planSweep } from '../public-seat-flow.mjs';
import { issueSeatToken, checkSeatClaim } from '../seat-token.mjs';
import { markSeatConnected, markSeatDisconnected } from '../seat-presence.mjs';

const RELEASE_MS = 180000;
const roomWith = (...usernames) => ({ players: new Set(usernames), spectators: new Set() });

test('design 069: a new player in a free room is seated and gets a token', () => {
  assert.deepEqual(
    decideJoin({ room: roomWith(), username: 'Ash', token: null, isSpectator: false, seatsFull: false }),
    { action: 'seat', issueToken: true }
  );
});

test('design 069 row 4: the second click on the last seat is refused as full', () => {
  assert.deepEqual(
    decideJoin({ room: roomWith('Ash', 'Misty'), username: 'Brock', isSpectator: false, seatsFull: true }),
    { action: 'reject', reason: 'full', issueToken: false }
  );
});

test('design 069 rows 5-6: a seated name without its token is refused, connected or not', () => {
  const room = roomWith('Ash');
  issueSeatToken(room, 'Ash', () => 'tok');
  markSeatConnected(room, 'Ash', 's1');
  const join = () => decideJoin({ room, username: 'Ash', token: null, isSpectator: false, seatsFull: false });
  assert.deepEqual(join(), { action: 'reject', reason: 'name_taken', issueToken: false });
  markSeatDisconnected(room, 'Ash', null, 0);
  assert.deepEqual(join(), { action: 'reject', reason: 'name_taken', issueToken: false });
});

test('design 069 rows 7, 16: the token holder gets the seat back even when the room is full', () => {
  const room = roomWith('Ash', 'Misty');
  issueSeatToken(room, 'Ash', () => 'tok');
  assert.deepEqual(
    decideJoin({ room, username: 'Ash', token: 'tok', isSpectator: false, seatsFull: true }),
    { action: 'seat', issueToken: false }
  );
});

test('design 069: spectating skips every seat check', () => {
  assert.deepEqual(
    decideJoin({ room: roomWith('Ash', 'Misty'), username: 'Ash', isSpectator: true, seatsFull: true }),
    { action: 'spectate', issueToken: false }
  );
});

test('design 069 row 8: reconnecting to a released seat is refused as seat_released', () => {
  assert.deepEqual(decideReconnect({ room: roomWith(), username: 'Ash', token: 'tok' }), {
    action: 'reject',
    reason: 'seat_released',
  });
  assert.deepEqual(decideReconnect({ room: undefined, username: 'Ash' }), {
    action: 'reject',
    reason: 'seat_released',
  });
});

test('design 069: reconnect needs the token; with it the seat is kept', () => {
  const room = roomWith('Ash');
  issueSeatToken(room, 'Ash', () => 'tok');
  assert.deepEqual(decideReconnect({ room, username: 'Ash', token: 'nope' }), {
    action: 'reject',
    reason: 'name_taken',
  });
  assert.deepEqual(decideReconnect({ room, username: 'Ash', token: 'tok' }), { action: 'seat' });
  assert.equal(checkSeatClaim(room, 'Ash', 'tok'), 'owner');
});

test('design 069 rows 3, 9, 12, 20: the sweep frees due public seats only', () => {
  const setUpRoom = roomWith('Ash', 'Misty');
  markSeatDisconnected(setUpRoom, 'Ash', null, 0);
  const notSetUpRoom = roomWith('Brock');
  markSeatDisconnected(notSetUpRoom, 'Brock', null, 0);
  const codeRoom = roomWith('Oak');
  markSeatDisconnected(codeRoom, 'Oak', null, 0);
  const roomInfo = new Map([
    ['public:1', setUpRoom],
    ['public:2', notSetUpRoom],
    ['my-code', codeRoom],
  ]);
  const isSetUp = (roomId) => roomId === 'public:1';
  assert.deepEqual(planSweep({ roomInfo, now: RELEASE_MS - 1, releaseMs: RELEASE_MS, isSetUp }), [
    { roomId: 'public:2', username: 'Brock' },
  ]);
  assert.deepEqual(planSweep({ roomInfo, now: RELEASE_MS, releaseMs: RELEASE_MS, isSetUp }), [
    { roomId: 'public:1', username: 'Ash' },
    { roomId: 'public:2', username: 'Brock' },
  ]);
  // Row 20: the game is reset, so the dropped seat in public:1 is no longer held.
  assert.deepEqual(planSweep({ roomInfo, now: 1, releaseMs: RELEASE_MS, isSetUp: () => false }), [
    { roomId: 'public:1', username: 'Ash' },
    { roomId: 'public:2', username: 'Brock' },
  ]);
});

test('design 069 row 11: a burst of 50 calls over 1 s fires at most 5 times', () => {
  const pending = [];
  let clock = 0;
  const timers = { setTimeout: (fn, ms) => pending.push({ at: clock + ms, fn }) };
  let fired = 0;
  const notify = createDebouncer(250, () => (fired += 1), timers);
  for (let call = 0; call < 50; call += 1) {
    clock = call * 20;
    for (const due of pending.filter((entry) => entry.at <= clock)) {
      pending.splice(pending.indexOf(due), 1);
      due.fn();
    }
    notify();
  }
  for (const entry of pending.splice(0)) entry.fn();
  assert.ok(fired >= 1 && fired <= 5, `fired ${fired}`);
});
