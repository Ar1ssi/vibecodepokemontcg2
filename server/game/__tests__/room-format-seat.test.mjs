import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomFormatLocked, roomFormatSeatRefusal } from '../room-format-seat.mjs';

const room = () => ({ players: new Set(['Ash', 'Gary']) });
const seat = { roomId: 'r1', username: 'Ash' };
const gameRoom = (socketToPlayer) => ({
  socketToPlayer: new Map(socketToPlayer),
  getPlayerIdByUsername: (name) => ({ Ash: 'p1', Gary: 'p2' })[name] ?? null,
});

test('053 row 4: a socket with no seat, or naming another room, is refused', () => {
  assert.equal(roomFormatSeatRefusal({ seat: null, requestRoomId: 'r1', room: room(), socketId: 's1' }), 'not_seated');
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r2', room: room(), socketId: 's1' }), 'not_seated');
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: null, socketId: 's1' }), 'not_seated');
});

test('053 row 4: only a two-seat room chooses, and the seat must still be listed', () => {
  const three = { players: new Set(['Ash', 'Gary', 'Misty']) };
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: three, socketId: 's1' }), 'not_seated');
  const left = { players: new Set(['Gary', 'Misty']) };
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: left, socketId: 's1' }), 'not_seated');
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: room(), socketId: 's1' }), null);
});

test('053 row 4: authoritative mode needs the socket that holds the seat, not just the username', () => {
  const held = gameRoom([['s1', 'p1'], ['s2', 'p2']]);
  assert.equal(roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: room(), gameRoom: held, socketId: 's1' }), null);
  assert.equal(
    roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: room(), gameRoom: held, socketId: 's9' }),
    'not_seated',
  );
  const taken = gameRoom([['s2', 'p1']]);
  assert.equal(
    roomFormatSeatRefusal({ seat, requestRoomId: 'r1', room: room(), gameRoom: taken, socketId: 's1' }),
    'not_seated',
  );
});

test('053 row 6: the format locks once the coin call opens, not only after the deal', () => {
  assert.equal(roomFormatLocked(null), false);
  assert.equal(roomFormatLocked({ turnOrder: null, state: { turn: { phase: 'setup' } } }), false);
  assert.equal(roomFormatLocked({ turnOrder: { phase: 'awaiting-call' }, state: { turn: { phase: 'setup' } } }), true);
  assert.equal(roomFormatLocked({ turnOrder: null, state: { turn: { phase: 'main' } } }), true);
});
