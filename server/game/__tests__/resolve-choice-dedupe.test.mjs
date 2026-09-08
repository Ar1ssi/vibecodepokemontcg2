import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createPendingChoice } from '../../../shared/engine/effects/executor.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import {
  getClientSeq,
  resetClientSeq,
  emitCmd,
  emitResolveChoice,
} from '../../../client/src/setup/netcode/cmd-emitter.js';

class MockSocket {
  constructor(id) {
    this.id = id;
    this.rooms = new Set([id]);
    this.emitted = [];
  }
  emit(event, data) {
    this.emitted.push({ event, data });
  }
}

class MockServer {
  constructor() {
    this.rooms = new Map();
  }
  to(socketId) {
    return {
      emit: (event, data) => {
        const sock = this.rooms.get(socketId);
        if (sock) sock.emit(event, data);
      },
    };
  }
}

test('Finding 11: GameRoom.resolveChoice deduplicates repeat requests with identical clientSeq', () => {
  const room = new GameRoom({ roomId: 'test-room-choice-dedupe', rulesEnabled: true });
  room.addPlayer('socket-p1', 'p1', 'Alice');
  room.addPlayer('socket-p2', 'p2', 'Bob');
  room.state.turn = { player: 'p1', number: 2, phase: 'main' };

  // Set up pending choice for p1
  room.state.pendingChoice = createPendingChoice({
    choiceId: 'choice_p1_0_0',
    player: 'p1',
    prompt: 'Choose a card',
    source: 'Test Choice',
    options: [
      { instanceId: 101, name: 'Card 101' },
      { instanceId: 102, name: 'Card 102' },
    ],
    min: 1,
    max: 1,
    stateVersion: 0,
    stepIndex: 0,
  });

  // First resolution with clientSeq: 1
  const res1 = room.resolveChoice(
    'socket-p1',
    {
      choiceId: 'choice_p1_0_0',
      selection: [101],
    },
    1
  );

  assert.equal(res1.success, true);
  assert.equal(res1.dedupe, false);
  assert.equal(res1.stateVersion, 1);
  assert.equal(room.state.pendingChoice, null, 'Choice should be resolved and cleared');
  assert.equal(room.getClientSeq('p1'), 1);

  // Duplicate resolution with clientSeq: 1 (retransmitted packet or double click)
  const res2 = room.resolveChoice(
    'socket-p1',
    {
      choiceId: 'choice_p1_0_0',
      selection: [101],
    },
    1
  );

  assert.equal(res2.success, true);
  assert.equal(res2.dedupe, true);
  assert.equal(res2.stateVersion, 1, 'stateVersion must remain identical on deduplicated choice');
  assert.equal(res2.lastClientSeq, 1);
  assert.ok(res2.view, 'Must return cached view');
  assert.equal(res2.view.pendingChoice, null);
});

