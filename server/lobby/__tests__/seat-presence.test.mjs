import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forgetSeat,
  isSeatConnected,
  markSeatConnected,
  markSeatDisconnected,
  releasableSeats,
  seatReleaseDue,
} from '../seat-presence.mjs';

const RELEASE_MS = 180000;
const roomWith = (...usernames) => ({ players: new Set(usernames), spectators: new Set() });

test('design 069 row 3: before set-up a dropped seat is due at once', () => {
  assert.equal(seatReleaseDue({ disconnectedAt: 1000, now: 1000, setUp: false, releaseMs: RELEASE_MS }), true);
});

test('design 069 row 3: once set up, due at exactly releaseMs and not a millisecond before', () => {
  const base = { disconnectedAt: 1000, setUp: true, releaseMs: RELEASE_MS };
  assert.equal(seatReleaseDue({ ...base, now: 1000 + RELEASE_MS }), true);
  assert.equal(seatReleaseDue({ ...base, now: 1000 + RELEASE_MS - 1 }), false);
});

test('design 069: a connected seat is never due', () => {
  assert.equal(seatReleaseDue({ disconnectedAt: null, now: 1e12, setUp: false, releaseMs: 0 }), false);
});

test('design 069: releasableSeats lists only dropped, due seats', () => {
  const room = roomWith('Ash', 'Misty');
  markSeatConnected(room, 'Ash', 's1');
  markSeatConnected(room, 'Misty', 's2');
  markSeatDisconnected(room, 'Ash', 's1', 0);
  assert.deepEqual(releasableSeats(room, RELEASE_MS, RELEASE_MS, true), ['Ash']);
  assert.deepEqual(releasableSeats(room, RELEASE_MS - 1, RELEASE_MS, true), []);
  assert.deepEqual(releasableSeats(room, 0, RELEASE_MS, false), ['Ash']);
});

test('design 069: a room with no presence state (code room) releases nothing', () => {
  assert.deepEqual(releasableSeats(roomWith('Ash'), 1e12, 0, false), []);
});

test('design 069: reconnecting clears the drop; disconnecting an unseated name is a no-op', () => {
  const room = roomWith('Ash');
  markSeatConnected(room, 'Ash', 's1');
  markSeatDisconnected(room, 'Ash', 's1', 5);
  assert.equal(isSeatConnected(room, 'Ash'), false);
  assert.equal(room.presence.get('Ash').socketId, 's1', 'last socket kept for release cleanup');
  markSeatConnected(room, 'Ash', 's9');
  assert.equal(isSeatConnected(room, 'Ash'), true);
  markSeatDisconnected(room, 'Brock', null, 5);
  assert.equal(room.presence.has('Brock'), false);
});

test('design 069: forgetSeat drops presence and token', () => {
  const room = roomWith('Ash');
  markSeatConnected(room, 'Ash', 's1');
  room.seatTokens = new Map([['Ash', 't']]);
  forgetSeat(room, 'Ash');
  assert.equal(room.presence.has('Ash'), false);
  assert.equal(room.seatTokens.has('Ash'), false);
  forgetSeat(roomWith(), 'Nobody');
});

test('design 069 row 21: a stale socket dropping after the player came back changes nothing', () => {
  const room = roomWith('Ash');
  markSeatConnected(room, 'Ash', 'old');
  markSeatConnected(room, 'Ash', 'new');
  assert.equal(markSeatDisconnected(room, 'Ash', 'old', 5), false);
  assert.equal(isSeatConnected(room, 'Ash'), true);
  assert.equal(markSeatDisconnected(room, 'Ash', 'new', 6), true);
  assert.equal(isSeatConnected(room, 'Ash'), false);
});
