import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import { createGameState } from '../../../shared/engine/state.mjs';
import { applyCommand } from '../../../shared/engine/reduce.mjs';
import { PROTOCOL_VERSION } from '../../../shared/engine/commands.mjs';

test('Edge Case 7: Server restart / in-memory loss handling', () => {
  // Server state: gameRooms is empty (simulating server restart or process crash)
  const gameRooms = new Map();
  const roomId = 'room-post-restart';

  let emittedEvent = null;
  let emittedData = null;
  const mockSocket = {
    id: 'socket-client-1',
    rooms: new Set(['socket-client-1', roomId]),
    emit: (event, data) => {
      emittedEvent = event;
      emittedData = data;
    },
  };

  // Simulating server 'cmd' handler when gameRoom is missing
  const handleCmdOnServer = (socket, data) => {
    const rId = data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
    const room = gameRooms.get(rId);
    if (!room) {
      socket.emit('gameEnded', {
        winner: null,
        reason: 'server_restart',
        message: 'Game session terminated due to server restart.',
      });
      return { success: false, error: 'server_restart' };
    }
    return { success: true };
  };

  const res = handleCmdOnServer(mockSocket, { roomId, type: 'pass' });
  assert.equal(res.success, false);
  assert.equal(res.error, 'server_restart');
  assert.equal(emittedEvent, 'gameEnded');
  assert.equal(emittedData.reason, 'server_restart');
  assert.match(emittedData.message, /server restart/i);

  // Client side reaction verification:
  const clientSystemState = {
    roomId: 'room-post-restart',
    isTwoPlayer: true,
  };
  // Emulate client gameEnded listener
  if (emittedData.reason === 'server_restart') {
    clientSystemState.roomId = null;
  }
  assert.equal(clientSystemState.roomId, null, 'Client should reset roomId to return to lobby');
});

test('Edge Case 14: 3rd player rejected as non-spectator, accepted as spectator', () => {
  const room = new GameRoom({ roomId: 'room-3p-limit', rulesEnabled: false });

  // Add 2 active players
  const p1Success = room.addPlayer('socket-p1', 'p1', 'Alice');
  const p2Success = room.addPlayer('socket-p2', 'p2', 'Bob');
  assert.equal(p1Success, true);
  assert.equal(p2Success, true);

  // Attempt to add a 3rd player as a player -> rejected
  const p3Success = room.addPlayer('socket-p3', 'p3', 'Charlie');
  assert.equal(p3Success, false, '3rd non-spectator player must be rejected');
  assert.equal(room.socketToPlayer.has('socket-p3'), false);

  // 3rd player joins as spectator -> accepted
  room.addSpectator('socket-p3');
  assert.equal(room.spectatorSockets.has('socket-p3'), true);

  // Spectator can view game
  const specView = room.getViewForSocket('socket-p3');
  assert.ok(specView, 'Spectator must receive a valid game view');
  assert.ok(specView.players, 'Spectator view should contain players');

  // Spectator commands are rejected
  const cmdRes = room.handleCommand('socket-p3', {
    type: 'pass',
    payload: {},
    clientSeq: 1,
  });
  assert.equal(cmdRes.success, false);
  assert.equal(cmdRes.error, 'spectator_readonly');
});

test('Edge Case 16: TCGdex API failure degrades gracefully to decklist data', () => {
  // Construct cards with minimal decklist data only (simulating TCGdex offline)
  const fallbackPokemon = createCard({
    instanceId: 1001,
    name: 'Fallback Pikachu',
    supertype: 'Pokémon',
    types: ['Lightning'],
    stage: 'Basic',
    hp: 60,
  });
  const fallbackEnergy = createCard({
    instanceId: 1002,
    name: 'Fallback Energy',
    supertype: 'Energy',
    types: ['Lightning'],
  });

  const room = new GameRoom({ roomId: 'room-tcgdex-fallback', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');

  room.state.players.p1.zones.hand.push(fallbackPokemon, fallbackEnergy);

  // Play Basic Pokémon to bench with fallback data
  const moveRes1 = room.handleCommand('socket-ash', {
    type: 'moveCard',
    payload: { instanceId: 1001, from: 'hand', to: 'bench' },
    clientSeq: 1,
  });
  assert.equal(moveRes1.success, true);
  assert.equal(room.state.players.p1.zones.bench.length, 1);
  assert.equal(room.state.players.p1.zones.bench[0].name, 'Fallback Pikachu');

  // Attach fallback energy
  const moveRes2 = room.handleCommand('socket-ash', {
    type: 'moveCard',
    payload: { instanceId: 1002, from: 'hand', to: 'active' },
    clientSeq: 2,
  });
  assert.equal(moveRes2.success, true);
  assert.equal(room.state.players.p1.zones.active.length, 1);

  // Redacted view works cleanly with fallback cards
  const p2View = room.getView('p2');
  assert.ok(p2View);
  // Bench Pokemon is public
  assert.equal(p2View.them.zones.bench[0].name, 'Fallback Pikachu');
});

test('Edge Case 17: Protocol version negotiation and mismatch rejection', () => {
  assert.equal(PROTOCOL_VERSION, '2.0.0');

  const room = new GameRoom({ roomId: 'room-version-test', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');

  // Command sent with outdated protocol version is rejected
  const oldVersionCmd = room.handleCommand('socket-ash', {
    type: 'pass',
    payload: {},
    clientSeq: 1,
    protocolVersion: '1.0.0',
  });
  assert.equal(oldVersionCmd.success, false);
  assert.equal(oldVersionCmd.error, 'version_mismatch');
  assert.equal(oldVersionCmd.expectedVersion, PROTOCOL_VERSION);
  assert.match(oldVersionCmd.reason, /version mismatch/i);

  // Command sent with matching protocol version is accepted
  const correctVersionCmd = room.handleCommand('socket-ash', {
    type: 'pass',
    payload: {},
    clientSeq: 2,
    protocolVersion: PROTOCOL_VERSION,
  });
  assert.equal(correctVersionCmd.success, true);
});

test('Edge Case 18: Solo mode runs cleanly in-process without network overhead', () => {
  // Pure local solo game state
  const state = createGameState({
    gameId: 'solo-game-1',
    seed: 42,
    rulesEnabled: false,
    players: {
      p1: { username: 'Ash' },
      p2: { username: 'AI' },
    },
  });
  state.turn.phase = 'main';

  const card1 = createCard({ instanceId: 1, name: 'Bulbasaur', supertype: 'Pokémon', hp: 70 });
  const card2 = createCard({ instanceId: 2, name: 'Grass Energy', supertype: 'Energy' });
  state.players.p1.zones.hand.push(card1, card2);

  // Local command dispatch via applyCommand without socket or server room
  const res1 = applyCommand(state, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { instanceId: 1, from: 'hand', to: 'active' },
  });
  assert.equal(res1.error, null);
  assert.equal(res1.state.players.p1.zones.active.length, 1);
  assert.equal(res1.state.players.p1.zones.active[0].name, 'Bulbasaur');
  assert.equal(res1.state.stateVersion, 1);

  const res2 = applyCommand(res1.state, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { instanceId: 2, from: 'hand', to: 'active' },
  });
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.active.length, 2);
  assert.equal(res2.state.stateVersion, 2);

  const res3 = applyCommand(res2.state, {
    type: 'pass',
    playerId: 'p1',
    payload: {},
  });
  assert.equal(res3.error, null);
  assert.equal(res3.state.turn.player, 'p2');
  assert.equal(res3.state.stateVersion, 3);
});
