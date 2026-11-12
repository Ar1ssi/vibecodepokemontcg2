// One client's state at export time (design 087 §6): what this tab believes, for diffing against the server.
import { LIMITS } from '../../../shared/log/log-schema.mjs';
import { safeStringify } from '../../../shared/log/safe-json.mjs';
import { describeElement } from '../../../shared/log/describe-element.mjs';
import { clientId, loadId, logStats } from './client-log.js';

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

async function defaultLoad({ hasSocket = typeof globalThis.io === 'function' } = {}) {
  const [applyView, cmdEmitter, fx, state] = await Promise.all([
    tryImport(() => import('../setup/netcode/apply-view.js')),
    tryImport(() => import('../setup/netcode/cmd-emitter.js')),
    tryImport(() => import('../setup/netcode/advisory-animations.js')),
    hasSocket ? tryImport(() => import('../state.js')) : null,
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

function readGpu(doc) {
  try {
    const gl = doc.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  } catch {
    return null;
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
    gpu: readGpu(doc),
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
  while (JSON.stringify(snapshot).length > LIMITS.snapshotMaxBytes) {
    const victim = DROP_ORDER.findLast((name) => name in snapshot);
    if (!victim) return;
    delete snapshot[victim];
    snapshot.omitted.push(victim);
  }
}

export async function buildSnapshot({
  win = window,
  doc = document,
  nav = navigator,
  hasSocket = typeof globalThis.io === 'function',
  load = defaultLoad,
} = {}) {
  const { applyView, cmdEmitter, fx, state } = await load({ hasSocket });
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
