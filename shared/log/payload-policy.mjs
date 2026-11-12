// What a socket payload contributes to the log. `log:*` is never logged (no feedback loop).
import { LIMITS } from './log-schema.mjs';
import { safeStringify } from './safe-json.mjs';

const SIZE_PROBE = { maxBytes: 4194304, maxString: 4194304, maxArray: 100000, maxDepth: 32 };
const KEY_LIMIT = 20;
const KEYS_ONLY = new Set(['instanceMap', 'dealOrder', 'spectatorActionData', 'storeGameState']);
const RELAY = new Set(['pushAction', 'requestAction', 'peerLog']);

function byteLength(args) {
  try {
    return safeStringify(args, SIZE_PROBE).length;
  } catch {
    return 0;
  }
}

function firstKeys(value) {
  return value && typeof value === 'object' ? Object.keys(value).slice(0, KEY_LIMIT) : [];
}

function summarizeView(bytes, args, trace) {
  const view = args?.[0];
  const summary = {
    bytes,
    sv: view?.stateVersion ?? null,
    lastClientSeq: view?.lastClientSeq ?? null,
    events: Array.isArray(view?.events) ? view.events.map((e) => e?.type) : [],
    choice: view?.pendingChoice?.choiceId ?? null,
  };
  return trace ? { ...summary, args } : summary;
}

export function summarizePayload(event, args, { trace = false } = {}) {
  if (typeof event === 'string' && event.startsWith('log:')) return null;
  const bytes = byteLength(args);
  if (event === 'view') return summarizeView(bytes, args, trace);
  if (KEYS_ONLY.has(event)) return { bytes, keys: firstKeys(args?.[0]) };
  if (RELAY.has(event)) return { bytes, maxBytes: LIMITS.relayDetailBytes, args };
  return { bytes, args };
}
