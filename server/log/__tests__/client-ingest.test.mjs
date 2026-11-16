import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLogStore } from '../log-store.mjs';
import { createLogger } from '../../../shared/log/logger.mjs';
import { createLogIngest, ingestLines } from '../client-ingest.mjs';

const CLIENT = 'a1b2c3d4e5f60718';
const LOAD = 'deadbeef';

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => (t += ms) };
  const store = createLogStore({ now: clock.now });
  const entries = [];
  const log = createLogger({ now: clock.now, sink: (e) => entries.push(e), level: 'trace' });
  const adapter = new EventEmitter();
  const emitted = [];
  const io = { of: () => ({ adapter }), to: (id) => ({ emit: (ev, payload) => emitted.push({ to: id, ev, payload }) }) };
  const ingest = createLogIngest({ store, log, io, now: clock.now });
  let n = 0;
  const makeSocket = (rooms = []) => {
    const id = `sock${++n}`;
    const handlers = {};
    const socket = { id, data: {}, rooms: new Set([id, ...rooms]), on: (ev, fn) => (handlers[ev] = fn) };
    ingest.attachSocket(socket);
    const call = (ev, payload) => {
      let result;
      handlers[ev](payload, (r) => (result = r));
      return result;
    };
    return { socket, call, handlers };
  };
  return { clock, store, entries, adapter, emitted, ingest, makeSocket };
}

const line = (seq, extra = {}) => JSON.stringify({ t: 5000 + seq, seq, lvl: 'info', cat: 'app', ev: 'x', ...extra });
const hello = { v: 1, clientId: CLIENT, loadId: LOAD, page: '/', build: 'abc', ua: 'UA' };

test('batch before hello is refused; bad ids are bad_hello', () => {
  const { makeSocket } = setup();
  const c = makeSocket();
  assert.deepEqual(c.call('log:batch', { loadId: LOAD, lines: [] }), { ok: false, reason: 'no_hello' });
  assert.equal(c.call('log:hello', { ...hello, clientId: 'nope' }).reason, 'bad_hello');
  assert.equal(c.call('log:hello', { ...hello, loadId: 'XYZ' }).reason, 'bad_hello');
  assert.equal(c.call('log:hello', null).reason, 'bad_hello');
});

test('a good hello acks, records meta and links the socket room', () => {
  const { makeSocket, store } = setup();
  const c = makeSocket(['roomA', 'lobby:watchers']);
  const ack = c.call('log:hello', hello);
  assert.equal(ack.ok, true);
  assert.equal(typeof ack.serverT, 'number');
  assert.equal(ack.level, 'debug');
  assert.equal(ack.acked, 0);
  assert.equal(store.participants('roomA')[0].clientId, CLIENT);
  assert.deepEqual(store.participants('lobby:watchers'), []);
  assert.equal(store.stream(`client:${CLIENT}`).meta.loads[LOAD].page, '/');
});

test('batch validation: too many, bad load, bad lines, duplicates', () => {
  const { makeSocket, store, entries } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  assert.equal(c.call('log:batch', { loadId: '00000000', lines: [] }).reason, 'bad_load');
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: 'x' }).reason, 'bad_batch');
  const many = Array.from({ length: 501 }, (_, i) => line(i + 1));
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: many }).reason, 'too_many');
  assert.ok(entries.some((e) => e.ev === 'batch.refused'));
  const lines = [line(1), 'not json', line(2).replace('"seq":2', '"seq":"2"'), line(3, { lvl: 'loud' }), `{"t":1,\n"seq":4,"lvl":"info"}`, line(5)];
  const ack = c.call('log:batch', { loadId: LOAD, lines, offset: 10, rtt: 4 });
  assert.equal(ack.ok, true);
  assert.equal(ack.bad, 4);
  assert.equal(ack.acked, 5);
  const stream = store.stream(`client:${CLIENT}`);
  assert.equal(stream.size, 2);
  const again = c.call('log:batch', { loadId: LOAD, lines: [line(1), line(5)] });
  assert.equal(store.stream(`client:${CLIENT}`).size, 2);
  assert.equal(again.acked, 5);
});

