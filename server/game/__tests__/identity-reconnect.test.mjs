import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { ShadowSession } from '../shadow.mjs';

test('Finding 7: GameRoom getPlayerIdByUsername and getNextAvailablePlayerId helpers', () => {
  const room = new GameRoom({ roomId: 'room-helpers', rulesEnabled: false });

  assert.equal(room.getNextAvailablePlayerId(), 'p1');
  assert.equal(room.getPlayerIdByUsername('Alice'), null);

  room.addPlayer('sock-1', 'p1', 'Alice');
  assert.equal(room.getPlayerIdByUsername('Alice'), 'p1');
  assert.equal(room.getNextAvailablePlayerId(), 'p2');

  room.addPlayer('sock-2', 'p2', 'Bob');
  assert.equal(room.getPlayerIdByUsername('Bob'), 'p2');
  assert.equal(room.getNextAvailablePlayerId(), null, 'Room is full with 2 players');
});

test('Finding 7: GameRoom prevents seat hijacking by different username on established playerId', () => {
  const room = new GameRoom({ roomId: 'room-hijack-prevention', rulesEnabled: false });

  // Alice occupies p1
  const p1Success = room.addPlayer('sock-alice', 'p1', 'Alice');
  assert.equal(p1Success, true);
  assert.equal(room.state.players.p1.username, 'Alice');

  // Alice temporarily disconnects
  room.removeSocket('sock-alice');
  assert.equal(room.playerToSocket.has('p1'), false);

  // Charlie tries to take p1 with a different username
  const charlieSuccess = room.addPlayer('sock-charlie', 'p1', 'Charlie');
  assert.equal(charlieSuccess, false, 'Charlie must not be allowed to hijack Alice seat');
  assert.equal(room.state.players.p1.username, 'Alice', 'Seat owner username must remain Alice');

  // Alice reconnects with a new socket
  const aliceReconnect = room.addPlayer('sock-alice-2', 'p1', 'Alice');
  assert.equal(aliceReconnect, true, 'Alice should successfully re-register her seat');
  assert.equal(room.playerToSocket.get('p1'), 'sock-alice-2');
});

test('Finding 7: ShadowSession delegates getPlayerIdByUsername and getNextAvailablePlayerId', () => {
  const shadow = new ShadowSession({ roomId: 'shadow-helpers' });

  assert.equal(shadow.getNextAvailablePlayerId(), 'p1');
  assert.equal(shadow.getPlayerIdByUsername('Alice'), null);

  shadow.addPlayer('sock-1', 'p1', 'Alice');
  assert.equal(shadow.getPlayerIdByUsername('Alice'), 'p1');
  assert.equal(shadow.getNextAvailablePlayerId(), 'p2');

  shadow.addPlayer('sock-2', 'p2', 'Bob');
  assert.equal(shadow.getPlayerIdByUsername('Bob'), 'p2');
  assert.equal(shadow.getNextAvailablePlayerId(), null);
});

test('Finding 7: Player 1 temporarily drops, Player 2 reconnects -> Player 2 retains p2 without identity swap', () => {
  const room = new GameRoom({ roomId: 'room-ident-swap', rulesEnabled: false });

  room.addPlayer('sock-p1', 'p1', 'Alice');
  room.addPlayer('sock-p2', 'p2', 'Bob');

  // Alice drops
  room.removeSocket('sock-p1');

  // Bob reconnects with a fresh socket
  // Target PID resolved via getPlayerIdByUsername or fallback
  const bobTargetPid =
    room.getPlayerIdByUsername('Bob') || room.getNextAvailablePlayerId();

  assert.equal(bobTargetPid, 'p2', 'Bob must resolve to p2 even when p1 socket is disconnected');

  const bobRejoin = room.addPlayer('sock-p2-new', bobTargetPid, 'Bob');
  assert.equal(bobRejoin, true);
  assert.equal(room.playerToSocket.get('p2'), 'sock-p2-new');
  assert.equal(room.playerToSocket.has('p1'), false, 'p1 seat remains empty waiting for Alice');
  assert.equal(room.state.players.p1.username, 'Alice');
  assert.equal(room.state.players.p2.username, 'Bob');
});

