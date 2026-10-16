/**
 * @file Socket side of the opening coin (designs 013, 072), kept out of server.js
 * so the call → flip → choice → deal sequence can be tested with a fake emitter.
 *
 * TCG Live's StartingCoinFlip: one seat calls heads or tails, the server flips,
 * and the coin's winner answers "Do you want to go first?". The GameRoom owns the
 * handshake state; this module owns the messages and the answer timeouts, one
 * timer per room at a time (the call's, then the choice's).
 *
 * Messages, each sent per seat with 'self'/'opp' relative to the recipient:
 * - out `turnOrderCall`   { roomId, callId (caller only), waiting, timeoutMs }
 * - in  `turnOrderCall`   { roomId, callId, call, coinId }
 * - out `turnOrderFlip`   { roomId, caller, call, result, winner, choiceId (winner only),
 *                           coinId, auto, timeoutMs }
 * - in  `turnOrderChoice` { roomId, choiceId, goFirst }
 * - out `turnOrderResult` { roomId, caller, call, result, winner, goFirst, starter,
 *                           coinId, auto, choiceAuto }, then the deal
 * - out `turnOrderCallRejected` / `turnOrderChoiceRejected` { roomId, reason } to the sender only
 */

import { TURN_ORDER_CALL_TIMEOUT_MS, TURN_ORDER_CHOICE_TIMEOUT_MS } from './room.mjs';

