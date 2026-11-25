import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLogStore } from '../log-store.mjs';
import { createLogger } from '../../../shared/log/logger.mjs';
import { createLogIngest } from '../client-ingest.mjs';
import { createJournal } from '../journal.mjs';
import { replayJournal } from '../replay.mjs';
import { buildExport } from '../export.mjs';

const CLIENT = 'a1b2c3d4e5f60718';
const LOAD = 'deadbeef';
const line = (seq) => JSON.stringify({ t: 5000 + seq, seq, lvl: 'info', cat: 'app', ev: 'x' });
const hello = { v: 1, clientId: CLIENT, loadId: LOAD, page: '/', build: 'abc', ua: 'UA' };

function setup() {
  const store = createLogStore({ now: () => 1_000_000 });
  const entries = [];
  const log = createLogger({ now: () => 1_000_000, sink: (e) => entries.push(JSON.parse(e.line)), level: 'trace' });
  const adapter = new EventEmitter();
  const io = { of: () => ({ adapter }), to: () => ({ emit() {} }) };
  const ingest = createLogIngest({ store, log, io, now: () => 1_000_000 });
  let n = 0;
  const makeSocket = () => {
    const id = `sock${++n}`;
    const handlers = {};
    const socket = { id, data: {}, rooms: new Set([id]), on: (ev, fn) => (handlers[ev] = fn), emit() {} };
    ingest.attachSocket(socket);
    return {
      socket,
      call(ev, payload) {
        let result;
        handlers[ev](payload, (r) => (result = r));
        return result;
      },
    };
  };
  return { store, entries, ingest, makeSocket, log };
}

test('a numeric-string or array offset is not kept: it would concatenate into the server-aligned ts', () => {
  for (const offset of ['100', [5], null, {}]) {
    const { makeSocket, store } = setup();
    const c = makeSocket();
    c.call('log:hello', hello);
    assert.equal(c.call('log:batch', { loadId: LOAD, lines: [line(1)], offset }).ok, true);
    const stream = store.stream(`client:${CLIENT}`);
    assert.equal(stream.meta.offset, 0, `offset ${JSON.stringify(offset)}`);
    assert.equal(stream.entries()[0].ts, 5001);
  }
});

test('a client id that is not a string is refused even when it stringifies like one', () => {
  const { makeSocket } = setup();
  const c = makeSocket();
  assert.equal(c.call('log:hello', { ...hello, clientId: 1234567890123456 }).reason, 'bad_hello');
  assert.equal(c.call('log:hello', { ...hello, loadId: [12345678] }).reason, 'bad_hello');
});

test('a refused or failed snapshot tail is logged with its reason', () => {
  const { makeSocket, ingest, entries } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  assert.equal(ingest.acceptTail(c.socket, { loadId: 'ffffffff', lines: [line(1)] }), 0);
  assert.equal(ingest.acceptTail(c.socket, { loadId: LOAD, lines: 'nope' }), 0);
  const refused = entries.filter((e) => e.ev === 'tail.refused');
  assert.deepEqual(refused.map((e) => e.d.reason), ['bad_load', 'bad_batch']);
});

test('a beacon with too many lines stores nothing', () => {
  const { makeSocket, ingest, store } = setup();
  makeSocket().call('log:hello', hello);
  const lines = Array.from({ length: 501 }, (_, i) => line(i + 1));
  const res = { status: () => res, end: () => res };
  ingest.beaconHandler({ body: JSON.stringify({ clientId: CLIENT, loadId: LOAD, lines }) }, res);
  assert.equal(store.stream(`client:${CLIENT}`).size, 0);
});

test('levelFor reports trace for a client that asked for it, outside any room', () => {
  const { makeSocket, ingest } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  assert.equal(ingest.levelFor('roomA', CLIENT), 'debug');
  c.call('log:setLevel', { level: 'trace' });
  assert.equal(ingest.levelFor('roomA', CLIENT), 'trace');
  assert.equal(ingest.levelFor('roomA', 'ffffffffffffffff'), 'debug');
});

test('the export header takes a string note only, and names each client with its own level', () => {
  const { makeSocket, ingest, store } = setup();
  const c = makeSocket();
  c.call('log:hello', hello);
  c.call('log:setLevel', { level: 'trace' });
  const lines = buildExport({
    store,
    scope: { clientId: CLIENT },
    note: { not: 'a string' },
    levelFor: ingest.levelFor,
  });
  const header = JSON.parse(lines[0]);
  assert.equal(header.note, '');
  assert.equal(header.sources.find((s) => s.clientId === CLIENT).level, 'trace');
});

test('a journal that failed to record a command reports itself incomplete', () => {
  const { log } = setup();
  const state = { stateVersion: 1, seed: 1, rngCursor: 0 };
  const journal = createJournal({
    roomId: 'r1',
    log,
    hash: () => {
      throw new Error('hash broke');
    },
  });
  journal.rebase(state, { cursor: 0 }, 'created');
  assert.equal(journal.stats().complete, true);
  journal.command({ cmd: { type: 'draw' }, playerId: 'p1', stateBefore: state, cursorBefore: 0, result: { state }, cursorAfter: 0, ms: 1 });
  assert.equal(journal.stats().complete, false);
});

test('replay refuses a command that has no rebase before it', () => {
  const cmd = { k: 'cmd', game: 1, n: 1, cmd: { type: 'draw' }, before: { cursor: 0 }, ok: true, after: { cursor: 0, sv: 1, hash: 'h' } };
  const engine = { applyCommand: () => assert.fail('no state to apply to'), createRng: () => ({ cursor: 0 }), hashState: () => 'h' };
  const result = replayJournal([cmd], engine);
  assert.equal(result.ok, false);
  assert.equal(result.divergence.kind, 'no-base');
});
