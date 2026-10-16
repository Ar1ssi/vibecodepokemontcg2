// Boot, wiring and fallback for the three.js board (design 074 §D3 "Lifecycle", §D9). Loaded by
// front-end.js through import() only when the flag asks for it; three.js and the scene modules
// load from here, so the iframe board never pays for them.
import { isBoard3dRequested } from './board-flag.mjs';
import { cameraFromCssTilt } from './board-camera.mjs';
import { flatLayout, halfFromViewport } from './board-layout.mjs';

const ACTIVE_CLASS = 'board3d-active';
const CHAT_LINES = {
  'legacy-netcode': 'The 3D board needs the server-run game; showing the classic board.',
  'no-webgl2': 'This browser cannot run the 3D board (no WebGL2); showing the classic board.',
  'context-lost-twice': 'The 3D board lost its graphics context twice; switched to the classic board.',
  'load-failed': 'The 3D board failed to load; showing the classic board.',
};

const defaultDeps = {
  importThree: () => import('three'),
  loadModules: async () => {
    const [renderer, textures, scene, clock, table, room] = await Promise.all([
      import('../gl/gl-renderer.js'),
      import('../gl/gl-textures.js'),
      import('./board-scene.js'),
      import('./scene-clock.js'),
      import('./table-mesh.js'),
      import('../../vendor/three/RoomEnvironment.js'),
    ]);
    return {
      createRenderer: renderer.createRenderer,
      createTextureCache: textures.createTextureCache,
      createMatTextureLoader: table.createMatTextureLoader,
      createBoardScene: scene.createBoardScene,
      createSceneClock: clock.createSceneClock,
      RoomEnvironment: room.RoomEnvironment,
    };
  },
  chat: async (message) => {
    const { appendMessage } = await import('../chatbox/append-message.js');
    appendMessage('', message, 'announcement', false);
  },
  systemState: async () => (await import('../../state.js')).systemState,
  matSpec: async () => (await import('../sizing/apply-mat-layout.js')).currentMatSpec(),
};

const safeStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

let active = false;
/** The running board: everything `disposeBoard3d` tears down. */
let session = null;

/** True while the three.js board is the board on screen. */
export const board3dActive = () => active;

/** The live scene (`board-scene.js`), or null when the 3D board is not running. */
export function getBoardScene() {
  return session?.scene ?? null;
}

const report = (deps, reason) => {
  console.info(`board3d: ${reason}`);
  const line = CHAT_LINES[reason];
  if (!line) return;
  try {
    Promise.resolve(deps.chat(line)).catch((error) => console.warn('board3d: chat line failed', error));
  } catch (error) {
    console.warn('board3d: chat line failed', error);
  }
};

const fallback = (deps, reason) => {
  report(deps, reason);
  return { active: false, reason };
};

const viewportOf = (host, win) => ({
  w: host.clientWidth || win?.innerWidth || 0,
  h: host.clientHeight || win?.innerHeight || 0,
});

/** Swaps in a fresh canvas: a lost WebGL context stays bound to its canvas. */
const freshCanvas = (host, old) => {
  const canvas = old.cloneNode(false);
  host.replaceChild(canvas, old);
  return canvas;
};

/**
 * Starts the three.js board when the flag asks for it; otherwise loads nothing.
 * @param {{ host?: HTMLElement|null, requested?: boolean, deps?: {
 *   createRenderer?: Function, importThree?: () => Promise<object>, loadModules?: () => Promise<object>,
 *   chat?: (message: string) => unknown, storage?: Storage|null, systemState?: () => object,
 *   matSpec?: () => object|null, document?: Document, window?: Window } }} [options]
 *   `deps` replaces the browser services (tests inject them). `loadModules` resolves
 *   `{ createRenderer, createTextureCache, createMatTextureLoader, createBoardScene, createSceneClock,
 *   RoomEnvironment }`.
 * @returns {Promise<{ active: boolean, reason: string|null }>} reasons: 'flag-off', 'no-host',
 *   'legacy-netcode', 'load-failed', 'no-webgl2'; a later second context loss falls back with
 *   'context-lost-twice' after this resolved.
 */
