import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../../game/room.mjs';
import { createJournal } from '../journal.mjs';
import { createLogStore } from '../log-store.mjs';
import { buildExport, findGaps, mergeTimeline } from '../export.mjs';
import { createLogger } from '../../../shared/log/logger.mjs';

const CLIENT_A = 'a1b2c3d4e5f60718';
const CLIENT_B = 'b2c3d4e5f6071829';
const NOW = 1_000_000;

const lineOf = (seq, ts, lvl = 'info', cat = 'app') => `{"t":${ts},"seq":${seq},"lvl":"${lvl}","cat":"${cat}","ev":"x"}`;

function push(store, streamId, seq, ts, lvl, cat, load) {
  store.append(streamId, { seq, t: ts, ts, lvl, load, line: lineOf(seq, ts, lvl, cat) });
}

function storeWithRoom() {
  const store = createLogStore({ now: () => NOW });
  store.link(CLIENT_A, 'r1', { socketId: 's1' });
  store.link(CLIENT_B, 'r1', { socketId: 's2' });
  return store;
}

const stubJournal = (states = []) => ({
  games: () => [{ game: 1, records: ['{"k":"rebase","game":1}'] }],
  states: () => states,
  stats: () => ({ games: 1, records: 1, bytes: 1, complete: true }),
});

const build = (store, extra = {}) =>
  buildExport({ store, scope: { roomId: 'r1' }, now: () => NOW, ...extra });

const headerOf = (lines) => JSON.parse(lines[0]);
const entriesOf = (lines) => lines.map((l) => JSON.parse(l)).filter((r) => r.k === 'e');

test('mergeTimeline sorts by ts, server first on ties, and does not re-parse the line', () => {
  const merged = mergeTimeline([
    { src: 'c:aaaaaaaa', entries: [{ seq: 1, ts: 20, load: 'deadbeef', line: lineOf(1, 20) }, { seq: 2, ts: 30, line: lineOf(2, 30) }] },
    { src: 'server', entries: [{ seq: 1, ts: 10, line: lineOf(1, 10) }, { seq: 2, ts: 30, line: lineOf(2, 30) }] },
  ]);
  const parsed = merged.map((l) => JSON.parse(l));
  assert.deepEqual(parsed.map((r) => r.ts), [10, 20, 30, 30]);
  assert.deepEqual(parsed.map((r) => r.src), ['server', 'c:aaaaaaaa', 'server', 'c:aaaaaaaa']);
  assert.equal(parsed[1].load, 'deadbeef');
  assert.equal(parsed[0].load, undefined);
  assert.equal(parsed[0].k, 'e');
  assert.equal(parsed[0].lvl, 'info');
});

test('findGaps reports a missing head and every jump, per load', () => {
  assert.deepEqual(findGaps([{ seq: 4, load: 'L' }, { seq: 5, load: 'L' }]), [{ load: 'L', from: 1, to: 3 }]);
  assert.deepEqual(
    findGaps([{ seq: 5, load: 'L' }, { seq: 1, load: 'L' }, { seq: 2, load: 'L' }, { seq: 1, load: 'M' }]),
    [{ load: 'L', from: 3, to: 4 }]
  );
  assert.deepEqual(findGaps([{ seq: 1 }, { seq: 2 }]), []);
});

test('client entries seq 1, 2, 5 produce one gap in the header source', () => {
  const store = storeWithRoom();
  for (const [seq, ts] of [[1, 100], [2, 110], [5, 120]]) push(store, `client:${CLIENT_A}`, seq, ts, 'info', 'app', 'deadbeef');
  const source = headerOf(build(store)).sources.find((s) => s.src === 'c:a1b2c3d4');
  assert.deepEqual(source.gaps, [{ load: 'deadbeef', from: 3, to: 4 }]);
  assert.equal(source.entries, 3);
  assert.equal(source.firstSeq, 1);
});

