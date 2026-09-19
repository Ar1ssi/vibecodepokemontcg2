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
import { deckPeekFor, viewFor } from '../../shared/engine/view.mjs';
import { applyCommand } from '../../shared/engine/reduce.mjs';
import { PROTOCOL_VERSION } from '../../shared/engine/commands.mjs';
import {
  flipCoinFace,
  isCoinFace,
  pickCoinCaller,
  resolveStarterPlayerId,
} from '../../shared/engine/rules/turn-order-flip.mjs';

/** How long the designated caller has to answer before the server calls for them. */
export const TURN_ORDER_CALL_TIMEOUT_MS = 15000;

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
    seed = null,
    initialState = null,
    rng = null,
  }) {
    this.roomId = roomId;
    this.rulesEnabled = Boolean(rulesEnabled);
    this.seed = seed ?? Math.floor(Math.random() * 0x7fffffff);
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

    // Seats whose player pressed Set Up this game. Kept outside `state` so it never
    // enters commandLog/undo replay; cleared by resetGame.
    this.readyPlayerIds = new Set();

    // Opening turn-order coin call (design 013). Transient handshake state, kept
    // outside `state` so it never reaches hashState/commandLog/undo replay.
    // null | { phase: 'awaiting-call'|'resolved', callerPlayerId, callId,
    //          call, result, starterPlayerId, auto }
    this.turnOrder = null;
    this.turnOrderCallCounter = 0;

    // Sweep grace (Finding 5): touched on any join or command traffic so the
    // periodic empty-socket sweep can distinguish a brief double-disconnect
    // from an actually-abandoned room.
    this.lastActivityAt = Date.now();
  }

  /** Marks the room as active now (Finding 5 — sweep grace). */
  touchActivity() {
    this.lastActivityAt = Date.now();
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
    if (!socketId || !playerId) return false;
    this.touchActivity();

    // Edge Case 14 & Hazard H1: Only 2 active players allowed per game room
    const registeredPids = [...this.playerToSocket.keys()];
    if (!registeredPids.includes(playerId) && registeredPids.length >= 2) {
      return false;
    }

    // Identity protection (Finding 7): Seat cannot be hijacked by a different username
    if (
      this.state.players[playerId] &&
      this.state.players[playerId].username &&
      this.state.players[playerId].username !== playerId &&
      username &&
      this.state.players[playerId].username !== username
    ) {
      return false;
    }

    const prevSocketId = this.playerToSocket.get(playerId);
    if (prevSocketId && prevSocketId !== socketId) {
      this.socketToPlayer.delete(prevSocketId);
      this.clientSeqByPlayer.delete(playerId);
    }

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
        oncePerGame: { vstarUsed: false, gxUsed: false },
      };
      // If turn player wasn't initialized, set to first joined player
      if (!this.state.turn.player) {
        this.state.turn.player = playerId;
      }
    } else if (username) {
      this.state.players[playerId].username = username;
    }
    return true;
  }

  /**
   * Returns playerId matching username in GameState, or null if not found.
   *
   * @param {string} username
   * @returns {string|null}
   */
  getPlayerIdByUsername(username) {
    if (!username || typeof username !== 'string') return null;
    for (const [pId, pData] of Object.entries(this.state.players)) {
      if (pData?.username === username) {
        return pId;
      }
    }
    return null;
  }

  /**
   * Returns the next available playerId ('p1' or 'p2'), or null if room is full.
   *
   * @returns {'p1'|'p2'|null}
   */
  getNextAvailablePlayerId() {
    if (!this.state.players.p1) return 'p1';
    if (!this.state.players.p2) return 'p2';
    return null;
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
      this.clientSeqByPlayer.delete(playerId);
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
  handleClientCommand(socketId, cmd = {}) {
    // Audit A-9: dedupe keys on clientSeq, so a socket command without one would skip
    // dedupe entirely. Every real client stamps one (cmd-emitter.js); server-internal
    // calls (setup, loadDeck, shadow) go through handleCommand directly.
    if (!Number.isInteger(cmd?.clientSeq) || cmd.clientSeq < 0) {
      return {
        success: false,
        error: 'bad_command',
        reason: 'clientSeq must be a non-negative integer',
        clientSeq: cmd?.clientSeq,
      };
    }
    return this.handleCommand(socketId, cmd);
  }

  /**
   * Executes a command for the socket's player: dedupes by clientSeq when present,
   * runs applyCommand, and assembles redacted broadcasts.
   */
  handleCommand(socketId, cmd = {}) {
    this.touchActivity();
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

    // Edge Case 17: Protocol version negotiation
    if (cmd.protocolVersion && cmd.protocolVersion !== PROTOCOL_VERSION) {
      return {
        success: false,
        error: 'version_mismatch',
        reason: `Protocol version mismatch: client ${cmd.protocolVersion} vs server ${PROTOCOL_VERSION}`,
        clientSeq: cmd.clientSeq,
        expectedVersion: PROTOCOL_VERSION,
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
          lastClientSeq: lastSeq,
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
        lastClientSeq: this.clientSeqByPlayer.get(pId) ?? 0,
      });
    }
    for (const sSockId of this.spectatorSockets) {
      broadcasts.push({
        socketId: sSockId,
        playerId: null,
        view: viewFor(this.state, null),
        lastClientSeq: 0,
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

  /**
   * Design 012: the top or bottom cards of a deck for the asking socket only (see
   * `deckPeekFor`). A spectator or unknown socket is refused.
   *
   * @param {string} socketId
   * @param {{ side?: 'you'|'them', count?: number, fromTop?: boolean }} request
   * @returns {{ ok: true, cards: object[], deckCount: number } | { ok: false, reason: string }}
   */
  peekDeck(socketId, request = {}) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return { ok: false, reason: 'Only a seated player can look at a deck.' };
    this.touchActivity();
    return deckPeekFor(this.state, playerId, request);
  }

  /**
   * Resets or deletes clientSeq tracking for a player (e.g. on new socket / page reload).
   * @param {string} playerId
   */
  /**
   * Records that a seated player pressed Set Up. Unknown playerIds are ignored.
   *
   * @param {string} playerId
   */
  markReady(playerId) {
    if (!this.state.players[playerId]) return;
    this.readyPlayerIds.add(playerId);
  }

  /**
   * True when the opening deal may run: still in setup, both seats exist, both have a
   * loaded deck, and both players pressed Set Up. A seat is created on join (addPlayer),
   * not when the room is created, so a host alone must not count as "every player".
   *
   * @returns {boolean}
   */
  isReadyToDeal() {
    if (this.state.turn?.phase !== 'setup') return false;
    const players = Object.values(this.state.players || {});
    return (
      players.length === 2 &&
      players.every(
        (p) => p.zones?.deck?.length > 0 && this.readyPlayerIds.has(p.playerId)
      )
    );
  }

  /**
   * Opens the opening turn-order coin call (design 013). The server picks the
   * caller from its own seeded rng, so neither client has to learn the other's
   * socket id first. Idempotent: a second call while one is open returns null,
   * so a duplicate "both ready" trigger cannot re-roll the caller.
   *
   * @returns {{ callerPlayerId: string, callId: string, timeoutMs: number }|null}
   *   null when the room is not ready to deal or a call already exists.
   */
  beginTurnOrderCall() {
    if (this.turnOrder) return null;
    if (!this.isReadyToDeal()) return null;
    const playerIds = Object.keys(this.state.players || {});
    const callerPlayerId = pickCoinCaller(playerIds, this.rng);
    if (!callerPlayerId) return null;

    this.turnOrderCallCounter += 1;
    const callId = `${this.roomId}:${this.turnOrderCallCounter}`;
    this.turnOrder = {
      phase: 'awaiting-call',
      callerPlayerId,
      callId,
      call: null,
      result: null,
      starterPlayerId: null,
      auto: false,
    };
    this.touchActivity();
    return { callerPlayerId, callId, timeoutMs: TURN_ORDER_CALL_TIMEOUT_MS };
  }

  /** True while a call is open and still unanswered. */
  isAwaitingTurnOrderCall() {
    return this.turnOrder?.phase === 'awaiting-call';
  }

  /**
   * Records the caller's heads/tails pick and flips the coin with the server's
   * own rng — the client supplies the call, never the result (D10).
   *
   * @param {string} socketId The socket that sent the call.
   * @param {object} [payload]
   * @param {string} [payload.callId]
   * @param {string} [payload.call] 'heads' | 'tails'
   * @returns {{ ok: true, callerPlayerId: string, call: string, result: string,
   *             starterPlayerId: string, auto: false }
   *          |{ ok: false, reason: string }}
   */
  submitTurnOrderCall(socketId, { callId = null, call = null } = {}) {
    if (!this.turnOrder) return { ok: false, reason: 'no_pending_call' };
    if (this.turnOrder.phase !== 'awaiting-call') {
      return { ok: false, reason: 'already_resolved' };
    }
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId || playerId !== this.turnOrder.callerPlayerId) {
      return { ok: false, reason: 'not_caller' };
    }
    if (callId !== this.turnOrder.callId) {
      return { ok: false, reason: 'stale_call' };
    }
    if (!isCoinFace(call)) return { ok: false, reason: 'invalid_call' };
    return this.#resolveTurnOrder(call, false);
  }

  /**
   * Resolves the open call on the caller's behalf — used when they time out or
   * disconnect, so a silent seat can never hang the match.
   *
   * @returns {{ ok: true, callerPlayerId: string, call: string, result: string,
   *             starterPlayerId: string, auto: true }|{ ok: false, reason: string }}
   */
  resolveTurnOrderCallAutomatically() {
    if (!this.turnOrder) return { ok: false, reason: 'no_pending_call' };
    if (this.turnOrder.phase !== 'awaiting-call') {
      return { ok: false, reason: 'already_resolved' };
    }
    return this.#resolveTurnOrder(flipCoinFace(this.rng), true);
  }

  /**
   * Shared tail of both resolution paths: flip, decide the starter, freeze the
   * handshake.
   *
   * @param {string} call
   * @param {boolean} auto
   * @returns {{ ok: true, callerPlayerId: string, call: string, result: string,
   *             starterPlayerId: string, auto: boolean }|{ ok: false, reason: string }}
   */
  #resolveTurnOrder(call, auto) {
    const result = flipCoinFace(this.rng);
    const starterPlayerId = resolveStarterPlayerId({
      playerIds: Object.keys(this.state.players || {}),
      callerPlayerId: this.turnOrder.callerPlayerId,
      call,
      result,
    });
    if (!starterPlayerId) return { ok: false, reason: 'no_starter' };

    this.turnOrder = {
      ...this.turnOrder,
      phase: 'resolved',
      call,
      result,
      starterPlayerId,
      auto,
    };
    this.touchActivity();
    return {
      ok: true,
      callerPlayerId: this.turnOrder.callerPlayerId,
      call,
      result,
      starterPlayerId,
      auto,
    };
  }

  /**
   * Drops any open or resolved call (new game, room teardown). The answer
   * timeout itself is owned by the transport layer, which clears it alongside.
   */
  clearTurnOrderCall() {
    this.turnOrder = null;
  }

  /**
   * This player's syncInstance -> instanceId lookup for their deck (design 002
   * §3.1 / D10). Sent only to the owning socket: it would leak opponent ids.
   *
   * @param {string} playerId
   * @returns {Record<number, number>}
   */
  getInstanceMap(playerId) {
    const map = {};
    for (const card of this.state.players[playerId]?.zones?.deck || []) {
      if (card?.syncInstance != null && card?.instanceId != null) {
        map[card.syncInstance] = card.instanceId;
      }
    }
    return map;
  }

  /**
   * Starts a fresh game in this room after a seated player explicitly left.
   * The leaver's seat is freed; every other seated player keeps their seat,
   * socket and deck (reloaded from `deckList`, with the printed card stats the
   * client sent once via `cardStats` carried across by syncInstance, since the
   * client will not resend them). `stateVersion` keeps increasing so clients'
   * monotonic view guard accepts the fresh view.
   *
   * @param {object} [options]
   * @param {string|null} [options.removePlayerId] Seat to free
   * @param {number|string|null} [options.seed] PRNG seed override
   * @returns {Array<{ playerId: string, socketId: string|null }>} Players kept
   */
  resetGame({ removePlayerId = null, seed = null } = {}) {
    const kept = [];
    for (const [playerId, player] of Object.entries(this.state.players)) {
      if (!player || playerId === removePlayerId) continue;
      kept.push({
        playerId,
        username: player.username || playerId,
        deckList: Array.isArray(player.deckList) ? [...player.deckList] : [],
        socketId: this.playerToSocket.get(playerId) || null,
        printedStats: collectPrintedStats(player),
      });
    }

    if (removePlayerId) {
      const leaverSocketId = this.playerToSocket.get(removePlayerId);
      if (leaverSocketId) this.socketToPlayer.delete(leaverSocketId);
      this.playerToSocket.delete(removePlayerId);
    }

    const minimumVersion = (this.state.stateVersion || 0) + 1;
    this.clientSeqByPlayer.clear();
    this.readyPlayerIds.clear();
    this.clearTurnOrderCall();
    this.seed = seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.rng = createRng(this.seed);
    this.state = createGameState({
      gameId: this.roomId,
      seed: this.seed,
      rulesEnabled: this.rulesEnabled,
    });

    for (const entry of kept) {
      this.state.players[entry.playerId] = {
        playerId: entry.playerId,
        username: entry.username,
        deckList: [],
        zones: createPlayerZones(),
        flags: {},
        oncePerGame: { vstarUsed: false, gxUsed: false },
      };
      if (!this.state.turn.player) {
        this.state.turn.player = entry.playerId;
      }
      if (entry.deckList.length > 0) {
        const result = applyCommand(
          this.state,
          {
            type: 'loadDeck',
            payload: { deckData: entry.deckList },
            playerId: entry.playerId,
          },
          this.rng
        );
        if (!result.error) {
          this.state = result.state;
        }
      }
      restorePrintedStats(this.state.players[entry.playerId], entry.printedStats);
    }

    this.state.stateVersion = Math.max(this.state.stateVersion || 0, minimumVersion);
    this.touchActivity();
    return kept.map(({ playerId, socketId }) => ({ playerId, socketId }));
  }

  resetClientSeq(playerId) {
    this.clientSeqByPlayer.delete(playerId);
  }

  /**
   * Gets the last processed clientSeq for a player.
   * @param {string} playerId
   * @returns {number}
   */
  getClientSeq(playerId) {
    return this.clientSeqByPlayer.get(playerId) ?? 0;
  }

  /**
   * Resolves a pending choice for a player socket.
   *
   * @param {string} socketId
   * @param {object} payload { choiceId, selection }
   * @param {number} [clientSeq]
   * @returns {object}
   */
  resolveChoice(socketId, payload = {}, clientSeq = null) {
    const seq =
      typeof clientSeq === 'number'
        ? clientSeq
        : typeof payload?.clientSeq === 'number'
          ? payload.clientSeq
          : null;
    return this.handleCommand(socketId, {
      type: 'resolveChoice',
      payload,
      clientSeq: seq,
    });
  }

  /**
   * Generates tailored gameEnded notification payload for a given player or spectator.
   *
   * @param {string|null} [playerId=null]
   * @returns {{ winner: string|null, reason: string, message: string } | null}
   */
  getGameEndedPayload(playerId = null) {
    if (this.state.turn?.phase !== 'ended') return null;
    const winner = this.state.winner || null;
    const reason = this.state.winReason || 'Game completed';
    const isWinner = playerId && playerId === winner;
    const winnerPlayer = winner ? this.state.players?.[winner] : null;
    const winnerName = winnerPlayer?.username || winner;
    const message = isWinner
      ? `🏆 Game over — you win! (${reason})`
      : playerId
        ? `🏆 Game over — opponent wins! (${reason})`
        : `🏆 Game over — ${winnerName || 'Unknown'} wins! (${reason})`;

    return {
      winner,
      reason,
      message,
    };
  }
}

// Printed card data the reducer reads for combat (see reduce.mjs 'cardStats').
const PRINTED_STAT_FIELDS = [
  'hp',
  'attacks',
  'types',
  'weakness',
  'resistance',
  'retreatCost',
  'stage',
];

// Printed stats are plain JSON (numbers, strings, arrays of plain objects).
function cloneStat(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectPrintedStats(player) {
  const bySyncInstance = new Map();
  for (const zone of Object.values(player?.zones || {})) {
    if (!Array.isArray(zone)) continue;
    for (const card of zone) {
      if (card?.syncInstance == null) continue;
      const stats = {};
      for (const field of PRINTED_STAT_FIELDS) {
        if (card[field] !== undefined && card[field] !== null) {
          stats[field] = cloneStat(card[field]);
        }
      }
      bySyncInstance.set(card.syncInstance, stats);
    }
  }
  return bySyncInstance;
}

function restorePrintedStats(player, bySyncInstance) {
  if (!player || !bySyncInstance?.size) return;
  for (const card of player.zones?.deck || []) {
    const stats = bySyncInstance.get(card?.syncInstance);
    if (!stats) continue;
    for (const [field, value] of Object.entries(stats)) {
      card[field] = cloneStat(value);
    }
  }
}
