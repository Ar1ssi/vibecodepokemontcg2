import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyCommand, attackExtrasFor, costDiscountsFor } from '../../shared/engine/reduce.mjs';
import { createRng } from '../../shared/engine/rng.mjs';
import { hashState } from '../../shared/engine/state.mjs';
import { viewFor } from '../../shared/engine/view.mjs';
import {
  diffView,
  grepEntries,
  loadExport,
  parseCs,
  replayExport,
  selectAround,
  summarize,
  traceCommand,
} from '../../tools/log-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = path.join(root, 'scripts/__tests__/fixtures/log-export.ndjson');
const CLI = path.join(root, 'tools/log.mjs');
const ENGINE = {
  applyCommand,
  createRng,
  hashState,
  viewFor,
  viewReaders: { attackExtrasFor, costDiscountsFor },
};
const P1 = 'c:3591dcb6';
const P2 = 'c:29f3cdfb';

const load = () => loadExport(FIXTURE);
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'log-cli-'));
const runCli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
const indexOf = (steps, predicate) => steps.findIndex(predicate);

function tamperedHashData() {
  const data = load();
  const record = data.journal.find((r) => r.k === 'cmd' && r.ok);
  record.after.hash = `${record.after.hash}x`;
  return { data, record };
}

test('loadExport reads the header, journal, states, snaps and a sorted timeline', () => {
  const data = load();
  assert.equal(data.header.k, 'header');
  assert.equal(data.journal.length, 13);
  assert.equal(data.states.length, 9);
  assert.equal(data.snaps.length, 2);
  assert.ok(data.timeline.length > 0);
  for (let i = 1; i < data.timeline.length; i += 1) assert.ok(data.timeline[i - 1].ts <= data.timeline[i].ts);
});

test('loadExport skips unparseable lines and unknown record kinds', () => {
  const dir = tempDir();
  const file = path.join(dir, 'x.ndjson');
  fs.writeFileSync(file, '{"k":"header","sources":[]}\nnot json\n{"k":"mystery"}\n\n');
  const data = loadExport(file);
  assert.equal(data.badLines, 1);
  assert.equal(data.timeline.length, 0);
});

test('summarize lists three sources with usernames', () => {
  const lines = summarize(load());
  assert.equal(lines.filter((l) => /^ {2}(server|c:[0-9a-f]{8})\b/.test(l)).length, 3);
  const text = lines.join('\n');
  assert.match(text, /Alpha/);
  assert.match(text, /Bravo/);
});

test('parseCs accepts seat#N and N, rejects the rest', () => {
  assert.deepEqual(parseCs('p1#41'), { seat: 'p1', cs: 41 });
  assert.deepEqual(parseCs('7'), { seat: null, cs: 7 });
  assert.equal(parseCs('x'), null);
});

test('traceCommand follows one command from client emit to both clients applying the view', () => {
  const data = load();
  const { steps, sv } = traceCommand(data, { seat: 'p1', cs: 3 });
  assert.equal(sv, 8);
  const emit = indexOf(steps, (e) => e.src === P1 && ((e.cat === 'cmd' && e.ev === 'emit') || (e.cat === 'socket' && e.ev === 'out.cmd')));
  const received = indexOf(steps, (e) => e.src === 'server' && e.cat === 'socket' && e.ev === 'in.cmd');
  const applied = indexOf(steps, (e) => e.src === 'server' && e.cat === 'engine' && e.ev === 'applied' && e.d.type === 'moveCard');
  const viewOf = (src) => indexOf(steps, (e) => e.src === src && e.cat === 'view' && e.ev === 'apply' && e.sv === 8);
  assert.ok(emit >= 0 && emit < received);
  assert.ok(received < applied);
  assert.ok(applied < viewOf(P1));
  assert.ok(applied < viewOf(P2));

  const missing = traceCommand(data, { seat: 'p1', cs: 999 });
  assert.ok(missing.error);
  assert.deepEqual(missing.steps, []);
});

test('selectAround keeps entries inside the window and anchors on sv or the mark', () => {
  const data = load();
  const bySv = selectAround(data, { sv: 8, windowMs: 1000 });
  assert.ok(bySv.entries.length > 0);
  assert.ok(bySv.entries.every((e) => Math.abs(e.ts - bySv.anchorTs) <= 1000));
  assert.ok(bySv.entries.some((e) => e.sv === 8));

  const mark = data.timeline.find((e) => e.cat === 'user' && e.ev === 'mark');
  assert.equal(selectAround(data, { mark: true }).anchorTs, mark.ts);
  assert.ok(selectAround(data, { sv: 999 }).error);
});

test('replayExport reproduces every hash, and a tampered hash is reported as the divergence', () => {
  const ok = replayExport(load(), ENGINE);
  assert.equal(ok.ok, true);
  assert.equal(ok.commands, 8);
  assert.equal(ok.divergence, null);

  const { data, record } = tamperedHashData();
  const bad = replayExport(data, ENGINE);
  assert.equal(bad.ok, false);
  assert.equal(bad.divergence.kind, 'hash');
  assert.equal(bad.divergence.n, record.n);
});

