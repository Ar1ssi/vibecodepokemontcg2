// Pure helpers behind tools/log.mjs (design 087 §7): load an export file or a disk-sink boot
// directory, and answer questions about it. No printing, no process.exit.
import fs from 'node:fs';
import path from 'node:path';
import { replayJournal } from '../server/log/replay.mjs';

const SIDES = ['you', 'them'];
const BAD_LEVELS = ['error', 'warn'];

// Same sanitizing as server/log/disk-sink.mjs `fileNameOf`.
const sanitize = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_');

function parseLines(text) {
  const records = [];
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { records, badLines };
}

const compareEntries = (a, b) => {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.src !== b.src) {
    if (a.src === 'server') return -1;
    if (b.src === 'server') return 1;
    return a.src < b.src ? -1 : 1;
  }
  return (a.seq ?? 0) - (b.seq ?? 0);
};

function loadFile(file) {
  const { records, badLines } = parseLines(fs.readFileSync(file, 'utf8'));
  const data = { header: null, journal: [], states: [], snaps: [], timeline: [], source: 'file', badLines };
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (record.k === 'header') data.header ??= record;
    else if (record.k === 'journal' && record.rec) data.journal.push(record.rec);
    else if (record.k === 'state') data.states.push({ sv: record.sv, state: record.state });
    else if (record.k === 'snap') data.snaps.push(record);
    else if (record.k === 'e') data.timeline.push(record);
  }
  return data;
}

function loadDir(dir, { room } = {}) {
  const wantedRoom = room ? sanitize(room) : null;
  const data = { header: null, journal: [], states: [], snaps: [], timeline: [], source: 'dir', badLines: 0 };
  const counts = new Map();
  const readInto = (name, onRecord) => {
    const { records, badLines } = parseLines(fs.readFileSync(path.join(dir, name), 'utf8'));
    data.badLines += badLines;
    for (const record of records) if (record && typeof record === 'object') onRecord(record);
  };
  const addEntry = (src, entry) => {
    data.timeline.push(entry);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  };

  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.ndjson')) continue;
    if (name === 'server.ndjson' || (name.startsWith('room_') && (!wantedRoom || name === `room_${wantedRoom}.ndjson`))) {
      readInto(name, (r) => addEntry('server', { ...r, src: 'server', ts: r.t }));
    } else if (name.startsWith('client_')) {
      const src = `c:${name.slice('client_'.length, -'.ndjson'.length).slice(0, 8)}`;
      readInto(name, (r) => addEntry(src, { ...r, src }));
    } else if (name.startsWith('journal_') && (!wantedRoom || name === `journal_${wantedRoom}.ndjson`)) {
      readInto(name, (r) => data.journal.push(r));
    }
  }
  data.timeline.sort(compareEntries);
  data.header = {
    k: 'header',
    partial: 'disk',
    sources: [...counts].map(([src, entries]) => ({ src, entries })),
    range: { from: data.timeline[0]?.ts ?? null, to: data.timeline.at(-1)?.ts ?? null },
    counts: { entries: data.timeline.length },
  };
  return data;
}

export function loadExport(target, options = {}) {
  const stat = fs.statSync(target);
  return stat.isDirectory() ? loadDir(target, options) : loadFile(target);
}

const pad = (text, width) => String(text).padEnd(width);

export function formatEntry(entry, baseTs) {
  const rel = (entry.ts - baseTs).toFixed(1);
  let line = `+${rel.padStart(9)} ${pad(entry.src, 10)} ${pad(entry.lvl, 5)} ${entry.cat}/${entry.ev}`;
  if (entry.sv !== undefined) line += ` sv=${entry.sv}`;
  if (entry.cs !== undefined) line += ` cs=${entry.cs}`;
  if (entry.seat !== undefined) line += ` seat=${entry.seat}`;
  if (entry.d !== undefined) line += ` ${cut(JSON.stringify(entry.d), 160)}`;
  return line;
}

const cut = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

const sourcesOf = (data) => data.header?.sources ?? [];

export function seatOfSrc(data, src) {
  return sourcesOf(data).find((s) => s.src === src)?.seat ?? null;
}

