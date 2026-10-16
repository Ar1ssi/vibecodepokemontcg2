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
import { DECK_FORMAT_TCG } from '../../shared/engine/formats.mjs';
import { deckFormatMismatch } from '../../shared/engine/setup.mjs';
import { deckPeekFor, viewFor, viewForSolo } from '../../shared/engine/view.mjs';
import { applyCommand, attackExtrasFor } from '../../shared/engine/reduce.mjs';
import { PROTOCOL_VERSION } from '../../shared/engine/commands.mjs';
import {
  flipCoinFace,
  isCoinFace,
  pickCoinCaller,
  resolveCoinWinnerPlayerId,
  resolveStarterFromChoice,
} from '../../shared/engine/rules/turn-order-flip.mjs';

/** How long the designated caller has to answer before the server calls for them. */
export const TURN_ORDER_CALL_TIMEOUT_MS = 15000;

/**
 * How long the toss winner has to say first or second (design 072). The client
 * opens that prompt only once the ~4 s coin ceremony has played, so this leaves
 * about the same answer window as the call.
 */
export const TURN_ORDER_CHOICE_TIMEOUT_MS = 25000;

const SOLO_SEATS = ['p1', 'p2'];

const BAD_SEAT = 'bad_seat';

function isSoloSeat(seat) {
  return SOLO_SEATS.includes(seat);
}

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

    // Design 053: the format both seated players agreed on (null = decks just match each other).
    // Room-level, never engine state, so undo replay and rematches are untouched.
    this.roomFormat = null;

    // Socket and player mappings (Hazard H1)
    this.socketToPlayer = new Map(); // socketId -> playerId
    this.playerToSocket = new Map(); // playerId -> socketId
    this.spectatorSockets = new Set(); // Set of socketIds

    // Design 074 D7: one socket plays both seats. Each socket-addressed call names the
    // seat it acts for (seatFor); views are drawn from soloNearSeat's side.
    this.solo = false;
    this.soloSeats = new Set();
    this.soloNearSeat = 'p1';

    // Monotonic sequence tracking per player for deduplication (Edge Case 4)
    this.clientSeqByPlayer = new Map(); // playerId -> lastSeenClientSeq

    // Seats whose player pressed Set Up this game. Kept outside `state` so it never
    // enters commandLog/undo replay; cleared by resetGame.
    this.readyPlayerIds = new Set();

    // Opening turn-order coin call (designs 013, 072). Transient handshake state,
    // kept outside `state` so it never reaches hashState/commandLog/undo replay.
    // null | { phase: 'awaiting-call'|'awaiting-choice'|'resolved', callerPlayerId,
    //          callId, call, coinId, result, auto, winnerPlayerId, choiceId,
    //          goFirst, choiceAuto, starterPlayerId, dealt }
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
    // A solo room's seats belong to its one socket (addSoloPlayer).
    if (this.solo) return false;
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

    this.#seatPlayer(playerId, username, deckList);
    return true;
  }

  /** Creates the seat's player record on first join, else refreshes its username. */
  #seatPlayer(playerId, username, deckList) {
    if (!this.state.players[playerId]) {
      this.state.players[playerId] = {
        playerId,
        username: username || playerId,
        deckList: Array.isArray(deckList) ? [...deckList] : [],
        deckFormat: DECK_FORMAT_TCG,
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
  }

  /**
   * Design 074 D7: seats one socket as both players — `p1` as `username`, `p2` as
   * `${username} (far)` — and makes the room solo. Refused when the room has any seated
   * player or spectator (or a game of seats whose sockets dropped). The same user's new
   * socket reclaims an existing solo room (page reload), keeping its game.
   *
   * @param {string} socketId
   * @param {string} username
   * @param {{ p1?: object[], p2?: object[] }} [deckLists] each seat's deck list (stored as addPlayer stores one)
   * @returns {boolean}
   */
  addSoloPlayer(socketId, username, { p1 = [], p2 = [] } = {}) {
    if (!socketId || typeof username !== 'string' || !username) return false;
    if (this.solo) {
      if (this.state.players.p1?.username !== username) return false;
      const previousSocketId = this.playerToSocket.get('p1');
      if (previousSocketId) this.socketToPlayer.delete(previousSocketId);
    } else if (
      this.playerToSocket.size > 0 ||
      this.spectatorSockets.size > 0 ||
      Object.keys(this.state.players || {}).length > 0
    ) {
      return false;
    }
    this.touchActivity();

    this.#seatPlayer('p1', username, p1);
    this.#seatPlayer('p2', `${username} (far)`, p2);
    for (const seat of SOLO_SEATS) {
      this.playerToSocket.set(seat, socketId);
      this.clientSeqByPlayer.delete(seat);
    }
    this.socketToPlayer.set(socketId, 'p1');
    this.soloSeats = new Set(SOLO_SEATS);
    this.solo = true;
    return true;
  }

  /**
   * The seat a socket acts for. A normal room ignores `payload.seat` and uses the socket's
   * own seat; a solo room acts for the named seat and refuses (null) any other value.
   *
   * @param {string} socketId
   * @param {{ seat?: string }} [payload]
   * @returns {'p1'|'p2'|null}
   */
  seatFor(socketId, payload = {}) {
    if (!this.solo) return this.socketToPlayer.get(socketId) || null;
    if (!this.socketToPlayer.has(socketId)) return null;
    const seat = payload?.seat;
    return isSoloSeat(seat) && this.soloSeats.has(seat) ? seat : null;
  }

  /**
   * Which seat a solo room's views are drawn from (the board flip).
   *
   * @param {string} socketId
   * @param {string} seat
   * @returns {boolean} false outside a solo room, for another socket, or a seat not 'p1'|'p2'
   */
  setSoloNearSeat(socketId, seat) {
    if (!this.solo || !this.socketToPlayer.has(socketId) || !isSoloSeat(seat)) return false;
    this.soloNearSeat = seat;
    return true;
  }

  /**
   * One entry per connected seated socket — the views to push after a change. A solo room
   * has one socket, reported as its near seat. Spectators are not included.
   *
   * @returns {Array<{ socketId: string, playerId: string }>}
   */
  viewTargets() {
    if (this.solo) {
      const socketId = this.playerToSocket.get(this.soloNearSeat);
      return socketId ? [{ socketId, playerId: this.soloNearSeat }] : [];
    }
    return [...this.playerToSocket.entries()].map(([playerId, socketId]) => ({
      socketId,
      playerId,
    }));
  }

  /**
   * The last clientSeq the socket's client had applied. A solo client stamps both seats'
   * commands from one counter, so its answer is the higher of the two seats.
   *
   * @param {string} socketId
   * @returns {number}
   */
  getClientSeqForSocket(socketId) {
    if (this.solo) {
      if (!this.socketToPlayer.has(socketId)) return 0;
      return Math.max(...SOLO_SEATS.map((seat) => this.getClientSeq(seat)));
    }
    const playerId = this.socketToPlayer.get(socketId);
    return playerId ? this.getClientSeq(playerId) : 0;
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
   * @returns {boolean} false for a missing socket id or a solo room
   */
  addSpectator(socketId) {
    if (!socketId) return false;
    // Design 074 D7: a solo room shows both hands, so nobody else may watch it.
    if (this.solo) return false;
    this.spectatorSockets.add(socketId);
    const existingPlayerId = this.socketToPlayer.get(socketId);
    if (existingPlayerId) {
      this.socketToPlayer.delete(socketId);
      this.playerToSocket.delete(existingPlayerId);
    }
    return true;
  }

  /**
   * Drops a spectator socket (it left the room or disconnected). A seated socket is untouched:
   * a seat survives a dropped connection (Finding 7).
   *
   * @param {string} socketId
   */
  removeSpectator(socketId) {
    this.spectatorSockets.delete(socketId);
  }

  /**
   * True when the socket is seated or registered as a spectator. Only those may read a view:
   * a spectator's view shows both hands (design 069).
   *
   * @param {string} socketId
   * @returns {boolean}
   */
  canView(socketId) {
    if (this.solo) return this.socketToPlayer.has(socketId);
    return this.socketToPlayer.has(socketId) || this.spectatorSockets.has(socketId);
  }

  /**
   * Cleans up socket mappings on disconnection.
   *
   * @param {string} socketId
   */
  removeSocket(socketId) {
    this.spectatorSockets.delete(socketId);
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    this.socketToPlayer.delete(socketId);
    const seats = this.solo ? SOLO_SEATS : [playerId];
    for (const seat of seats) {
      if (this.playerToSocket.get(seat) !== socketId) continue;
      this.playerToSocket.delete(seat);
      this.clientSeqByPlayer.delete(seat);
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
   * } | { ok: false, success: false, error: 'bad_seat', reason: 'bad_seat', clientSeq?: number }}
   *   A solo room acts for `cmd.seat`; a missing or unknown seat there is refused as
   *   `bad_seat` (`success`/`error` ride along for the server's cmdRejected path).
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
    if (!this.solo) return this.handleCommand(socketId, cmd);
    const seat = this.seatFor(socketId, cmd);
    if (!seat) return this.handleCommand(socketId, cmd, this.#badSeatOr(socketId));
    return this.handleCommand(socketId, cmd, seat);
  }

  // A stranger's command in a solo room keeps its spectator/unauthorized refusal.
  #badSeatOr(socketId) {
    return this.socketToPlayer.has(socketId) ? BAD_SEAT : null;
  }

  /**
   * Executes a command for the socket's player: dedupes by clientSeq when present,
   * runs applyCommand, and assembles redacted broadcasts.
   *
   * @param {string} socketId
   * @param {object} [cmd]
   * @param {string|null} [actingSeat] the seat already resolved by seatFor (solo rooms);
   *   omitted, the socket's own seat acts — server-internal commands (setup, loadDeck)
   */
  handleCommand(socketId, cmd = {}, actingSeat = undefined) {
    if (actingSeat === BAD_SEAT) {
      return {
        ok: false,
        success: false,
        error: BAD_SEAT,
        reason: BAD_SEAT,
        clientSeq: cmd?.clientSeq,
      };
    }
    this.touchActivity();
    const playerId =
      actingSeat === undefined ? this.socketToPlayer.get(socketId) : actingSeat;

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
          view: this.getViewForSocket(socketId),
          clientSeq: cmd.clientSeq,
          lastClientSeq: this.solo ? this.getClientSeqForSocket(socketId) : lastSeq,
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
    for (const { socketId: sockId, playerId: pId } of this.viewTargets()) {
      broadcasts.push({
        socketId: sockId,
        playerId: pId,
        view: this.getViewForSocket(sockId),
        lastClientSeq: this.solo
          ? this.getClientSeqForSocket(sockId)
          : (this.clientSeqByPlayer.get(pId) ?? 0),
      });
    }
    for (const sSockId of this.spectatorSockets) {
      broadcasts.push({
        socketId: sSockId,
        playerId: null,
        view: viewFor(this.state, null, { attackExtrasFor }),
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
    return viewFor(this.state, playerId, { attackExtrasFor });
  }

  /**
   * Retrieves redacted view for a specific connected socket.
   *
   * @param {string} socketId
   * @returns {object}
   */
  getViewForSocket(socketId) {
    if (this.solo && this.socketToPlayer.has(socketId)) {
      return viewForSolo(this.state, this.soloNearSeat, { attackExtrasFor });
    }
    const playerId = this.socketToPlayer.get(socketId) || null;
    return viewFor(this.state, playerId, { attackExtrasFor });
  }

  /**
   * Design 012: the top or bottom cards of a deck for the asking socket only (see
   * `deckPeekFor`). A spectator or unknown socket is refused.
   *
   * @param {string} socketId
   * @param {{ side?: 'you'|'them', count?: number, fromTop?: boolean, seat?: string }} request
   *   `seat` names the asking seat in a solo room; `side` is relative to it.
   * @returns {{ ok: true, cards: object[], deckCount: number } | { ok: false, reason: string }}
   */
  peekDeck(socketId, request = {}) {
    const playerId = this.seatFor(socketId, request);
    if (!playerId) {
      if (this.#badSeatOr(socketId) === BAD_SEAT) return { ok: false, reason: BAD_SEAT };
      return { ok: false, reason: 'Only a seated player can look at a deck.' };
    }
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
    return this.#bothSeatsReady(players) && !deckFormatMismatch(this.state, this.roomFormat);
  }

  #bothSeatsReady(players) {
    return (
      players.length === 2 &&
      players.every(
        (p) => p.zones?.deck?.length > 0 && this.readyPlayerIds.has(p.playerId)
      )
    );
  }

  /**
   * Design 051 / I202: when both seats pressed Set Up but their decks' formats differ (or, design
   * 053, either deck differs from the agreed room format), the
   * deal is refused and both Set Ups are cleared, so a player loads a matching deck and
   * both press Set Up again (the clients clear theirs on the same condition).
   *
   * @returns {{ playerId: string, username: string, format: string }[]|null}
   *   the two decks when the deal was refused, else null
   */
  refuseDealOnFormatMismatch() {
    if (this.state.turn?.phase !== 'setup') return null;
    if (!this.#bothSeatsReady(Object.values(this.state.players || {}))) return null;
    const mismatch = deckFormatMismatch(this.state, this.roomFormat);
    if (!mismatch) return null;
    this.readyPlayerIds.clear();
    return mismatch;
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
      coinId: null,
      result: null,
      auto: false,
      winnerPlayerId: null,
      choiceId: null,
      goFirst: null,
      choiceAuto: false,
      starterPlayerId: null,
      dealt: false,
    };
    this.touchActivity();
    return { callerPlayerId, callId, timeoutMs: TURN_ORDER_CALL_TIMEOUT_MS };
  }

  /** True while a call is open and still unanswered. */
  isAwaitingTurnOrderCall() {
    return this.turnOrder?.phase === 'awaiting-call';
  }

  /** True once the coin has landed and its winner has not yet chosen first or second. */
  isAwaitingTurnOrderChoice() {
    return this.turnOrder?.phase === 'awaiting-choice';
  }

  /**
   * Records the caller's heads/tails pick and flips the coin with the server's
   * own rng — the client supplies the call, never the result (D10). The coin's
   * winner then decides the order (design 072), so the handshake moves to
   * 'awaiting-choice' rather than straight to a starter.
   *
   * @param {string} socketId The socket that sent the call.
   * @param {object} [payload]
   * @param {string} [payload.callId]
   * @param {string} [payload.call] 'heads' | 'tails'
   * @param {string} [payload.coinId] The caller's chosen coin art id (display only)
   * @param {string} [payload.seat] The calling seat in a solo room
   * @returns {TurnOrderFlip|{ ok: false, reason: string }}
   */
  submitTurnOrderCall(socketId, { callId = null, call = null, coinId = null, seat = null } = {}) {
    if (!this.turnOrder) return { ok: false, reason: 'no_pending_call' };
    if (this.turnOrder.phase !== 'awaiting-call') {
      return { ok: false, reason: 'already_resolved' };
    }
    const playerId = this.seatFor(socketId, { seat });
    if (!playerId && this.#badSeatOr(socketId) === BAD_SEAT) {
      return { ok: false, reason: BAD_SEAT };
    }
    if (!playerId || playerId !== this.turnOrder.callerPlayerId) {
      return { ok: false, reason: 'not_caller' };
    }
    if (callId !== this.turnOrder.callId) {
      return { ok: false, reason: 'stale_call' };
    }
    if (!isCoinFace(call)) return { ok: false, reason: 'invalid_call' };
    return this.#flipTurnOrderCoin(call, false, coinId);
  }

  /**
   * Calls the coin on the caller's behalf — used when they time out or
   * disconnect, so a silent seat can never hang the match.
   *
   * @returns {TurnOrderFlip|{ ok: false, reason: string }}
   */
  resolveTurnOrderCallAutomatically() {
    if (!this.turnOrder) return { ok: false, reason: 'no_pending_call' };
    if (this.turnOrder.phase !== 'awaiting-call') {
      return { ok: false, reason: 'already_resolved' };
    }
    return this.#flipTurnOrderCoin(flipCoinFace(this.rng), true);
  }

  /**
   * @typedef {object} TurnOrderFlip
   * @property {true} ok
   * @property {string} callerPlayerId
   * @property {'heads'|'tails'} call
   * @property {'heads'|'tails'} result
   * @property {string} winnerPlayerId Who answers "Do you want to go first?"
   * @property {string} choiceId Only the winner's socket may be sent this.
   * @property {string|null} coinId
   * @property {boolean} auto The call was made by the server.
   * @property {number} timeoutMs How long the winner has to choose.
   */

  /**
   * Shared tail of both call paths: flip, name the winner, open the choice.
   *
   * @param {string} call
   * @param {boolean} auto
   * @param {string|null} [coinId] Display-only coin art id the caller chose.
   *   Echoed back so both clients render the same coin; never trusted for the
   *   flip itself (D10), so a malformed/oversize value is simply dropped.
   * @returns {TurnOrderFlip|{ ok: false, reason: string }}
   */
  #flipTurnOrderCoin(call, auto, coinId = null) {
    const result = flipCoinFace(this.rng);
    const winnerPlayerId = resolveCoinWinnerPlayerId({
      playerIds: Object.keys(this.state.players || {}),
      callerPlayerId: this.turnOrder.callerPlayerId,
      call,
      result,
    });
    if (!winnerPlayerId) return { ok: false, reason: 'no_winner' };

    const safeCoinId =
      typeof coinId === 'string' && coinId.length > 0 && coinId.length <= 128
        ? coinId
        : null;
    // An ordering token, not a secret (the caller can derive it from callId):
    // the socket check in submitTurnOrderChoice is what limits who may answer.
    const choiceId = `${this.turnOrder.callId}:choice`;

    this.turnOrder = {
      ...this.turnOrder,
      phase: 'awaiting-choice',
      call,
      result,
      coinId: safeCoinId,
      auto,
      winnerPlayerId,
      choiceId,
    };
    this.touchActivity();
    return {
      ok: true,
      callerPlayerId: this.turnOrder.callerPlayerId,
      call,
      result,
      winnerPlayerId,
      choiceId,
      coinId: safeCoinId,
      auto,
      timeoutMs: TURN_ORDER_CHOICE_TIMEOUT_MS,
    };
  }

  /**
   * Records the toss winner's answer to "Do you want to go first?" (design 072).
   *
   * @param {string} socketId The socket that sent the answer.
   * @param {object} [payload]
   * @param {string} [payload.choiceId]
   * @param {boolean} [payload.goFirst]
   * @param {string} [payload.seat] The answering seat in a solo room
   * @returns {TurnOrderResolution|{ ok: false, reason: string }}
   */
  submitTurnOrderChoice(socketId, { choiceId = null, goFirst = null, seat = null } = {}) {
    const refusal = this.#choiceRefusal();
    if (refusal) return refusal;
    const playerId = this.seatFor(socketId, { seat });
    if (!playerId && this.#badSeatOr(socketId) === BAD_SEAT) {
      return { ok: false, reason: BAD_SEAT };
    }
    if (!playerId || playerId !== this.turnOrder.winnerPlayerId) {
      return { ok: false, reason: 'not_winner' };
    }
    if (choiceId !== this.turnOrder.choiceId) {
      return { ok: false, reason: 'stale_choice' };
    }
    if (typeof goFirst !== 'boolean') return { ok: false, reason: 'invalid_choice' };
    return this.#resolveTurnOrderChoice(goFirst, false);
  }

  /**
   * Chooses for a winner who timed out or left: they go first, which is what
   * winning the toss meant before the choice existed.
   *
   * @returns {TurnOrderResolution|{ ok: false, reason: string }}
   */
  resolveTurnOrderChoiceAutomatically() {
    const refusal = this.#choiceRefusal();
    if (refusal) return refusal;
    return this.#resolveTurnOrderChoice(true, true);
  }

  #choiceRefusal() {
    if (this.turnOrder?.phase === 'resolved') {
      return { ok: false, reason: 'already_resolved' };
    }
    if (this.turnOrder?.phase !== 'awaiting-choice') {
      return { ok: false, reason: 'no_pending_choice' };
    }
    return null;
  }

  /**
   * @typedef {object} TurnOrderResolution
   * @property {true} ok
   * @property {string} callerPlayerId
   * @property {'heads'|'tails'} call
   * @property {'heads'|'tails'} result
   * @property {string} winnerPlayerId
   * @property {boolean} goFirst The winner's answer.
   * @property {string} starterPlayerId Seated first by the `setup` command.
   * @property {string|null} coinId
   * @property {boolean} auto The call was made by the server.
   * @property {boolean} choiceAuto The first/second answer was made by the server.
   */

  /**
   * The resolved order, rebuilt from the handshake — for a deal that has to be
   * retried because no seat had a socket when the choice resolved.
   *
   * @returns {TurnOrderResolution|null} null unless resolved and not yet dealt.
   */
  undealtTurnOrderResolution() {
    if (this.turnOrder?.phase !== 'resolved' || this.turnOrder.dealt) return null;
    return this.#resolutionFromHandshake();
  }

  /** @returns {TurnOrderResolution} */
  #resolutionFromHandshake() {
    const {
      callerPlayerId,
      call,
      result,
      winnerPlayerId,
      goFirst,
      starterPlayerId,
      coinId,
      auto,
      choiceAuto,
    } = this.turnOrder;
    return {
      ok: true,
      callerPlayerId,
      call,
      result,
      winnerPlayerId,
      goFirst,
      starterPlayerId,
      coinId,
      auto,
      choiceAuto,
    };
  }

  /** Records that the opening hands went out for the resolved order. */
  markTurnOrderDealt() {
    if (this.turnOrder?.phase === 'resolved') this.turnOrder.dealt = true;
  }

  /**
   * @param {boolean} goFirst
   * @param {boolean} choiceAuto
   * @returns {TurnOrderResolution|{ ok: false, reason: string }}
   */
  #resolveTurnOrderChoice(goFirst, choiceAuto) {
    const starterPlayerId = resolveStarterFromChoice({
      playerIds: Object.keys(this.state.players || {}),
      winnerPlayerId: this.turnOrder.winnerPlayerId,
      goFirst,
    });
    if (!starterPlayerId) return { ok: false, reason: 'no_starter' };

    this.turnOrder = {
      ...this.turnOrder,
      phase: 'resolved',
      goFirst,
      choiceAuto,
      starterPlayerId,
    };
    this.touchActivity();
    return this.#resolutionFromHandshake();
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
        deckFormat: player.deckFormat,
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
        deckFormat: DECK_FORMAT_TCG,
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
            payload: { deckData: entry.deckList, format: entry.deckFormat },
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
   * @param {object} payload { choiceId, selection, seat? } — `seat` names the answering seat in a solo room
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
    const cmd = { type: 'resolveChoice', payload, clientSeq: seq };
    if (!this.solo) return this.handleCommand(socketId, cmd);
    const seat = this.seatFor(socketId, payload);
    return this.handleCommand(socketId, cmd, seat ?? this.#badSeatOr(socketId));
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

// Printed card data the reducer reads (see reduce.mjs 'cardStats'): everything cardStats
// applies, since the client never resends it after a reset.
const PRINTED_STAT_FIELDS = [
  'hp',
  'attacks',
  'types',
  'weakness',
  'resistance',
  'retreatCost',
  'stage',
  'evolvesFrom',
  'abilities',
  'text',
  'trainerType',
  'subtypes',
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
