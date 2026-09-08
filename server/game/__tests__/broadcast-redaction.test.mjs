import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createPendingChoice } from '../../../shared/engine/effects/executor.mjs';

test('GameRoom broadcasts: Invariant 5 redaction - secret choice options redacted for opponent and spectator', () => {
  const room = new GameRoom({ roomId: 'test-redact-room', rulesEnabled: false });

  room.addPlayer('socket-p1', 'p1', 'Player 1');
  room.addPlayer('socket-p2', 'p2', 'Player 2');
  room.addSpectator('socket-spec');

  // Set up a pendingChoice with secret deck options for p1
  room.state.pendingChoice = createPendingChoice({
    choiceId: 'choice-secret-1',
    player: 'p1',
    type: 'selectCards',
    prompt: 'Choose a Pokemon from your deck',
    min: 1,
    max: 1,
    options: [
      { instanceId: 101, name: 'Secret Charizard ex' },
      { instanceId: 102, name: 'Secret Mewtwo' },
    ],
  });

  // Verify getViewForSocket
  const p1View = room.getViewForSocket('socket-p1');
  assert.ok(p1View.pendingChoice);
  assert.equal(p1View.pendingChoice.options.length, 2);
  assert.equal(p1View.pendingChoice.options[0].name, 'Secret Charizard ex');

  const p2View = room.getViewForSocket('socket-p2');
  assert.ok(p2View.pendingChoice);
  assert.equal(p2View.pendingChoice.options, undefined, 'Opponent view must not contain secret options');
  assert.equal(p2View.pendingChoice.optionsCount, 2);

  const specView = room.getViewForSocket('socket-spec');
  assert.ok(specView.pendingChoice);
  assert.equal(specView.pendingChoice.options, undefined, 'Spectator view must not contain secret options');
  assert.equal(specView.pendingChoice.optionsCount, 2);

  // Simulate server.js broadcast assembly for view emission
  const broadcasts = [];
  for (const [pId, sockId] of room.playerToSocket.entries()) {
    broadcasts.push({
      socketId: sockId,
      playerId: pId,
      view: room.getView(pId),
    });
  }
  for (const sSockId of room.spectatorSockets) {
    broadcasts.push({
      socketId: sSockId,
      playerId: null,
      view: room.getView(null),
    });
  }

  // Generate payload as emitted by server.js
  const payloads = broadcasts.map((broadcast) => ({
    socketId: broadcast.socketId,
    gameId: room.roomId,
    stateVersion: room.state.stateVersion,
    view: broadcast.view,
    events: [],
    pendingChoice: broadcast.view?.pendingChoice || null,
  }));

  const p1Payload = payloads.find((p) => p.socketId === 'socket-p1');
  const p2Payload = payloads.find((p) => p.socketId === 'socket-p2');
  const specPayload = payloads.find((p) => p.socketId === 'socket-spec');

  // P1 payload has full choice options
  assert.equal(p1Payload.pendingChoice.options.length, 2);
  assert.equal(p1Payload.pendingChoice.options[0].name, 'Secret Charizard ex');

  // P2 payload has redacted choice options (both top-level and in view)
  assert.equal(p2Payload.pendingChoice.options, undefined, 'Top-level pendingChoice must be redacted for opponent');
  assert.equal(p2Payload.pendingChoice.optionsCount, 2);
  assert.equal(p2Payload.view.pendingChoice.options, undefined, 'View pendingChoice must be redacted for opponent');

  // Spectator payload has redacted choice options
  assert.equal(specPayload.pendingChoice.options, undefined, 'Top-level pendingChoice must be redacted for spectator');
  assert.equal(specPayload.pendingChoice.optionsCount, 2);
  assert.equal(specPayload.view.pendingChoice.options, undefined, 'View pendingChoice must be redacted for spectator');
});