export function srcOfSeat(data, seat) {
  return sourcesOf(data).find((s) => s.seat === seat)?.src ?? null;
}

function countBy(entries, keyOf) {
  const counts = new Map();
  for (const entry of entries) counts.set(keyOf(entry), (counts.get(keyOf(entry)) ?? 0) + 1);
  return counts;
}

function sourceLine(source) {
  const parts = [`  ${source.src}`];
  if (source.username) parts.push(source.username);
  if (source.seat) parts.push(`seat=${source.seat}`);
  parts.push(`entries=${source.entries ?? 0}`);
  parts.push(`dropped=${source.dropped ?? 0}`);
  parts.push(`gaps=${source.gaps?.length ?? 0}`);
  if (source.snapshot) parts.push(`snapshot=${source.snapshot}`);
  if (typeof source.offset === 'number') parts.push(`offset=${source.offset.toFixed(1)}ms`);
  if (typeof source.rtt === 'number') parts.push(`rtt=${source.rtt.toFixed(1)}ms`);
  return parts.join(' ');
}

function lastSvLines(data) {
  const lines = [];
  for (const source of sourcesOf(data)) {
    const svs = data.timeline.filter((e) => e.src === source.src && Number.isInteger(e.sv)).map((e) => e.sv);
    const snap = data.snaps.find((s) => s.src === source.src);
    const parts = [`  last sv ${source.src}=${svs.length ? Math.max(...svs) : '-'}`];
    if (snap) parts.push(`snapshot lastRenderedVersion=${snap.netcode?.lastRenderedVersion ?? '-'}`);
    lines.push(parts.join(' '));
  }
  return lines;
}

export function summarize(data) {
  const { header } = data;
  const lines = [];
  if (header?.partial) lines.push(`partial export (${header.partial}): no snapshots, states or build info`);
  lines.push(`exported: ${header?.exportedAt ?? 'unknown'}`);
  lines.push(`room: ${header?.room ?? 'unknown'}`);
  lines.push(`netcode: ${header?.netcode ?? 'unknown'}`);
  lines.push(`server build: ${header?.build?.server ?? 'unknown'}`);
  lines.push('sources:');
  for (const source of sourcesOf(data)) lines.push(sourceLine(source));

  const byLevel = [...countBy(data.timeline, (e) => e.lvl)].map(([lvl, n]) => `${lvl}=${n}`).join(' ');
  lines.push(`entries: ${data.timeline.length} (${byLevel})`);
  const top = [...countBy(data.timeline, (e) => `${e.cat}/${e.ev}`)].sort((a, b) => b[1] - a[1]).slice(0, 10);
  lines.push('top events:');
  for (const [name, n] of top) lines.push(`  ${n} ${name}`);

  const complete = header?.journal?.complete ?? data.journal.length > 0;
  const games = header?.journal?.games ?? new Set(data.journal.map((r) => r.game)).size;
  lines.push(`journal: games=${games} records=${data.journal.length} complete=${complete}`);
  lines.push('last sv per source:');
  lines.push(...lastSvLines(data));

  const bad = selectErrors(data, { warn: true }).slice(0, 10);
  lines.push('first errors and warnings:');
  if (bad.length === 0) lines.push('  none');
  const base = data.timeline[0]?.ts ?? 0;
  for (const entry of bad) lines.push(formatEntry(entry, base));
  return lines;
}

export function selectErrors(data, { warn = false } = {}) {
  const wanted = warn ? BAD_LEVELS : ['error'];
  return data.timeline.filter((e) => wanted.includes(e.lvl));
}

