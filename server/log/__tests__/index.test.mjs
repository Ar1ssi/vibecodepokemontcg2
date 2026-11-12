import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerLogging } from '../index.mjs';
import { NO_JOURNAL } from '../journal.mjs';

const quietConsole = () => ({ log() {}, info() {}, warn() {}, error() {}, debug() {} });
const stubProcess = () => ({ on() {}, removeListener() {}, stderr: { write() {} } });

test('LOG_OFF=1 builds an inert twin', () => {
  const logging = createServerLogging({ env: { LOG_OFF: '1' }, repoRoot: '/r', processRef: stubProcess(), consoleRef: quietConsole() });
  assert.equal(logging.enabled, false);
  assert.equal(logging.store, null);
  assert.equal(logging.diskSink, null);
  let nexted = false;
  logging.httpMiddleware({}, {}, () => { nexted = true; });
  assert.ok(nexted);
  let status = null;
  logging.beaconHandler({}, { status: (code) => ({ end: () => { status = code; } }) });
  assert.equal(status, 204);
  assert.equal(logging.levelFor('r'), 'debug');
  assert.doesNotThrow(() => {
    logging.log.error('boot', 'x');
    logging.forRoom('r').error('room', 'x');
    logging.attachIo({});
    logging.attachSocket({});
    logging.shutdown();
  });
});

test('LOG_DIR=off keeps memory logging and records boot/start', () => {
  const consoleRef = quietConsole();
  const logging = createServerLogging({
    env: { LOG_DIR: 'off', RENDER_GIT_COMMIT: 'abc', LOG_MAX_MB: '2' },
    repoRoot: '/r',
    processRef: stubProcess(),
    consoleRef,
  });
  try {
    assert.equal(logging.enabled, true);
    assert.equal(logging.diskSink, null);
    const first = JSON.parse(logging.store.stream('server').entries()[0].line);
    assert.equal(first.cat, 'boot');
    assert.equal(first.ev, 'start');
    assert.equal(first.d.commit, 'abc');
    assert.equal(first.d.logDir, null);
    assert.match(logging.bootId, /^[0-9a-z]+-\d+$/);
    consoleRef.warn('hello');
    assert.equal(JSON.parse(logging.store.stream('server').entries().at(-1).line).cat, 'console');
  } finally {
    logging.shutdown();
  }
});

test('attachIo/attachSocket wire the taps and seatOf', () => {
  const logging = createServerLogging({ env: { LOG_DIR: 'off', LOG_MAX_MB: 'junk' }, repoRoot: '/r', processRef: stubProcess(), consoleRef: quietConsole() });
  try {
    const sockets = new Map([['s1', { data: { logClientId: 'cl' } }]]);
    const handlers = {};
    const adapter = { on: (ev, fn) => { (handlers[ev] ??= []).push(fn); } };
    const io = { engine: { on() {} }, of: () => ({ adapter }), sockets: { sockets } };
    logging.attachIo(io, { seatOf: () => 'p2' });
    handlers['join-room'].forEach((fn) => fn('room1', 's1'));
    assert.equal(logging.store.participants('room1')[0].clientId, 'cl');
    const socket = { id: 's1', data: {}, rooms: new Set(), handshake: {}, onAny(fn) { this.any = fn; }, onAnyOutgoing() {}, on() {} };
    logging.attachSocket(socket);
    socket.any('cmd', { roomId: 'room1' });
    const last = JSON.parse(logging.store.stream('room:room1').entries().at(-1).line);
    assert.equal(last.seat, 'p2');
  } finally {
    logging.shutdown();
  }
});

test('createJournal returns one journal per room, journalFor looks it up, LOG_OFF yields NO_JOURNAL', () => {
  const logging = createServerLogging({
    env: { LOG_DIR: 'off' },
    repoRoot: '/r',
    processRef: stubProcess(),
    consoleRef: quietConsole(),
  });
  try {
    const journal = logging.createJournal('r1');
    assert.equal(logging.createJournal('r1'), journal);
    assert.equal(logging.journalFor('r1'), journal);
    assert.equal(logging.journalFor('nope'), null);
  } finally {
    logging.shutdown();
  }
  const off = createServerLogging({ env: { LOG_OFF: '1' }, repoRoot: '/r', processRef: stubProcess(), consoleRef: quietConsole() });
  assert.equal(off.createJournal('r1'), NO_JOURNAL);
  assert.equal(off.journalFor('r1'), null);
});
