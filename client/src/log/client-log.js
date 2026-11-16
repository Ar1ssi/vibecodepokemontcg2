// Client logging singleton (design 088 §5). Safe to import in Node: storage access is guarded.
import { createLogger } from '../../../shared/log/logger.mjs';
import { createRing } from '../../../shared/log/ring.mjs';
import { LIMITS } from '../../../shared/log/log-schema.mjs';

const CLIENT_KEY = 'ptcg-sim.log.client.v1';

function randomHex(chars) {
  const bytes = new Uint8Array(Math.ceil(chars / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, chars);
}

function loadClientId() {
  try {
    const stored = globalThis.localStorage?.getItem(CLIENT_KEY);
    if (/^[0-9a-f]{16}$/.test(stored ?? '')) return stored;
    const fresh = randomHex(16);
    globalThis.localStorage?.setItem(CLIENT_KEY, fresh);
    return fresh;
  } catch {
    return randomHex(16);
  }
}

export const clientId = loadClientId();
export const loadId = randomHex(8);
export const clientRing = createRing(LIMITS.clientRing);

const listeners = new Set();

export function onEntry(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sink(entry) {
  clientRing.push({ seq: entry.seq, t: entry.t, line: entry.line });
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      // a broken listener must not stop logging
    }
  }
}

export const log = createLogger({
  now: () => performance.timeOrigin + performance.now(),
  sink,
});

export function logStats() {
  return {
    clientId,
    loadId,
    entries: clientRing.size(),
    bytes: clientRing.bytes(),
    dropped: clientRing.dropped(),
    seq: log.seq(),
    level: log.level(),
    ...log.suppressed(),
  };
}
