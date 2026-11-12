// Server logging assembly: store, logger, taps, disk mirror. `LOG_OFF=1` builds an inert twin.
import { createLogger } from '../../shared/log/logger.mjs';
import { LIMITS } from '../../shared/log/log-schema.mjs';
import { createLogStore } from './log-store.mjs';
import { createDiskSink, resolveLogDir } from './disk-sink.mjs';
import { createServerLog } from './server-logger.mjs';
import { installProcessTap } from './process-tap.mjs';
import { httpLog } from './http-tap.mjs';
import { tapServer, tapSocket } from './socket-tap.mjs';
import { readBuild } from './build-info.mjs';
import { NO_JOURNAL, createJournal } from './journal.mjs';
import { createLogIngest } from './client-ingest.mjs';
import { createLogExport } from './export-routes.mjs';

const notFound = (req, res) => res.status(404).end();

function createInert(now) {
  const log = createLogger({ now, sink: () => {}, level: 'error' });
  return {
    enabled: false,
    store: null,
    log,
    forRoom: () => log,
    createJournal: () => NO_JOURNAL,
    journalFor: () => null,
    build: null,
    bootId: null,
    diskSink: null,
    httpMiddleware: (req, res, next) => next(),
    beaconHandler: (req, res) => res.status(204).end(),
    levelFor: () => 'debug',
    attachIo() {},
    attachSocket() {},
    exportDownloadHandler: notFound,
    devRoomsHandler: notFound,
    devExportHandler: notFound,
    shutdown() {},
  };
}

function totalBytesFrom(env) {
  const mb = Number(env.LOG_MAX_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1048576 : LIMITS.totalBytesDefault;
}

export function createServerLogging({
  env = process.env,
  repoRoot,
  now = Date.now,
  processRef = process,
  consoleRef = console,
} = {}) {
  if (env.LOG_OFF === '1') return createInert(now);

  const bootId = `${Date.now().toString(36)}-${process.pid}`;
  // Captured before the console is wrapped, so a disk warning is not re-logged as a console entry.
  const warnToConsole = (line) => consoleRef.warn(line);
  const logDir = resolveLogDir(env, repoRoot);
  const diskSink = logDir
    ? createDiskSink({
        dir: logDir,
        bootId,
        onWarn: ({ streamId, reason }) => warnToConsole(`[log] disk sink disabled for ${streamId}: ${reason}`),
      })
    : null;
  const store = createLogStore({ now, totalBytes: totalBytesFrom(env), sink: diskSink });
  const { log, forRoom } = createServerLog({ store, now });
  const uninstallProcessTap = installProcessTap({ log, diskSink, consoleRef, processRef });
  const journals = new Map();
  const sweepTimer = setInterval(() => {
    store.sweep();
    for (const roomId of journals.keys()) {
      if (!store.stream(`room:${roomId}`)) journals.delete(roomId);
    }
  }, LIMITS.sweepMs);
  sweepTimer.unref();
  const build = readBuild({ env, cwd: repoRoot });
  log.info('boot', 'start', { commit: build.commit, node: build.node, pid: process.pid, logDir: diskSink?.dir ?? null });

  let seatOf = () => null;
  let ingest = null;
  let exporter = null;
  const delegate = (name) => (req, res) => (exporter ? exporter[name](req, res) : notFound(req, res));
  return {
    enabled: true,
    store,
    log,
    forRoom,
    createJournal(roomId) {
      let journal = journals.get(roomId);
      if (!journal) {
        journal = createJournal({
          roomId,
          log: forRoom(roomId),
          onRecord: diskSink ? (line) => diskSink.write(`journal:${roomId}`, line) : null,
        });
        journals.set(roomId, journal);
      }
      return journal;
    },
    journalFor: (roomId) => journals.get(roomId) ?? null,
    build,
    bootId,
    diskSink,
    httpMiddleware: httpLog({ log }),
    beaconHandler: (req, res) => (ingest ? ingest.beaconHandler(req, res) : res.status(204).end()),
    levelFor: (roomId) => ingest?.levelFor(roomId) ?? 'debug',
    exportDownloadHandler: delegate('downloadHandler'),
    devRoomsHandler: delegate('devRoomsHandler'),
    devExportHandler: delegate('devExportHandler'),
    attachIo(io, options = {}) {
      if (options.seatOf) seatOf = options.seatOf;
      tapServer(io, { log, store, clientOf: (id) => io.sockets.sockets.get(id)?.data?.logClientId ?? null });
      ingest = createLogIngest({ store, log, io });
      exporter = createLogExport({
        store,
        log,
        io,
        journalFor: (roomId) => journals.get(roomId) ?? null,
        levelFor: (roomId) => ingest?.levelFor(roomId) ?? 'debug',
        build,
        netcode: options.netcode ?? null,
        describe: (socketId, roomId) => {
          const sock = socketId ? io.sockets.sockets.get(socketId) : null;
          return {
            username: sock?.data?.seat?.roomId === roomId ? (sock.data.seat.username ?? null) : null,
            seat: socketId && roomId ? seatOf(socketId, roomId) : null,
          };
        },
      });
    },
    attachSocket(socket) {
      tapSocket(socket, { log, seatOf: (id, room) => seatOf(id, room) });
      ingest?.attachSocket(socket);
      exporter?.attachSocket(socket);
    },
    shutdown() {
      clearInterval(sweepTimer);
      diskSink?.close();
      uninstallProcessTap();
    },
  };
}