test('diffView finds nothing on the untouched fixture', () => {
  assert.deepEqual(diffView(load(), ENGINE), []);
});

test('diffView names a card the registry renders in the wrong zone', () => {
  const data = load();
  const snap = data.snaps[0];
  const activeId = snap.netcode.lastAppliedView.you.zones.active[0].instanceId;
  snap.registry.find((row) => row.id === activeId).zone = 'bench';
  const wrong = diffView(data, ENGINE).filter((f) => f.kind === 'wrong-zone');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].detail.id, activeId);
  assert.equal(wrong[0].detail.view, 'you.active');
  assert.equal(wrong[0].detail.rendered, 'you.bench');
});

test('diffView reports a card the server view has but the client view lacks', () => {
  const data = load();
  const [removed] = data.snaps[0].netcode.lastAppliedView.you.zones.hand.splice(0, 1);
  const missing = diffView(data, ENGINE).filter((f) => f.kind === 'missing-on-client');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].detail.side, 'you');
  assert.equal(missing[0].detail.zone, 'hand');
  assert.ok(missing[0].detail.ids.includes(removed.instanceId));
});

test('diffView reports no-server-state when neither a state record nor a journal covers the version', () => {
  const data = load();
  data.states = [];
  data.journal = [];
  assert.ok(diffView(data, ENGINE).some((f) => f.kind === 'no-server-state'));
});

test('grepEntries filters by category and event', () => {
  const entries = grepEntries(load(), { cat: 'engine', ev: 'applied' });
  assert.equal(entries.length, 8);
  assert.ok(entries.every((e) => e.src === 'server'));
});

test('a disk-sink boot directory loads, merges by ts and replays', () => {
  const data = load();
  const dir = tempDir();
  const line = (o) => `${JSON.stringify(o)}\n`;
  const entry = (extra) => ({ seq: 1, lvl: 'info', cat: 'app', ev: 'x', ...extra });
  fs.writeFileSync(path.join(dir, 'server.ndjson'), line(entry({ t: 30 })) + line(entry({ t: 10, seq: 2 })));
  fs.writeFileSync(path.join(dir, 'room_r1.ndjson'), line(entry({ t: 20, seq: 3 })));
  fs.writeFileSync(
    path.join(dir, 'client_aaaaaaaaaaaaaaaa.ndjson'),
    line(entry({ t: 25, ts: 25, load: 'L' })) + line(entry({ t: 5, ts: 5, load: 'L', seq: 2 }))
  );
  fs.writeFileSync(path.join(dir, 'journal_r1.ndjson'), data.journal.map(line).join(''));
  fs.writeFileSync(path.join(dir, 'journal_other.ndjson'), line({ k: 'rng', game: 9, cursor: 0 }));

  const loaded = loadExport(dir, { room: 'r1' });
  assert.equal(loaded.timeline.length, 5);
  assert.deepEqual(loaded.timeline.map((e) => e.ts), [5, 10, 20, 25, 30]);
  assert.equal(loaded.timeline[3].src, 'c:aaaaaaaa');
  assert.equal(loaded.journal.length, 13);
  assert.equal(loaded.header.partial, 'disk');
  assert.equal(replayExport(loaded, ENGINE).ok, true);
  assert.equal(loadExport(dir).journal.length, 14);
});

test('CLI summary exits 0 within the line cap', () => {
  const out = execFileSync('node', [CLI, 'summary', FIXTURE], { encoding: 'utf8' });
  assert.ok(out.split('\n').length <= 201);
});

test('CLI replay prints OK for the fixture and DIVERGED (exit 1) for a tampered copy', () => {
  assert.match(execFileSync('node', [CLI, 'replay', FIXTURE], { encoding: 'utf8' }), /^OK 8 commands, 0 divergences$/m);

  const dir = tempDir();
  const copy = path.join(dir, 'tampered.ndjson');
  const lines = fs.readFileSync(FIXTURE, 'utf8').split('\n');
  const index = lines.findIndex((l) => l.startsWith('{"k":"journal"') && l.includes('"hash":"'));
  lines[index] = lines[index].replace(/"hash":"([^"]*)"/, '"hash":"$1x"');
  fs.writeFileSync(copy, lines.join('\n'));
  const result = runCli('replay', copy);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /DIVERGED at/);
});

test('CLI exits 2 with a stderr message for an unknown command or a missing file', () => {
  const unknown = runCli('nope', FIXTURE);
  assert.equal(unknown.status, 2);
  assert.ok(unknown.stderr.length > 0);
  assert.equal(runCli('summary', path.join(os.tmpdir(), 'no-such-log.ndjson')).status, 2);
});

