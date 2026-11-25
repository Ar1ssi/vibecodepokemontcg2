// Server side of client log shipping (design 088 §5): hello/batch/ping/level sockets and the pagehide beacon.
import {
  CATEGORIES,
  LEVEL_RANK,
  LIMITS,
  LOBBY_WATCHERS,
  LOG_EVENTS,
  isCaptureLevel,
  isClientId,
  isGameRoom,
  isLoadId,
} from '../../shared/log/log-schema.mjs';
import { alignedTs } from '../../shared/log/export-format.mjs';
import { clientStreamId } from './log-store.mjs';
const CATEGORY_SET = new Set(CATEGORIES);
const EVENT_NAME_MAX = 120;
const BUILD_MAX = 80;
// Keys the export writes in front of every client line; a line that carried its own would
// override them when the file is parsed (a client forging `src: server`).
const RESERVED_KEYS = ['k', 'ts', 'src', 'load'];
// Sanity bounds on client clocks: beyond them `t + offset` stops being a finite, sortable number.
const TIME_MAX = 1e14;
const OFFSET_MAX = 1e12;

const shortString = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null);

function parseLine(line, limits) {
  if (typeof line !== 'string' || line.length > limits.ingestMaxLineBytes) return null;
  // The export patches each line by position, so it must be exactly what the logger writes.
  if (!line.startsWith('{"t":') || line.includes('\n') || line.includes('\r')) return null;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.t !== 'number' || !(Math.abs(entry.t) < TIME_MAX)) return null;
  if (!Number.isInteger(entry.seq) || entry.seq <= 0 || entry.seq > limits.ingestMaxSeq) return null;
  if (typeof entry.lvl !== 'string' || !Object.hasOwn(LEVEL_RANK, entry.lvl)) return null;
  if (!CATEGORY_SET.has(entry.cat)) return null;
  if (typeof entry.ev !== 'string' || entry.ev.length > EVENT_NAME_MAX) return null;
  if (RESERVED_KEYS.some((key) => Object.hasOwn(entry, key))) return null;
  return entry;
}

export function ingestLines({ store, clientId, loadId, lines, offset = 0, lastSeq = 0, limits = LIMITS }) {
  let stored = 0;
  let bad = 0;
  for (const line of lines) {
    const entry = parseLine(line, limits);
    if (!entry) {
      bad += 1;
      continue;
    }
    if (entry.seq <= lastSeq) continue;
    const ts = alignedTs(entry.t, offset);
    store.append(clientStreamId(clientId), {
      seq: entry.seq,
      t: entry.t,
      ts,
      lvl: entry.lvl,
      load: loadId,
      line,
      diskLine: `{"ts":${ts},"load":${JSON.stringify(loadId)},${line.slice(1)}`,
    });
    lastSeq = entry.seq;
    stored += 1;
  }
  return { stored, bad, lastSeq };
}

