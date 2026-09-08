import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';

test('GameRoom: registers players and enforces absolute playerId (Hazard H1)', () => {
  const room = new GameRoom({ roomId: 'test-room-1', rulesEnabled: false });

  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');

  assert.equal(room.socketToPlayer.get('socket-ash'), 'p1');
  assert.equal(room.socketToPlayer.get('socket-gary'), 'p2');
  assert.equal(room.playerToSocket.get('p1'), 'socket-ash');
  assert.equal(room.playerToSocket.get('p2'), 'socket-gary');

  // Verify view for player Ash: you is p1, them is p2
  const viewAsh = room.getView('p1');
  assert.equal(viewAsh.you.playerId, 'p1');
  assert.equal(viewAsh.you.username, 'Ash');
  assert.equal(viewAsh.them.playerId, 'p2');
  assert.equal(viewAsh.them.username, 'Gary');
});

test('GameRoom: Edge Case 4 - clientSeq deduplication per player returns same stateVersion with no-op', () => {
  const room = new GameRoom({ roomId: 'test-room-2', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');

  const card = createCard({ instanceId: 10, name: 'Pikachu' });
  room.state.players.p1.zones.hand.push(card);

  // First command with clientSeq: 1
  const res1 = room.handleCommand('socket-ash', {
    type: 'moveCard',
    payload: { instanceId: 10, from: 'hand', to: 'bench' },
    clientSeq: 1,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.dedupe, false);
  assert.equal(res1.stateVersion, 1);
  assert.equal(room.state.players.p1.zones.bench.length, 1);

  // Second duplicate command with same clientSeq: 1 (e.g. double click or retry)
  const res2 = room.handleCommand('socket-ash', {
    type: 'moveCard',
    payload: { instanceId: 10, from: 'hand', to: 'bench' },
    clientSeq: 1,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.dedupe, true);
  assert.equal(res2.stateVersion, 1, 'stateVersion must remain identical on deduplicated command');
  assert.equal(room.state.stateVersion, 1);
  assert.ok(res2.view, 'Must return cached view');
});

test('GameRoom: Edge Case 13 - spectator command is rejected spectator_readonly', () => {
  const room = new GameRoom({ roomId: 'test-room-3' });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addSpectator('socket-spectator');

  const res = room.handleCommand('socket-spectator', {
    type: 'draw',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'spectator_readonly');
});

test('GameRoom: unauthorized socket command is rejected', () => {
  const room = new GameRoom({ roomId: 'test-room-4' });

  const res = room.handleCommand('unknown-socket', {
    type: 'draw',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'unauthorized');
});

test('GameRoom: command failure returns error without advancing stateVersion', () => {
  const room = new GameRoom({ roomId: 'test-room-5', rulesEnabled: true });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.state.turn.phase = 'main';

  const res = room.handleCommand('socket-ash', {
    type: 'moveCard',
    payload: { instanceId: 9999, from: 'hand', to: 'bench' },
    clientSeq: 5,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'stale_view');
  assert.equal(room.state.stateVersion, 0);
});

test('GameRoom: successful command produces broadcasts for all players with redacted views', () => {
  const room = new GameRoom({ roomId: 'test-room-6', rulesEnabled: false });
  room.addPlayer('socket-p1', 'p1', 'Ash');
  room.addPlayer('socket-p2', 'p2', 'Gary');
  room.addSpectator('socket-spec');

  const secretCard = createCard({ instanceId: 101, name: 'Secret Trainer' });
  room.state.players.p1.zones.deck.push(secretCard);

  const res = room.handleCommand('socket-p1', {
    type: 'draw',
    payload: { count: 1 },
    clientSeq: 10,
  });

  assert.equal(res.success, true);
  assert.equal(res.broadcasts.length, 3);

  const p1Broadcast = res.broadcasts.find((b) => b.playerId === 'p1');
  const p2Broadcast = res.broadcasts.find((b) => b.playerId === 'p2');
  const specBroadcast = res.broadcasts.find((b) => b.playerId === null);

  assert.ok(p1Broadcast);
  assert.ok(p2Broadcast);
  assert.ok(specBroadcast);

  // Owner sees full card name in hand
  assert.equal(p1Broadcast.view.you.zones.hand[0].name, 'Secret Trainer');

  // Opponent sees redacted card (only instanceId, no name)
  assert.equal(p2Broadcast.view.them.zones.hand[0].instanceId, 101);
  assert.equal(p2Broadcast.view.them.zones.hand[0].name, undefined);

  // Spectator sees hand count
  assert.equal(specBroadcast.view.players.p1.zones.hand.count, 1);

  // Broadcasts contain recipient-specific lastClientSeq
  assert.equal(p1Broadcast.lastClientSeq, 10);
  assert.equal(p2Broadcast.lastClientSeq, 0);
  assert.equal(specBroadcast.lastClientSeq, 0);
});

test('GameRoom: Finding 6 - re-registering player socket (page refresh) resets clientSeq tracking and accepts fresh sequence', () => {
  const room = new GameRoom({ roomId: 'test-room-refresh', rulesEnabled: false });
  room.addPlayer('socket-ash-1', 'p1', 'Ash');

  const card1 = createCard({ instanceId: 201, name: 'Pikachu' });
  const card2 = createCard({ instanceId: 202, name: 'Raichu' });
  room.state.players.p1.zones.hand.push(card1, card2);

  // Ash plays command with clientSeq: 20
  const res1 = room.handleCommand('socket-ash-1', {
    type: 'moveCard',
    payload: { instanceId: 201, from: 'hand', to: 'bench' },
    clientSeq: 20,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.dedupe, false);
  assert.equal(room.getClientSeq('p1'), 20);

  // Old socket duplicate is properly deduplicated
  const dup = room.handleCommand('socket-ash-1', {
    type: 'moveCard',
    payload: { instanceId: 201, from: 'hand', to: 'bench' },
    clientSeq: 15,
  });
  assert.equal(dup.dedupe, true);
  assert.equal(dup.lastClientSeq, 20);

  // Ash refreshes the page: new socket connects and registers via addPlayer
  room.addPlayer('socket-ash-2', 'p1', 'Ash');

  // Sequence tracking is reset for the new socket session
  assert.equal(room.getClientSeq('p1'), 0);

  // Ash emits command with clientSeq: 1 from new page session
  const res2 = room.handleCommand('socket-ash-2', {
    type: 'moveCard',
    payload: { instanceId: 202, from: 'hand', to: 'bench' },
    clientSeq: 1,
  });

  // Must NOT be treated as dedupe/dropped!
  assert.equal(res2.success, true);
  assert.equal(res2.dedupe, false);
  assert.equal(room.getClientSeq('p1'), 1);

  // Duplicate from new socket is deduplicated
  const res2Dup = room.handleCommand('socket-ash-2', {
    type: 'moveCard',
    payload: { instanceId: 202, from: 'hand', to: 'bench' },
    clientSeq: 1,
  });
  assert.equal(res2Dup.dedupe, true);
  assert.equal(res2Dup.lastClientSeq, 1);
});

test('Finding 5: GameRoom sets lastActivityAt on construction and touches it on addPlayer/handleCommand', () => {
  const before = Date.now();
  const room = new GameRoom({ roomId: 'room-activity', rulesEnabled: false });
  assert.ok(room.lastActivityAt >= before, 'constructor stamps lastActivityAt');

  // Simulate the room having gone idle
  room.lastActivityAt = before - 60 * 60 * 1000;
  room.addPlayer('socket-ash', 'p1', 'Ash');
  assert.ok(
    room.lastActivityAt > before - 60 * 60 * 1000,
    'addPlayer refreshes lastActivityAt'
  );

  room.lastActivityAt = before - 60 * 60 * 1000;
  room.handleCommand('socket-ash', {
    type: 'draw',
    payload: {},
    clientSeq: 1,
  });
  assert.ok(
    room.lastActivityAt > before - 60 * 60 * 1000,
    'handleCommand refreshes lastActivityAt, even on a failed command'
  );
});

test('Finding 5: sweep grace distinguishes a brief double-disconnect from an abandoned room', () => {
  const ROOM_GRACE_MS = 30 * 60 * 1000;
  const isSweepEligible = (room) =>
    room.playerToSocket.size === 0 &&
    room.spectatorSockets.size === 0 &&
    Date.now() - room.lastActivityAt > ROOM_GRACE_MS;

  const room = new GameRoom({ roomId: 'room-sweep', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');

  // Both players briefly disconnect (e.g. reload) — sockets empty, but recent activity.
  room.removeSocket('socket-ash');
  room.removeSocket('socket-gary');
  assert.equal(
    isSweepEligible(room),
    false,
    'a room with empty sockets but recent activity must survive the sweep'
  );

  // Same empty-socket room, but idle well past the grace window.
  room.lastActivityAt = Date.now() - ROOM_GRACE_MS - 1;
  assert.equal(
    isSweepEligible(room),
    true,
    'a room with empty sockets and no activity for longer than the grace window is sweep-eligible'
  );

  // A room with a connected socket is never sweep-eligible, no matter how idle.
  room.addPlayer('socket-ash-2', 'p1', 'Ash');
  room.lastActivityAt = Date.now() - ROOM_GRACE_MS - 1;
  assert.equal(
    isSweepEligible(room),
    false,
    'a room with a connected socket must never be swept'
  );
});

