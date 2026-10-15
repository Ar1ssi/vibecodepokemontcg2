/**
 * @file Designs 013 and 072 — client side of the server-owned opening coin.
 *
 * The server decides WHO calls and flips the coin itself (D10: the client never
 * supplies randomness); the coin's winner then chooses to go first or second, as
 * in TCG Live. This module is the thin transport layer: it turns the server's
 * messages into DOM events the rules bridge listens for, and caches the flip and
 * the result so a listener that attaches late (the bridge only starts the game
 * once `both-players-ready` has fired) still sees them.
 *
 * Registered from socket-event-listeners.js beside the `dealOrder` listener, NOT
 * from the rules bridge: the call arrives while `setupPrizes()` is still awaiting
 * `dealOrder`, before the bridge's own setup path runs.
 */

/**
 * @typedef {object} TurnOrderFlip
 * @property {'self'|'opp'} caller
 * @property {'heads'|'tails'} call
 * @property {'heads'|'tails'} result
 * @property {'self'|'opp'} winner Who answers "Do you want to go first?".
 * @property {string|null} choiceId Set only on the winner's own copy.
 * @property {string|null} coinId
 * @property {boolean} auto The call was made by the server.
 * @property {number|null} timeoutMs
 */

/**
 * @typedef {object} TurnOrderResult
 * @property {'self'|'opp'} caller
 * @property {'heads'|'tails'} call
 * @property {'heads'|'tails'} result
 * @property {'self'|'opp'} winner
 * @property {boolean} goFirst The winner's answer.
 * @property {'self'|'opp'} starter
 * @property {string|null} coinId
 * @property {boolean} auto The call was made by the server.
 * @property {boolean} choiceAuto The first/second answer was made by the server.
 */

/** @type {TurnOrderFlip|null} */
let lastFlip = null;
/** @type {TurnOrderResult|null} */
let lastResult = null;

/**
 * The server's coin, if it has already landed this game.
 *
 * @returns {TurnOrderFlip|null}
 */
export function getTurnOrderFlip() {
  return lastFlip;
}

/**
 * The server's resolved turn order, if it has already arrived this game.
 *
 * @returns {TurnOrderResult|null}
 */
export function getTurnOrderResult() {
  return lastResult;
}

/** Drops the cached flip and result — call on room change, reset or restart. */
export function resetTurnOrderCall() {
  lastFlip = null;
  lastResult = null;
}

const isSide = (value) => value === 'self' || value === 'opp';
const isCoinFace = (value) => value === 'heads' || value === 'tails';
const boundedId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;

/**
 * Normalizes a `turnOrderFlip` payload, or null when it is malformed. A choiceId
 * on a copy that does not name this seat the winner is dropped: only the
 * winner may answer.
 *
 * @param {object} data
 * @returns {TurnOrderFlip|null}
 */
export function normalizeTurnOrderFlip(data) {
  if (!data || !isSide(data.caller) || !isSide(data.winner)) return null;
  if (!isCoinFace(data.call) || !isCoinFace(data.result)) return null;
  return {
    caller: data.caller,
    call: data.call,
    result: data.result,
    winner: data.winner,
    choiceId: data.winner === 'self' ? boundedId(data.choiceId) : null,
    coinId: boundedId(data.coinId),
    auto: Boolean(data.auto),
    timeoutMs: Number.isFinite(data.timeoutMs) ? data.timeoutMs : null,
  };
}

/**
 * Normalizes a `turnOrderResult` payload, or null when it is malformed — a
 * half-valid result must not start a game on a guessed starter.
 *
 * @param {object} data
 * @returns {TurnOrderResult|null}
 */
export function normalizeTurnOrderResult(data) {
  if (!data || !isSide(data.starter) || !isSide(data.caller) || !isSide(data.winner)) {
    return null;
  }
  if (!isCoinFace(data.call) || !isCoinFace(data.result)) return null;
  if (typeof data.goFirst !== 'boolean') return null;
  return {
    caller: data.caller,
    call: data.call,
    result: data.result,
    winner: data.winner,
    goFirst: data.goFirst,
    starter: data.starter,
    coinId: boundedId(data.coinId),
    auto: Boolean(data.auto),
    choiceAuto: Boolean(data.choiceAuto),
  };
}

/**
 * Wires the inbound turn-order messages onto `document` events.
 *
 * @param {object} socket Socket.IO client socket.
 * @param {Document} [doc=document] Injected for tests.
 */
export function registerTurnOrderCallListeners(socket, doc = document) {
  if (!socket || typeof socket.on !== 'function') return;

  socket.on('turnOrderCall', (data) => {
    if (!data) return;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-call', {
        detail: {
          roomId: data.roomId ?? null,
          // Only the designated caller is handed a callId; the other seat is told
          // to wait. A client that invents a callId is rejected server-side.
          callId: typeof data.callId === 'string' ? data.callId : null,
          waiting: Boolean(data.waiting),
          timeoutMs: Number.isFinite(data.timeoutMs) ? data.timeoutMs : null,
        },
      })
    );
  });

  socket.on('turnOrderFlip', (data) => {
    const flip = normalizeTurnOrderFlip(data);
    if (!flip) return;
    lastFlip = flip;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-flip', {
        detail: { ...flip, roomId: data.roomId ?? null },
      })
    );
  });

  socket.on('turnOrderResult', (data) => {
    const result = normalizeTurnOrderResult(data);
    if (!result) return;
    lastResult = result;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-result', { detail: result })
    );
  });

  socket.on('turnOrderCallRejected', (data) => {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-call-rejected', {
        detail: { reason: data?.reason || 'unknown' },
      })
    );
  });

  socket.on('turnOrderChoiceRejected', (data) => {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-choice-rejected', {
        detail: { reason: data?.reason || 'unknown' },
      })
    );
  });
}