export function createLogIngest({ store, log, io, now = Date.now, limits = LIMITS }) {
  // clientId -> loadId -> { seq: last stored seq, window: the batch byte-rate window }
  const loadStates = new Map();
  const roomLevels = new Map();
  // A client outside any room (deck builder, lobby) can still ask for verbose capture.
  const clientLevels = new Map();

  const adapter = io.of('/').adapter;
  adapter.on('delete-room', (room) => roomLevels.delete(room));
  adapter.on('join-room', (room, id) => {
    if (roomLevels.get(room) === 'trace') io.to(id).emit(LOG_EVENTS.level, { level: 'trace', by: 'room' });
  });

  // A client's own verbose request counts as well as its room's.
  const levelFor = (roomId, clientId) =>
    roomLevels.get(roomId) === 'trace' || clientLevels.get(clientId) === 'trace' ? 'trace' : 'debug';

  function loadState(clientId, loadId) {
    let loads = loadStates.get(clientId);
    if (!loads) {
      loads = new Map();
      loadStates.set(clientId, loads);
    }
    let state = loads.get(loadId);
    if (!state) {
      state = { seq: 0, window: null };
      loads.set(loadId, state);
    }
    return state;
  }

  // The line-array shape every path in (batch, snapshot tail, beacon) must meet.
  function linesRefusal(lines) {
    if (!Array.isArray(lines)) return 'bad_batch';
    return lines.length > limits.ingestMaxLines ? 'too_many' : null;
  }

  function levelForSocket(socket) {
    if (clientLevels.get(socket.data?.logClientId) === 'trace') return 'trace';
    for (const room of socket.rooms ?? []) if (roomLevels.get(room) === 'trace') return 'trace';
    return 'debug';
  }

  function storeBatch({ clientId, loadId, lines, payload }) {
    const state = loadState(clientId, loadId);
    // A numeric string or array would pass a coercing range check and then concatenate into `t + offset`.
    const offset = Number.isFinite(payload.offset) && Math.abs(payload.offset) < OFFSET_MAX ? payload.offset : 0;
    const result = ingestLines({ store, clientId, loadId, lines, offset, lastSeq: state.seq, limits });
    state.seq = result.lastSeq;
    store.setMeta(clientStreamId(clientId), {
      offset,
      rtt: Number.isFinite(payload.rtt) ? payload.rtt : null,
      lastBatchAt: now(),
    });
    if (result.bad > 0) log.warn('log', 'batch.bad_lines', { clientId, bad: result.bad });
    return result;
  }

  function hello(socket, payload, ack) {
    const clientId = payload?.clientId;
    const loadId = payload?.loadId;
    if (!isClientId(clientId) || !isLoadId(loadId)) {
      ack({ ok: false, reason: 'bad_hello' });
      return;
    }
    // One identity per socket: a socket that could re-hello as someone new would mint a stream
    // (and its metadata) per call.
    const bound = socket.data.logClientId;
    if (bound && (bound !== clientId || socket.data.logLoadId !== loadId)) {
      ack({ ok: false, reason: 'client_changed' });
      return;
    }
    socket.data.logClientId = clientId;
    socket.data.logLoadId = loadId;
    const streamId = clientStreamId(clientId);
    const page = shortString(payload.page, 200) ?? '';
    const build = shortString(payload.build, BUILD_MAX);
    const loads = { ...(store.stream(streamId)?.meta?.loads ?? {}), [loadId]: { helloAt: now(), page, build } };
    const kept = Object.entries(loads)
      .sort(([, a], [, b]) => b.helloAt - a.helloAt)
      .slice(0, limits.helloMaxLoads);
    store.setMeta(streamId, { ua: shortString(payload.ua, 300) ?? '', build, loads: Object.fromEntries(kept) });
    store.reopen(streamId);
    for (const room of socket.rooms) {
      if (room === socket.id || room === LOBBY_WATCHERS) continue;
      store.link(clientId, room, { socketId: socket.id });
    }
    log.info('log', 'hello', { clientId, loadId, page, build });
    for (const known of loadStates.keys()) {
      if (known !== clientId && store.stream(clientStreamId(known)) === null) loadStates.delete(known);
    }
    for (const known of clientLevels.keys()) {
      if (known !== clientId && store.stream(clientStreamId(known)) === null) clientLevels.delete(known);
    }
    ack({ ok: true, serverT: now(), level: levelForSocket(socket), acked: loadState(clientId, loadId).seq });
  }

  function batch(socket, payload, ack) {
    const clientId = socket.data.logClientId;
    if (!clientId) return ack({ ok: false, reason: 'no_hello' });
    if (payload?.loadId !== socket.data.logLoadId) return ack({ ok: false, reason: 'bad_load' });
    const refusal = linesRefusal(payload.lines);
    if (refusal) {
      if (refusal === 'too_many') log.warn('log', 'batch.refused', { clientId, reason: refusal, lines: payload.lines.length });
      return ack({ ok: false, reason: refusal });
    }
    // The rate window guards the socket path only: a snapshot tail and a beacon are each one bounded message.
    const state = loadState(clientId, socket.data.logLoadId);
    let window = state.window;
    if (!window || now() - window.start > limits.ingestWindowMs) {
      window = { start: now(), bytes: 0, warned: false };
      state.window = window;
    }
    for (const line of payload.lines) if (typeof line === 'string') window.bytes += line.length;
    if (window.bytes > limits.ingestWindowBytes) {
      if (!window.warned) {
        window.warned = true;
        log.warn('log', 'batch.refused', { clientId, reason: 'rate' });
      }
      return ack({ ok: false, reason: 'rate' });
    }
    store.reopen(clientStreamId(clientId));
    const result = storeBatch({ clientId, loadId: socket.data.logLoadId, lines: payload.lines, payload });
    return ack({ ok: true, acked: result.lastSeq, bad: result.bad, level: levelForSocket(socket) });
  }

  function setLevel(socket, payload, ack) {
    const level = payload?.level;
    if (!isCaptureLevel(level)) return ack({ ok: false, reason: 'bad_request' });
    if (payload.roomId == null) return setClientLevel(socket, level, ack);
    if (!isGameRoom(payload.roomId, socket.id) || !socket.rooms.has(payload.roomId)) return ack({ ok: false, reason: 'bad_request' });
    if (level === 'trace') roomLevels.set(payload.roomId, 'trace');
    else roomLevels.delete(payload.roomId);
    const by = socket.data.logClientId ?? socket.id;
    io.to(payload.roomId).emit(LOG_EVENTS.level, { level, by });
    log.info('log', 'level', { level, by }, { room: payload.roomId });
    return ack({ ok: true, level });
  }

  function setClientLevel(socket, level, ack) {
    const clientId = socket.data.logClientId;
    if (!clientId) return ack({ ok: false, reason: 'no_hello' });
    if (level === 'trace') clientLevels.set(clientId, 'trace');
    else clientLevels.delete(clientId);
    socket.emit?.(LOG_EVENTS.level, { level: levelForSocket(socket), by: clientId });
    log.info('log', 'level', { level, by: clientId, scope: 'client' });
    return ack({ ok: true, level: levelForSocket(socket) });
  }

  function guarded(handler) {
    return (payload, maybeAck) => {
      const ack = typeof maybeAck === 'function' ? maybeAck : () => {};
      try {
        handler(payload, ack);
      } catch {
        try {
          ack({ ok: false, reason: 'error' });
        } catch {
          // the client went away
        }
      }
    };
  }

  return {
    attachSocket(socket) {
      socket.on(LOG_EVENTS.hello, guarded((payload, ack) => hello(socket, payload, ack)));
      socket.on(LOG_EVENTS.batch, guarded((payload, ack) => batch(socket, payload, ack)));
      socket.on(LOG_EVENTS.ping, guarded((payload, ack) => ack({ t0: payload?.t0 ?? null, serverT: now() })));
      socket.on(LOG_EVENTS.setLevel, guarded((payload, ack) => setLevel(socket, payload, ack)));
      socket.on('disconnect', () => {
        try {
          if (socket.data.logClientId) store.close(clientStreamId(socket.data.logClientId));
        } catch {
          // closing is best effort
        }
      });
    },
    beaconHandler(req, res) {
      try {
        const body = JSON.parse(typeof req.body === 'string' ? req.body : '');
        const { clientId, loadId, lines } = body ?? {};
        const admitted = isClientId(clientId) && isLoadId(loadId) && linesRefusal(lines) === null;
        if (admitted && store.stream(clientStreamId(clientId))?.meta?.loads?.[loadId]) {
          storeBatch({ clientId, loadId, lines, payload: body });
        }
      } catch {
        // a bad beacon is dropped; the endpoint always answers 204
      }
      res.status(204).end();
    },
    levelFor,
    /**
     * A client's unshipped entries, sent inside its snapshot reply so an export has them without
     * a second round trip. Same validation and seq dedupe as a batch; the later batch is a no-op.
     */
    acceptTail(socket, tail) {
      const clientId = socket?.data?.logClientId ?? null;
      try {
        const refusal =
          !clientId || tail?.loadId !== socket.data.logLoadId ? 'bad_load' : linesRefusal(tail.lines);
        if (refusal) {
          log.warn('log', 'tail.refused', { clientId, reason: refusal });
          return 0;
        }
        return storeBatch({ clientId, loadId: tail.loadId, lines: tail.lines, payload: tail }).stored;
      } catch (error) {
        log.warn('log', 'tail.failed', { clientId, error: String(error?.message ?? error) });
        return 0;
      }
    },
  };
}
