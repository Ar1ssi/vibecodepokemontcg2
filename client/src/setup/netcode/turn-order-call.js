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

/** @type {{caller: string, call: string, result: string, starter: string, coinId: string|null, auto: boolean}|null} */
let lastResult = null;

/**
 * The server's resolved flip, if it has already arrived this game.
 *
 * @returns {{caller: string, call: string, result: string, starter: string, coinId: string|null, auto: boolean}|null}
 */
export function getTurnOrderResult() {
  return lastResult;
}

/** Drops the cached result — call on room change, reset or restart. */
export function resetTurnOrderCall() {
  lastResult = null;
}

const isSide = (value) => value === 'self' || value === 'opp';
const isCoinFace = (value) => value === 'heads' || value === 'tails';

/**
 * Normalizes a `turnOrderResult` payload, or null when it is malformed — a
 * half-valid flip must not start a game on a guessed starter.
 *
 * @param {object} data
 * @returns {{caller: string, call: string, result: string, starter: string, coinId: string|null, auto: boolean}|null}
 */
export function normalizeTurnOrderResult(data) {
  if (!data || !isSide(data.starter) || !isSide(data.caller)) return null;
  if (!isCoinFace(data.call) || !isCoinFace(data.result)) return null;
  const coinId =
    typeof data.coinId === 'string' && data.coinId.length > 0 && data.coinId.length <= 128
      ? data.coinId
      : null;
  return {
    caller: data.caller,
    call: data.call,
    result: data.result,
    starter: data.starter,
    coinId,
    auto: Boolean(data.auto),
  };
}

/**
 * Wires the two inbound turn-order messages onto `document` events.
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

  socket.on('turnOrderCallRejected', (data) => {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-call-rejected', {
        detail: { reason: data?.reason || 'unknown' },
      })
    );
  });
}
