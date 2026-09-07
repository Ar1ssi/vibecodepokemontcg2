/**
 * @file Server GameRoom authority wrapper.
 * Manages one authoritative GameState per room, enforces socket -> playerId mapping (Hazard H1),
 * handles clientSeq deduplication (Edge Case 4), and dispatches to applyCommand.
 */

import {
  createGameState,
  createPlayerZones,
} from '../../shared/engine/state.mjs';
import { createRng } from '../../shared/engine/rng.mjs';
import { viewFor } from '../../shared/engine/view.mjs';
import { applyCommand } from '../../shared/engine/reduce.mjs';

export class GameRoom {
  /**
   * @param {object} options
   * @param {string} options.roomId Room identifier
   * @param {boolean} [options.rulesEnabled=true]
   * @param {string|number} [options.seed] PRNG seed
   * @param {object} [options.initialState] Optional pre-configured GameState
   */
  constructor({
    roomId,
    rulesEnabled = true,
    seed = 0,
    initialState = null,
    rng = null,
  }) {
    this.roomId = roomId;
    this.rulesEnabled = Boolean(rulesEnabled);
    this.seed = seed ?? 0;
    this.rng = rng || createRng(this.seed);

    this.state =
      initialState ||
      createGameState({
        gameId: roomId,
        seed: this.seed,
        rulesEnabled: this.rulesEnabled,
      });

    // Socket and player mappings (Hazard H1)
    this.socketToPlayer = new Map(); // socketId -> playerId
    this.playerToSocket = new Map(); // playerId -> socketId
    this.spectatorSockets = new Set(); // Set of socketIds

    // Monotonic sequence tracking per player for deduplication (Edge Case 4)
    this.clientSeqByPlayer = new Map(); // playerId -> lastSeenClientSeq
  }

  /**
   * Registers a player socket with an absolute playerId.
   *
   * @param {string} socketId
   * @param {string} playerId
   * @param {string} [username]
   * @param {object[]} [deckList]
   */
  addPlayer(socketId, playerId, username = '', deckList = []) {
    if (!socketId || !playerId) return;

    this.socketToPlayer.set(socketId, playerId);
    this.playerToSocket.set(playerId, socketId);
    this.spectatorSockets.delete(socketId);

    if (!this.state.players[playerId]) {
      this.state.players[playerId] = {
        playerId,
        username: username || playerId,
        deckList: Array.isArray(deckList) ? [...deckList] : [],
        zones: createPlayerZones(),
        flags: {},
      };
      // If turn player wasn't initialized, set to first joined player
      if (!this.state.turn.player) {
        this.state.turn.player = playerId;
      }
    } else if (username) {
      this.state.players[playerId].username = username;
    }
  }

  /**
   * Registers a socket as a spectator.
   *
   * @param {string} socketId
   */
  addSpectator(socketId) {
    if (!socketId) return;
    this.spectatorSockets.add(socketId);
    const existingPlayerId = this.socketToPlayer.get(socketId);
    if (existingPlayerId) {
      this.socketToPlayer.delete(socketId);
      this.playerToSocket.delete(existingPlayerId);
    }
  }

  /**
   * Cleans up socket mappings on disconnection.
   *
   * @param {string} socketId
   */
  removeSocket(socketId) {
    this.spectatorSockets.delete(socketId);
    const playerId = this.socketToPlayer.get(socketId);
    if (playerId) {
      this.socketToPlayer.delete(socketId);
      this.playerToSocket.delete(playerId);
    }
  }

  /**
   * Handles an incoming command from a socket.
   *
   * @param {string} socketId
   * @param {object} cmd Command envelope: { type, payload, clientSeq }
   * @returns {{
   *   success: boolean,
   *   dedupe?: boolean,
   *   error?: string,
   *   reason?: string,
   *   clientSeq?: number,
   *   stateVersion?: number,
   *   events?: object[],
   *   pendingChoice?: object|null,
   *   broadcasts?: Array<{ socketId: string, playerId: string|null, view: object }>
   * }}
   */
  handleCommand(socketId, cmd = {}) {
    const playerId = this.socketToPlayer.get(socketId);

    if (!playerId) {
      if (this.spectatorSockets.has(socketId)) {
        // Edge Case 13: Spectator sends command rejected spectator_readonly
        return {
          success: false,
          error: 'spectator_readonly',
          reason: 'Spectators cannot execute commands',
          clientSeq: cmd.clientSeq,
        };
      }
      return {
        success: false,
        error: 'unauthorized',
        reason: 'Socket not registered as player',
        clientSeq: cmd.clientSeq,
      };
    }

    // Edge Case 4: Deduplication via clientSeq
    if (typeof cmd.clientSeq === 'number') {
      const lastSeq = this.clientSeqByPlayer.get(playerId) ?? -1;
      if (cmd.clientSeq <= lastSeq) {
        return {
          success: true,
          dedupe: true,
          stateVersion: this.state.stateVersion,
          view: viewFor(this.state, playerId),
          clientSeq: cmd.clientSeq,
        };
      }
    }

    // Dispatch to applyCommand
    const commandWithPlayer = {
      ...cmd,
      playerId,
    };

    const result = applyCommand(this.state, commandWithPlayer, this.rng);

    if (result.error) {
      return {
        success: false,
        error: result.error,
        reason: result.reason,
        clientSeq: cmd.clientSeq,
      };
    }

    // Apply success
    this.state = result.state;
    if (typeof cmd.clientSeq === 'number') {
      this.clientSeqByPlayer.set(playerId, cmd.clientSeq);
    }

    // Assemble redacted views for all connected sockets
    const broadcasts = [];
    for (const [pId, sockId] of this.playerToSocket.entries()) {
      broadcasts.push({
        socketId: sockId,
        playerId: pId,
        view: viewFor(this.state, pId),
      });
    }
    for (const sSockId of this.spectatorSockets) {
      broadcasts.push({
        socketId: sSockId,
        playerId: null,
        view: viewFor(this.state, null),
      });
    }

    return {
      success: true,
      dedupe: false,
      stateVersion: this.state.stateVersion,
      events: result.events,
      pendingChoice: result.pendingChoice,
      broadcasts,
      clientSeq: cmd.clientSeq,
    };
  }

  /**
   * Retrieves redacted view for a given playerId or spectator (null).
   *
   * @param {string|null} playerId
   * @returns {object}
   */
  getView(playerId) {
    return viewFor(this.state, playerId);
  }

  /**
   * Retrieves redacted view for a specific connected socket.
   *
   * @param {string} socketId
   * @returns {object}
   */
  getViewForSocket(socketId) {
    const playerId = this.socketToPlayer.get(socketId) || null;
    return viewFor(this.state, playerId);
  }
}
