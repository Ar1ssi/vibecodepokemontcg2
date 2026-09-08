/**
 * @file Client command emitter and in-flight affordance manager.
 * Manages monotonic clientSeq generation (Edge Case 4) and applies .cmd-pending
 * affordances to interacting elements during server round-trips.
 */

let clientSeq = 0;
const pendingElements = new Set();

let cachedValidateShape = null;
let cachedProtocolVersion = null;

/**
 * Resolves the shared engine commands module across browser and Node.js loaders.
 *
 * @returns {Promise<object|null>}
 */
async function loadCommandsModule() {
  try {
    return await import('/shared/engine/commands.mjs');
  } catch {
    try {
      return await import('../../../../shared/engine/commands.mjs');
    } catch {
      return null;
    }
  }
}

/**
 * Resolves validateCommandShape across browser and Node.js loaders.
 *
 * @returns {Promise<Function|null>}
 */
export async function getShapeValidator() {
  if (cachedValidateShape) return cachedValidateShape;
  const mod = await loadCommandsModule();
  cachedValidateShape = mod?.validateCommandShape || null;
  return cachedValidateShape;
}

/**
 * Resolves the shared PROTOCOL_VERSION constant so client and server negotiate
 * from the same source of truth instead of a hardcoded copy (Finding #7/#8).
 *
 * @returns {Promise<string|null>}
 */
export async function getProtocolVersion() {
  if (cachedProtocolVersion) return cachedProtocolVersion;
  const mod = await loadCommandsModule();
  cachedProtocolVersion = mod?.PROTOCOL_VERSION || null;
  return cachedProtocolVersion;
}

/**
 * Returns current monotonic client sequence number.
 *
 * @returns {number}
 */
export function getClientSeq() {
  return clientSeq;
}

/**
 * Resets client sequence counter (used for tests or new room join).
 *
 * @param {number} [initialSeq=0]
 */
export function resetClientSeq(initialSeq = 0) {
  clientSeq = initialSeq;
  clearInFlightAffordances();
}

/**
 * Seeds or advances client sequence counter from server's last processed sequence.
 * Ensures subsequent emitted commands have clientSeq > lastClientSeq (Edge Case 4).
 *
 * @param {number} serverSeq
 * @returns {number}
 */
export function seedClientSeq(serverSeq) {
  if (typeof serverSeq === 'number' && Number.isFinite(serverSeq)) {
    clientSeq = Math.max(clientSeq, serverSeq);
  }
  return clientSeq;
}

/**
 * Adds .cmd-pending affordance to an element while command is in flight.
 *
 * @param {HTMLElement|null} element
 */
export function addInFlightAffordance(element) {
  if (!element) return;
  try {
    if (element.classList && typeof element.classList.add === 'function') {
      element.classList.add('cmd-pending');
      pendingElements.add(element);
    }
  } catch {
    // Ignore DOM errors in headless environments
  }
}

/**
 * Clears all active .cmd-pending affordances across tracked elements and DOM.
 */
export function clearInFlightAffordances() {
  for (const el of pendingElements) {
    try {
      if (el.classList && typeof el.classList.remove === 'function') {
        el.classList.remove('cmd-pending');
      }
    } catch {
      // Ignore
    }
  }
  pendingElements.clear();

  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    try {
      const remaining = document.querySelectorAll('.cmd-pending');
      remaining.forEach((node) => node.classList?.remove('cmd-pending'));
    } catch {
      // Ignore
    }
  }
}

/**
 * Creates and formats a structured command envelope.
 *
 * @param {string} type
 * @param {object} payload
 * @param {number} seq
 * @returns {object}
 */
export function createCommandEnvelope(type, payload = {}, seq = 0) {
  return {
    type,
    payload: payload && typeof payload === 'object' ? payload : {},
    clientSeq: seq,
  };
}

/**
 * Validates and emits a command to the authoritative server over Socket.IO.
 *
 * @param {object} options
 * @param {object} options.socket Socket.IO client instance
 * @param {string} options.roomId
 * @param {string} options.type Command type
 * @param {object} [options.payload={}] Command payload
 * @param {HTMLElement} [options.element=null] Triggering UI element
 * @returns {Promise<{ success: boolean, clientSeq?: number, error?: string, command?: object }>}
 */
export async function emitCmd({
  socket,
  roomId,
  type,
  payload = {},
  element = null,
}) {
  if (!socket || typeof socket.emit !== 'function') {
    return { success: false, error: 'socket_unavailable' };
  }
  if (!roomId) {
    return { success: false, error: 'missing_room_id' };
  }
  if (!type || typeof type !== 'string') {
    return { success: false, error: 'invalid_command_type' };
  }

  // Pre-validate command shape if validator available
  const validator = await getShapeValidator();
  if (validator) {
    const shapeResult = validator({ type, payload });
    if (!shapeResult.valid) {
      return {
        success: false,
        error: 'bad_command',
        reason: shapeResult.reason,
      };
    }
  }

  clientSeq += 1;
  const currentSeq = clientSeq;

  addInFlightAffordance(element);

  const protocolVersion = await getProtocolVersion();

  const command = {
    gameId: roomId,
    roomId,
    clientSeq: currentSeq,
    type,
    payload,
    ...(protocolVersion ? { protocolVersion } : {}),
  };

  socket.emit('cmd', command);

  return {
    success: true,
    clientSeq: currentSeq,
    command,
  };
}

/**
 * Emits resolution for an active PendingChoice.
 *
 * @param {object} options
 * @param {object} options.socket
 * @param {string} options.roomId
 * @param {string} options.choiceId
 * @param {number[]} options.selection Array of selected instanceIds
 * @param {HTMLElement} [options.element=null]
 * @returns {Promise<{ success: boolean, clientSeq?: number, error?: string }>}
 */
export async function emitResolveChoice({
  socket,
  roomId,
  choiceId,
  selection = [],
  element = null,
}) {
  if (!socket || typeof socket.emit !== 'function') {
    return { success: false, error: 'socket_unavailable' };
  }
  if (!roomId || !choiceId) {
    return { success: false, error: 'missing_choice_parameters' };
  }

  clientSeq += 1;
  const currentSeq = clientSeq;

  addInFlightAffordance(element);

  const payload = {
    gameId: roomId,
    roomId,
    choiceId,
    selection: Array.isArray(selection) ? selection : [],
    clientSeq: currentSeq,
  };

  socket.emit('resolveChoice', payload);

  return {
    success: true,
    clientSeq: currentSeq,
  };
}

/**
 * Emits requestView to fetch the latest authoritative view snapshot (reconnect/resync).
 *
 * @param {object} options
 * @param {object} options.socket
 * @param {string} options.roomId
 * @returns {boolean}
 */
export function emitRequestView({ socket, roomId }) {
  if (!socket || typeof socket.emit !== 'function' || !roomId) {
    return false;
  }
  socket.emit('requestView', { gameId: roomId, roomId });
  return true;
}

/**
 * Handles incoming cmdRejected event from server.
 * Clears in-flight affordances and surfaces the error.
 *
 * @param {object} rejectionData { clientSeq, reason, details }
 * @param {object} [options={}]
 * @param {Function} [options.onRejected] Optional callback
 */
export function handleCmdRejected(rejectionData = {}, options = {}) {
  clearInFlightAffordances();

  const reason = rejectionData.reason || 'command_rejected';
  const details = rejectionData.details || '';

  if (typeof options.onRejected === 'function') {
    options.onRejected({ reason, details, clientSeq: rejectionData.clientSeq });
  }
}
