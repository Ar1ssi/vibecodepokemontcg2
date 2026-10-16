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
 *
 * Design 074 D7: a solo room's one socket gets every message once per seat, each copy's
 * 'self'/'opp' relative to its seat. A copy names its seat in `seat` when the server sends
 * one; otherwise copies are attributed in arrival order, p1 then p2 — the server sends a
 * solo room's copies seat by seat (turn-order-transport.mjs forEachSeat over the room's
 * players, seated p1 then p2) and replays only p1's copy. Copies are relabeled to the
 * near seat's point of view; the call and the first/second prompt open for whichever
 * seat holds the id, and the answer names that seat.
 */

import { seatForSide, sideForSeat } from './solo-seat.mjs';

/**
 * @typedef {object} TurnOrderFlip
 * @property {'self'|'opp'} caller
 * @property {'heads'|'tails'} call
 * @property {'heads'|'tails'} result
 * @property {'self'|'opp'} winner Who answers "Do you want to go first?".
 * @property {string|null} choiceId Set only on the winner's own copy.
 * @property {'p1'|'p2'} [choiceSeat] Solo room: the seat that answers (the winner's).
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
// Solo arrival-order attribution: copies seen per message type this game.
let soloCopies = { turnOrderCall: 0, turnOrderFlip: 0, turnOrderResult: 0 };

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
  soloCopies = { turnOrderCall: 0, turnOrderFlip: 0, turnOrderResult: 0 };
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
  // The starter must be the seat the winner's answer names.
  const otherSide = data.winner === 'self' ? 'opp' : 'self';
  if (data.starter !== (data.goFirst ? data.winner : otherSide)) return null;
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

const otherSide = (side) => (side === 'self' ? 'opp' : 'self');

/**
 * Rewrites a copy's seat-relative sides to the near seat's point of view.
 *
 * @param {object} copy normalized flip or result
 * @param {'p1'|'p2'} copySeat the seat the copy was sent for
 * @param {'p1'|'p2'} nearSeat
 * @param {string[]} fields the copy's 'self'|'opp' fields
 * @returns {object}
 */
export function relabelForNearSeat(copy, copySeat, nearSeat, fields) {
  if (sideForSeat(copySeat, nearSeat) === 'self') return copy;
  const relabeled = { ...copy };
  for (const field of fields) relabeled[field] = otherSide(copy[field]);
  return relabeled;
}

const isSeat = (value) => value === 'p1' || value === 'p2';

/**
 * Wires the inbound turn-order messages onto `document` events.
 *
 * @param {object} socket Socket.IO client socket.
 * @param {Document} [doc=document] Injected for tests.
 * @param {object} [options]
 * @param {{ solo?: boolean, nearSeat?: 'p1'|'p2' }} [options.systemState] read on each
 *   message, so a solo room (design 074 D7) gets its copies attributed and relabeled.
 */
export function registerTurnOrderCallListeners(socket, doc = document, { systemState = null } = {}) {
  if (!socket || typeof socket.on !== 'function') return;

  const soloNearSeat = () => (systemState?.solo ? seatForSide('self', systemState.nearSeat) : null);
  // The seat a solo copy was sent for: the server's own `seat`, else arrival order.
  const soloCopySeat = (type, data) => {
    const index = soloCopies[type];
    soloCopies[type] = index + 1;
    if (isSeat(data?.seat)) return data.seat;
    return index % 2 === 0 ? 'p1' : 'p2';
  };

  socket.on('turnOrderCall', (data) => {
    if (!data) return;
    const callId = typeof data.callId === 'string' ? data.callId : null;
    const nearSeat = soloNearSeat();
    const seat = nearSeat ? soloCopySeat('turnOrderCall', data) : null;
    // A solo player is both seats: only the caller's copy, which holds the callId, matters.
    if (nearSeat && !callId) return;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-call', {
        detail: {
          roomId: data.roomId ?? null,
          // Only the designated caller is handed a callId; the other seat is told
          // to wait. A client that invents a callId is rejected server-side.
          callId,
          waiting: Boolean(data.waiting) && !nearSeat,
          timeoutMs: Number.isFinite(data.timeoutMs) ? data.timeoutMs : null,
          ...(seat ? { seat } : {}),
        },
      })
    );
  });

  socket.on('turnOrderFlip', (data) => {
    let flip = normalizeTurnOrderFlip(data);
    if (!flip) return;
    const nearSeat = soloNearSeat();
    if (nearSeat) {
      const seat = soloCopySeat('turnOrderFlip', data);
      // Only the winner's copy can answer "Do you want to go first?"; it opens the prompt.
      if (!flip.choiceId) return;
      flip = { ...relabelForNearSeat(flip, seat, nearSeat, ['caller', 'winner']), choiceSeat: seat };
    }
    lastFlip = flip;
    doc.dispatchEvent(
      new CustomEvent('rules-turn-order-flip', {
        detail: { ...flip, roomId: data.roomId ?? null },
      })
    );
  });

  socket.on('turnOrderResult', (data) => {
    let result = normalizeTurnOrderResult(data);
    if (!result) return;
    const nearSeat = soloNearSeat();
    if (nearSeat) {
      const seat = soloCopySeat('turnOrderResult', data);
      result = relabelForNearSeat(result, seat, nearSeat, ['caller', 'winner', 'starter']);
    }
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
