import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import {
  getClientSeq,
  resetClientSeq,
  seedClientSeq,
  emitCmd,
} from '../../../client/src/setup/netcode/cmd-emitter.js';

class MockSocket {
  constructor() {
    this.emitted = [];
  }
  emit(event, data) {
    this.emitted.push({ event, data });
  }
}

test('Finding 6: Complete server-client sequence synchronization flow across refresh and reconnect', async () => {
  resetClientSeq(0);
  const room = new GameRoom({ roomId: 'room-seq-test', rulesEnabled: false });

  // Initial connection
  room.addPlayer('socket-p1-initial', 'p1', 'Ash');
  room.addPlayer('socket-p2-initial', 'p2', 'Gary');

  const card1 = createCard({ instanceId: 101, name: 'Pikachu' });
  const card2 = createCard({ instanceId: 102, name: 'Raichu' });
  const card3 = createCard({ instanceId: 103, name: 'Pichu' });
  room.state.players.p1.zones.hand.push(card1, card2, card3);

  const socketP1 = new MockSocket();

  // 1. Client p1 emits 5 commands
  for (let i = 1; i <= 5; i++) {
    const res = await emitCmd({
      socket: socketP1,
      roomId: 'room-seq-test',
      type: 'draw',
      payload: { count: 1 },
    });
    assert.equal(res.clientSeq, i);

    const serverRes = room.handleCommand('socket-p1-initial', socketP1.emitted[socketP1.emitted.length - 1].data);
    assert.equal(serverRes.success, true);
    assert.equal(serverRes.dedupe, false);
  }

  assert.equal(getClientSeq(), 5);
  assert.equal(room.getClientSeq('p1'), 5);

  // 2. Server broadcast includes lastClientSeq: 5 for p1
  const p1Broadcast = room.handleCommand('socket-p1-initial', {
    type: 'draw',
    payload: { count: 1 },
    clientSeq: 6,
  });
  const p1Payload = p1Broadcast.broadcasts.find((b) => b.playerId === 'p1');
  assert.equal(p1Payload.lastClientSeq, 6);

  // 3. Page Refresh Scenario:
  // Client state reloads -> clientSeq reset to 0 in new browser window
  resetClientSeq(0);
  assert.equal(getClientSeq(), 0);

  // New socket connects on page refresh
  const socketP1Refresh = new MockSocket();
  const socketIdRefresh = 'socket-p1-refreshed';

  // Server registers new socket for p1
  room.addPlayer(socketIdRefresh, 'p1', 'Ash');

  // Verify server sequence tracking is reset for the new socket session
  assert.equal(room.getClientSeq('p1'), 0);

  // Ash emits command with clientSeq: 1 on fresh page load BEFORE or AFTER receiving view
  const resFresh = await emitCmd({
    socket: socketP1Refresh,
    roomId: 'room-seq-test',
    type: 'moveCard',
    payload: { instanceId: 102, from: 'hand', to: 'bench' },
  });
  assert.equal(resFresh.clientSeq, 1);

  // Server processes command 1 without dropping it as a duplicate
  const serverResFresh = room.handleCommand(
    socketIdRefresh,
    socketP1Refresh.emitted[socketP1Refresh.emitted.length - 1].data
  );
  assert.equal(serverResFresh.success, true);
  assert.equal(serverResFresh.dedupe, false, 'Command 1 after refresh must NOT be treated as dedupe');
  assert.equal(room.getClientSeq('p1'), 1);

  // 4. RequestView snapshot scenario:
  // Server provides requestView payload with lastClientSeq
  const viewForSocket = room.getViewForSocket(socketIdRefresh);
  const playerId = room.socketToPlayer.get(socketIdRefresh);
  const viewPayload = {
    gameId: room.roomId,
    stateVersion: room.state.stateVersion,
    view: viewForSocket,
    events: [],
    pendingChoice: viewForSocket?.pendingChoice || null,
    lastClientSeq: playerId ? room.getClientSeq(playerId) : 0,
  };

  assert.equal(viewPayload.lastClientSeq, 1);

  // Client receives view and seeds clientSeq
  seedClientSeq(viewPayload.lastClientSeq);
  assert.equal(getClientSeq(), 1);

  // 5. Subsequent command increments to 2 and is accepted
  const resNext = await emitCmd({
    socket: socketP1Refresh,
    roomId: 'room-seq-test',
    type: 'moveCard',
    payload: { instanceId: 103, from: 'hand', to: 'bench' },
  });
  assert.equal(resNext.clientSeq, 2);

  const serverResNext = room.handleCommand(
    socketIdRefresh,
    socketP1Refresh.emitted[socketP1Refresh.emitted.length - 1].data
  );
  assert.equal(serverResNext.success, true);
  assert.equal(serverResNext.dedupe, false);
  assert.equal(room.getClientSeq('p1'), 2);

  // Duplicate command 2 is properly deduplicated
  const serverResDup = room.handleCommand(
    socketIdRefresh,
    socketP1Refresh.emitted[socketP1Refresh.emitted.length - 1].data
  );
  assert.equal(serverResDup.success, true);
  assert.equal(serverResDup.dedupe, true);
  assert.equal(serverResDup.lastClientSeq, 2);
});
