import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ROOMS, isPublicRoomId, publicRoomName } from '../public-rooms.mjs';

test('design 069: exactly eight rooms named Room 1..Room 8, in order', () => {
  assert.deepEqual(
    PUBLIC_ROOMS.map((room) => room.name),
    ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6', 'Room 7', 'Room 8']
  );
  assert.equal(new Set(PUBLIC_ROOMS.map((room) => room.id)).size, 8);
  assert.ok(Object.isFrozen(PUBLIC_ROOMS) && Object.isFrozen(PUBLIC_ROOMS[0]));
});

test('design 069: only listed ids are public; anything else is a code room', () => {
  assert.equal(isPublicRoomId('public:1'), true);
  assert.equal(isPublicRoomId('public:8'), true);
  assert.equal(isPublicRoomId('public:9'), false);
  assert.equal(isPublicRoomId('abc'), false);
  assert.equal(isPublicRoomId(''), false);
  assert.equal(isPublicRoomId(5), false);
  assert.equal(isPublicRoomId(null), false);
  assert.equal(publicRoomName('public:3'), 'Room 3');
  assert.equal(publicRoomName('abc'), null);
  assert.equal(publicRoomName(undefined), null);
});
