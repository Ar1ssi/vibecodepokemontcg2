const MAX_ENTRIES = 800;
const STORAGE_KEY = 'ptcg-sim.sync-log.v1';

let sessionEnabled = false;
let seq = 0;
const entries = [];

export function isSyncLogEnabled() {
  if (sessionEnabled) return true;
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSyncLogEnabled(on) {
  sessionEnabled = !!on;
  try {
    if (on) {
      globalThis.localStorage?.setItem(STORAGE_KEY, '1');
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    /* node:test */
  }
}

/** Short hint summary safe for logs (no huge deck arrays). */
export function summarizeCardHint(hint) {
  if (!hint) return null;
  const parts = [];
  if (hint.name) parts.push(hint.name);
  if (typeof hint.syncInstance === 'number') parts.push(`#${hint.syncInstance}`);
  if (hint.number) parts.push(`n${hint.number}`);
  if (hint.set) parts.push(hint.set);
  return parts.join(' ') || null;
}

/** Trim moveCardBundle parameters for logging. */
export function summarizeMoveCardParams(parameters) {
  if (!parameters?.length) return {};
  const [
    initiator,
    oZoneId,
    dZoneId,
    index,
    targetIndex,
    action,
    cardHints,
  ] = parameters;
  return {
    initiator,
    from: oZoneId,
    to: dZoneId,
    index,
    targetIndex,
    action,
    moving: summarizeCardHint(cardHints?.moving),
    target: summarizeCardHint(cardHints?.target),
    isEvolution: cardHints?.isEvolution ?? false,
  };
}

/**
 * @param {{ event: string, dir?: 'in'|'out'|'local', detail?: object, counters?: { self?: number, opp?: number } }} payload
 */
export function syncLog(payload) {
  if (!isSyncLogEnabled()) return;

  const entry = {
    seq: ++seq,
    t: Date.now(),
    dir: payload.dir || 'local',
    event: payload.event,
    selfCounter: payload.counters?.self ?? null,
    oppCounter: payload.counters?.opp ?? null,
    detail: payload.detail ?? {},
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  const c = `[sync ${entry.seq} ${entry.dir}]`;
  console.info(`${c} ${entry.event}`, entry.detail);
}

export function clearSyncLog() {
  seq = 0;
  entries.length = 0;
}

export function getSyncLogEntries() {
  return [...entries];
}

function compareLinesFor(meta, list) {
  const who = meta.username || meta.clientTag || '?';
  return list.map((e) => formatCompareLine(who, e));
}

export function formatCompareLine(who, entry) {
  const ctr = `s${entry.selfCounter ?? '?'}/o${entry.oppCounter ?? '?'}`;
  const detail =
    entry.detail?.summary ||
    (entry.detail?.action && entry.detail?.counter != null
      ? `${entry.detail.action}@${entry.detail.counter}`
      : JSON.stringify(entry.detail));
  return `${who}\t${entry.seq}\t${entry.dir}\t${ctr}\t${entry.event}\t${detail}`;
}

/**
 * @param {{ username?: string, roomId?: string, socketId?: string, initiator?: string, selfCounter?: number, oppCounter?: number }} meta
 */
export function buildSyncLogExport(meta = {}, entryList = getSyncLogEntries()) {
  const snapshot = {
    meta: { exportedAt: new Date().toISOString(), ...meta },
    entries: [...entryList],
  };
  return {
    ...snapshot,
    compareHeader: 'client\tseq\tdir\tcounters\tevent\tdetail',
    compareLines: compareLinesFor(meta, snapshot.entries),
  };
}

/**
 * Merge local + remote client exports into one file with a unified timeline.
 * @param {ReturnType<typeof buildSyncLogExport>} localExport
 * @param {ReturnType<typeof buildSyncLogExport>[]} remoteExports
 */
export function buildCombinedSyncLogExport(localExport, remoteExports = []) {
  const clients = [localExport, ...remoteExports.filter(Boolean)];
  const timeline = [];

  for (const client of clients) {
    const who = client.meta?.username || client.meta?.socketId || '?';
    for (const entry of client.entries || []) {
      timeline.push({
        t: entry.t,
        who,
        entry,
        compareLine: formatCompareLine(who, entry),
      });
    }
  }

  timeline.sort((a, b) => a.t - b.t || String(a.who).localeCompare(String(b.who)));

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      combined: true,
      roomId: localExport.meta?.roomId || remoteExports[0]?.meta?.roomId || '',
      requester: localExport.meta?.username,
      clients: clients.map((c) => c.meta),
    },
    clients,
    compareHeader: 'client\tseq\tdir\tcounters\tevent\tdetail',
    compareLines: timeline.map((row) => row.compareLine),
    timeline: timeline.map(({ t, who, entry }) => ({
      t,
      who,
      seq: entry.seq,
      dir: entry.dir,
      selfCounter: entry.selfCounter,
      oppCounter: entry.oppCounter,
      event: entry.event,
      detail: entry.detail,
    })),
  };
}