test('Finding 7: Both players drop, Player 2 reconnects first -> No identity swap', () => {
  const room = new GameRoom({ roomId: 'room-both-drop', rulesEnabled: false });

  room.addPlayer('sock-p1', 'p1', 'Alice');
  room.addPlayer('sock-p2', 'p2', 'Bob');

  // Both drop
  room.removeSocket('sock-p1');
  room.removeSocket('sock-p2');
  assert.equal(room.playerToSocket.size, 0);

  // Bob reconnects first
  const bobTargetPid =
    room.getPlayerIdByUsername('Bob') || room.getNextAvailablePlayerId();
  assert.equal(bobTargetPid, 'p2', 'Bob must be assigned p2, not p1');
  assert.equal(room.addPlayer('sock-p2-reconnect', bobTargetPid, 'Bob'), true);

  // Alice reconnects second
  const aliceTargetPid =
    room.getPlayerIdByUsername('Alice') || room.getNextAvailablePlayerId();
  assert.equal(aliceTargetPid, 'p1', 'Alice must be assigned p1');
  assert.equal(room.addPlayer('sock-p1-reconnect', aliceTargetPid, 'Alice'), true);

  assert.equal(room.playerToSocket.get('p1'), 'sock-p1-reconnect');
  assert.equal(room.playerToSocket.get('p2'), 'sock-p2-reconnect');
  assert.equal(room.state.players.p1.username, 'Alice');
  assert.equal(room.state.players.p2.username, 'Bob');
});

test('Finding 7: 3rd player cannot join active game when Player 1 is disconnected', () => {
  const room = new GameRoom({ roomId: 'room-3p-hijack', rulesEnabled: false });

  room.addPlayer('sock-p1', 'p1', 'Alice');
  room.addPlayer('sock-p2', 'p2', 'Bob');

  // Alice drops
  room.removeSocket('sock-p1');

  // 3rd player Charlie attempts to join as non-spectator
  const isExistingPlayer = Boolean(room.getPlayerIdByUsername('Charlie'));
  const nextAvailablePid = room.getNextAvailablePlayerId();
  const roomIsFull = !nextAvailablePid;

  assert.equal(isExistingPlayer, false);
  assert.equal(roomIsFull, true, 'Room must be reported full because 2 players exist in state');

  const canJoinAsPlayer = isExistingPlayer || !roomIsFull;
  assert.equal(canJoinAsPlayer, false, 'Charlie must be rejected from joining as player');

  // Charlie can still join as spectator
  room.addSpectator('sock-charlie-spec');
  assert.equal(room.spectatorSockets.has('sock-charlie-spec'), true);
});

test('Finding 7: DisconnectHandler preserves room.players on unintended disconnect but removes on leaveRoom', () => {
  const roomInfo = new Map();
  const gameRooms = new Map();
  const roomId = 'test-room-lifecycle';

  const room = new GameRoom({ roomId });
  gameRooms.set(roomId, room);
  room.addPlayer('sock-alice', 'p1', 'Alice');
  room.addPlayer('sock-bob', 'p2', 'Bob');

  roomInfo.set(roomId, {
    players: new Set(['Alice', 'Bob']),
    spectators: new Set(['Charlie']),
  });

  // Emulate disconnectHandler logic
  const disconnectHandler = (socketData, username) => {
    if (gameRooms.has(roomId)) {
      gameRooms.get(roomId).removeSocket(socketData.id);
    }
    if (roomInfo.has(roomId)) {
      const r = roomInfo.get(roomId);
      if (socketData.leaveRoom) {
        if (r.players.has(username)) {
          r.players.delete(username);
        } else if (r.spectators.has(username)) {
          r.spectators.delete(username);
        }
        if (r.players.size === 0 && r.spectators.size === 0) {
          roomInfo.delete(roomId);
          gameRooms.delete(roomId);
        }
      } else {
        if (r.spectators.has(username)) {
          r.spectators.delete(username);
        }
      }
    }
  };

  // 1. Alice experiences unintended disconnect
  disconnectHandler({ id: 'sock-alice', leaveRoom: false }, 'Alice');

  // Alice socket mapping removed from GameRoom
  assert.equal(room.playerToSocket.has('p1'), false);
  // But Alice remains reserved in room.players!
  assert.equal(roomInfo.get(roomId).players.has('Alice'), true);
  assert.equal(roomInfo.get(roomId).players.size, 2);

  // 2. Spectator Charlie experiences unintended disconnect
  disconnectHandler({ id: 'sock-charlie', leaveRoom: false }, 'Charlie');
  assert.equal(roomInfo.get(roomId).spectators.has('Charlie'), false);

  // 3. Bob explicitly leaves room (leaveRoom = true)
  disconnectHandler({ id: 'sock-bob', leaveRoom: true }, 'Bob');
  assert.equal(roomInfo.get(roomId).players.has('Bob'), false);
  assert.equal(roomInfo.get(roomId).players.has('Alice'), true);

  // 4. Alice explicitly leaves room (leaveRoom = true)
  disconnectHandler({ id: 'sock-alice-reconnect', leaveRoom: true }, 'Alice');
  assert.equal(roomInfo.has(roomId), false, 'Empty room cleaned up');
  assert.equal(gameRooms.has(roomId), false, 'GameRoom cleaned up');
});
