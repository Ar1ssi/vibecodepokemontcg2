// One schema for every log source (design 088 §1-2). Pure: served to the browser and imported by the server.
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

// Levels a player may ask for (the verbose toggle); the server and the client both gate on it.
export const isCaptureLevel = (level) => level === 'debug' || level === 'trace';

// Identity grammars: the client mints them, the server and the http tap validate them.
const CLIENT_ID = /^[0-9a-f]{16}$/;
const LOAD_ID = /^[0-9a-f]{8}$/;
export const isClientId = (value) => typeof value === 'string' && CLIENT_ID.test(value);
export const isLoadId = (value) => typeof value === 'string' && LOAD_ID.test(value);

// Socket.IO channel that holds lobby watchers; never a game room, like a socket's own id room.
export const LOBBY_WATCHERS = 'lobby:watchers';

/** A Socket.IO room name that is a game: the lobby channel and a socket's own room never are. */
export const isGameRoom = (room, socketId) =>
  typeof room === 'string' && room !== '' && room !== LOBBY_WATCHERS && room !== socketId;

// Wire names shared by the client shipper, the export UI and the server.
export const LOG_EVENTS = Object.freeze({
  hello: 'log:hello',
  batch: 'log:batch',
  ping: 'log:ping',
  setLevel: 'log:setLevel',
  level: 'log:level',
  snapshot: 'log:snapshot',
  export: 'log:export',
});
export const LOG_ROUTES = Object.freeze({ beacon: '/api/log/beacon', exportDownload: '/api/log/export/' });
export const LOG_API_PREFIX = '/api/log/';
export const CLIENT_HEADER = 'x-ptcg-client';

// Longest note kept from a `user.mark` entry, and from an export header.
export const MARK_NOTE_MAX = 500;
export const EXPORT_NOTE_MAX = 2000;

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
  beaconBodyChars: 48000,
  snapshotTailChars: 100000,
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
