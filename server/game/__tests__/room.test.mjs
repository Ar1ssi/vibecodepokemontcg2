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
});
