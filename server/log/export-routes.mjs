// `log:export` socket event, the one-time download route and the dev-only routes (design 088 §6).
import { randomBytes } from 'node:crypto';
import { gzip } from 'node:zlib';
import { LIMITS, LOG_EVENTS, LOG_ROUTES, isGameRoom } from '../../shared/log/log-schema.mjs';
import { logFileName } from '../../shared/log/export-format.mjs';
import { buildExport } from './export.mjs';
import { isRoomStream, roomIdOfStream, roomStreamId } from './log-store.mjs';

const MAX_TOKENS = 8;
const FILENAME_ROOM_CHARS = 40;

function sendLines(req, res, { lines, filename }) {
  const body = `${lines.join('\n')}\n`;
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  if (!req.acceptsEncodings('gzip')) {
    res.end(body);
    return;
  }
  gzip(body, (error, packed) => {
    if (error) {
      res.end(body);
      return;
    }
    res.setHeader('Content-Encoding', 'gzip');
    res.end(packed);
  });
}

function requestSnapshot(sock, exportId, limits, acceptTail) {
  return new Promise((resolve) => {
    try {
      sock.timeout(limits.snapshotTimeoutMs).emit(LOG_EVENTS.snapshot, { exportId }, (err, snap) => {
        if (err) return resolve('timeout');
        if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) return resolve('malformed');
        // The client's unshipped entries ride in the reply; store them, keep them out of the file.
        const { tail, ...snapshot } = snap;
        if (tail) acceptTail(sock, tail);
        return resolve(snapshot);
      });
    } catch {
      resolve('error');
    }
  });
}

export function createLogExport({
  store,
  log,
  io,
  journalFor,
  levelFor,
  build,
  netcode,
  describe,
  acceptTail = () => 0,
  now = Date.now,
  limits = LIMITS,
  randomToken = () => randomBytes(16).toString('hex'),
}) {
  const tokens = new Map();
  // An export walks every stream of a room and asks each client for a snapshot: one at a time
  // per socket, spaced out, and announced to a room at most once per interval.
  const inFlight = new WeakSet();
  const lastExportAt = new WeakMap();
  const lastAnnouncedAt = new Map();

  const filenameFor = (roomId) => logFileName((roomId ?? 'session').replace(/[^\w.-]+/g, '_').slice(0, FILENAME_ROOM_CHARS), now());

  function storeToken(entry) {
    for (const [token, held] of tokens) if (held.expires <= now()) tokens.delete(token);
    while (tokens.size >= MAX_TOKENS) tokens.delete(tokens.keys().next().value);
    const token = randomToken();
    tokens.set(token, entry);
    return token;
  }

  async function collectSnapshots(socket, roomId) {
    const targets = [];
    if (roomId) {
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        const sock = io.sockets.sockets.get(id);
        if (sock?.data?.logClientId) targets.push(sock);
      }
    } else {
      targets.push(socket);
    }
    const exportId = randomToken();
    const answers = await Promise.all(targets.map((sock) => requestSnapshot(sock, exportId, limits, acceptTail)));
    const snapshots = {};
    targets.forEach((sock, i) => {
      snapshots[sock.data.logClientId] = answers[i];
    });
    return snapshots;
  }

  async function exportFor(socket, payload) {
    const roomId = typeof payload?.roomId === 'string' && payload.roomId ? payload.roomId : null;
    if (roomId && (!isGameRoom(roomId, socket.id) || !socket.rooms.has(roomId))) return { ok: false, reason: 'not_in_room' };
    if (!roomId && !socket.data.logClientId) return { ok: false, reason: 'no_hello' };
    if (inFlight.has(socket)) return { ok: false, reason: 'busy' };
    if (now() - (lastExportAt.get(socket) ?? -Infinity) < limits.exportMinIntervalMs) return { ok: false, reason: 'too_soon' };
    inFlight.add(socket);
    lastExportAt.set(socket, now());
    try {
      return await buildAndStore(socket, payload, roomId);
    } finally {
      inFlight.delete(socket);
    }
  }

  function announce(roomId, username) {
    for (const [room, at] of lastAnnouncedAt) if (now() - at >= limits.exportAnnounceMs) lastAnnouncedAt.delete(room);
    if (lastAnnouncedAt.has(roomId)) return;
    lastAnnouncedAt.set(roomId, now());
    io.to(roomId).emit('appendMessage', {
      user: '',
      message: `${username ?? 'A player'} exported the match log.`,
      type: 'announcement',
      emit: false,
    });
  }

  async function buildAndStore(socket, payload, roomId) {
    const snapshots = await collectSnapshots(socket, roomId);
    const who = describe(socket.id, roomId);
    const lines = buildExport({
      store,
      journal: roomId ? journalFor(roomId) : null,
      snapshots,
      scope: roomId ? { roomId } : { clientId: socket.data.logClientId },
      requester: { clientId: socket.data.logClientId ?? null, ...who },
      note: payload?.note ?? '',
      build,
      netcode,
      now,
      levelFor,
      describe: (clientId, row) => describe(row?.socketId, roomId),
    });
    const filename = filenameFor(roomId);
    const token = storeToken({ lines, filename, expires: now() + limits.exportTokenMs });

    if (roomId) announce(roomId, who.username);
    log.info(
      'log',
      'export',
      { by: socket.data.logClientId ?? socket.id, records: lines.length, bytes: lines.reduce((sum, line) => sum + line.length, 0) },
      { room: roomId ?? undefined }
    );
    const header = JSON.parse(lines[0]);
    return {
      ok: true,
      url: `${LOG_ROUTES.exportDownload}${token}`,
      filename,
      sources: header.sources.map(({ src, snapshot }) => ({ src, snapshot })),
    };
  }

  return {
    attachSocket(socket) {
      socket.on(LOG_EVENTS.export, async (payload, maybeAck) => {
        const ack = typeof maybeAck === 'function' ? maybeAck : () => {};
        try {
          ack(await exportFor(socket, payload));
        } catch {
          try {
            ack({ ok: false, reason: 'error' });
          } catch {
            // the client went away
          }
        }
      });
    },
    downloadHandler(req, res) {
      const entry = tokens.get(req.params.token);
      tokens.delete(req.params.token);
      if (!entry || entry.expires <= now()) {
        res.status(404).end();
        return;
      }
      sendLines(req, res, entry);
    },
    devRoomsHandler(req, res) {
      const rooms = store
        .stats()
        .byStream.filter((stream) => isRoomStream(stream.id))
        .map(({ id, bytes, size, closedAt }) => {
          const roomId = roomIdOfStream(id);
          return { roomId, bytes, size, closedAt, participants: store.participants(roomId).length };
        });
      res.json({ rooms });
    },
    devExportHandler(req, res) {
      const roomId = String(req.query.room ?? '');
      if (!roomId || !store.stream(roomStreamId(roomId))) {
        res.status(404).end();
        return;
      }
      const snapshots = {};
      for (const { clientId } of store.participants(roomId)) snapshots[clientId] = 'not_requested';
      const lines = buildExport({
        store,
        journal: journalFor(roomId),
        snapshots,
        scope: { roomId },
        requester: { dev: true },
        build,
        netcode,
        now,
        levelFor,
        describe: (clientId, row) => describe(row?.socketId, roomId),
      });
      sendLines(req, res, { lines, filename: filenameFor(roomId) });
    },
  };
}
