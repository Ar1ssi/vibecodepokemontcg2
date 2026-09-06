/**
 * Formal Event Sourcing Action interface and factory.
 * Standardizes all game events with type, user, payload, timestamp, and metadata.
 */

export function createAction(type, user, payload = [], options = {}) {
  return {
    type,
    user,
    payload: Array.isArray(payload) ? [...payload] : payload,
    timestamp: options.timestamp || Date.now(),
    // Backward-compatibility aliases
    action: type,
    parameters: Array.isArray(payload) ? [...payload] : payload,
    emit: options.emit ?? true,
    meta: options.meta || {},
  };
}

export function isReplayActive(systemState) {
  return Boolean(
    systemState?.syncReplaying ||
    systemState?.isCatchingUp ||
    systemState?.isReplay
  );
}
