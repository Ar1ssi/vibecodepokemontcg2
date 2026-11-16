import test from 'node:test';
import assert from 'node:assert/strict';
import { startShipping } from '../ship.js';
import { createRing } from '../../../../shared/log/ring.mjs';
import { createLogger } from '../../../../shared/log/logger.mjs';
import { LIMITS } from '../../../../shared/log/log-schema.mjs';

const CLIENT = 'a1b2c3d4e5f60718';
const LOAD = 'deadbeef';

// performance.now is not covered by mock timers, so tests advance both together.
function advance(t, ms) {
  clock.ms += ms;
  t.mock.timers.tick(ms);
}
const clock = { ms: 0 };

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  clock.ms = 0;
  t.mock.method(performance, 'now', () => clock.ms);
  const ring = createRing(LIMITS.clientRing);
  const listeners = new Set();
  const log = createLogger({
    now: () => performance.timeOrigin + performance.now(),
    sink: (e) => {
      ring.push({ seq: e.seq, t: e.t, line: e.line });
      for (const fn of listeners) fn(e);
    },
  });
  const onEntry = (fn) => (listeners.add(fn), () => listeners.delete(fn));
  const sent = [];
  const handlers = {};
  const socket = {
    connected: true,
    on: (ev, fn) => (handlers[ev] = fn),
    off: (ev) => delete handlers[ev],
    timeout: () => ({ emit: (event, payload, cb) => sent.push({ event, payload, cb }) }),
  };
  const winHandlers = {};
  const docHandlers = {};
  const win = {
    location: { pathname: '/play' },
    __PTCG_BUILD: 'b1',
    addEventListener: (ev, fn) => (winHandlers[ev] = fn),
    removeEventListener: (ev) => delete winHandlers[ev],
  };
  const doc = {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => (docHandlers[ev] = fn),
    removeEventListener: (ev) => delete docHandlers[ev],
  };
  const beacons = [];
  const nav = { userAgent: 'UA', sendBeacon: (url, body) => beacons.push({ url, body }) };
  const ship = startShipping({ socket, log, ring, onEntry, clientId: CLIENT, loadId: LOAD, win, doc, nav });
  const eventsOf = (name) => sent.filter((s) => s.event === name);
  return { ship, log, sent, handlers, winHandlers, docHandlers, doc, beacons, eventsOf };
}

const okHello = { ok: true, serverT: 1, level: 'debug', acked: 0 };

test('hello is sent on start; a refused hello leaves the shipper unconnected', (t) => {
  const { ship, eventsOf } = setup(t);
  const [h] = eventsOf('log:hello');
  assert.equal(h.payload.clientId, CLIENT);
  assert.equal(h.payload.loadId, LOAD);
  assert.equal(h.payload.page, '/play');
  assert.equal(h.payload.build, 'b1');
  h.cb(null, { ok: false, reason: 'bad_hello' });
  assert.equal(ship.state().connected, false);
  ship.stop();
});

test('after an ok hello, 3 entries ship as one batch after 2 s and ack advances', (t) => {
  const { ship, log, eventsOf } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  assert.equal(ship.state().connected, true);
  log.info('app', 'a');
  log.info('app', 'b');
  log.info('app', 'c');
  advance(t, 1000);
  assert.equal(eventsOf('log:batch').length, 0);
  advance(t, 1250);
  const [batch] = eventsOf('log:batch');
  assert.equal(batch.payload.lines.length, 3);
  assert.equal(batch.payload.loadId, LOAD);
  batch.cb(null, { ok: true, acked: 3, level: 'debug' });
  assert.equal(ship.state().acked, 3);
  ship.stop();
});

test('a rate refusal pauses shipping for 10 s', (t) => {
  const { ship, log, eventsOf } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  log.info('app', 'a');
  advance(t, 2250);
  eventsOf('log:batch')[0].cb(null, { ok: false, reason: 'rate' });
  advance(t, 9000);
  assert.equal(eventsOf('log:batch').length, 1);
  advance(t, 1500);
  assert.equal(eventsOf('log:batch').length, 2);
  ship.stop();
});