test('stored entry carries ts = t + offset, load, and a disk line', () => {
  const { makeSocket, store } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  c.call('log:batch', { loadId: LOAD, lines: [line(1)], offset: 100 });
  const [entry] = store.stream(`client:${CLIENT}`).entries();
  assert.equal(entry.ts, 5001 + 100);
  assert.equal(entry.load, LOAD);
  assert.equal(entry.line, line(1));
});

test('ingestLines builds the disk line with ts and load first', () => {
  const written = [];
  const store = createLogStore({ sink: { write: (id, l) => written.push(l) } });
  const result = ingestLines({ store, clientId: CLIENT, loadId: LOAD, lines: [line(1)], offset: 2 });
  assert.deepEqual(result, { stored: 1, bad: 0, lastSeq: 1 });
  const disk = JSON.parse(written[0]);
  assert.equal(disk.ts, 5003);
  assert.equal(disk.load, LOAD);
  assert.equal(disk.seq, 1);
});

test('rate window: 600 KB refused, accepted again after the window', () => {
  const { makeSocket, store, clock, entries } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  const big = Array.from({ length: 40 }, (_, i) => line(i + 1, { pad: 'x'.repeat(15000) }));
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: big }).reason, 'rate');
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: big }).reason, 'rate');
  assert.equal(entries.filter((e) => e.ev === 'batch.refused').length, 1);
  assert.equal(store.stream(`client:${CLIENT}`).size, 0);
  clock.advance(10001);
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: [line(1)] }).ok, true);
});

test('reconnect hello with the same ids reports the last stored seq', () => {
  const { makeSocket } = setup();
  const first = makeSocket();
  first.call('log:hello', hello);
  first.call('log:batch', { loadId: LOAD, lines: [line(1), line(2), line(3)] });
  const second = makeSocket();
  assert.equal(second.call('log:hello', hello).acked, 3);
});

test('setLevel trace from a member sets the room level; non-members are refused', () => {
  const { makeSocket, ingest, emitted, adapter } = setup();
  const member = makeSocket(['roomA']);
  const outsider = makeSocket();
  member.call('log:hello', hello);
  assert.equal(outsider.call('log:setLevel', { roomId: 'roomA', level: 'trace' }).reason, 'bad_request');
  assert.equal(member.call('log:setLevel', { roomId: 'roomA', level: 'verbose' }).reason, 'bad_request');
  assert.deepEqual(member.call('log:setLevel', { roomId: 'roomA', level: 'trace' }), { ok: true, level: 'trace' });
  assert.equal(ingest.levelFor('roomA'), 'trace');
  assert.equal(emitted[0].to, 'roomA');
  assert.equal(emitted[0].payload.level, 'trace');
  adapter.emit('join-room', 'roomA', 'sockX');
  assert.deepEqual(emitted[1], { to: 'sockX', ev: 'log:level', payload: { level: 'trace', by: 'room' } });
  const late = makeSocket(['roomA']);
  assert.equal(late.call('log:hello', hello).level, 'trace');
  adapter.emit('delete-room', 'roomA');
  assert.equal(ingest.levelFor('roomA'), 'debug');
});

test('disconnect closes the client stream; ping echoes t0', () => {
  const { makeSocket, store } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  assert.equal(store.stream(`client:${CLIENT}`).closedAt, null);
  const pong = c.call('log:ping', { t0: 7 });
  assert.equal(pong.t0, 7);
  assert.equal(typeof pong.serverT, 'number');
  c.handlers.disconnect();
  assert.notEqual(store.stream(`client:${CLIENT}`).closedAt, null);
});

test('a handler with no ack function does not throw', () => {
  const { makeSocket } = setup();
  const c = makeSocket();
  assert.doesNotThrow(() => c.handlers['log:hello'](hello));
});

