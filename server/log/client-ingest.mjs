// Server side of client log shipping (design 087 §5): hello/batch/ping/level sockets and the pagehide beacon.
import { CATEGORIES, LEVEL_RANK, LIMITS } from '../../shared/log/log-schema.mjs';

const CLIENT_ID = /^[0-9a-f]{16}$/;
const LOAD_ID = /^[0-9a-f]{8}$/;
const NOT_A_ROOM = 'lobby:watchers';
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
    const ts = Math.round((entry.t + offset) * 10) / 10;
    store.append(`client:${clientId}`, {
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
  const seqByLoad = new Map();
  const roomLevels = new Map();
  // A client outside any room (deck builder, lobby) can still ask for verbose capture.
  const clientLevels = new Map();
  const windows = new WeakMap();

  const adapter = io.of('/').adapter;
  adapter.on('delete-room', (room) => roomLevels.delete(room));
  adapter.on('join-room', (room, id) => {
    if (roomLevels.get(room) === 'trace') io.to(id).emit('log:level', { level: 'trace', by: 'room' });
  });

  const levelFor = (roomId) => roomLevels.get(roomId) ?? 'debug';

  function levelForSocket(socket) {
    if (clientLevels.get(socket.data?.logClientId) === 'trace') return 'trace';
    for (const room of socket.rooms ?? []) if (roomLevels.get(room) === 'trace') return 'trace';
    return 'debug';
  }

  function storeBatch({ clientId, loadId, lines, payload }) {
    const key = `${clientId}/${loadId}`;
    const offset = Math.abs(payload.offset) < OFFSET_MAX ? payload.offset : 0;
    const result = ingestLines({ store, clientId, loadId, lines, offset, lastSeq: seqByLoad.get(key) ?? 0, limits });
    seqByLoad.set(key, result.lastSeq);
    store.setMeta(`client:${clientId}`, {
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
    if (!CLIENT_ID.test(clientId ?? '') || !LOAD_ID.test(loadId ?? '')) {
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
    const streamId = `client:${clientId}`;
    const page = shortString(payload.page, 200) ?? '';
    const build = shortString(payload.build, BUILD_MAX);
    const loads = { ...(store.stream(streamId)?.meta?.loads ?? {}), [loadId]: { helloAt: now(), page, build } };
    const kept = Object.entries(loads)
      .sort(([, a], [, b]) => b.helloAt - a.helloAt)
      .slice(0, limits.helloMaxLoads);
    store.setMeta(streamId, { ua: shortString(payload.ua, 300) ?? '', build, loads: Object.fromEntries(kept) });
    store.reopen(streamId);
    for (const room of socket.rooms) {
      if (room === socket.id || room === NOT_A_ROOM) continue;
      store.link(clientId, room, { socketId: socket.id });
    }
    log.info('log', 'hello', { clientId, loadId, page, build });
    const key = `${clientId}/${loadId}`;
    for (const known of seqByLoad.keys()) {
      if (known !== key && store.stream(`client:${known.split('/')[0]}`) === null) seqByLoad.delete(known);
    }
    for (const known of clientLevels.keys()) {
      if (known !== clientId && store.stream(`client:${known}`) === null) clientLevels.delete(known);
    }
    ack({ ok: true, serverT: now(), level: levelForSocket(socket), acked: seqByLoad.get(key) ?? 0 });
  }

  function batch(socket, payload, ack) {
    const clientId = socket.data.logClientId;
    if (!clientId) return ack({ ok: false, reason: 'no_hello' });
    if (payload?.loadId !== socket.data.logLoadId) return ack({ ok: false, reason: 'bad_load' });
    if (!Array.isArray(payload.lines)) return ack({ ok: false, reason: 'bad_batch' });
    if (payload.lines.length > limits.ingestMaxLines) {
      log.warn('log', 'batch.refused', { clientId, reason: 'too_many', lines: payload.lines.length });
      return ack({ ok: false, reason: 'too_many' });
    }
    let window = windows.get(socket);
    if (!window || now() - window.start > limits.ingestWindowMs) {
      window = { start: now(), bytes: 0, warned: false };
      windows.set(socket, window);
    }
    for (const line of payload.lines) if (typeof line === 'string') window.bytes += line.length;
    if (window.bytes > limits.ingestWindowBytes) {
      if (!window.warned) {
        window.warned = true;
        log.warn('log', 'batch.refused', { clientId, reason: 'rate' });
      }
      return ack({ ok: false, reason: 'rate' });
    }
    store.reopen(`client:${clientId}`);
    const result = storeBatch({ clientId, loadId: socket.data.logLoadId, lines: payload.lines, payload });
    return ack({ ok: true, acked: result.lastSeq, bad: result.bad, level: levelForSocket(socket) });
  }

  function setLevel(socket, payload, ack) {
    const level = payload?.level;
    if (level !== 'debug' && level !== 'trace') return ack({ ok: false, reason: 'bad_request' });
    if (payload.roomId == null) return setClientLevel(socket, level, ack);
    // The lobby channel and a socket's own room are Socket.IO rooms too, but never a game room.
    const isGameRoom = typeof payload.roomId === 'string' && payload.roomId !== NOT_A_ROOM && payload.roomId !== socket.id;
    if (!isGameRoom || !socket.rooms.has(payload.roomId)) return ack({ ok: false, reason: 'bad_request' });
    if (level === 'trace') roomLevels.set(payload.roomId, 'trace');
    else roomLevels.delete(payload.roomId);
    const by = socket.data.logClientId ?? socket.id;
    io.to(payload.roomId).emit('log:level', { level, by });
    log.info('log', 'level', { level, by }, { room: payload.roomId });
    return ack({ ok: true, level });
  }

  function setClientLevel(socket, level, ack) {
    const clientId = socket.data.logClientId;
    if (!clientId) return ack({ ok: false, reason: 'no_hello' });
    if (level === 'trace') clientLevels.set(clientId, 'trace');
    else clientLevels.delete(clientId);
    socket.emit?.('log:level', { level: levelForSocket(socket), by: clientId });
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
      socket.on('log:hello', guarded((payload, ack) => hello(socket, payload, ack)));
      socket.on('log:batch', guarded((payload, ack) => batch(socket, payload, ack)));
      socket.on('log:ping', guarded((payload, ack) => ack({ t0: payload?.t0 ?? null, serverT: now() })));
      socket.on('log:setLevel', guarded((payload, ack) => setLevel(socket, payload, ack)));
      socket.on('disconnect', () => {
        try {
          if (socket.data.logClientId) store.close(`client:${socket.data.logClientId}`);
        } catch {
          // closing is best effort
        }
      });
    },
    beaconHandler(req, res) {
      try {
        const body = JSON.parse(typeof req.body === 'string' ? req.body : '');
        const { clientId, loadId, lines } = body ?? {};
        const valid = CLIENT_ID.test(clientId ?? '') && LOAD_ID.test(loadId ?? '');
        if (valid && Array.isArray(lines) && lines.length <= limits.ingestMaxLines) {
          if (store.stream(`client:${clientId}`)?.meta?.loads?.[loadId]) storeBatch({ clientId, loadId, lines, payload: body });
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
      try {
        const clientId = socket?.data?.logClientId;
        if (!clientId || tail?.loadId !== socket.data.logLoadId) return 0;
        if (!Array.isArray(tail.lines) || tail.lines.length > limits.ingestMaxLines) return 0;
        return storeBatch({ clientId, loadId: tail.loadId, lines: tail.lines, payload: tail }).stored;
      } catch {
        return 0;
      }
    },
  };
}
