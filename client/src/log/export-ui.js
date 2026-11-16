// Export, mark and verbose-logging controls (design 088 §6), plus the "A problem was logged." toast.
import { LIMITS, LOG_FORMAT } from '../../../shared/log/log-schema.mjs';
import { clientId, clientRing, loadId, onEntry } from './client-log.js';
import { buildSnapshot, buildSnapshotSync, preloadSnapshotModules, preloadedSnapshotModules } from './snapshot.js';

const TOAST_VISIBLE_MS = 12000;
const LABEL_REFRESH_DELAY_MS = 300;
const NOTE_MAX = 500;
const HEADER_NOTE_MAX = 2000;

let socket = null;
let shipping = null;
let log = null;
let win = null;
let doc = null;
let systemState = null;
let lastToastAt = -Infinity;

const shortSrc = () => `c:${clientId.slice(0, 8)}`;

const utcStamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

function refreshLabel() {
  const el = doc?.getElementById('verboseLogging');
  if (!el || !log) return;
  el.textContent = `Verbose logging: ${log.level() === 'trace' ? 'on' : 'off'}`;
}

// The level itself is applied by ship.js's own `log:level` listener, which may run after this one.
function refreshLabelSoon() {
  refreshLabel();
  setTimeout(refreshLabel, LABEL_REFRESH_DELAY_MS);
}

function download({ href, filename }) {
  const link = doc.createElement('a');
  link.href = href;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  link.remove();
}

function showToast() {
  const toast = doc.createElement('div');
  toast.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;gap:8px;align-items:center;' +
    'padding:10px 12px;background:#222;color:#fff;font:13px sans-serif;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.5)';
  const text = doc.createElement('span');
  text.textContent = 'A problem was logged.';
  const exportButton = doc.createElement('button');
  exportButton.textContent = 'Export log';
  exportButton.addEventListener('click', () => {
    toast.remove();
    exportFullLog().catch(() => {});
  });
  const dismiss = doc.createElement('button');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => toast.remove());
  toast.append(text, exportButton, dismiss);
  doc.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_VISIBLE_MS);
}

function maybeToast(entry) {
  const problem = entry.lvl === 'error' || (entry.cat === 'sync' && entry.ev === 'desync.detected');
  if (!problem) return;
  if (win.location?.search?.includes('e2e=1') || win.location?.href?.includes('e2e=1')) return;
  const at = Date.now();
  if (at - lastToastAt < LIMITS.toastMinMs) return;
  lastToastAt = at;
  showToast();
}

// One synchronous step when the modules are preloaded (the normal case): the server waits a
// bounded time, and a janking tab gets few turns. The unshipped tail rides in the same reply.
async function answerSnapshot(ack) {
  const modules = preloadedSnapshotModules() ?? (await preloadSnapshotModules());
  const snapshot = buildSnapshotSync({ win, doc, modules });
  const tail = shipping?.tail?.() ?? null;
  ack(tail && tail.lines.length > 0 ? { ...snapshot, tail } : snapshot);
}

function preloadWhenLoaded() {
  const start = () => preloadSnapshotModules().catch(() => {});
  if (doc.readyState === 'complete') start();
  else win.addEventListener('load', start, { once: true });
}

export function initExport({ socket: appSocket = null, shipping: shipper = null, log: logger, win: w = window, doc: d = document }) {
  socket = appSocket;
  shipping = shipper;
  log = logger;
  win = w;
  doc = d;
  systemState = null;
  lastToastAt = -Infinity;

  if (socket) {
    import('../state.js')
      .then((state) => {
        systemState = state.systemState;
      })
      .catch((error) => log.warn('log', 'export.state_import_failed', { error }));
    socket.on('log:snapshot', (payload, ack) => {
      if (typeof ack !== 'function') return;
      answerSnapshot(ack).catch(() => ack(null));
    });
    socket.on('log:level', refreshLabelSoon);
  }
  onEntry(maybeToast);
  refreshLabel();
  if (socket) preloadWhenLoaded();
}

export async function exportLocal(note = '') {
  const src = shortSrc();
  const offset = shipping?.state().offset ?? 0;
  const snapshot = await buildSnapshot();
  const header = {
    k: 'header',
    format: LOG_FORMAT,
    partial: 'local-only',
    exportedAt: new Date().toISOString(),
    note: String(note).slice(0, HEADER_NOTE_MAX),
    room: null,
    sources: [
      {
        src,
        clientId,
        loadIds: [loadId],
        entries: clientRing.size(),
        firstSeq: clientRing.firstSeq(),
        dropped: clientRing.dropped(),
        snapshot: 'ok',
      },
    ],
    legend: { cli: 'node tools/log.mjs summary <file>' },
  };
  const lines = [JSON.stringify(header), JSON.stringify({ k: 'snap', src, ...snapshot })];
  for (const entry of clientRing.toArray()) {
    lines.push(`{"k":"e","ts":${entry.t + offset},"src":${JSON.stringify(src)},"load":${JSON.stringify(loadId)},${entry.line.slice(1)}`);
  }
  const filename = `ptcg-log_local_${utcStamp(Date.now())}.ndjson`;
  const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'application/x-ndjson' }));
  try {
    download({ href: url, filename });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { ok: true, mode: 'local', filename };
}

function requestServerExport(note) {
  return new Promise((resolve) => {
    socket.timeout(LIMITS.exportAckMs + LIMITS.snapshotTimeoutMs).emit(
      'log:export',
      { roomId: systemState?.roomId || null, note },
      (err, ack) => resolve({ err, ack })
    );
  });
}

// The server answering "not now" (an export already running, or one seconds ago): the file from
// that export is the answer, so no local-only file is produced on top of it.
const NOT_NOW = new Set(['busy', 'too_soon']);

/** @param {string | { note?: string }} [options] a note, or `{ note }` */
export async function exportFullLog(options = {}) {
  const note = typeof options === 'string' ? options : (options?.note ?? '');
  log.info('user', 'export.request', { note: String(note).slice(0, NOTE_MAX) });
  if (!socket?.connected) return exportLocal(note);
  await shipping?.flushNow();
  const { err, ack } = await requestServerExport(note);
  if (err || !ack?.ok) {
    const reason = err ? 'timeout' : (ack?.reason ?? 'refused');
    log.warn('log', 'export.failed', { reason });
    if (NOT_NOW.has(reason)) return { ok: false, mode: 'none', reason };
    return exportLocal(note);
  }
  download({ href: ack.url, filename: ack.filename });
  return { ok: true, mode: 'server', filename: ack.filename };
}

export function markMoment(note = '') {
  log.info('user', 'mark', { note: String(note).slice(0, NOTE_MAX) });
  shipping?.flushNow();
}

/**
 * Sets the capture level. With a server it is the server's to hold (room-wide in a room,
 * per client outside one) — a level set only locally would be reset by the next batch ack.
 */
export function setVerbose(level) {
  if (level !== 'debug' && level !== 'trace') return log.level();
  if (socket?.connected) socket.emit('log:setLevel', { roomId: systemState?.roomId || null, level });
  else log.setLevel(level);
  refreshLabelSoon();
  return level;
}

export function toggleVerbose() {
  return setVerbose(log.level() === 'trace' ? 'debug' : 'trace');
}