test('beacon stores lines for a known hello and always answers 204', () => {
  const { makeSocket, ingest, store } = setup();
  const res = () => {
    const r = { code: null, status: (c) => ((r.code = c), r), end: () => r };
    return r;
  };
  const unknown = res();
  ingest.beaconHandler({ body: JSON.stringify({ clientId: CLIENT, loadId: LOAD, lines: [line(1)] }) }, unknown);
  assert.equal(unknown.code, 204);
  assert.equal(store.stream(`client:${CLIENT}`), null);
  makeSocket().call('log:hello', hello);
  const ok = res();
  ingest.beaconHandler({ body: JSON.stringify({ clientId: CLIENT, loadId: LOAD, lines: [line(1), line(2)], offset: 1 }) }, ok);
  assert.equal(ok.code, 204);
  assert.equal(store.stream(`client:${CLIENT}`).size, 2);
  const junk = res();
  ingest.beaconHandler({ body: { not: 'a string' } }, junk);
  assert.equal(junk.code, 204);
});

test('setLevel with no room sets a per-client level that survives a reconnect', () => {
  const { makeSocket } = setup();
  const anonymous = makeSocket();
  assert.equal(anonymous.call('log:setLevel', { level: 'trace' }).reason, 'no_hello');
  const first = makeSocket();
  const sent = [];
  first.socket.emit = (ev, payload) => sent.push({ ev, payload });
  first.call('log:hello', hello);
  assert.deepEqual(first.call('log:setLevel', { level: 'trace' }), { ok: true, level: 'trace' });
  assert.deepEqual(sent, [{ ev: 'log:level', payload: { level: 'trace', by: CLIENT } }]);
  assert.equal(first.call('log:batch', { loadId: LOAD, lines: [line(1)] }).level, 'trace');
  first.handlers.disconnect();
  const second = makeSocket();
  assert.equal(second.call('log:hello', hello).level, 'trace');
  assert.deepEqual(second.call('log:setLevel', { level: 'debug' }), { ok: true, level: 'debug' });
  assert.equal(second.call('log:batch', { loadId: LOAD, lines: [line(2)] }).level, 'debug');
});

test('acceptTail stores a snapshot tail once; the later batch of the same lines is a no-op', () => {
  const { makeSocket, ingest, store } = setup();
  const c = makeSocket();
  assert.equal(ingest.acceptTail(c.socket, { loadId: LOAD, lines: [line(1)] }), 0, 'no hello yet');
  c.call('log:hello', hello);
  assert.equal(ingest.acceptTail(c.socket, { loadId: 'ffffffff', lines: [line(1)] }), 0, 'another load');
  assert.equal(ingest.acceptTail(c.socket, { loadId: LOAD, lines: [line(1), line(2)], offset: 5 }), 2);
  assert.equal(store.stream(`client:${CLIENT}`).size, 2);
  const ack = c.call('log:batch', { loadId: LOAD, lines: [line(1), line(2), line(3)] });
  assert.equal(ack.acked, 3);
  assert.equal(store.stream(`client:${CLIENT}`).size, 3);
  assert.equal(ingest.acceptTail(c.socket, { loadId: LOAD, lines: 'nope' }), 0);
});

test('lines that would corrupt or forge the export are dropped', () => {
  const { makeSocket, store } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  const good = line(1);
  const lines = [
    good,
    ` ${line(2)}`, // leading space: the export cuts the first character
    JSON.stringify({ t: 1e308, seq: 3, lvl: 'info', cat: 'app', ev: 'x' }), // ts would be Infinity
    line(4, { src: 'server' }),
    line(5, { k: 'header' }),
    line(6, { ts: 1 }),
    line(7, { load: 'x' }),
    JSON.stringify({ t: 5, seq: 8, lvl: 'info', cat: 'not-a-category', ev: 'x' }),
    JSON.stringify({ t: 5, seq: 9, lvl: 'info', cat: 'app', ev: 'e'.repeat(121) }),
    JSON.stringify({ t: 5, seq: 9e15, lvl: 'info', cat: 'app', ev: 'x' }), // would block every later seq
    JSON.stringify({ seq: 10, t: 5, lvl: 'info', cat: 'app', ev: 'x' }), // keys out of order
  ];
  const ack = c.call('log:batch', { loadId: LOAD, lines, offset: 1e300 });
  assert.equal(ack.bad, lines.length - 1);
  const stored = store.stream(`client:${CLIENT}`).entries();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].ts, stored[0].t, 'an absurd offset is ignored');
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: [line(11)] }).acked, 11, 'later lines still land');
});

