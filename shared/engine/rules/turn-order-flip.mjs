/**
 * @file Pure, DOM-free turn-order coin resolution in ABSOLUTE playerId space (design 013).
 *
 * Sibling to rules-turnorder.mjs, which speaks the client's local 'self'/'opp'
 * perspective. The server authority has no such perspective — it holds both
 * playerIds — so it uses these helpers instead, and translates to 'self'/'opp'
 * only when broadcasting to a specific recipient.
 *
 * Every random draw here comes from the caller-supplied seeded rng
 * (shared/engine/rng.mjs `createRng`, shape `{ next(): number }`), never from
 * Math.random, so the opening flip stays replayable (Invariant 6).
 */

export const COIN_FACES = ['heads', 'tails'];

/**
 * @param {unknown} value
 * @returns {boolean} true when value is a valid coin face.
 */
export const isCoinFace = (value) => value === 'heads' || value === 'tails';

/**
 * Draws one coin face from the seeded rng.
 *
 * @param {{ next: () => number }} rng
 * @returns {'heads'|'tails'} 'heads' when the draw is below 0.5.
 */
export function flipCoinFace(rng) {
  if (!rng || typeof rng.next !== 'function') return 'heads';
  return rng.next() < 0.5 ? 'heads' : 'tails';
}

/**
 * Picks which player calls the opening coin. The ids are sorted first so the
 * pick depends only on the rng draw and the id set, not on join order.
 *
 * @param {string[]} playerIds
 * @param {{ next: () => number }} rng
 * @returns {string|null} the calling playerId, or null when fewer than 2 ids.
 */
export function pickCoinCaller(playerIds, rng) {
  const ids = [...new Set((playerIds || []).filter(Boolean))].sort();
  if (ids.length < 2) return null;
  if (!rng || typeof rng.next !== 'function') return ids[0];
  return rng.next() < 0.5 ? ids[0] : ids[1];
}

/**
 * Decides who won the opening toss: the caller wins iff the coin landed on the
 * face they called. An invalid call or result is treated as a loss for the
 * caller, so a malformed client payload can never hand its sender the win.
 *
 * @param {object} options
 * @param {string[]} options.playerIds
 * @param {string} options.callerPlayerId
 * @param {unknown} options.call
 * @param {unknown} options.result
 * @returns {string|null} the winning playerId, or null when the inputs cannot name one.
 */
export function resolveCoinWinnerPlayerId({
  playerIds,
  callerPlayerId,
  call,
  result,
} = {}) {
  const ids = [...new Set((playerIds || []).filter(Boolean))].sort();
  if (ids.length < 2 || !ids.includes(callerPlayerId)) return null;
  const otherPlayerId = ids.find((id) => id !== callerPlayerId);
  if (!isCoinFace(call) || !isCoinFace(result)) return otherPlayerId;
  return result === call ? callerPlayerId : otherPlayerId;
}

/**
 * The toss winner decides the order (design 072, TCG Live's `pl_calling_turn`
 * "Do you want to go first?"): yes seats the winner, no seats the other player.
 *
 * @param {object} options
 * @param {string[]} options.playerIds
 * @param {string} options.winnerPlayerId
 * @param {unknown} options.goFirst Must be a boolean.
 * @returns {string|null} the starting playerId, or null when the inputs cannot name one.
 */
export function resolveStarterFromChoice({ playerIds, winnerPlayerId, goFirst } = {}) {
  const ids = [...new Set((playerIds || []).filter(Boolean))].sort();
  if (ids.length < 2 || !ids.includes(winnerPlayerId)) return null;
  if (typeof goFirst !== 'boolean') return null;
  return goFirst ? winnerPlayerId : ids.find((id) => id !== winnerPlayerId);
}