export function parseCs(text) {
  const match = /^(?:(p[12])#)?(\d+)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  return { seat: match[1] ?? null, cs: Number(match[2]) };
}

function entrySeat(data, entry) {
  return entry.seat ?? seatOfSrc(data, entry.src);
}

export function selectAround(data, { sv, cs, ts, mark = false, windowMs = 5000 }) {
  let anchor;
  if (sv !== undefined && sv !== null) {
    anchor = data.timeline.find((e) => e.sv === sv);
  } else if (cs !== undefined && cs !== null) {
    const seat = typeof cs === 'object' ? cs.seat : null;
    const number = typeof cs === 'object' ? cs.cs : cs;
    anchor = data.timeline.find((e) => e.cs === number && (!seat || entrySeat(data, e) === seat));
  } else if (ts !== undefined && ts !== null) {
    anchor = { ts };
  } else if (mark) {
    anchor = data.timeline.findLast((e) => e.cat === 'user' && e.ev === 'mark');
  } else {
    return { error: 'give one of sv, cs, ts or mark' };
  }
  if (!anchor) return { error: 'no entry matches that anchor' };
  const entries = data.timeline.filter((e) => Math.abs(e.ts - anchor.ts) <= windowMs);
  return { anchorTs: anchor.ts, entries };
}

const isCmdEmit = (e, cs) => e.cat === 'cmd' && e.ev === 'emit' && e.cs === cs;

function findClientEmit(data, { seat, cs }) {
  const wantedSrc = seat ? srcOfSeat(data, seat) : null;
  return data.timeline.find((e) => isCmdEmit(e, cs) && (seat ? e.src === wantedSrc : e.src !== 'server'));
}

const SERVER_CMD_EVENTS = new Set(['in.cmd', 'in.resolveChoice']);

function isServerStep(e, cs, seat) {
  if (e.src !== 'server' || e.cs !== cs) return false;
  if (seat && e.seat && e.seat !== seat) return false;
  if (e.cat === 'socket') return SERVER_CMD_EVENTS.has(e.ev);
  if (e.cat === 'cmd') return e.ev === 'refused' || e.ev === 'dedupe';
  return e.cat === 'engine' && (e.ev === 'applied' || e.ev === 'rejected');
}

function fxBetweenViews(data, src, sv) {
  const views = data.timeline.filter((e) => e.src === src && e.cat === 'view' && e.ev === 'apply');
  const start = views.findIndex((e) => e.sv === sv);
  if (start < 0) return [];
  const from = views[start].ts;
  const to = views[start + 1]?.ts ?? Infinity;
  return data.timeline.filter((e) => e.src === src && e.cat === 'fx' && e.ts >= from && e.ts < to).slice(0, 20);
}

export function traceCommand(data, { seat = null, cs }) {
  const emit = findClientEmit(data, { seat, cs });
  const serverSteps = data.timeline.filter((e) => isServerStep(e, cs, seat));
  if (!emit && serverSteps.length === 0) return { steps: [], error: 'no command with that clientSeq' };

  const steps = new Set(serverSteps);
  const clientSrc = emit?.src ?? (seat ? srcOfSeat(data, seat) : null);
  if (emit) {
    steps.add(emit);
    const inputs = data.timeline.filter((e) => e.src === emit.src && e.cat === 'input' && e.ts < emit.ts && emit.ts - e.ts <= 1500);
    for (const input of inputs.slice(-3)) steps.add(input);
  }
  if (clientSrc) {
    for (const e of data.timeline) {
      if (e.src === clientSrc && e.cs === cs && e.cat === 'socket' && (e.ev === 'out.cmd' || e.ev === 'out.resolveChoice')) steps.add(e);
    }
  }

  const applied = serverSteps.find((e) => e.cat === 'engine' && e.ev === 'applied');
  const sv = applied?.sv ?? null;
  if (sv !== null) {
    for (const e of data.timeline) if (e.sv === sv) steps.add(e);
    for (const source of sourcesOf(data)) {
      if (source.src === 'server') continue;
      for (const fx of fxBetweenViews(data, source.src, sv)) steps.add(fx);
    }
  }
  return { steps: [...steps].sort(compareEntries), sv };
}

export function replayExport(data, engine, { to = Infinity } = {}) {
  return replayJournal(data.journal, { ...engine, to });
}

const finding = (src, seat, sv, kind, detail) => ({ src, seat, sv, kind, detail });

function serverStateAt(data, engine, sv) {
  const recorded = data.states.find((s) => s.sv === sv);
  if (recorded) return { state: recorded.state };
  if (data.journal.length > 0) {
    const replayed = replayExport(data, engine, { to: sv });
    if (replayed.state?.stateVersion === sv) return { state: replayed.state };
  }
  const known = data.states.map((s) => s.sv);
  const range = known.length ? `${Math.min(...known)}..${Math.max(...known)}` : 'none';
  return { error: range };
}

const zoneArrays = (view, side) =>
  Object.entries(view?.[side]?.zones ?? {}).filter(([, cards]) => Array.isArray(cards));

const idsOf = (cards) => cards.map((c) => c?.instanceId).filter((id) => id !== undefined && id !== null);

function compareZones(src, seat, sv, serverView, clientView) {
  const findings = [];
  for (const side of SIDES) {
    const names = new Set([...zoneArrays(serverView, side), ...zoneArrays(clientView, side)].map(([name]) => name));
    for (const zone of names) {
      const server = idsOf(serverView?.[side]?.zones?.[zone] ?? []);
      const client = idsOf(clientView?.[side]?.zones?.[zone] ?? []);
      const clientSet = new Set(client);
      const serverSet = new Set(server);
      const missing = server.filter((id) => !clientSet.has(id));
      const extra = client.filter((id) => !serverSet.has(id));
      if (missing.length) findings.push(finding(src, seat, sv, 'missing-on-client', { side, zone, ids: missing }));
      if (extra.length) findings.push(finding(src, seat, sv, 'extra-on-client', { side, zone, ids: extra }));
      const sameSet = !missing.length && !extra.length;
      if (sameSet && server.some((id, i) => id !== client[i])) {
        findings.push(finding(src, seat, sv, 'order', { side, zone, server, client }));
      }
    }
  }
  return findings;
}

function compareRegistry(src, seat, sv, clientView, registry) {
  const findings = [];
  const rows = new Map((registry ?? []).map((row) => [row.id, row]));
  for (const side of SIDES) {
    for (const [zone, cards] of zoneArrays(clientView, side)) {
      for (const id of idsOf(cards)) {
        const row = rows.get(id);
        if (!row) findings.push(finding(src, seat, sv, 'not-rendered', { id, view: `${side}.${zone}` }));
        else if (row.connected === false) findings.push(finding(src, seat, sv, 'detached', { id, view: `${side}.${zone}` }));
        else if (row.side !== side || row.zone !== zone) {
          findings.push(finding(src, seat, sv, 'wrong-zone', { id, view: `${side}.${zone}`, rendered: `${row.side}.${row.zone}` }));
        }
      }
    }
  }
  return findings;
}

export function diffView(data, engine, { seat = null } = {}) {
  const findings = [];
  for (const snap of data.snaps) {
    const snapSeat = seatOfSrc(data, snap.src);
    if (seat && snapSeat !== seat) continue;
    const sv = snap.netcode?.lastRenderedVersion ?? null;
    const clientView = snap.netcode?.lastAppliedView;
    if (!snapSeat) {
      findings.push(finding(snap.src, null, sv, 'skipped', 'no seat for this source'));
      continue;
    }
    if (!clientView) {
      findings.push(finding(snap.src, snapSeat, sv, 'skipped', 'snapshot has no lastAppliedView'));
      continue;
    }
    const server = serverStateAt(data, engine, sv);
    if (server.error) {
      findings.push(finding(snap.src, snapSeat, sv, 'no-server-state', `available sv range: ${server.error}`));
      continue;
    }
    const serverView = engine.viewFor(server.state, snapSeat, engine.viewReaders);
    findings.push(...compareZones(snap.src, snapSeat, sv, serverView, clientView));
    findings.push(...compareRegistry(snap.src, snapSeat, sv, clientView, snap.registry));
  }
  return findings;
}

export function grepEntries(data, { cat, ev, src, lvl, text } = {}) {
  return data.timeline.filter(
    (e) =>
      (!cat || e.cat === cat) &&
      (!ev || e.ev.includes(ev)) &&
      (!src || e.src === src) &&
      (!lvl || e.lvl === lvl) &&
      (!text || JSON.stringify(e).includes(text))
  );
}