export async function initializeBoard3d({
  deps: injected = {},
  host = (injected.document ?? globalThis.document)?.getElementById('board3dHost') ?? null,
  requested = isBoard3dRequested(
    globalThis.location?.search ?? '',
    'storage' in injected ? injected.storage : safeStorage()
  ),
} = {}) {
  const deps = { ...defaultDeps, ...injected };
  const doc = deps.document ?? globalThis.document;
  const win = deps.window ?? globalThis.window;

  if (!requested) return fallback(deps, 'flag-off');
  if (session) return { active, reason: null };
  if (!host || !doc) return fallback(deps, 'no-host');

  const systemState = await deps.systemState();
  if (systemState?.serverAuthoritative === false) return fallback(deps, 'legacy-netcode');

  let three;
  let modules;
  try {
    [three, modules] = await Promise.all([deps.importThree(), deps.loadModules()]);
  } catch (error) {
    console.warn('board3d: modules failed to load', error);
    return fallback(deps, 'load-failed');
  }
  const createRenderer = injected.createRenderer ?? modules.createRenderer;

  const current = { lost: 0, model: null };

  const readMat = async () => {
    try {
      return (await deps.matSpec()) ?? null;
    } catch (error) {
      console.warn('board3d: mat spec unavailable', error);
      return null;
    }
  };

  const relayout = () => {
    if (!session) return;
    const viewport = viewportOf(host, win);
    if (!(viewport.w > 0 && viewport.h > 0)) return;
    const half = halfFromViewport(viewport);
    const spec = session.mat;
    session.scene.setViewport(viewport);
    session.scene.setCamera(cameraFromCssTilt({ viewportW: viewport.w, viewportH: viewport.h, nearHalf: half }));
    session.scene.setLayout(flatLayout(spec?.profile, half, { viewport, matScale: spec?.scale ?? 1 }));
  };

  const onLost = () => {
    current.lost += 1;
    // Rebuild after the loss event returns; a second loss gives up on WebGL for this page.
    Promise.resolve().then(() => {
      if (!session) return;
      if (current.lost >= 2) {
        disposeBoard3d();
        report(deps, 'context-lost-twice');
        return;
      }
      current.model = session.scene.inspect?.().model ?? current.model;
      teardownGraphics();
      const canvas = freshCanvas(host, session.canvas);
      if (!buildGraphics(canvas)) {
        disposeBoard3d();
        report(deps, 'no-webgl2');
        return;
      }
      if (current.model) session.scene.applyModel(current.model);
      session.scene.setMat(session.mat);
      relayout();
    });
  };

  /** Renderer, textures, clock and scene on `canvas`; false when WebGL2 is unavailable. */
  function buildGraphics(canvas) {
    const gl = createRenderer({ canvas, onLost });
    if (!gl) return false;
    const textures = modules.createTextureCache({ loader: modules.createMatTextureLoader?.(three) });
    const clock = modules.createSceneClock(canvas);
    const scene = modules.createBoardScene({
      host,
      canvas,
      renderer: gl.renderer,
      textures,
      clock,
      three,
      RoomEnvironment: modules.RoomEnvironment,
    });
    Object.assign(session, { canvas, gl, textures, clock, scene });
    if (doc.visibilityState !== 'hidden') clock.start();
    return true;
  }

  function teardownGraphics() {
    session.scene?.dispose();
    session.clock?.dispose();
    session.gl?.dispose();
    Object.assign(session, { gl: null, textures: null, clock: null, scene: null });
  }

  const initialCanvas = host.querySelector('canvas') ?? host.appendChild(doc.createElement('canvas'));
  session = { host, canvas: initialCanvas, mat: null, cleanup: [], teardownGraphics };
  if (!buildGraphics(initialCanvas)) {
    session = null;
    return fallback(deps, 'no-webgl2');
  }

  session.mat = await readMat();
  if (!session) return { active: false, reason: 'context-lost-twice' };
  session.scene.setMat(session.mat);

  host.hidden = false;
  doc.body?.classList.add(ACTIVE_CLASS);
  active = true;
  relayout();

  const onMatApplied = async () => {
    const spec = await readMat();
    if (!session) return;
    session.mat = spec;
    session.scene.setMat(spec);
    relayout();
  };
  doc.addEventListener('mat-layout-applied', onMatApplied);
  session.cleanup.push(() => doc.removeEventListener('mat-layout-applied', onMatApplied));

  const onVisibility = () => {
    if (!session?.clock) return;
    if (doc.visibilityState === 'hidden') {
      session.clock.stop();
      return;
    }
    session.clock.start();
    session.scene.invalidate();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  session.cleanup.push(() => doc.removeEventListener('visibilitychange', onVisibility));

  const ResizeObserverImpl = win?.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverImpl === 'function') {
    const observer = new ResizeObserverImpl(() => relayout());
    observer.observe(host);
    session.cleanup.push(() => observer.disconnect());
  } else if (win) {
    win.addEventListener('resize', relayout);
    session.cleanup.push(() => win.removeEventListener('resize', relayout));
  }

  if (win && new URLSearchParams(win.location?.search ?? '').get('e2e') === '1') {
    win.__board3d = {
      get scene() {
        return session?.scene?.inspect().scene ?? null;
      },
      get camera() {
        return session?.scene?.inspect().camera ?? null;
      },
      get layout() {
        return session?.scene?.inspect().layout ?? null;
      },
      get cameraDesc() {
        return session?.scene?.inspect().cameraDesc ?? null;
      },
    };
    session.cleanup.push(() => {
      delete win.__board3d;
    });
  }

  return { active: true, reason: null };
}

/** Stops the 3D board and gives the screen back to the iframe board. */
export function disposeBoard3d() {
  if (!session) return;
  const { host, cleanup, teardownGraphics } = session;
  for (const undo of cleanup.splice(0)) undo();
  teardownGraphics();
  session = null;
  active = false;
  host.hidden = true;
  host.ownerDocument?.body?.classList.remove(ACTIVE_CLASS);
}
