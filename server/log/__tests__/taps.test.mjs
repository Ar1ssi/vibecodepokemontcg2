import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLogStore } from '../log-store.mjs';
import { createServerLog } from '../server-logger.mjs';
import { installProcessTap } from '../process-tap.mjs';
import { httpLog } from '../http-tap.mjs';
import { defaultRoomOf, tapServer, tapSocket } from '../socket-tap.mjs';
import { readBuild } from '../build-info.mjs';

function setup() {
  const store = createLogStore();
  const { log, forRoom } = createServerLog({ store });
  const parsed = (id) => store.stream(id)?.entries().map((e) => JSON.parse(e.line)) ?? [];
  return { store, log, forRoom, parsed };
}

test('server log routes by room', () => {
  const { log, forRoom, parsed } = setup();
  log.info('boot', 'start');
  forRoom('r1').info('room', 'join');
  assert.equal(parsed('server').length, 1);
  assert.equal(parsed('room:r1')[0].room, 'r1');
});

test('readBuild: env commit, git commit, unknown', () => {
  assert.equal(readBuild({ env: { RENDER_GIT_COMMIT: 'abc' } }).commit, 'abc');
  const calls = [];
  const exec = (...a) => { calls.push(a); return 'deadbeef\n'; };
  const b = readBuild({ env: {}, exec, cwd: '/c' });
  assert.equal(b.commit, 'deadbeef');
  assert.deepEqual(calls[0][1], ['rev-parse', 'HEAD']);
  assert.equal(calls[0][2].cwd, '/c');
  assert.equal(readBuild({ env: {}, exec: () => { throw new Error('no git'); } }).commit, 'unknown');
  assert.equal(readBuild({ env: {}, exec }).node, process.version);
  assert.ok(!Number.isNaN(Date.parse(readBuild({ env: {}, exec }).startedAt)));
});

function stubProcess() {
  const handlers = new Map();
  const written = [];
  return {
    handlers,
    written,
    on: (ev, fn) => handlers.set(ev, fn),
    removeListener: (ev, fn) => { if (handlers.get(ev) === fn) handlers.delete(ev); },
    stderr: { write: (s) => written.push(s) },
  };
}