test('a room with nothing logged exports a header, the created rebase and its state', () => {
  const store = createLogStore({ now: () => NOW });
  const log = createLogger({ now: Date.now, sink: () => {} });
  const journal = createJournal({ roomId: 'r1', log });
  new GameRoom({ roomId: 'r1', rulesEnabled: false, seed: 7, journal });
  const lines = build(store, { journal });
  assert.equal(lines.length, 3);
  const [header, rec, state] = lines.map((l) => JSON.parse(l));
  assert.equal(header.k, 'header');
  assert.equal(header.counts.entries, 0);
  assert.deepEqual(header.range, { from: null, to: null });
  assert.equal(rec.k, 'journal');
  assert.equal(rec.rec.k, 'rebase');
  assert.equal(rec.rec.why, 'created');
  assert.equal(state.k, 'state');
});

test('every line is single-line JSON and state lines carry commandLogLength only', () => {
  const store = storeWithRoom();
  push(store, 'room:r1', 1, 100, 'info', 'engine');
  // sv 1 appears twice with different states (an undo rewound to it): both must be exported,
  // and the same state object listed twice (a rebase of the current state) only once.
  const rewound = { stateVersion: 1, commandLog: [{ a: 1 }, { a: 2 }, { a: 3 }] };
  const states = [
    { sv: 1, game: 1, n: 1, state: { stateVersion: 1, commandLog: [{ a: 1 }, { a: 2 }], note: 'multi\nline' } },
    { sv: 2, game: 1, n: 2, state: { stateVersion: 2 } },
    { sv: 1, game: 1, n: 3, state: rewound },
    { sv: 1, game: 1, n: 3, state: rewound },
  ];
  const lines = build(store, { journal: stubJournal(states) });
  for (const line of lines) {
    assert.ok(!line.includes('\n'));
    JSON.parse(line);
  }
  const stateLines = lines.map((l) => JSON.parse(l)).filter((r) => r.k === 'state');
  assert.deepEqual(stateLines.map((s) => [s.sv, s.game, s.n]), [[1, 1, 1], [2, 1, 2], [1, 1, 3]]);
  assert.equal(stateLines[0].state.commandLogLength, 2);
  assert.equal(stateLines[2].state.commandLogLength, 3);
  assert.equal('commandLog' in stateLines[0].state, false);
  assert.equal(stateLines[1].state.commandLogLength, 0);
});

test('snapshot states: object -> ok plus a snap line, string kept, missing -> offline', () => {
  const store = storeWithRoom();
  store.link('c3d4e5f607182930', 'r1', { socketId: 's3' });
  for (const id of [CLIENT_A, CLIENT_B, 'c3d4e5f607182930']) push(store, `client:${id}`, 1, 100, 'info', 'app', 'deadbeef');
  const lines = build(store, { snapshots: { [CLIENT_A]: { meta: { w: 1 } }, [CLIENT_B]: 'timeout' } });
  const sources = headerOf(lines).sources;
  const bySrc = Object.fromEntries(sources.map((s) => [s.src, s.snapshot]));
  assert.equal(bySrc['c:a1b2c3d4'], 'ok');
  assert.equal(bySrc['c:b2c3d4e5'], 'timeout');
  assert.equal(bySrc['c:c3d4e5f6'], 'offline');
  const snaps = lines.map((l) => JSON.parse(l)).filter((r) => r.k === 'snap');
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].src, 'c:a1b2c3d4');
  assert.deepEqual(snaps[0].meta, { w: 1 });
});

test('the server source takes room entries plus server entries from 60 s before the first client/room entry', () => {
  const store = storeWithRoom();
  push(store, 'room:r1', 1, 200_000, 'info', 'engine');
  push(store, `client:${CLIENT_A}`, 1, 200_500, 'info', 'app', 'deadbeef');
  push(store, 'server', 1, 200_000 - 120_000, 'info', 'boot');
  push(store, 'server', 2, 200_000 - 30_000, 'info', 'boot');
  const lines = build(store);
  const serverTs = entriesOf(lines).filter((e) => e.src === 'server').map((e) => e.ts);
  assert.deepEqual(serverTs, [170_000, 200_000]);
  assert.equal(headerOf(lines).sources[0].entries, 2);
});