/**
 * @param {object} deps
 * @param {(socketId: string, event: string, payload: object) => void} deps.emitTo
 * @param {(gameRoom: object, roomId: string, starterPlayerId: string) => boolean} deps.deal
 *   Runs the `setup` command with the chosen starter and broadcasts the deal; false
 *   when it could not (no seated socket), so the result stays undealt and is retried.
 * @param {(roomId: string) => void} [deps.onCallOpened] The room format locks here.
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 */
export function createTurnOrderTransport({
  emitTo,
  deal,
  onCallOpened = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const timers = new Map();

  const clearRoomTimer = (roomId) => {
    const timer = timers.get(roomId);
    if (timer) clearTimer(timer);
    timers.delete(roomId);
  };

  const armRoomTimer = (roomId, ms, onExpire) => {
    clearRoomTimer(roomId);
    const timer = setTimer(() => {
      timers.delete(roomId);
      onExpire();
    }, ms);
    if (typeof timer?.unref === 'function') timer.unref();
    timers.set(roomId, timer);
  };

  const forEachSeat = (gameRoom, send) => {
    for (const playerId of Object.keys(gameRoom.state.players)) {
      const socketId = gameRoom.playerToSocket.get(playerId);
      if (socketId) send(playerId, socketId);
    }
  };

  const allSeatsBound = (gameRoom) =>
    Object.keys(gameRoom.state.players).every((playerId) => gameRoom.playerToSocket.has(playerId));

  const sideOf = (playerId, recipientId) => (playerId === recipientId ? 'self' : 'opp');

  const finish = (gameRoom, roomId, resolution) => {
    clearRoomTimer(roomId);
    forEachSeat(gameRoom, (playerId, socketId) => {
      emitTo(socketId, 'turnOrderResult', {
        roomId,
        caller: sideOf(resolution.callerPlayerId, playerId),
        call: resolution.call,
        result: resolution.result,
        winner: sideOf(resolution.winnerPlayerId, playerId),
        goFirst: resolution.goFirst,
        starter: sideOf(resolution.starterPlayerId, playerId),
        // Display-only: the caller's coin art, so both screens show the same coin.
        coinId: resolution.coinId ?? null,
        auto: Boolean(resolution.auto),
        choiceAuto: Boolean(resolution.choiceAuto),
      });
    });
    // Every seat must be bound to get its dealOrder: a seat dealt to while away
    // would fall back to a local shuffle and desync its hand. The result stays
    // undealt and replayTo deals it once the last seat is back.
    if (!allSeatsBound(gameRoom)) return;
    if (deal(gameRoom, roomId, resolution.starterPlayerId)) gameRoom.markTurnOrderDealt();
  };

  const callPayload = (roomId, turnOrder, playerId, timeoutMs) => {
    const isCaller = playerId === turnOrder.callerPlayerId;
    return {
      roomId,
      callId: isCaller ? turnOrder.callId : null,
      waiting: !isCaller,
      timeoutMs,
    };
  };

  const flipPayload = (roomId, flip, playerId, timeoutMs) => {
    const isWinner = playerId === flip.winnerPlayerId;
    return {
      roomId,
      caller: sideOf(flip.callerPlayerId, playerId),
      call: flip.call,
      result: flip.result,
      winner: isWinner ? 'self' : 'opp',
      // Only the winner may answer; the other seat never sees a usable id.
      choiceId: isWinner ? flip.choiceId : null,
      coinId: flip.coinId ?? null,
      auto: Boolean(flip.auto),
      timeoutMs,
    };
  };

  const chooseAutomatically = (gameRoom, roomId) => {
    const resolution = gameRoom.resolveTurnOrderChoiceAutomatically();
    if (!resolution.ok) return;
    finish(gameRoom, roomId, resolution);
  };

  const announceFlip = (gameRoom, roomId, flip) => {
    clearRoomTimer(roomId);
    forEachSeat(gameRoom, (playerId, socketId) => {
      emitTo(socketId, 'turnOrderFlip', flipPayload(roomId, flip, playerId, flip.timeoutMs));
    });
    // A winner with no socket (they dropped while the coin was called for them)
    // cannot answer: choose for them now instead of stalling the other seat.
    if (!gameRoom.playerToSocket.get(flip.winnerPlayerId)) {
      chooseAutomatically(gameRoom, roomId);
      return;
    }
    armRoomTimer(roomId, flip.timeoutMs, () => chooseAutomatically(gameRoom, roomId));
  };

  const callAutomatically = (gameRoom, roomId) => {
    const flip = gameRoom.resolveTurnOrderCallAutomatically();
    if (!flip.ok) return;
    announceFlip(gameRoom, roomId, flip);
  };

  return {
    /**
     * Opens the call once both seats are ready. Idempotent through
     * `beginTurnOrderCall`, so a duplicate ready cannot re-roll the caller.
     *
     * @returns {boolean} true when a call was opened.
     */
    open(gameRoom, roomId) {
      // A result whose deal found no seated socket is dealt on the next ready.
      const undealt = gameRoom.undealtTurnOrderResolution();
      if (undealt) {
        finish(gameRoom, roomId, undealt);
        return false;
      }
      const opened = gameRoom.beginTurnOrderCall();
      if (!opened) return false;
      onCallOpened(roomId);
      forEachSeat(gameRoom, (playerId, socketId) => {
        emitTo(
          socketId,
          'turnOrderCall',
          callPayload(roomId, gameRoom.turnOrder, playerId, opened.timeoutMs)
        );
      });
      armRoomTimer(roomId, opened.timeoutMs, () => callAutomatically(gameRoom, roomId));
      return true;
    },

    /** The caller's heads/tails. The coin itself comes from the room's rng (D10). */
    receiveCall(gameRoom, roomId, socketId, data) {
      const flip = gameRoom.submitTurnOrderCall(socketId, {
        callId: data?.callId ?? null,
        call: data?.call ?? null,
        coinId: data?.coinId ?? null,
        seat: data?.seat ?? null,
      });
      if (!flip.ok) {
        emitTo(socketId, 'turnOrderCallRejected', { roomId, reason: flip.reason });
        return;
      }
      announceFlip(gameRoom, roomId, flip);
    },

    /** The coin winner's answer to "Do you want to go first?". */
    receiveChoice(gameRoom, roomId, socketId, data) {
      const resolution = gameRoom.submitTurnOrderChoice(socketId, {
        choiceId: data?.choiceId ?? null,
        goFirst: data?.goFirst ?? null,
        seat: data?.seat ?? null,
      });
      if (!resolution.ok) {
        emitTo(socketId, 'turnOrderChoiceRejected', { roomId, reason: resolution.reason });
        return;
      }
      finish(gameRoom, roomId, resolution);
    },

    /**
     * A seated player's socket is gone (call after `removeSocket`). If the match
     * was waiting on them — to call, or to choose — the server answers for them.
     *
     * @param {object} gameRoom
     * @param {string} roomId
     * @param {string|null|undefined} playerId The seat the socket held.
     */
    handleSeatLost(gameRoom, roomId, playerId) {
      if (!playerId || !gameRoom.turnOrder) return;
      if (gameRoom.isAwaitingTurnOrderCall() && gameRoom.turnOrder.callerPlayerId === playerId) {
        callAutomatically(gameRoom, roomId);
        return;
      }
      if (
        gameRoom.isAwaitingTurnOrderChoice() &&
        gameRoom.turnOrder.winnerPlayerId === playerId
      ) {
        chooseAutomatically(gameRoom, roomId);
      }
    },

    /**
     * A seat just (re)bound a socket (join, reconnect). Socket.IO does not carry
     * what was sent to the old socket, so the seat gets its pending prompt again,
     * and a result whose deal found no socket is dealt now. A dealt game is left
     * to the view sync: replaying its result would restart the client's opening.
     *
     * @param {object} gameRoom
     * @param {string} roomId
     * @param {string} playerId
     */
    replayTo(gameRoom, roomId, playerId) {
      const turnOrder = gameRoom.turnOrder;
      const socketId = gameRoom.playerToSocket.get(playerId);
      if (!turnOrder || !socketId) return;
      if (turnOrder.phase === 'awaiting-call') {
        emitTo(
          socketId,
          'turnOrderCall',
          callPayload(roomId, turnOrder, playerId, TURN_ORDER_CALL_TIMEOUT_MS)
        );
        return;
      }
      if (turnOrder.phase === 'awaiting-choice') {
        emitTo(
          socketId,
          'turnOrderFlip',
          flipPayload(roomId, turnOrder, playerId, TURN_ORDER_CHOICE_TIMEOUT_MS)
        );
        return;
      }
      const undealt = gameRoom.undealtTurnOrderResolution();
      if (undealt) finish(gameRoom, roomId, undealt);
    },

    /** Drops the room's pending answer timeout (reset, leave, teardown). */
    clearTimer: clearRoomTimer,
  };
}