test('Finding 11: GameRoom.resolveChoice extracts clientSeq from payload when 3rd param omitted', () => {
  const room = new GameRoom({ roomId: 'test-room-choice-payload-seq', rulesEnabled: false });
  room.addPlayer('socket-p1', 'p1', 'Alice');

  room.state.pendingChoice = createPendingChoice({
    choiceId: 'choice_p1_0_1',
    player: 'p1',
    prompt: 'Pick one',
    source: 'Test',
    options: [{ instanceId: 50, name: 'Option 50' }],
    min: 1,
    max: 1,
    stateVersion: 0,
    stepIndex: 0,
  });

  // Call resolveChoice passing clientSeq inside payload object
  const res1 = room.resolveChoice('socket-p1', {
    choiceId: 'choice_p1_0_1',
    selection: [50],
    clientSeq: 10,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.dedupe, false);
  assert.equal(room.getClientSeq('p1'), 10);

  // Repeat call with same clientSeq inside payload
  const res2 = room.resolveChoice('socket-p1', {
    choiceId: 'choice_p1_0_1',
    selection: [50],
    clientSeq: 10,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.dedupe, true);
  assert.equal(res2.lastClientSeq, 10);
});

test('Finding 11: resolveChoice deduplication preserves active subsequent pendingChoice', () => {
  const room = new GameRoom({ roomId: 'test-room-multistep-choice', rulesEnabled: false });
  room.addPlayer('socket-p1', 'p1', 'Alice');

  // Set sequence to 2
  room.clientSeqByPlayer.set('p1', 2);

  // Simulate active second choice step in progress
  room.state.pendingChoice = createPendingChoice({
    choiceId: 'choice_p1_2_step2',
    player: 'p1',
    prompt: 'Choose second target',
    source: 'Multi-step',
    options: [{ instanceId: 99, name: 'Target 99' }],
    min: 1,
    max: 1,
    stateVersion: 2,
    stepIndex: 1,
  });

  // Duplicate resolveChoice from step 1 arrives with clientSeq: 2 <= 2
  const dupRes = room.resolveChoice('socket-p1', {
    choiceId: 'choice_p1_2_step1',
    selection: [1],
    clientSeq: 2,
  });

  assert.equal(dupRes.success, true);
  assert.equal(dupRes.dedupe, true);
  assert.ok(dupRes.view.pendingChoice, 'Dedupe response view must preserve the active pendingChoice');
  assert.equal(dupRes.view.pendingChoice.choiceId, 'choice_p1_2_step2');
});

test('Finding 11: End-to-end socket resolveChoice deduplication and view broadcast behavior', async () => {
  resetClientSeq(0);
  const room = new GameRoom({ roomId: 'test-socket-room', rulesEnabled: false });
  const server = new MockServer();

  const sock1 = new MockSocket('sock-p1');
  const sock2 = new MockSocket('sock-p2');
  server.rooms.set('sock-p1', sock1);
  server.rooms.set('sock-p2', sock2);

  room.addPlayer('sock-p1', 'p1', 'Alice');
  room.addPlayer('sock-p2', 'p2', 'Bob');

  // Socket event listener simulation mirroring server/server.js
  function handleSocketResolveChoice(socket, data) {
    const result = room.resolveChoice(socket.id, data, data?.clientSeq);
    if (!result.success) {
      socket.emit('cmdRejected', {
        clientSeq: data?.clientSeq,
        reason: result.error,
        details: result.reason,
      });
    } else if (result.dedupe) {
      socket.emit('view', {
        gameId: room.roomId,
        stateVersion: result.stateVersion,
        view: result.view,
        events: [],
        pendingChoice: result.view?.pendingChoice || null,
        lastClientSeq: result.lastClientSeq ?? result.clientSeq,
      });
    } else {
      for (const broadcast of result.broadcasts || []) {
        server.to(broadcast.socketId).emit('view', {
          gameId: room.roomId,
          stateVersion: result.stateVersion,
          view: broadcast.view,
          events: result.events,
          pendingChoice: broadcast.view?.pendingChoice || null,
          lastClientSeq: broadcast.lastClientSeq,
        });
      }
    }
  }

  // 1. Initial pending choice
  room.state.pendingChoice = createPendingChoice({
    choiceId: 'choice_initial',
    player: 'p1',
    prompt: 'Choose prize',
    source: 'Prize',
    options: [{ instanceId: 10, name: 'Card 10' }],
    min: 1,
    max: 1,
    stateVersion: 0,
    stepIndex: 0,
  });

  // Client emits resolveChoice via cmd-emitter
  const emitRes1 = await emitResolveChoice({
    socket: sock1,
    roomId: 'test-socket-room',
    choiceId: 'choice_initial',
    selection: [10],
  });
  assert.equal(emitRes1.clientSeq, 1);
  assert.equal(getClientSeq(), 1);

  // Server processes first resolveChoice
  const clientPayload1 = sock1.emitted.find((e) => e.event === 'resolveChoice')?.data;
  sock1.emitted = [];
  sock2.emitted = [];
  handleSocketResolveChoice(sock1, clientPayload1);

  // Verify full broadcast to both players
  assert.equal(sock1.emitted.length, 1);
  assert.equal(sock1.emitted[0].event, 'view');
  assert.equal(sock1.emitted[0].data.lastClientSeq, 1);

  assert.equal(sock2.emitted.length, 1);
  assert.equal(sock2.emitted[0].event, 'view');
  assert.equal(sock2.emitted[0].data.lastClientSeq, 0);

  // 2. Duplicate resolveChoice packet arrives at server
  sock1.emitted = [];
  sock2.emitted = [];
  handleSocketResolveChoice(sock1, clientPayload1);

  // Verify deduplication response ONLY sent back to caller (sock1) and NOT sock2
  assert.equal(sock1.emitted.length, 1, 'Caller should receive dedupe view');
  assert.equal(sock1.emitted[0].event, 'view');
  assert.equal(sock1.emitted[0].data.lastClientSeq, 1);
  assert.deepEqual(sock1.emitted[0].data.events, [], 'Dedupe response must have empty events');
  assert.equal(sock2.emitted.length, 0, 'Opponent must NOT receive duplicate broadcast');

  // 3. Monotonic sequence progression: interleaved cmd and resolveChoice
  const cmdRes = await emitCmd({
    socket: sock1,
    roomId: 'test-socket-room',
    type: 'draw',
    payload: { count: 1 },
  });
  assert.equal(cmdRes.clientSeq, 2);

  const card = createCard({ instanceId: 99, name: 'Energy' });
  room.state.players.p1.zones.deck.push(card);

  const cmdPayload = sock1.emitted.find((e) => e.event === 'cmd')?.data;
  sock1.emitted = [];
  const cmdServerRes = room.handleCommand(sock1.id, cmdPayload);
  assert.equal(cmdServerRes.success, true);
  assert.equal(cmdServerRes.dedupe, false);
  assert.equal(room.getClientSeq('p1'), 2);

  // Duplicate resolveChoice with old seq: 1 is still deduped
  sock1.emitted = [];
  handleSocketResolveChoice(sock1, clientPayload1);
  assert.equal(sock1.emitted.length, 1);
  assert.equal(sock1.emitted[0].data.lastClientSeq, 2);
});