test('header counts levels and categories and points at the first error', () => {
  const store = storeWithRoom();
  push(store, 'room:r1', 1, 100, 'info', 'engine');
  push(store, `client:${CLIENT_A}`, 1, 150, 'error', 'error', 'deadbeef');
  push(store, `client:${CLIENT_B}`, 1, 160, 'error', 'error', 'deadbeef');
  push(store, 'room:r1', 2, 170, 'warn', 'cmd');
  const header = headerOf(build(store, { build: { commit: 'abc' }, netcode: 'server-authoritative', note: 'n' }));
  assert.deepEqual(header.firstError, { ts: 150, src: 'c:a1b2c3d4', seq: 1 });
  assert.deepEqual(header.counts.byLevel, { info: 1, error: 2, warn: 1 });
  assert.deepEqual(header.counts.byCat, { engine: 1, error: 2, cmd: 1 });
  assert.equal(header.counts.entries, 4);
  assert.deepEqual(header.range, { from: 100, to: 170 });
  assert.equal(header.build.server, 'abc');
  assert.equal(header.note, 'n');
  assert.equal(header.netcode, 'server-authoritative');
  assert.equal(header.room, 'r1');
});

test('client scope exports only that client stream and the server window', () => {
  const store = storeWithRoom();
  push(store, 'room:r1', 1, 100, 'info', 'engine');
  push(store, `client:${CLIENT_A}`, 1, 100, 'info', 'app', 'deadbeef');
  push(store, `client:${CLIENT_B}`, 1, 100, 'info', 'app', 'deadbeef');
  push(store, 'server', 1, 90, 'info', 'process');
  const lines = buildExport({ store, scope: { clientId: CLIENT_A }, now: () => NOW });
  const header = headerOf(lines);
  assert.equal(header.room, null);
  assert.deepEqual(header.sources.map((s) => s.src), ['server', 'c:a1b2c3d4']);
  assert.deepEqual(entriesOf(lines).map((e) => e.src).sort(), ['c:a1b2c3d4', 'server']);
});

test('from the shared server stream an export takes process entries and its own clients\' HTTP, never other sockets\' traffic', () => {
  const store = storeWithRoom();
  push(store, `client:${CLIENT_A}`, 1, 1000, 'info', 'app', 'deadbeef');
  const server = (seq, cat, detail) =>
    store.append('server', { seq, t: 1000, ts: 1000, lvl: 'info', line: `{"t":1000,"seq":${seq},"lvl":"info","cat":"${cat}","ev":"x","d":${JSON.stringify(detail)}}` });
  server(1, 'socket', { id: 'other', args: ['their-private-room', 'Stranger'] });
  server(2, 'room', { id: 'other' });
  server(3, 'http', { path: '/api/x', client: CLIENT_A });
  server(4, 'http', { path: '/api/y', client: 'ffffffffffffffff' });
  server(5, 'http', { path: '/api/z', client: null });
  server(6, 'process', { warning: 'w' });
  server(7, 'console', { args: ['boot line'] });
  const text = build(store).join('\n');
  assert.doesNotMatch(text, /their-private-room|Stranger|\/api\/y|\/api\/z/);
  assert.match(text, /\/api\/x/);
  assert.deepEqual(entriesOf(build(store)).filter((e) => e.src === 'server').map((e) => e.cat), ['http', 'process', 'console']);
});

test('a snapshot cannot rename itself: k and src are set by the export', () => {
  const store = storeWithRoom();
  push(store, `client:${CLIENT_A}`, 1, 100, 'info', 'app', 'deadbeef');
  const lines = build(store, { snapshots: { [CLIENT_A]: { k: 'header', src: 'server', meta: { w: 1 } } } });
  const records = lines.map((l) => JSON.parse(l));
  assert.equal(records.filter((r) => r.k === 'header').length, 1);
  assert.deepEqual(records.filter((r) => r.k === 'snap').map((r) => r.src), ['c:a1b2c3d4']);
});