test('a relay entry at the 16 KB detail cap fits the ingest line cap', () => {
  const { makeSocket, store } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  const big = JSON.stringify({ t: 5, seq: 1, lvl: 'debug', cat: 'socket', ev: 'out.pushAction', room: 'r'.repeat(40), d: { args: 'x'.repeat(16300) } });
  assert.ok(big.length > 16384);
  assert.equal(c.call('log:batch', { loadId: LOAD, lines: [big] }).bad, 0);
  assert.equal(store.stream(`client:${CLIENT}`).size, 1);
});

test('hello metadata is bounded and a socket cannot change identity', () => {
  const { makeSocket, store, clock } = setup();
  const c = makeSocket();
  const ack = c.call('log:hello', { ...hello, build: 'b'.repeat(900000), page: { not: 'a string' }, ua: 'u'.repeat(5000) });
  assert.equal(ack.ok, true);
  const meta = store.stream(`client:${CLIENT}`).meta;
  assert.equal(meta.build.length, 80);
  assert.equal(meta.ua.length, 300);
  assert.equal(meta.loads[LOAD].page, '');
  assert.ok(JSON.stringify(meta).length < 2000);
  assert.deepEqual(c.call('log:hello', { ...hello, clientId: 'ffffffffffffffff' }), { ok: false, reason: 'client_changed' });
  assert.equal(store.stream('client:ffffffffffffffff'), null);
  assert.equal(c.call('log:hello', hello).ok, true, 'the same identity may say hello again');

  for (let i = 0; i < 15; i++) {
    clock.advance(1000);
    makeSocket().call('log:hello', { ...hello, loadId: i.toString(16).padStart(8, '0') });
  }
  const loads = Object.keys(store.stream(`client:${CLIENT}`).meta.loads);
  assert.equal(loads.length, 10);
  assert.ok(loads.includes('0000000e') && !loads.includes(LOAD), 'the newest loads are kept');
});

test('a beacon after the disconnect does not reopen the client stream; a hello does', () => {
  const { makeSocket, store, ingest } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  c.handlers.disconnect();
  const res = { status: () => res, end() {} };
  ingest.beaconHandler({ body: JSON.stringify({ clientId: CLIENT, loadId: LOAD, lines: [line(1)] }) }, res);
  assert.equal(store.stream(`client:${CLIENT}`).size, 1);
  assert.notEqual(store.stream(`client:${CLIENT}`).closedAt, null);
  makeSocket().call('log:hello', hello);
  assert.equal(store.stream(`client:${CLIENT}`).closedAt, null);
});

test('the lobby channel and a socket\'s own room are not rooms a level can be set for', () => {
  const { makeSocket, emitted, ingest } = setup();
  const c = makeSocket(['lobby:watchers']);
  c.call('log:hello', hello);
  assert.equal(c.call('log:setLevel', { roomId: 'lobby:watchers', level: 'trace' }).reason, 'bad_request');
  assert.equal(c.call('log:setLevel', { roomId: c.socket.id, level: 'trace' }).reason, 'bad_request');
  assert.equal(c.call('log:setLevel', { roomId: { toString: () => 'lobby:watchers' }, level: 'trace' }).reason, 'bad_request');
  assert.equal(emitted.length, 0);
  assert.equal(ingest.levelFor('lobby:watchers'), 'debug');
});
