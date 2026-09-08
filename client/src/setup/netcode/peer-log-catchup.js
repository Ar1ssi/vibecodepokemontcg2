/**
 * @file Peer-log reconnect catch-up (design 002, slice 1.1 / O2-B).
 * On reconnect, a client asks its peer for the tail of `selfActionData` past
 * the counter it has already applied, and replays it through the same
 * `pushActionQueue` chain live traffic uses. Capped and time-boxed: past the
 * cap, or with no answer, the caller must fall through to the O2-C failure
 * announcement rather than guess at partial state.
 */

export const PEER_LOG_MAX = 200;
export const PEER_LOG_TIMEOUT_MS = 5000;

/**
 * Builds the `peerLog` reply for a `requestPeerLog` request received from a peer.
 *
 * @param {object} options
 * @param {Array<{action: string, parameters: any}>} [options.selfActionData]
 * @param {number} [options.fromCounter]
 * @param {string} [options.requesterSocketId]
 * @param {string} [options.roomId]
 * @returns {{roomId: string|undefined, toSocketId: string|undefined, actions: Array, capped: boolean}}
 */
export function buildPeerLogResponse({
  selfActionData = [],
  fromCounter = 0,
  requesterSocketId,
  roomId,
} = {}) {
  const start = Math.max(0, Number.isFinite(fromCounter) ? fromCounter : 0);
  const gap = selfActionData.length - start;
  const capped = gap > PEER_LOG_MAX;
  const actions = capped
    ? []
    : selfActionData.slice(start).map((entry) => ({
        action: entry.action,
        parameters: entry.parameters,
      }));
  return { roomId, toSocketId: requesterSocketId, actions, capped };
}

/**
 * True when an incoming `peerLog` payload is addressed to this socket.
 * Guards against a room broadcast reaching a spectator or the wrong peer.
 *
 * @param {object} options
 * @param {string} [options.toSocketId]
 * @param {string} [options.mySocketId]
 * @returns {boolean}
 */
export function isPeerLogForMe({ toSocketId, mySocketId } = {}) {
  return Boolean(toSocketId) && toSocketId === mySocketId;
}

/**
 * Emits a `requestPeerLog` asking the peer for actions past `fromCounter`.
 *
 * @param {object} options
 * @param {object} options.socket
 * @param {string} options.roomId
 * @param {number} options.fromCounter
 * @param {string} [options.requesterSocketId]
 * @returns {boolean}
 */
export function emitRequestPeerLog({
  socket,
  roomId,
  fromCounter,
  requesterSocketId,
}) {
  if (!socket || typeof socket.emit !== 'function' || !roomId) return false;
  socket.emit('requestPeerLog', { roomId, fromCounter, requesterSocketId });
  return true;
}

/**
 * Chains a batch of peer actions onto the existing action queue, preserving
 * ordering with any live traffic already enqueued on it.
 *
 * @param {object} options
 * @param {Array<{action: string, parameters: any}>} options.actions
 * @param {Promise} [options.currentQueue]
 * @param {(action: string, parameters: any) => Promise<void>} options.applyAction
 * @param {() => void} [options.onSettled] Called once, after every action has applied.
 * @returns {Promise} The new queue tail — assign this back to the caller's queue variable.
 */
export function scheduleReplay({
  actions,
  currentQueue,
  applyAction,
  onSettled,
}) {
  let queue = currentQueue || Promise.resolve();
  for (const entry of actions) {
    queue = queue.then(() => applyAction(entry.action, entry.parameters));
  }
  if (typeof onSettled === 'function') {
    queue = queue.then(() => onSettled());
  }
  return queue;
}
