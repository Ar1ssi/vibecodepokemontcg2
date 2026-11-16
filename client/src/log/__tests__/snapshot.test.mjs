import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  buildSnapshotSync,
  preloadSnapshotModules,
  preloadedSnapshotModules,
} from '../snapshot.js';
import { LIMITS } from '../../../../shared/log/log-schema.mjs';

const SECTIONS = ['meta', 'socket', 'netcode', 'registry', 'systemState', 'fx', 'settings', 'storage', 'perf'];

function stubEnv(store = { ptcg_a: '1', other: 'xyz', ptcg_big: 'x'.repeat(600) }) {
  const keys = Object.keys(store);
  return {
    win: {
      location: { pathname: '/', search: '?a=1' },
      innerWidth: 1000,
      innerHeight: 700,
      devicePixelRatio: 2,
      performance: { memory: { usedJSHeapSize: 3 * 1048576 } },
      localStorage: { length: keys.length, key: (i) => keys[i], getItem: (k) => store[k] },
    },
    doc: {
      visibilityState: 'visible',
      createElement: () => ({ getContext: () => null }),
      getElementsByTagName: () => ({ length: 42 }),
    },
    nav: { userAgent: 'UA', language: 'en', onLine: true, hardwareConcurrency: 8 },
  };
}

function stubModules({ view = { sv: 1 }, connected = false } = {}) {
  const element = { isConnected: connected, className: 'card', dataset: { zone: 'hand', side: 'you' }, parentElement: null };
  return {
    applyView: {
      getLastAppliedView: () => view,
      getLastRenderedVersion: () => 7,
      getCardRegistry: () => new Map([[12, { side: 'you', zone: 'hand', element }]]),
    },
    cmdEmitter: { getClientSeq: () => 5 },
    fx: { fxQueueStats: () => ({ pending: 0, started: 3 }) },
    state: { systemState: { roomId: 'r1' }, socket: { id: 's', connected: true, io: { engine: { transport: { name: 'websocket' } } } } },
  };
}

test('sections come out in order with the expected shapes', async () => {
  const snapshot = await buildSnapshot({ ...stubEnv(), load: async () => stubModules({ connected: true }) });
  const present = Object.keys(snapshot).filter((k) => SECTIONS.includes(k));
  assert.deepEqual(present, SECTIONS);
  assert.deepEqual(snapshot.omitted, []);
  assert.equal(snapshot.meta.url, '/?a=1');
  assert.equal(snapshot.meta.gpu, null);
  assert.equal(snapshot.socket.transport, 'websocket');
  assert.deepEqual(snapshot.netcode, { lastRenderedVersion: 7, clientSeq: 5, lastAppliedView: { sv: 1 } });
  assert.equal(snapshot.registry[0].connected, true);
  assert.equal(snapshot.registry[0].data.zone, 'hand');
  assert.deepEqual(snapshot.systemState, { roomId: 'r1' });
  assert.deepEqual(snapshot.fx, { pending: 0, started: 3 });
  assert.deepEqual(snapshot.settings, { ptcg_a: '1' });
  assert.deepEqual(snapshot.storage.map((s) => s.key), ['ptcg_a', 'other', 'ptcg_big']);
  assert.equal(snapshot.perf.heapMB, 3);
  assert.equal(snapshot.perf.domNodes, 42);
  assert.equal(typeof snapshot.takenAt, 'number');
});

test('a detached card element is reported as not connected', async () => {
  const snapshot = await buildSnapshot({ ...stubEnv(), load: async () => stubModules({ connected: false }) });
  assert.equal(snapshot.registry[0].connected, false);
});

test('an oversized view drops sections last-to-first, keeps meta, stays under the cap', async () => {
  const view = { huge: 'x'.repeat(1_000_000) };
  const snapshot = await buildSnapshot({ ...stubEnv(), load: async () => stubModules({ view }) });
  assert.deepEqual(snapshot.omitted, ['perf', 'storage', 'settings', 'fx', 'systemState', 'registry', 'netcode']);
  assert.ok(snapshot.meta);
  assert.ok(JSON.stringify(snapshot).length <= LIMITS.snapshotMaxBytes);
});

test('a failing section stores its error and the others survive', async () => {
  const env = stubEnv();
  env.win.localStorage = { get length() { throw new Error('blocked'); }, key() {}, getItem() {} };
  const snapshot = await buildSnapshot({ ...env, load: async () => stubModules() });
  assert.match(snapshot.settings.error, /blocked/);
  assert.match(snapshot.storage.error, /blocked/);
  assert.equal(snapshot.fx.started, 3);
});

test('with every module missing the snapshot still has meta and omitted', async () => {
  const snapshot = await buildSnapshot({
    ...stubEnv(),
    load: async () => ({ applyView: null, cmdEmitter: null, fx: null, state: null }),
  });
  assert.equal(snapshot.meta.ua, 'UA');
  assert.deepEqual(snapshot.omitted, []);
  assert.equal(snapshot.socket, null);
  assert.equal(snapshot.registry, null);
  assert.equal(snapshot.fx, null);
});

test('after a preload the snapshot is built synchronously from the cached modules', async () => {
  const env = stubEnv();
  assert.equal(preloadedSnapshotModules(), null);
  const modules = await preloadSnapshotModules({ load: async () => stubModules() });
  assert.equal(preloadedSnapshotModules(), modules);
  const snapshot = buildSnapshotSync({ ...env, modules: preloadedSnapshotModules() });
  assert.equal(typeof snapshot.then, 'undefined');
  assert.equal(snapshot.netcode.lastRenderedVersion, 7);
  assert.equal(snapshot.registry[0].id, 12);
  const bare = buildSnapshotSync({ ...env, modules: null });
  assert.equal(bare.registry, null);
  assert.equal(bare.meta.w, 1000);
});

test('a page with no socket loads no app modules for the snapshot', async () => {
  const env = stubEnv();
  let loaded = 0;
  const realIo = globalThis.io;
  delete globalThis.io;
  try {
    const modules = await preloadSnapshotModules({ hasSocket: false });
    assert.deepEqual(modules, { applyView: null, cmdEmitter: null, fx: null, state: null });
    const snapshot = await buildSnapshot({ ...env, hasSocket: false });
    assert.equal(snapshot.registry, null);
    assert.equal(snapshot.netcode.lastAppliedView, null);
    assert.equal(snapshot.meta.w, 1000);
    assert.equal(loaded, 0);
  } finally {
    if (realIo !== undefined) globalThis.io = realIo;
  }
});

test('the snapshot leaves room for the tail inside one socket message', async () => {
  const env = stubEnv();
  const big = { blob: 'x'.repeat(LIMITS.snapshotMaxBytes - 50_000) };
  const snapshot = await buildSnapshot({ ...env, load: async () => stubModules({ view: big }) });
  assert.ok(JSON.stringify(snapshot).length <= LIMITS.snapshotMaxBytes - LIMITS.snapshotTailChars);
  assert.ok(snapshot.omitted.includes('netcode'));
});
