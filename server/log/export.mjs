// Builds the export file (design 087 §6): header, journal, state ring, client snapshots, merged timeline.
// Pure: reads the store and journal it is given, returns one JSON record per array element.
import { LOG_FORMAT } from '../../shared/log/log-schema.mjs';

const SERVER_WINDOW_MS = 60000;
const PREFIX_FIELDS = /^\{"t":[^,]*,"seq":\d+,"lvl":"([^"]*)","cat":"([^"]*)"/;

const LEGEND = Object.freeze({
  record: 'k = header | journal | state | snap | e',
  e: 'ts = server-aligned ms; src = server or c:<client>; t = source clock ms; seq = per-source counter; lvl; cat; ev; room; seat; sv = stateVersion; cs = clientSeq; d = detail',
  journal: 'rec.k = rebase | rng | cmd — replayable with: node tools/log.mjs replay <file>',
  cli: 'node tools/log.mjs summary <file>',
});

export function findGaps(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const load = entry.load ?? null;
    if (!groups.has(load)) groups.set(load, []);
    groups.get(load).push(entry.seq);
  }
  const gaps = [];
  for (const [load, seqs] of groups) {
    seqs.sort((a, b) => a - b);
    if (seqs[0] > 1) gaps.push({ load, from: 1, to: seqs[0] - 1 });
    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i] > seqs[i - 1] + 1) gaps.push({ load, from: seqs[i - 1] + 1, to: seqs[i] - 1 });
    }
  }
  return gaps;
}

function compareTimeline(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  const serverA = a.src === 'server';
  if (serverA !== (b.src === 'server')) return serverA ? -1 : 1;
  if (a.src !== b.src) return a.src < b.src ? -1 : 1;
  return a.seq - b.seq;
}

function sortedTimeline(sources) {
  const rows = [];
  for (const { src, entries } of sources) {
    for (const entry of entries) rows.push({ ...entry, src });
  }
  return rows.sort(compareTimeline);
}

function timelineLine({ ts, src, load, line }) {
  const loadPart = load ? `,"load":${JSON.stringify(load)}` : '';
  return `{"k":"e","ts":${ts},"src":${JSON.stringify(src)}${loadPart},${line.slice(1)}`;
}

export function mergeTimeline(sources) {
  return sortedTimeline(sources).map(timelineLine);
}

function countLines(timeline) {
  const byLevel = {};
  const byCat = {};
  for (const { line } of timeline) {
    const match = PREFIX_FIELDS.exec(line);
    if (!match) continue;
    byLevel[match[1]] = (byLevel[match[1]] ?? 0) + 1;
    byCat[match[2]] = (byCat[match[2]] ?? 0) + 1;
  }
  return { entries: timeline.length, byLevel, byCat };
}

function stateLines(journal) {
  const bySv = new Map();
  for (const { sv, state } of journal.states()) bySv.set(sv, state);
  return [...bySv].map(([sv, state]) =>
    JSON.stringify({ k: 'state', sv, state: { ...state, commandLog: undefined, commandLogLength: state.commandLog?.length ?? 0 } })
  );
}

function gatherClients({ store, scope }) {
  const rows = scope.roomId == null ? [{ clientId: scope.clientId }] : store.participants(scope.roomId);
  const clients = [];
  for (const row of rows) {
    const stream = store.stream(`client:${row.clientId}`);
    if (!stream) continue;
    clients.push({ row, stream, src: `c:${row.clientId.slice(0, 8)}`, entries: stream.entries() });
  }
  return clients;
}

export function buildExport({
  store,
  journal = null,
  snapshots = {},
  scope,
  requester = {},
  note = '',
  build = null,
  netcode = null,
  now = Date.now,
  describe = () => ({}),
  levelFor = () => 'debug',
}) {
  const roomStream = scope.roomId == null ? null : store.stream(`room:${scope.roomId}`);
  const roomEntries = roomStream?.entries() ?? [];
  const clients = gatherClients({ store, scope });

  let from = Infinity;
  for (const entry of roomEntries) from = Math.min(from, entry.ts);
  for (const client of clients) for (const entry of client.entries) from = Math.min(from, entry.ts);
  if (from === Infinity) from = now() - SERVER_WINDOW_MS;

  const serverStream = store.stream('server');
  const serverEntries = [
    ...roomEntries,
    ...(serverStream?.entries() ?? []).filter((entry) => entry.ts >= from - SERVER_WINDOW_MS),
  ];

  const serverSource = {
    src: 'server',
    entries: serverEntries.length,
    dropped: (roomStream?.dropped ?? 0) + (serverStream?.dropped ?? 0),
  };
  const buildByClient = {};
  const snapLines = [];
  const clientRows = clients.map(({ row, stream, src, entries }) => {
    const meta = stream.meta ?? {};
    const snapshot = snapshots[row.clientId];
    const { username = null, seat = null } = describe(row.clientId, row) ?? {};
    buildByClient[src] = meta.build ?? null;
    if (snapshot !== null && typeof snapshot === 'object') snapLines.push(JSON.stringify({ k: 'snap', src, ...snapshot }));
    return {
      src,
      clientId: row.clientId,
      username,
      seat,
      loadIds: Object.keys(meta.loads ?? {}),
      ua: meta.ua ?? null,
      level: levelFor(scope.roomId),
      offset: meta.offset ?? null,
      rtt: meta.rtt ?? null,
      entries: entries.length,
      firstSeq: stream.firstSeq,
      dropped: stream.dropped,
      gaps: findGaps(entries),
      snapshot: snapshot !== null && typeof snapshot === 'object' ? 'ok' : (snapshot ?? 'offline'),
    };
  });

  const merged = sortedTimeline([
    { src: 'server', entries: serverEntries },
    ...clients.map(({ src, entries }) => ({ src, entries })),
  ]);
  const firstError = merged.find((entry) => entry.lvl === 'error');
  const lines = merged.map(timelineLine);

  const header = {
    k: 'header',
    format: LOG_FORMAT,
    exportedAt: new Date(now()).toISOString(),
    requester,
    note: String(note).slice(0, 2000),
    room: scope.roomId ?? null,
    netcode,
    build: { server: build?.commit ?? null, clients: buildByClient },
    range: merged.length ? { from: merged[0].ts, to: merged[merged.length - 1].ts } : { from: null, to: null },
    counts: countLines(merged),
    firstError: firstError ? { ts: firstError.ts, src: firstError.src, seq: firstError.seq } : null,
    sources: [serverSource, ...clientRows],
    journal: journal ? journal.stats() : null,
    legend: LEGEND,
  };

  const journalLines = journal
    ? journal.games().flatMap((game) => game.records.map((record) => `{"k":"journal","rec":${record}}`))
    : [];
  return [JSON.stringify(header), ...journalLines, ...(journal ? stateLines(journal) : []), ...snapLines, ...lines];
}
