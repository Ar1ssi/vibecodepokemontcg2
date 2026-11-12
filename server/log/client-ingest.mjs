// Server side of client log shipping (design 087 §5): hello/batch/ping/level sockets and the pagehide beacon.
import { LEVEL_RANK, LIMITS } from '../../shared/log/log-schema.mjs';

const CLIENT_ID = /^[0-9a-f]{16}$/;
const LOAD_ID = /^[0-9a-f]{8}$/;
const NOT_A_ROOM = 'lobby:watchers';

function parseLine(line, limits) {
  if (typeof line !== 'string' || line.length > limits.ingestMaxLineBytes) return null;
  if (line.includes('\n') || line.includes('\r')) return null;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.t !== 'number' || !Number.isFinite(entry.t)) return null;
  if (!Number.isInteger(entry.seq) || entry.seq <= 0) return null;
  if (typeof entry.lvl !== 'string' || !Object.hasOwn(LEVEL_RANK, entry.lvl)) return null;
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
    const ts = entry.t + offset;
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
  const windows = new WeakMap();

  const adapter = io.of('/').adapter;
  adapter.on('delete-room', (room) => roomLevels.delete(room));
  adapter.on('join-room', (room, id) => {
    if (roomLevels.get(room) === 'trace') io.to(id).emit('log:level', { level: 'trace', by: 'room' });
  });

  const levelFor = (roomId) => roomLevels.get(roomId) ?? 'debug';

  function levelForSocket(socket) {
    for (const room of socket.rooms ?? []) if (roomLevels.get(room) === 'trace') return 'trace';
    return 'debug';
  }

  function storeBatch({ clientId, loadId, lines, payload }) {
    const key = `${clientId}/${loadId}`;
    const offset = Number.isFinite(payload.offset) ? payload.offset : 0;
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
    socket.data.logClientId = clientId;
    socket.data.logLoadId = loadId;
    const streamId = `client:${clientId}`;
    const page = String(payload.page ?? '').slice(0, 200);
    const build = payload.build ?? null;
    const existing = store.stream(streamId)?.meta?.loads ?? {};
    store.setMeta(streamId, {
      ua: String(payload.ua ?? '').slice(0, 300),
      build,
      loads: { ...existing, [loadId]: { helloAt: now(), page, build } },
    });
    for (const room of socket.rooms) {
      if (room === socket.id || room === NOT_A_ROOM) continue;
      store.link(clientId, room, { socketId: socket.id });
    }
    log.info('log', 'hello', { clientId, loadId, page, build });
    const key = `${clientId}/${loadId}`;
    for (const known of seqByLoad.keys()) {
      if (known !== key && store.stream(`client:${known.split('/')[0]}`) === null) seqByLoad.delete(known);
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
    const result = storeBatch({ clientId, loadId: socket.data.logLoadId, lines: payload.lines, payload });
    return ack({ ok: true, acked: result.lastSeq, bad: result.bad, level: levelForSocket(socket) });
  }

  function setLevel(socket, payload, ack) {
    const level = payload?.level;
    if ((level !== 'debug' && level !== 'trace') || !socket.rooms.has(payload.roomId)) {
      return ack({ ok: false, reason: 'bad_request' });
    }
    if (level === 'trace') roomLevels.set(payload.roomId, 'trace');
    else roomLevels.delete(payload.roomId);
    const by = socket.data.logClientId ?? socket.id;
    io.to(payload.roomId).emit('log:level', { level, by });
    log.info('log', 'level', { level, by }, { room: payload.roomId });
    return ack({ ok: true, level });
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
  };
}
