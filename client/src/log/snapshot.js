// One client's state at export time (design 088 §6): what this tab believes, for diffing against the server.
import { LIMITS } from '../../../shared/log/log-schema.mjs';
import { safeStringify } from '../../../shared/log/safe-json.mjs';
import { describeElement } from '../../../shared/log/describe-element.mjs';
import { clientId, loadId, logStats } from './client-log.js';
import { getGpuRenderer } from './capture-errors.js';

const DROP_ORDER = ['socket', 'netcode', 'registry', 'systemState', 'fx', 'settings', 'storage', 'perf'];
const SETTINGS_PREFIX = 'ptcg';
const SETTINGS_MAX_VALUE = 512;
const STORAGE_MAX_KEYS = 200;
const CLASSES_MAX = 120;
const SYSTEM_STATE_LIMITS = { maxBytes: 65536, maxDepth: 4, maxArray: 60, maxString: 300 };

async function tryImport(importer) {
  try {
    return await importer();
  } catch {
    return null;
  }
}

const NO_MODULES = Object.freeze({ applyView: null, cmdEmitter: null, fx: null, state: null });

async function defaultLoad({ hasSocket = typeof globalThis.io === 'function' } = {}) {
  // A page with no Socket.IO client (/unboxing) is not the game: importing the board modules
  // there would evaluate the whole netcode graph against a DOM that has no board.
  if (!hasSocket) return NO_MODULES;
  const [applyView, cmdEmitter, fx, state] = await Promise.all([
    tryImport(() => import('../setup/netcode/apply-view.js')),
    tryImport(() => import('../setup/netcode/cmd-emitter.js')),
    tryImport(() => import('../setup/netcode/advisory-animations.js')),
    tryImport(() => import('../state.js')),
  ]);
  return { applyView, cmdEmitter, fx, state };
}

function section(build) {
  try {
    return build();
  } catch (err) {
    return { error: String(err) };
  }
}

function metaSection({ win, doc, nav }) {
  return {
    url: win.location.pathname + win.location.search,
    w: win.innerWidth,
    h: win.innerHeight,
    dpr: win.devicePixelRatio,
    ua: nav.userAgent,
    lang: nav.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibility: doc.visibilityState,
    online: nav.onLine,
    cores: nav.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null,
    gpu: getGpuRenderer(),
  };
}

function socketSection(socket) {
  if (!socket) return null;
  return {
    id: socket.id,
    connected: socket.connected,
    transport: socket.io?.engine?.transport?.name ?? null,
    recovered: Boolean(socket.recovered),
  };
}

function registrySection(applyView) {
  const out = [];
  for (const [instanceId, record] of applyView.getCardRegistry()) {
    const element = record.element;
    const ds = element?.dataset;
    out.push({
      id: instanceId,
      side: record.side ?? null,
      zone: record.zone ?? null,
      connected: Boolean(element?.isConnected),
      parent: describeElement(element?.parentElement),
      classes: String(element?.className ?? '').slice(0, CLASSES_MAX),
      data: {
        zone: ds?.zone ?? null,
        side: ds?.side ?? null,
        damage: ds?.damage ?? null,
        condition: ds?.specialCondition ?? null,
      },
    });
  }
  return out;
}

function settingsSection(storage) {
  const out = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(SETTINGS_PREFIX)) continue;
    const value = storage.getItem(key) ?? '';
    if (value.length <= SETTINGS_MAX_VALUE) out[key] = value;
  }
  return out;
}

function storageSection(storage) {
  const out = [];
  for (let i = 0; i < Math.min(storage.length, STORAGE_MAX_KEYS); i++) {
    const key = storage.key(i);
    out.push({ key, bytes: (storage.getItem(key) ?? '').length });
  }
  return out;
}

function perfSection({ win, doc }) {
  const used = win.performance?.memory?.usedJSHeapSize;
  return {
    heapMB: typeof used === 'number' ? Math.round(used / 1048576) : null,
    domNodes: doc.getElementsByTagName('*').length,
    log: logStats(),
    ship: win.__ptcgLog?.ship?.() ?? null,
  };
}

function trimToBudget(snapshot) {
  // The reply also carries the unshipped tail, and both must fit one socket message.
  while (JSON.stringify(snapshot).length > LIMITS.snapshotMaxBytes - LIMITS.snapshotTailChars) {
    const victim = DROP_ORDER.findLast((name) => name in snapshot);
    if (!victim) return;
    delete snapshot[victim];
    snapshot.omitted.push(victim);
  }
}

let preloaded = null;

/**
 * Loads the app modules a snapshot reads, once. Called after the page has loaded so that a later
 * snapshot is one synchronous step: a tab that is janking gets very few event-loop turns, and
 * that is the tab whose snapshot matters.
 *
 * @returns {Promise<object>} the module set `buildSnapshotSync` takes
 */
export function preloadSnapshotModules({ hasSocket = typeof globalThis.io === 'function', load = defaultLoad } = {}) {
  const pending = Promise.resolve(load({ hasSocket })).then((modules) => {
    preloaded = modules;
    return modules;
  });
  return pending;
}

/** The module set from `preloadSnapshotModules`, or null until it has resolved. */
export function preloadedSnapshotModules() {
  return preloaded;
}

export async function buildSnapshot({
  win = window,
  doc = document,
  nav = navigator,
  hasSocket = typeof globalThis.io === 'function',
  load = defaultLoad,
} = {}) {
  return buildSnapshotSync({ win, doc, nav, modules: await load({ hasSocket }) });
}

/** One synchronous pass over already-loaded modules (missing ones leave their section null). */
export function buildSnapshotSync({ win = window, doc = document, nav = navigator, modules = {} } = {}) {
  const { applyView = null, cmdEmitter = null, fx = null, state = null } = modules ?? {};
  const storage = () => win.localStorage;
  const snapshot = {
    clientId,
    loadId,
    takenAt: Date.now(),
    omitted: [],
    meta: section(() => metaSection({ win, doc, nav })),
    socket: section(() => socketSection(state?.socket)),
    netcode: section(() => ({
      lastRenderedVersion: applyView?.getLastRenderedVersion() ?? null,
      clientSeq: cmdEmitter?.getClientSeq() ?? null,
      lastAppliedView: applyView?.getLastAppliedView() ?? null,
    })),
    registry: section(() => (applyView ? registrySection(applyView) : null)),
    systemState: section(() =>
      state?.systemState ? JSON.parse(safeStringify(state.systemState, SYSTEM_STATE_LIMITS)) : null
    ),
    fx: section(() => fx?.fxQueueStats() ?? null),
    settings: section(() => settingsSection(storage())),
    storage: section(() => storageSection(storage())),
    perf: section(() => perfSection({ win, doc })),
  };
  trimToBudget(snapshot);
  return snapshot;
}