test('process tap: monitor logs one error entry, flushes disk and writes a fatal JSON line', () => {
  const { log, parsed } = setup();
  const proc = stubProcess();
  const fakeConsole = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  let flushed = 0;
  const uninstall = installProcessTap({ log, diskSink: { flushSync: () => flushed++ }, consoleRef: fakeConsole, processRef: proc });
  proc.handlers.get('uncaughtExceptionMonitor')(new TypeError('boom'), 'uncaughtException');
  const errors = parsed('server').filter((e) => e.lvl === 'error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].ev, 'uncaught');
  assert.equal(flushed, 1);
  assert.equal(proc.written.length, 1);
  assert.ok(proc.written[0].includes('"fatal":true'));
  assert.ok(proc.written[0].endsWith('\n'));
  assert.equal(JSON.parse(proc.written[0]).message, 'boom');
  proc.handlers.get('warning')(new Error('w'));
  assert.equal(parsed('server').at(-1).ev, 'warning');
  fakeConsole.log('hi');
  assert.equal(parsed('server').at(-1).cat, 'console');
  uninstall();
  assert.equal(proc.handlers.size, 0);
});

test('process tap: a throwing disk flush still writes the stderr line', () => {
  const { log } = setup();
  const proc = stubProcess();
  installProcessTap({ log, diskSink: { flushSync() { throw new Error('x'); } }, consoleRef: {}, processRef: proc });
  proc.handlers.get('uncaughtExceptionMonitor')(new Error('b'), 'x');
  assert.equal(proc.written.length, 1);
});

function fakeRes(status, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = status;
  res.getHeader = (k) => headers[k];
  return res;
}
function runHttp(url, status, { msTaken = 3, headers } = {}) {
  const { log, parsed } = setup();
  let t = 0;
  const mw = httpLog({ log, now: () => t });
  const req = { method: 'GET', originalUrl: url, get: (k) => (k === 'x-ptcg-client' ? 'cid' : undefined) };
  const res = fakeRes(status, headers);
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  t = msTaken;
  res.emit('finish');
  assert.ok(nexted);
  return parsed('server');
}

test('http tap levels', () => {
  assert.equal(runHttp('/src/a.png', 200).length, 0);
  const api = runHttp('/api/x?q=1', 200, { headers: { 'content-length': '12' } });
  assert.equal(api.length, 1);
  assert.equal(api[0].lvl, 'debug');
  assert.equal(api[0].ev, 'req');
  assert.deepEqual(api[0].d, { method: 'GET', path: '/api/x', query: 'q=1', status: 200, ms: 3, bytes: 12, client: 'cid' });
  const missing = runHttp('/src/a.png', 404);
  assert.equal(missing[0].lvl, 'warn');
  assert.equal(missing[0].ev, 'req.failed');
  assert.equal(runHttp('/x', 500)[0].lvl, 'error');
  assert.equal(runHttp('/slow', 200, { msTaken: 600 })[0].lvl, 'debug');
  assert.equal(runHttp('/api/log/beacon', 200).length, 0);
  assert.equal(runHttp('/p?' + 'a'.repeat(300), 404)[0].d.query.length, 200);
  assert.equal('query' in runHttp('/api/y', 200)[0].d, false);
  assert.equal(runHttp('/api/y', 200)[0].d.bytes, null);
});

function fakeSocket(extra = {}) {
  const s = {
    id: 'sock1',
    rooms: new Set(['sock1']),
    handshake: { headers: { 'user-agent': 'UA' } },
    conn: { transport: { name: 'websocket' } },
    any: null,
    anyOut: null,
    handlers: {},
    onAny(fn) { s.any = fn; },
    onAnyOutgoing(fn) { s.anyOut = fn; },
    on(ev, fn) { s.handlers[ev] = fn; },
    ...extra,
  };
  return s;
}

test('defaultRoomOf order', () => {
  const s = fakeSocket({ rooms: new Set(['sock1', 'lobby:watchers', 'live', 'other']) });
  assert.equal(defaultRoomOf(s, { roomId: 'other', gameId: 'live' }), 'other');
  assert.equal(defaultRoomOf(s, { gameId: 'other' }), 'other');
  // A room the socket is not in is never trusted: it would open a stream nothing closes.
  assert.equal(defaultRoomOf(s, { roomId: 'not-joined', gameId: 'nor-this' }), 'live');
  assert.equal(defaultRoomOf(s, { roomId: 'lobby:watchers' }), 'live');
  assert.equal(defaultRoomOf(s, { roomId: 'sock1' }), 'live');
  assert.equal(defaultRoomOf(s, { roomId: 5 }), 'live');
  assert.equal(defaultRoomOf(s, null), 'live');
  assert.equal(defaultRoomOf(fakeSocket(), undefined), null);
});

test('socket tap: connect, in, out, log:batch, disconnect, error', () => {
  const { log, parsed } = setup();
  const s = fakeSocket({ recovered: true });
  tapSocket(s, { log, seatOf: (id, room) => (room === 'r' ? 'p1' : null) });
  s.rooms = new Set(['sock1', 'r']);
  const connect = parsed('server')[0];
  assert.equal(connect.ev, 'connect');
  assert.deepEqual(connect.d, { id: 'sock1', transport: 'websocket', recovered: true, ua: 'UA' });

  s.any('cmd', { roomId: 'r', clientSeq: 4 });
  const inEntry = parsed('room:r')[0];
  assert.equal(inEntry.cat, 'socket');
  assert.equal(inEntry.ev, 'in.cmd');
  assert.equal(inEntry.room, 'r');
  assert.equal(inEntry.seat, 'p1');
  assert.equal(inEntry.cs, 4);

  s.anyOut('view', { stateVersion: 9, events: [{ type: 'attack' }] });
  const out = parsed('room:r').at(-1);
  assert.equal(out.ev, 'out.view');
  assert.equal(out.sv, 9);
  assert.equal(out.d.sv, 9);

  const before = parsed('server').length + parsed('room:r').length;
  s.any('log:batch', ['x']);
  s.anyOut('log:ack', {});
  assert.equal(parsed('server').length + parsed('room:r').length, before);

  s.handlers.error(new Error('bad'));
  assert.equal(parsed('server').at(-1).ev, 'error');
  s.handlers.disconnecting();
  s.rooms = new Set();
  s.handlers.disconnect('transport close');
  const bye = parsed('room:r').at(-1);
  assert.equal(bye.ev, 'disconnect');
  assert.equal(bye.d.reason, 'transport close');
});

test('socket tap handlers swallow a throwing roomOf', () => {
  const { log } = setup();
  const s = fakeSocket();
  tapSocket(s, { log, roomOf: () => { throw new Error('x'); } });
  assert.doesNotThrow(() => s.any('cmd', {}));
});

test('tapServer: connection_error, joins, leaves, delete-room', () => {
  const { store, log, parsed } = setup();
  const engine = new EventEmitter();
  const adapter = new EventEmitter();
  const io = { engine, of: () => ({ adapter }) };
  const clients = { s1: 'client-1' };
  tapServer(io, { log, store, clientOf: (id) => clients[id] ?? null });

  engine.emit('connection_error', { code: 3, message: 'Bad request' });
  assert.deepEqual(parsed('server')[0].d, { code: 3, message: 'Bad request' });

  adapter.emit('join-room', 's1', 's1');
  adapter.emit('join-room', 'lobby:watchers', 's1');
  assert.equal(parsed('server').length, 1);
  adapter.emit('join-room', 'r', 's1');
  assert.equal(parsed('room:r')[0].ev, 'join');
  assert.equal(store.participants('r')[0].clientId, 'client-1');
  assert.equal(store.participants('r')[0].socketId, 's1');
  adapter.emit('join-room', 'r', 's2'); // no client id: logged, not linked
  assert.equal(store.participants('r').length, 1);

  adapter.emit('leave-room', 'r', 's1');
  assert.equal(parsed('room:r').find((e) => e.ev === 'leave').d.id, 's1');
  assert.notEqual(store.participants('r')[0].leftAt, null);
  adapter.emit('leave-room', 'r', 'r');
  assert.equal(parsed('room:r').filter((e) => e.ev === 'leave').length, 1);

  adapter.emit('delete-room', 'norecord');
  adapter.emit('delete-room', 'lobby:watchers');
  assert.equal(store.stream('room:norecord'), null);
  adapter.emit('delete-room', 'r');
  assert.equal(parsed('room:r').at(-1).ev, 'deleted');
  assert.notEqual(store.stream('room:r').closedAt, null);
});

test('a payload naming a room the socket never joined opens no room stream', () => {
  const { log, store } = setup();
  const s = fakeSocket();
  tapSocket(s, { log });
  for (let i = 0; i < 50; i++) s.any('joinGame', { roomId: `typo-${i}` });
  assert.deepEqual(store.stats().byStream.map((row) => row.id), ['server']);
});

test('seat tokens never reach the log: object keys and the joinGame positional argument', () => {
  const { log, store } = setup();
  const s = fakeSocket({ rooms: new Set(['sock1', 'r']) });
  tapSocket(s, { log });
  s.any('joinGame', 'private-room', 'Ash', false, 'SECRET-SEAT-TOKEN-1', { solo: false });
  s.anyOut('joinGame', { roomId: 'r', seatToken: 'SECRET-SEAT-TOKEN-2' });
  s.any('userReconnected', { roomId: 'r', username: 'Ash', seatToken: 'SECRET-SEAT-TOKEN-3', nested: { password: 'hunter2' } });
  const everything = store.stats().byStream.flatMap((row) => store.stream(row.id).entries().map((e) => e.line)).join('\n');
  assert.doesNotMatch(everything, /SECRET-SEAT-TOKEN|hunter2/);
  assert.match(everything, /"Ash"/);
  assert.match(everything, /\[redacted\]/);
});
