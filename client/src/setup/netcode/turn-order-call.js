/**
 * @file Design 013 — client side of the server-owned opening coin call.
 *
 * The server decides WHO calls and flips the coin itself (D10: the client never
 * supplies randomness). This module is the thin transport layer: it turns the two
 * server messages into DOM events the rules bridge listens for, and caches the
 * result so a listener that attaches late (the bridge only starts the game once
 * `both-players-ready` has fired) still sees it.
 *
 * Registered from socket-event-listeners.js beside the `dealOrder` listener, NOT
 * from the rules bridge: the call arrives while `setupPrizes()` is still awaiting
 * `dealOrder`, before the bridge's own setup path runs.
 */

/**
 * @typedef {{caller: string, call: string, result: string, winner: string,
 *   choiceId: string|null, choiceTimeoutMs: number|null, coinId: string|null,
 *   auto: boolean}} TurnOrderResult
 * @typedef {{winner: string, choice: string, starter: string, auto: boolean}} TurnOrderStarter
 */

/** @type {TurnOrderResult|null} */
let lastResult = null;
/** @type {TurnOrderStarter|null} */
let lastStarter = null;

/**
 * The server's resolved flip, if it has already arrived this game.
 *
 * @returns {TurnOrderResult|null}
 */
export function getTurnOrderResult() {
  return lastResult;
}

/**
 * The coin winner's go-first/go-second choice, if it has already arrived.
 *
 * @returns {TurnOrderStarter|null}
 */
export function getTurnOrderStarter() {
  return lastStarter;
}

/** Drops the cached result and choice — call on room change, reset or restart. */
export function resetTurnOrderCall() {
  lastResult = null;
  lastStarter = null;
}

const isSide = (value) => value === 'self' || value === 'opp';
const isCoinFace = (value) => value === 'heads' || value === 'tails';

const isChoice = (value) => value === 'first' || value === 'second';

/**
 * Normalizes a `turnOrderResult` payload, or null when it is malformed — a
 * half-valid flip must not name a guessed winner.
 *
 * @param {object} data
 * @returns {TurnOrderResult|null}
 */
export function normalizeTurnOrderResult(data) {
  if (!data || !isSide(data.winner) || !isSide(data.caller)) return null;
  if (!isCoinFace(data.call) || !isCoinFace(data.result)) return null;
  const coinId =
    typeof data.coinId === 'string' && data.coinId.length > 0 && data.coinId.length <= 128
      ? data.coinId
      : null;
  return {
    caller: data.caller,
    call: data.call,
    result: data.result,
    winner: data.winner,
    // Only the winner is handed a choiceId; it answers the server's choice prompt.
    choiceId: data.winner === 'self' && typeof data.choiceId === 'string' ? data.choiceId : null,
    choiceTimeoutMs: Number.isFinite(data.choiceTimeoutMs) ? data.choiceTimeoutMs : null,
    coinId,
    auto: Boolean(data.auto),
  };
}

/**
 * Normalizes a `turnOrderStarter` payload, or null when it is malformed.
 *
 * @param {object} data
 * @returns {TurnOrderStarter|null}
 */
export function normalizeTurnOrderStarter(data) {
  if (!data || !isSide(data.winner) || !isSide(data.starter) || !isChoice(data.choice)) return null;
  return { winner: data.winner, choice: data.choice, starter: data.starter, auto: Boolean(data.auto) };
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

  socket.on('turnOrderResult', (data) => {
    const result = normalizeTurnOrderResult(data);
    if (!result) return;
    lastResult = result;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-result', { detail: result })
    );
  });

  socket.on('turnOrderStarter', (data) => {
    const starter = normalizeTurnOrderStarter(data);
    if (!starter) return;
    lastStarter = starter;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-starter', { detail: starter })
    );
  });

  socket.on('turnOrderChoiceRejected', (data) => {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-choice-rejected', {
        detail: { reason: data?.reason || 'unknown' },
      })
    );
  });

  socket.on('turnOrderCallRejected', (data) => {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-call-rejected', {
        detail: { reason: data?.reason || 'unknown' },
      })
    );
  });
}
