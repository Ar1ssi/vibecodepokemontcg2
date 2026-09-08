import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { viewFor } from '../../../shared/engine/view.mjs';

test('Finding 12: GameRoom.prototype.getGameEndedPayload returns null when game is ongoing', () => {
  const room = new GameRoom({ roomId: 'room-active', rulesEnabled: false });
  room.addPlayer('sock-1', 'p1', 'Player 1');
  room.addPlayer('sock-2', 'p2', 'Player 2');

  assert.equal(room.getGameEndedPayload('p1'), null);
  assert.equal(room.getGameEndedPayload('p2'), null);
  assert.equal(room.getGameEndedPayload(null), null);
});

test('Finding 12: GameRoom.prototype.getGameEndedPayload tailors messages for winner, loser, and spectator', () => {
  const room = new GameRoom({ roomId: 'room-ended', rulesEnabled: false });
  room.addPlayer('sock-1', 'p1', 'Ash');
  room.addPlayer('sock-2', 'p2', 'Gary');
  room.addSpectator('sock-spec');

  room.state.turn.phase = 'ended';
  room.state.winner = 'p1';
  room.state.winReason = 'all prize cards taken';

  const p1Payload = room.getGameEndedPayload('p1');
  assert.ok(p1Payload);
  assert.equal(p1Payload.winner, 'p1');
  assert.equal(p1Payload.reason, 'all prize cards taken');
  assert.equal(p1Payload.message, '🏆 Game over — you win! (all prize cards taken)');

  const p2Payload = room.getGameEndedPayload('p2');
  assert.ok(p2Payload);
  assert.equal(p2Payload.winner, 'p1');
  assert.equal(p2Payload.reason, 'all prize cards taken');
  assert.equal(p2Payload.message, '🏆 Game over — opponent wins! (all prize cards taken)');

  const specPayload = room.getGameEndedPayload(null);
  assert.ok(specPayload);
  assert.equal(specPayload.winner, 'p1');
  assert.equal(specPayload.reason, 'all prize cards taken');
  assert.equal(specPayload.message, '🏆 Game over — Ash wins! (all prize cards taken)');
});

test('Finding 12: viewFor exposes authoritative winner and winReason', () => {
  const room = new GameRoom({ roomId: 'room-view-ended', rulesEnabled: false });
  room.addPlayer('sock-1', 'p1', 'Ash');
  room.addPlayer('sock-2', 'p2', 'Gary');

  room.state.turn.phase = 'ended';
  room.state.winner = 'p2';
  room.state.winReason = 'deck-out';

  const v1 = viewFor(room.state, 'p1');
  assert.equal(v1.turn.phase, 'ended');
  assert.equal(v1.winner, 'p2');
  assert.equal(v1.winReason, 'deck-out');

  const v2 = viewFor(room.state, 'p2');
  assert.equal(v2.turn.phase, 'ended');
  assert.equal(v2.winner, 'p2');
  assert.equal(v2.winReason, 'deck-out');

  const vSpec = viewFor(room.state, null);
  assert.equal(vSpec.turn.phase, 'ended');
  assert.equal(vSpec.winner, 'p2');
  assert.equal(vSpec.winReason, 'deck-out');
});

test('Finding 12: Simulated server broadcast emits view and gameEnded to all room sockets', () => {
  const room = new GameRoom({ roomId: 'room-broadcast', rulesEnabled: false });
  room.addPlayer('sock-p1', 'p1', 'Ash');
  room.addPlayer('sock-p2', 'p2', 'Gary');
  room.addSpectator('sock-spec');

  const emitted = [];
  const mockIo = {
    to: (socketId) => ({
      emit: (event, payload) => {
        emitted.push({ socketId, event, payload });
      },
    }),
  };

  room.state.turn.phase = 'ended';
  room.state.winner = 'p1';
  room.state.winReason = 'all prize cards taken';

  const commandResult = {
    success: true,
    dedupe: false,
    stateVersion: 5,
    events: [{ type: 'gameEnded', winner: 'p1', reason: 'all prize cards taken' }],
    broadcasts: [
      { socketId: 'sock-p1', playerId: 'p1', view: room.getView('p1'), lastClientSeq: 1 },
      { socketId: 'sock-p2', playerId: 'p2', view: room.getView('p2'), lastClientSeq: 0 },
      { socketId: 'sock-spec', playerId: null, view: room.getView(null), lastClientSeq: 0 },
    ],
  };

  const broadcastGameResult = (gameRoom, result) => {
    for (const broadcast of result.broadcasts || []) {
      mockIo.to(broadcast.socketId).emit('view', {
        gameId: gameRoom.roomId,
        stateVersion: result.stateVersion,
        view: broadcast.view,
        events: result.events,
        pendingChoice: broadcast.view?.pendingChoice || null,
        lastClientSeq: broadcast.lastClientSeq,
      });
    }

    const gameEndedEvent =
      (result.events || []).find((e) => e.type === 'gameEnded') ||
      gameRoom.state.turn?.phase === 'ended';

    if (gameEndedEvent) {
      for (const broadcast of result.broadcasts || []) {
        const payload = gameRoom.getGameEndedPayload(broadcast.playerId);
        if (payload) {
          mockIo.to(broadcast.socketId).emit('gameEnded', payload);
        }
      }
    }
  };

  broadcastGameResult(room, commandResult);

  assert.equal(emitted.length, 6);

  const views = emitted.filter((e) => e.event === 'view');
  assert.equal(views.length, 3);
  assert.equal(views[0].socketId, 'sock-p1');
  assert.equal(views[0].payload.view.winner, 'p1');

  const gameEndeds = emitted.filter((e) => e.event === 'gameEnded');
  assert.equal(gameEndeds.length, 3);

  const p1End = gameEndeds.find((e) => e.socketId === 'sock-p1');
  assert.ok(p1End);
  assert.equal(p1End.payload.winner, 'p1');
  assert.match(p1End.payload.message, /you win/i);

  const p2End = gameEndeds.find((e) => e.socketId === 'sock-p2');
  assert.ok(p2End);
  assert.equal(p2End.payload.winner, 'p1');
  assert.match(p2End.payload.message, /opponent wins/i);

  const specEnd = gameEndeds.find((e) => e.socketId === 'sock-spec');
  assert.ok(specEnd);
  assert.equal(specEnd.payload.winner, 'p1');
  assert.match(specEnd.payload.message, /Ash wins/i);
});
