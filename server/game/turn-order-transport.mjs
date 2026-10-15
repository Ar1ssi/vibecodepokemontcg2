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

/**
 * @param {object} deps
 * @param {(socketId: string, event: string, payload: object) => void} deps.emitTo
 * @param {(gameRoom: object, roomId: string, starterPlayerId: string) => void} deps.deal
 *   Runs the `setup` command with the chosen starter and broadcasts the deal.
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
    deal(gameRoom, roomId, resolution.starterPlayerId);
  };

  const chooseAutomatically = (gameRoom, roomId) => {
    const resolution = gameRoom.resolveTurnOrderChoiceAutomatically();
    if (!resolution.ok) return;
    finish(gameRoom, roomId, resolution);
  };

  const announceFlip = (gameRoom, roomId, flip) => {
    clearRoomTimer(roomId);
    forEachSeat(gameRoom, (playerId, socketId) => {
      const isWinner = playerId === flip.winnerPlayerId;
      emitTo(socketId, 'turnOrderFlip', {
        roomId,
        caller: sideOf(flip.callerPlayerId, playerId),
        call: flip.call,
        result: flip.result,
        winner: isWinner ? 'self' : 'opp',
        // Only the winner may answer; the other seat never sees a usable id.
        choiceId: isWinner ? flip.choiceId : null,
        coinId: flip.coinId ?? null,
        auto: Boolean(flip.auto),
        timeoutMs: flip.timeoutMs,
      });
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
      const opened = gameRoom.beginTurnOrderCall();
      if (!opened) return false;
      onCallOpened(roomId);
      forEachSeat(gameRoom, (playerId, socketId) => {
        const isCaller = playerId === opened.callerPlayerId;
        emitTo(socketId, 'turnOrderCall', {
          roomId,
          callId: isCaller ? opened.callId : null,
          waiting: !isCaller,
          timeoutMs: opened.timeoutMs,
        });
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

    /** Drops the room's pending answer timeout (reset, leave, teardown). */
    clearTimer: clearRoomTimer,
  };
}
