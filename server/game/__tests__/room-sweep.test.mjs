import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { planRoomSweep } from '../room-sweep.mjs';
import { PUBLIC_ROOMS } from '../../../shared/lobby/public-rooms.mjs';

const GRACE_MS = 30 * 60 * 1000;
const NOW = 10 * GRACE_MS;

// A room whose seated player dropped without pressing Leave: the seat stays, the socket is gone.
function abandonedRoom(roomId, idleMs) {
  const room = new GameRoom({ roomId, rulesEnabled: false });
  room.addPlayer('sock-a', 'p1', 'Ash');
  room.removeSocket('sock-a');
  room.lastActivityAt = NOW - idleMs;
  return room;
}

const plan = (rooms, socketCounts = {}) =>
  planRoomSweep({
    gameRooms: new Map(rooms.map((room) => [room.roomId, room])),
    now: NOW,
    graceMs: GRACE_MS,
    socketCount: (roomId) => socketCounts[roomId] ?? 0,
  });

test('a socketless private room past the grace is ended and its roomInfo forgotten', () => {
  assert.deepEqual(plan([abandonedRoom('private-1', GRACE_MS + 1)]), [
    { roomId: 'private-1', forgetRoomInfo: true },
  ]);
});

test('a socketless private room within the grace is kept (Finding 5)', () => {
  assert.deepEqual(plan([abandonedRoom('private-2', GRACE_MS)]), []);
});

test('a room with a registered player socket is kept however long it idles', () => {
  const room = abandonedRoom('private-3', GRACE_MS * 5);
  room.addPlayer('sock-a2', 'p1', 'Ash');
  assert.deepEqual(plan([room]), []);
});

test('a room with a spectator socket is kept', () => {
  const room = abandonedRoom('private-4', GRACE_MS * 5);
  room.addSpectator('sock-s');
  assert.deepEqual(plan([room]), []);
});

test('the GameRoom ends but roomInfo is kept while a socket is still in the Socket.IO room', () => {
  assert.deepEqual(plan([abandonedRoom('private-5', GRACE_MS + 1)], { 'private-5': 1 }), [
    { roomId: 'private-5', forgetRoomInfo: false },
  ]);
});

test('a public room keeps roomInfo: its seats are released by planSweep', () => {
  const publicId = PUBLIC_ROOMS[0].id;
  assert.deepEqual(plan([abandonedRoom(publicId, GRACE_MS + 1)]), [
    { roomId: publicId, forgetRoomInfo: false },
  ]);
});