test('log:level trace raises the logger level', (t) => {
  const { ship, log, handlers } = setup(t);
  handlers['log:level']({ level: 'trace', by: 'peer' });
  assert.equal(log.level(), 'trace');
  handlers['log:level']({ level: 'bogus' });
  assert.equal(log.level(), 'trace');
  ship.stop();
});

test('pagehide beacons the unacked lines', (t) => {
  const { ship, log, winHandlers, beacons } = setup(t);
  winHandlers.pagehide();
  assert.equal(beacons.length, 0);
  log.info('app', 'unsent');
  winHandlers.pagehide();
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, '/api/log/beacon');
  const body = JSON.parse(beacons[0].body);
  assert.equal(body.clientId, CLIENT);
  assert.equal(body.lines.length, 1);
  ship.stop();
});

test('hidden visibility flushes immediately; flushNow resolves on ack', async (t) => {
  const { ship, log, eventsOf, docHandlers, doc } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  log.info('app', 'a');
  const flushed = ship.flushNow();
  const [batch] = eventsOf('log:batch');
  assert.ok(batch);
  batch.cb(null, { ok: true, acked: 1 });
  assert.equal(await flushed, true);
  assert.equal(await ship.flushNow(), true);
  log.info('app', 'b');
  docHandlers.visibilitychange();
  assert.equal(eventsOf('log:batch').length, 1, 'a visible tab waits for the normal flush');
  doc.visibilityState = 'hidden';
  docHandlers.visibilitychange();
  assert.equal(eventsOf('log:batch').length, 2, 'a hidden tab flushes at once');
  assert.equal(eventsOf('log:batch')[1].payload.lines.length, 1);
  ship.stop();
});

test('a large backlog still fits one beacon: the newest lines, measured as sent', (t) => {
  const { ship, log, winHandlers, beacons } = setup(t);
  for (let i = 0; i < 2000; i++) {
    clock.ms += 20; // under the flood gate's 60 per second
    log.info('app', 'x', { text: `entry "${i}" ${'y'.repeat(120)}` });
  }
  winHandlers.pagehide();
  assert.equal(beacons.length, 1);
  assert.ok(beacons[0].body.length < 64 * 1024, `body is ${beacons[0].body.length} chars`);
  const lines = JSON.parse(beacons[0].body).lines;
  assert.ok(lines.length > 50);
  assert.equal(JSON.parse(lines.at(-1)).seq, 2000, 'the newest entry is included');
  ship.stop();
});

test('an ok ack settles the whole batch even when the server refused its last line', (t) => {
  const { ship, log, eventsOf } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  log.info('app', 'a');
  log.info('app', 'b');
  advance(t, 2000);
  eventsOf('log:batch')[0].cb(null, { ok: true, acked: 1, bad: 1 });
  assert.equal(ship.state().acked, 2);
  advance(t, 4000);
  assert.equal(eventsOf('log:batch').length, 1, 'the refused line is not sent again');
  ship.stop();
});

test('tail() is the unacked entries in batch shape, for a snapshot reply', (t) => {
  const { ship, log, eventsOf } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  assert.deepEqual(ship.tail().lines, []);
  log.info('app', 'a');
  const tail = ship.tail();
  assert.equal(tail.loadId, LOAD);
  assert.equal(tail.lines.length, 1);
  assert.equal(JSON.parse(tail.lines[0]).ev, 'a');
  ship.stop();
});

test('flushNow resolves false when nothing is connected', async (t) => {
  const { ship, log } = setup(t);
  log.info('app', 'a');
  assert.equal(await ship.flushNow(), false);
  ship.stop();
});

test('successful hello starts pings; stop clears the interval', (t) => {
  const { ship, log, eventsOf } = setup(t);
  eventsOf('log:hello')[0].cb(null, okHello);
  advance(t, 1000);
  assert.equal(eventsOf('log:ping').length, 1);
  log.info('app', 'a');
  ship.stop();
  advance(t, 5000);
  assert.equal(eventsOf('log:batch').length, 0);
  assert.equal(eventsOf('log:ping').length, 1);
});
