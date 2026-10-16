import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicRoomRows, rejectEndsSeat, roomRejectMessage } from '../public-room-view.mjs';

const summary = (overrides) => ({
  id: 'public:1',
  name: 'Room 1',
  players: [],
  spectators: 0,
  format: null,
  status: 'open',
  ...overrides,
});

test('design 069: an open room can be joined but not watched', () => {
  assert.deepEqual(publicRoomRows([summary()]), [
    {
      id: 'public:1',
      name: 'Room 1',
      statusLabel: 'Open',
      playersLabel: '',
      formatLabel: '',
      spectatorsLabel: '',
      canJoin: true,
      joinLabel: 'Join',
      canWatch: false,
    },
  ]);
});

test('design 069: a waiting room names the player and offers Join and Watch', () => {
  const [row] = publicRoomRows([
    summary({ status: 'waiting', players: [{ username: 'Ash', connected: true }] }),
  ]);
  assert.equal(row.playersLabel, 'Ash is waiting');
  assert.equal(row.statusLabel, 'Waiting for an opponent');
  assert.equal(row.canJoin, true);
  assert.equal(row.canWatch, true);
});

test('design 069: full and in-game rooms can only be watched; dropped players show reconnecting', () => {
  const players = [
    { username: 'Ash', connected: true },
    { username: 'Misty', connected: false },
  ];
  const [full, inGame] = publicRoomRows([
    summary({ status: 'full', players, format: 'build-battle', spectators: 2 }),
    summary({ id: 'public:2', status: 'in-game', players, format: 'tcg' }),
  ]);
  assert.equal(full.playersLabel, 'Ash vs Misty (reconnecting)');
  assert.equal(full.formatLabel, 'Build & Battle');
  assert.equal(full.spectatorsLabel, '2 watching');
  assert.equal(full.canJoin, false);
  assert.equal(full.canWatch, true);
  assert.equal(inGame.statusLabel, 'In game');
  assert.equal(inGame.formatLabel, 'Standard');
});

test('design 069 row 2: malformed payloads render nothing rather than throwing', () => {
  assert.deepEqual(publicRoomRows(undefined), []);
  assert.deepEqual(publicRoomRows('rooms'), []);
  assert.deepEqual(publicRoomRows([null, { id: 3 }, summary({ status: 'weird' })]), []);
  assert.deepEqual(publicRoomRows([summary({ status: 'constructor' })]), []);
  assert.equal(publicRoomRows([summary({ format: 'constructor' })])[0].formatLabel, '');
  assert.match(roomRejectMessage('toString'), /Room is full/);
  assert.equal(publicRoomRows([summary({ status: 'waiting', players: [null, { username: 'Ash', connected: true }] })])[0].playersLabel, 'Ash is waiting');
  const [row] = publicRoomRows([summary({ players: 'x', spectators: -1.5, format: 'nope' })]);
  assert.equal(row.playersLabel, '');
  assert.equal(row.spectatorsLabel, '');
  assert.equal(row.formatLabel, '');
});

test('design 069: reject reasons pick their message; only lost-seat reasons end the seat', () => {
  assert.match(roomRejectMessage('name_taken'), /already using that name/);
  assert.match(roomRejectMessage('seat_released'), /seat was released/);
  assert.match(roomRejectMessage('full'), /Room is full/);
  assert.match(roomRejectMessage(undefined), /Room is full/);
  assert.equal(rejectEndsSeat('seat_released'), true);
  assert.equal(rejectEndsSeat('name_taken'), true);
  assert.equal(rejectEndsSeat('full'), false);
  assert.equal(rejectEndsSeat(undefined), false);
});

test('design 069 row 7: a full room offers Rejoin to the tab holding one of its seats', () => {
  const players = [
    { username: 'Ash', connected: false },
    { username: 'Misty', connected: true },
  ];
  const rooms = [summary({ status: 'in-game', players })];
  const [mine] = publicRoomRows(rooms, (roomId) => (roomId === 'public:1' ? 'Ash' : null));
  assert.equal(mine.canJoin, true);
  assert.equal(mine.joinLabel, 'Rejoin');
  const [stranger] = publicRoomRows(rooms, () => 'Brock');
  assert.equal(stranger.canJoin, false);
  assert.equal(stranger.joinLabel, 'Join');
});

test('design 074 D7: solo-room refusals have their own messages and keep the seat', () => {
  assert.match(roomRejectMessage('solo_room'), /solo game/);
  assert.match(roomRejectMessage('solo_needs_authority'), /local board/);
  assert.equal(rejectEndsSeat('solo_room'), false);
  assert.equal(rejectEndsSeat('solo_needs_authority'), false);
});