test('CLI grep caps output at 200 lines and says how many more', () => {
  const total = grepEntries(load(), { cat: 'net' }).length;
  assert.ok(total > 200);
  const capped = runCli('grep', '--cat', 'net', FIXTURE).stdout.trimEnd().split('\n');
  // One extra line: the listing starts with its absolute time base (t0=…).
  assert.equal(capped.length, 201);
  assert.match(capped[0], /^t0=\d/);
  assert.equal(capped.at(-1), `… ${total + 1 - 200} more lines (use --all)`);
  assert.equal(runCli('grep', '--cat', 'net', '--all', FIXTURE).stdout.trimEnd().split('\n').length, total + 1);
});

test('CLI help lists every command', () => {
  const out = runCli('--help').stdout;
  for (const name of ['summary', 'errors', 'around', 'trace', 'replay', 'diff-view', 'grep']) assert.match(out, new RegExp(name));
});

test('a bare clientSeq used by both seats is refused with the seats to choose from', () => {
  const data = load();
  const trace = traceCommand(data, { seat: null, cs: 1 });
  assert.deepEqual(trace.steps, []);
  assert.match(trace.error, /clientSeq 1 was used by p1 and p2.*--cs p1#1/);
  assert.match(selectAround(data, { cs: { seat: null, cs: 1 } }).error, /p1 and p2/);
  assert.equal(traceCommand(data, { seat: 'p2', cs: 1 }).steps.some((e) => e.cs === 1 && e.seat === 'p1'), false);
  assert.equal(traceCommand(data, { seat: null, cs: 3 }).sv, 8, 'only p1 used clientSeq 3');
});

test('diffView reports a card still rendered that the applied view no longer has', () => {
  const data = load();
  data.snaps[0].registry.push({ id: 999, side: 'you', zone: 'bench', connected: true });
  const stale = diffView(data, ENGINE).filter((f) => f.kind === 'stale-rendered');
  assert.equal(stale.length, 1);
  assert.deepEqual(stale[0].detail, { id: 999, rendered: 'you.bench', connected: true });
});

test('diffView does not compare a spectator against a server view it never had', () => {
  const data = load();
  data.header.sources.find((s) => s.src === P2).seat = 'spec';
  const findings = diffView(data, ENGINE).filter((f) => f.src === P2);
  assert.deepEqual(findings.map((f) => f.kind), ['skipped']);
  assert.match(findings[0].detail, /spectator/);
});

test('diffView uses the latest state when a stateVersion repeats (after an undo)', () => {
  const data = load();
  const sv = data.snaps[0].netcode.lastRenderedVersion;
  const real = data.states.find((s) => s.sv === sv);
  // An older state that carried the same version before an undo rewound to it.
  data.states.unshift({ sv, state: { ...real.state, players: {} } });
  assert.deepEqual(diffView(data, ENGINE).filter((f) => f.kind !== 'skipped'), []);
});

test('summarize says when lines were unreadable and what a local-only export lacks', () => {
  const dir = tempDir();
  const file = path.join(dir, 'local.ndjson');
  fs.writeFileSync(file, '{"k":"header","partial":"local-only","sources":[{"src":"c:aaaaaaaa","entries":1}]}\n{"k":"e","ts":1,"src":"c:aaaaaaaa","t":1,"seq":1,"lvl":"info","cat":"app","ev":"x"}\n{"k":"e","ts":2,"src":"c:aaa');
  const text = summarize(loadExport(file)).join('\n');
  assert.match(text, /local-only\): this client only/);
  assert.match(text, /1 unreadable line\(s\) skipped/);
});

test('CLI listings start with the absolute time base, and diff-view exits 1 on a difference', () => {
  const trace = runCli('trace', '--cs', 'p1#3', FIXTURE);
  assert.equal(trace.status, 0);
  const base = /^t0=(\d+(?:\.\d+)?) \(\d{4}-\d\d-\d\dT/.exec(trace.stdout);
  assert.ok(base, trace.stdout.slice(0, 80));
  const around = runCli('around', '--ts', base[1], '--window', '50ms', FIXTURE);
  assert.equal(around.status, 0);
  assert.match(around.stdout, /socket\/out\.cmd cs=3/);
  assert.equal(runCli('trace', '--cs', '1', FIXTURE).status, 1);

  assert.equal(runCli('diff-view', FIXTURE).status, 0);
  const dir = tempDir();
  const broken = path.join(dir, 'broken.ndjson');
  const lines = fs.readFileSync(FIXTURE, 'utf8').split('\n');
  const snapAt = lines.findIndex((l) => l.startsWith('{"k":"snap"'));
  const snap = JSON.parse(lines[snapAt]);
  snap.registry.push({ id: 999, side: 'you', zone: 'bench', connected: true });
  lines[snapAt] = JSON.stringify(snap);
  fs.writeFileSync(broken, lines.join('\n'));
  const diff = runCli('diff-view', broken);
  assert.equal(diff.status, 1);
  assert.match(diff.stdout, /stale-rendered/);
});
