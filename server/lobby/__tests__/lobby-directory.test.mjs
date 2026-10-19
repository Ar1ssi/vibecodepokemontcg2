import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobbySnapshot, describePublicRoom } from '../lobby-directory.mjs';
import { markSeatConnected, markSeatDisconnected } from '../seat-presence.mjs';

const roomWith = (players, spectators = []) => ({
  players: new Set(players),
  spectators: new Set(spectators),
  format: { format: null, proposal: null },
});

test('design 069 row 1: a fresh server lists all eight rooms open', () => {
  const { rooms } = buildLobbySnapshot({ roomInfo: new Map(), isInGame: () => false });
  assert.equal(rooms.length, 8);
  assert.deepEqual(rooms[0], {
    id: 'public:1',
    name: 'Room 1',
    players: [],
    spectators: 0,
    format: null,
    status: 'open',
  });
  assert.ok(rooms.every((room) => room.status === 'open'));
});

test('design 069: status follows seats and set-up', () => {
  const describe = (players, inGame = false) =>
    describePublicRoom({ id: 'public:1', name: 'Room 1', room: roomWith(players), inGame }).status;
  assert.equal(describe([]), 'open');
  assert.equal(describe(['Ash']), 'waiting');
  assert.equal(describe(['Ash', 'Misty']), 'full');
  assert.equal(describe(['Ash', 'Misty'], true), 'in-game');
});

test('design 069 row 14: spectators count, format and connection show through', () => {
  const room = roomWith(['Ash', 'Misty'], ['Brock', 'Oak']);
  room.format = { format: 'build-battle', proposal: null };
  markSeatConnected(room, 'Ash', 's1');
  markSeatConnected(room, 'Misty', 's2');
  markSeatDisconnected(room, 'Misty', 's2', 10);
  const summary = describePublicRoom({ id: 'public:2', name: 'Room 2', room });
  assert.equal(summary.spectators, 2);
  assert.equal(summary.format, 'build-battle');
  assert.deepEqual(summary.players, [
    { username: 'Ash', connected: true },
    { username: 'Misty', connected: false },
  ]);
});

test('design 069 row 12: code rooms never appear in the snapshot', () => {
  const roomInfo = new Map([
    ['secret-code', roomWith(['Ash'])],
    ['public:4', roomWith(['Misty'])],
  ]);
  const { rooms } = buildLobbySnapshot({ roomInfo, isInGame: (id) => id === 'public:4' });
  assert.equal(rooms.length, 8);
  assert.equal(rooms[3].status, 'waiting');
  assert.ok(!rooms.some((room) => room.id === 'secret-code'));
});
