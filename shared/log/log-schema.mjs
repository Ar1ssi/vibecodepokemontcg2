// One schema for every log source (design 087 §1-2). Pure: served to the browser and imported by the server.
export const LOG_FORMAT = 1;

export const LEVELS = Object.freeze(['error', 'warn', 'info', 'debug', 'trace']);

export const LEVEL_RANK = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3, trace: 4 });

export const CATEGORIES = Object.freeze([
  'boot',
  'process',
  'http',
  'socket',
  'room',
  'cmd',
  'engine',
  'journal',
  'view',
  'choice',
  'fx',
  'input',
  'console',
  'error',
  'net',
  'perf',
  'app',
  'sync',
  'decision',
  'log',
  'user',
]);

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

export const LIMITS = deepFreeze({
  detailBytes: 2048,
  traceDetailBytes: 8192,
  relayDetailBytes: 16384,
  floodPerSec: 60,
  clientRing: { maxBytes: 4194304, maxEntries: 20000 },
  serverStreamBytes: 4194304,
  roomStreamBytes: 8388608,
  clientStreamBytes: 6291456,
  totalBytesDefault: 67108864,
  retainClosedMs: 1800000,
  sweepMs: 60000,
  batchFlushMs: 2000,
  batchMaxLines: 200,
  batchMaxBytes: 131072,
  errorFlushMs: 250,
  rateBackoffMs: 10000,
  ingestMaxLines: 500,
  ingestMaxLineBytes: 20480,
  ingestWindowMs: 10000,
  ingestWindowBytes: 524288,
  beaconMaxBytes: 262144,
  pingFastCount: 3,
  pingFastMs: 1000,
  pingMs: 30000,
  clockKeep: 8,
  stateRing: 24,
  journalGames: 2,
  journalGameBytes: 4194304,
  snapshotTimeoutMs: 5000,
  snapshotMaxBytes: 819200,
  exportTokenMs: 60000,
  exportAckMs: 5000,
  exportMinIntervalMs: 5000,
  exportAnnounceMs: 30000,
  helloMaxLoads: 10,
  ingestMaxSeq: 1000000000,
  diskFileBytes: 52428800,
  diskFlushMs: 1000,
  diskKeepBoots: 10,
  toastMinMs: 60000,
});
