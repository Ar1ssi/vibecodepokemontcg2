// What a socket payload contributes to the log. `log:*` is never logged (no feedback loop).
import { LIMITS } from './log-schema.mjs';
import { REDACTED } from './safe-json.mjs';

const KEY_LIMIT = 20;
const KEYS_ONLY = new Set(['instanceMap', 'dealOrder', 'spectatorActionData', 'storeGameState']);
// Logged up to the larger relay cap: the legacy relay's only record, and exactly what a client sent.
const FULL = new Set(['pushAction', 'requestAction', 'peerLog', 'cmd', 'resolveChoice']);

// Socket payloads are plain JSON, so the native stringify is the cheap size probe (this runs for
// every view on the command path); anything it cannot take just reports 0.
function byteLength(args) {
  try {
    return JSON.stringify(args)?.length ?? 0;
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

// Events that carry a credential as a bare positional argument (object keys are redacted by name
// in safeStringify): joinGame(roomId, username, isSpectator, seatToken, options).
const SECRET_ARGS = { joinGame: [3] };

function withoutSecretArgs(event, args) {
  const positions = SECRET_ARGS[event];
  if (!positions || !Array.isArray(args)) return args;
  return args.map((arg, i) => (positions.includes(i) && arg != null ? REDACTED : arg));
}

export function summarizePayload(event, rawArgs, { trace = false } = {}) {
  if (typeof event === 'string' && event.startsWith('log:')) return null;
  const args = withoutSecretArgs(event, rawArgs);
  const bytes = byteLength(args);
  if (event === 'view') return summarizeView(bytes, args, trace);
  if (KEYS_ONLY.has(event)) return { bytes, keys: firstKeys(args?.[0]) };
  if (FULL.has(event)) return { bytes, maxBytes: LIMITS.relayDetailBytes, args };
  return { bytes, args };
}
