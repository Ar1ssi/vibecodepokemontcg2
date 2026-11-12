// Drives the batcher over the app socket (design 087 §5). Nothing here may throw or log its own traffic.
import { createBatcher } from '../../../shared/log/batcher.mjs';
import { createClockSync } from '../../../shared/log/clock-sync.mjs';
import { LIMITS } from '../../../shared/log/log-schema.mjs';

const TICK_MS = 250;
const FLUSH_WAIT_MS = 1500;
const ACK_TIMEOUT_MS = 5000;
const BATCH_TIMEOUT_MS = 10000;
const BEACON_ENVELOPE_BYTES = 512;

export function startShipping({ socket, log, ring, onEntry, clientId, loadId, win = window, doc = document, nav = navigator }) {
  const now = () => performance.timeOrigin + performance.now();
  const batcher = createBatcher();
  const clock = createClockSync({ keep: LIMITS.clockKeep });
  let pingTimer = null;
  let pingsLeftFast = 0;
  let waiting = [];

  const swallow = (fn) => (...args) => {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  };

  function settleWaiting(ok) {
    const done = waiting;
    waiting = [];
    for (const resolve of done) resolve(ok);
  }

  function stopPings() {
    clearTimeout(pingTimer);
    pingTimer = null;
  }

  const ping = swallow(() => {
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'log:ping',
      { t0: now() },
      swallow((err, res) => {
        if (!err && res) clock.sample({ t0: res.t0, t1: now(), serverT: res.serverT });
      })
    );
  });

  function schedulePing() {
    stopPings();
    const fast = pingsLeftFast > 0;
    pingTimer = setTimeout(
      swallow(() => {
        if (fast) pingsLeftFast -= 1;
        if (!socket.connected) return;
        ping();
        schedulePing();
      }),
      fast ? LIMITS.pingFastMs : LIMITS.pingMs
    );
  }

  const send = swallow(() => {
    const batch = batcher.take(ring, now());
    if (!batch) return;
    socket.timeout(BATCH_TIMEOUT_MS).emit(
      'log:batch',
      { loadId, lines: batch.lines, offset: clock.offset(), rtt: clock.rtt() },
      swallow((err, ack) => {
        if (err) batcher.failed('timeout', now());
        else if (!ack?.ok) batcher.failed(ack?.reason ?? 'refused', now());
        else {
          // An ok ack settles the whole batch: a line the server refused is refused for good,
          // and re-sending it every flush would never end.
          batcher.acked(Math.max(Number(ack.acked) || 0, batch.to), now());
          if (ack.level && ack.level !== log.level()) log.setLevel(ack.level);
        }
        settleWaiting(Boolean(!err && ack?.ok));
      })
    );
  });

  const hello = swallow(() => {
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'log:hello',
      {
        v: 1,
        clientId,
        loadId,
        page: win.location.pathname,
        build: win.__PTCG_BUILD ?? null,
        ua: nav.userAgent,
        t: now(),
      },
      swallow((err, ack) => {
        if (err || !ack?.ok) {
          log.debug('log', 'hello.refused', { reason: err ? 'timeout' : (ack?.reason ?? null) });
          return;
        }
        batcher.onConnect(Number(ack.acked) || 0);
        if (ack.level) log.setLevel(ack.level);
        pingsLeftFast = LIMITS.pingFastCount;
        schedulePing();
      })
    );
  });

  const onDisconnect = swallow(() => {
    batcher.onDisconnect();
    stopPings();
    settleWaiting(false);
  });

  const onLevel = swallow(({ level, by } = {}) => {
    if (level !== 'debug' && level !== 'trace') return;
    log.setLevel(level);
    log.info('log', 'level', { level, by: by ?? null });
  });

  const onVisibility = swallow(() => {
    if (doc.visibilityState !== 'hidden') return;
    batcher.force();
    send();
  });

  const onPageHide = swallow(() => {
    const lines = batcher.unacked(ring, LIMITS.beaconMaxBytes - BEACON_ENVELOPE_BYTES);
    if (lines.length === 0) return;
    nav.sendBeacon?.('/api/log/beacon', JSON.stringify({ clientId, loadId, lines, offset: clock.offset(), rtt: clock.rtt() }));
  });

  const unsubscribe = onEntry(swallow((e) => batcher.note({ seq: e.seq, lvl: e.lvl }, now())));
  const tick = setInterval(
    swallow(() => {
      if (batcher.due(now())) send();
    }),
    TICK_MS
  );

  socket.on('connect', hello);
  socket.on('disconnect', onDisconnect);
  socket.on('log:level', onLevel);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  if (socket.connected) hello();

  return {
    flushNow() {
      return new Promise((resolve) => {
        try {
          if (batcher.pending() === 0 && !batcher.state().inFlight) return resolve(true);
          if (!batcher.state().connected) return resolve(false);
          const timer = setTimeout(() => settle(false), FLUSH_WAIT_MS);
          const settle = (ok) => {
            clearTimeout(timer);
            waiting = waiting.filter((fn) => fn !== settle);
            resolve(ok);
          };
          waiting.push(settle);
          batcher.force();
          send();
          if (batcher.pending() === 0 && !batcher.state().inFlight) settle(true);
        } catch {
          resolve(false);
        }
      });
    },
    state: () => ({ ...batcher.state(), offset: clock.offset(), rtt: clock.rtt() }),
    /** The entries the server has not acked yet, in `log:batch` shape, to ride inside a snapshot reply. */
    tail: () => ({
      loadId,
      lines: batcher.unacked(ring, LIMITS.batchMaxBytes),
      offset: clock.offset(),
      rtt: clock.rtt(),
    }),
    stop() {
      clearInterval(tick);
      stopPings();
      unsubscribe?.();
      socket.off?.('connect', hello);
      socket.off?.('disconnect', onDisconnect);
      socket.off?.('log:level', onLevel);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pagehide', onPageHide);
      settleWaiting(false);
    },
  };
}
