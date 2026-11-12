import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../../../shared/log/logger.mjs';
import { installErrorCapture } from '../capture-errors.js';
import { installNetCapture } from '../capture-net.js';
import { tapClientSocket } from '../capture-socket.js';
import { installAppEventCapture } from '../capture-app.js';

function makeLog() {
  const entries = [];
  const log = createLogger({ now: () => Date.now(), sink: (e) => entries.push(e), level: 'trace' });
  return { log, entries };
}

test('error capture logs uncaught errors and failed resources', () => {
  const { log, entries } = makeLog();
  const handlers = {};
  const win = { addEventListener: (t, h) => (handlers[t] = h), removeEventListener() {} };
  installErrorCapture({ log, win });
  handlers.error({ message: 'boom', filename: 'a.js', lineno: 3, error: new Error('boom') });
  handlers.error({ target: { tagName: 'IMG', src: 'http://x/a.png' } });
  assert.deepEqual(
    entries.map((e) => `${e.cat}/${e.ev}`),
    ['error/uncaught', 'net/resource.failed'],
  );
});

function netWin(fetch) {
  return { fetch, location: { origin: 'http://h' } };
}

test('net capture logs a failed status and returns the same response', async () => {
  const { log, entries } = makeLog();
  const response = { ok: false, status: 404 };
  const win = netWin(async () => response);
  installNetCapture({ log, win, clientId: 'abc' });
  assert.equal(await win.fetch('/a?b=1'), response);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ev, 'fetch.failed');
  assert.match(entries[0].line, /"status":404/);
});

test('net capture rethrows the same rejection and logs it', async () => {
  const { log, entries } = makeLog();
  const boom = new TypeError('down');
  const win = netWin(async () => {
    throw boom;
  });
  installNetCapture({ log, win, clientId: 'abc' });
  await assert.rejects(win.fetch('/a'), (e) => e === boom);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ev, 'fetch.failed');
});

test('net capture adds the client header to same-origin string calls', async () => {
  const { log } = makeLog();
  let seen;
  const win = netWin(async (_i, init) => {
    seen = init;
    return { ok: true, status: 200 };
  });
  installNetCapture({ log, win, clientId: 'abc' });
  await win.fetch('/a', { headers: { a: '1' } });
  assert.equal(seen.headers.get('x-ptcg-client'), 'abc');
  assert.equal(seen.headers.get('a'), '1');
});

test('socket tap logs in.view with top-level sv and skips log:batch', () => {
  const { log, entries } = makeLog();
  const h = {};
  const socket = {
    onAny: (fn) => (h.any = fn),
    onAnyOutgoing: (fn) => (h.out = fn),
    on: (e, fn) => (h[e] = fn),
    io: { on() {} },
  };
  tapClientSocket(socket, { log });
  h.any('view', { stateVersion: 7, events: [{ type: 'attack' }] });
  h.out('log:batch', { lines: [] });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ev, 'in.view');
  assert.match(entries[0].line, /"sv":7/);
});

test('app event capture logs custom events once and restores the prototype', () => {
  const { log, entries } = makeLog();
  const original = EventTarget.prototype.dispatchEvent;
  const win = { EventTarget, CustomEvent };
  const uninstall = installAppEventCapture({ log, win });
  try {
    const target = new EventTarget();
    let ran = 0;
    target.addEventListener('game-restarted', () => ran++);
    target.dispatchEvent(new CustomEvent('game-restarted', { detail: { a: 1 } }));
    target.dispatchEvent(new CustomEvent('board-view-applied'));
    assert.equal(ran, 1);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].cat, 'app');
    assert.equal(entries[0].ev, 'game-restarted');
  } finally {
    uninstall();
  }
  assert.equal(EventTarget.prototype.dispatchEvent, original);
});
