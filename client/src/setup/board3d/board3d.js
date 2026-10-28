// Boot, wiring and failure reporting for the three.js board (design 074 §D3 "Lifecycle", §D9).
// Loaded by front-end.js through import(), so the page still boots when this board cannot start;
// three.js and the scene modules load from here.
import { cameraFromCssTilt, cameraTcgLive } from './board-camera.mjs';
import { boardWidthFrac, flatLayout, halfFromViewport } from './board-layout.mjs';
import { CARD_ZONES } from './board-model.mjs';
import { createPerfHud, perfHudWanted } from './perf-hud.js';
import { environmentOverride } from './stadium-environment-layout.mjs';

const ACTIVE_CLASS = 'board3d-active';
// Past the scene's longest tween (board-scene.js CARD_POSE_MS 180, card-mesh.js FLIP_MS 300).
const MIRROR_SETTLE_MS = 400;
// Reasons the player is told about; 'no-host' is a page bug and only reaches the console.
const ANNOUNCED_REASONS = new Set(['legacy-netcode', 'no-webgl2', 'context-lost-twice', 'load-failed']);
const unavailableNotice = (reason) => `3D board unavailable: ${reason}; this browser needs WebGL2`;

const defaultDeps = {
  importThree: () => import('three'),
  loadModules: async () => {
    const [renderer, textures, scene, clock, table, room, bloom, impacts, model, applyView, hydrateHolo, matFx, containers, input, hover, dragActions, fxApply, fxModel, handSort] =
      await Promise.all([
        import('../gl/gl-renderer.js'),
        import('../gl/gl-textures.js'),
        import('./board-scene.js'),
        import('./scene-clock.js'),
        import('./table-mesh.js'),
        import('../../vendor/three/RoomEnvironment.js'),
        import('../../vendor/three/addons/postprocessing/UnrealBloomPass.js'),
        import('../netcode/mat-fx/impact/impact-stage.js'),
        import('./board-model.mjs'),
        import('../netcode/apply-view.js'),
        import('../deck-constructor/hydrate-holo.js'),
        import('../image-logic/mat-fx.mjs'),
        import('../../initialization/global-variables/containers.js'),
        import('./board-input.js'),
        import('../image-logic/hover-preview.js'),
        import('./board-drag-actions.js'),
        import('../image-logic/fx-settings.js'),
        import('../image-logic/fx-settings.mjs'),
        import('../netcode/hand-sort-context.js'),
      ]);
    return {
      createRenderer: renderer.createRenderer,
      createTextureCache: textures.createTextureCache,
      createMatTextureLoader: table.createMatTextureLoader,
      createBoardScene: scene.createBoardScene,
      createSceneClock: clock.createSceneClock,
      RoomEnvironment: room.RoomEnvironment,
      UnrealBloomPass: bloom.UnrealBloomPass,
      attachSceneImpacts: impacts.attachSceneImpacts,
      boardModelFrom: model.boardModelFrom,
      getLastAppliedView: applyView.getLastAppliedView,
      sortZoneCards: handSort.sortZoneCardsForRender,
      cardBackSrcFor: hydrateHolo.cardBackSrcForUser,
      motionReduced: matFx.motionReduced,
      fxDisabled: matFx.fxDisabled,
      boardMirror: containers.boardMirror,
      createBoardInput: input.createBoardInput,
      getHoverPreview: hover.getHoverPreview,
      createBoardDragActions: dragActions.createBoardDragActions,
      cameraPreset: {
        current: () => fxModel.readSettings(globalThis.localStorage).cameraPreset,
        subscribe: (listener) => fxApply.onFxSettingsChanged((settings) => listener(settings.cameraPreset)),
      },
      loadFoil,
    };
  },
  chat: async (message) => {
    const { appendMessage } = await import('../chatbox/append-message.js');
    appendMessage('', message, 'announcement', false);
  },
  systemState: async () => (await import('../../state.js')).systemState,
  matSpec: async () => (await import('../sizing/apply-mat-layout.js')).currentMatSpec(),
};

/**
 * The TCG Live foil as hydrate-holo.js resolves it: the manifest (tcgl-foil-store.js) plus the
 * shaders/materials `createFoilMaterial` needs. Null when either is unavailable (no texture
 * host configured, missing files): every card then wears its plain front.
 */
async function loadFoil() {
  const [store, material, manifestModule, holo] = await Promise.all([
    import('../foil/tcgl-foil-store.js'),
    import('../foil/tcgl-foil-material.js'),
    import('../foil/tcgl-foil-manifest.mjs'),
    import('../deck-builder/core/holo.mjs'),
  ]);
  const manifest = await store.loadFoilManifest();
  if (!manifest) return null;
  try {
    await material.loadFoilData();
  } catch (error) {
    console.warn('board3d: foil shaders unavailable', error?.message || error);
    return null;
  }
  return {
    manifest,
    createFoilMaterial: material.createFoilMaterial,
    recordFor: (card) => {
      const reverse = holo.isReverseHoloCard(card);
      const id = holo.foilCardId(card, manifest, { reverse });
      return manifestModule.foilRecordFor(manifest, id, { reverse });
    },
  };
}

/** Cards of a view by instance id: owner (`you`/`them`) and spectator (`players`) views. */
function cardsOfView(view) {
  const cards = new Map();
  const players = view?.you
    ? [view.you, view.them]
    : Object.values(view?.players && typeof view.players === 'object' ? view.players : {});
  for (const player of players) {
    for (const zoneId of CARD_ZONES) {
      const list = player?.zones?.[zoneId];
      if (!Array.isArray(list)) continue;
      for (const card of list) if (card && typeof card.instanceId === 'number') cards.set(card.instanceId, card);
    }
  }
  return cards;
}

let active = false;
/** The running board: everything `disposeBoard3d` tears down. */
let session = null;

/** True while the three.js board is the board on screen. */
export const board3dActive = () => active;

/** The live scene (`board-scene.js`), or null when the 3D board is not running. */
export function getBoardScene() {
  return session?.scene ?? null;
}

/** The live pointer input (`board-input.js`), or null when the 3D board is not running. */
export function getBoardInput() {
  return session?.input ?? null;
}

/** A board that cannot run: one console error, plus one chat announcement for the reasons a player can act on. */
const report = (deps, reason) => {
  console.error(`board3d: unavailable (${reason})`);
  if (!ANNOUNCED_REASONS.has(reason)) return;
  try {
    Promise.resolve(deps.chat(unavailableNotice(reason))).catch((error) =>
      console.warn('board3d: chat line failed', error)
    );
  } catch (error) {
    console.warn('board3d: chat line failed', error);
  }
};

const fail = (deps, reason) => {
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
 * Starts the three.js board. A page that cannot run it reports why (console error plus one chat
 * line) and stays without a board; there is no other board to fall back to.
 * @param {{ host?: HTMLElement|null, deps?: {
 *   createRenderer?: Function, importThree?: () => Promise<object>, loadModules?: () => Promise<object>,
 *   chat?: (message: string) => unknown, systemState?: () => object,
 *   matSpec?: () => object|null, document?: Document, window?: Window } }} [options]
 *   `deps` replaces the browser services (tests inject them). `loadModules` resolves
 *   `{ createRenderer, createTextureCache, createMatTextureLoader, createBoardScene, createSceneClock,
 *   RoomEnvironment }`, optionally `boardMirror` (board-mirror.js, the shadow roots apply-view.js
 *   renders into while this board runs: its UI state feeds the scene, the scene's rects feed it),
 *   `createBoardInput` (board-input.js, the canvas's pointer input dispatched to the mirror),
 *   `getHoverPreview` (hover-preview.js, the preview that input feeds),
 *   `createBoardDragActions` (board-drag-actions.js, the page-side calls a drag ends in) and
 *   `cameraPreset` (`{ current(): 'tilt12'|'tcgl', subscribe(listener(preset)): unsubscribe }`, the
 *   stored camera setting; absent = 'tilt12').
 * @returns {Promise<{ active: boolean, reason: string|null }>} reasons: 'no-host',
 *   'legacy-netcode', 'load-failed', 'no-webgl2'; a later second context loss reports
 *   'context-lost-twice' after this resolved.
 */
export async function initializeBoard3d({
  deps: injected = {},
  host = (injected.document ?? globalThis.document)?.getElementById('board3dHost') ?? null,
} = {}) {
  const deps = { ...defaultDeps, ...injected };
  const doc = deps.document ?? globalThis.document;
  const win = deps.window ?? globalThis.window;

  if (session) return { active, reason: null };
  if (!host || !doc) return fail(deps, 'no-host');

  const systemState = await deps.systemState();
  if (systemState?.serverAuthoritative === false) return fail(deps, 'legacy-netcode');

  let three;
  let modules;
  try {
    [three, modules] = await Promise.all([deps.importThree(), deps.loadModules()]);
  } catch (error) {
    console.warn('board3d: modules failed to load', error);
    return fail(deps, 'load-failed');
  }
  const createRenderer = injected.createRenderer ?? modules.createRenderer;

  const current = { lost: 0, model: null, cards: new Map(), foil: null, warnedInvalid: false };
  const mirror = modules.boardMirror ?? null;

  // The mirror's rects follow the scene: after each model, each relayout and every frame in which
  // a card moved (plus the frame it settled on), coalesced to one write per task.
  // A trailing sync once every tween has settled covers a page that draws no frames (a hidden or
  // throttled tab stops the clock): its mirror still ends on the scene's final rects.
  let mirrorSyncQueued = false;
  let settleTimer = null;
  const syncMirrorNow = () => {
    if (!session?.scene) return;
    // The board's column: the canvas runs on under the side menu (relayout's halfFromViewport).
    const box = session.canvas?.getBoundingClientRect?.() ?? null;
    const column = box && { left: box.left, top: box.top, width: box.width * boardWidthFrac(doc.body?.classList), height: box.height };
    mirror.sync(current.model, session.scene.rects(), session.scene.zoneRects?.() ?? {}, column);
  };
  const queueMirrorSync = () => {
    if (!mirror) return;
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      syncMirrorNow();
    }, MIRROR_SETTLE_MS);
    if (mirrorSyncQueued) return;
    mirrorSyncQueued = true;
    queueMicrotask(() => {
      mirrorSyncQueued = false;
      syncMirrorNow();
    });
  };
  let cardsWereMoving = false;
  let perfHud = null;
  const onSceneRendered = (frame) => {
    const { cardsMoving } = frame;
    if (cardsMoving || cardsWereMoving) queueMirrorSync();
    cardsWereMoving = cardsMoving;
    perfHud?.record(frame);
  };

  // Card foil for the scene's pool (card-mesh.js): lookups answer null until loadFoil resolves.
  const foil =
    typeof modules.loadFoil === 'function'
      ? {
          recordFor: (placement) => {
            const card = current.cards.get(placement?.instanceId);
            return current.foil && card ? current.foil.recordFor(card) : null;
          },
          createMaterial: (record) => current.foil.createFoilMaterial(record),
          uv: () => current.foil?.manifest?.uv ?? null,
        }
      : null;

  const readMat = async () => {
    try {
      return (await deps.matSpec()) ?? null;
    } catch (error) {
      console.warn('board3d: mat spec unavailable', error);
      return null;
    }
  };

  const currentPreset = () => {
    try {
      return modules.cameraPreset?.current() === 'tcgl' ? 'tcgl' : 'tilt12';
    } catch {
      return 'tilt12';
    }
  };
  let appliedPreset = 'tilt12';

  const relayout = () => {
    if (!session) return;
    const viewport = viewportOf(host, win);
    if (!(viewport.w > 0 && viewport.h > 0)) return;
    const half = halfFromViewport(viewport, boardWidthFrac(doc.body?.classList));
    const spec = session.mat;
    const layout = flatLayout(spec?.profile, half, { viewport, matScale: spec?.scale ?? 1 });
    appliedPreset = currentPreset();
    const cameraParams = { viewportW: viewport.w, viewportH: viewport.h, nearHalf: half };
    session.gl?.syncPixelRatio?.();
    session.scene.setViewport(viewport);
    session.scene.setCamera(
      appliedPreset === 'tcgl'
        ? cameraTcgLive({ ...cameraParams, cardHeightPx: layout.self.cardBox.active.h })
        : cameraFromCssTilt(cameraParams)
    );
    session.scene.setLayout(layout);
    queueMirrorSync();
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
    const textures = modules.createTextureCache({
      loader: modules.createMatTextureLoader?.(three),
      anisotropy: gl.renderer.capabilities?.getMaxAnisotropy?.() ?? 1,
      renderer: gl.renderer,
    });
    const clock = modules.createSceneClock(canvas);
    const scene = modules.createBoardScene({
      host,
      canvas,
      renderer: gl.renderer,
      textures,
      clock,
      three,
      RoomEnvironment: modules.RoomEnvironment,
      UnrealBloomPass: modules.UnrealBloomPass ?? null,
      foil,
      motionReduced: modules.motionReduced,
      // mat-tilt.mjs's kill switch: the holo tilt is off with the FX.
      pointerTiltEnabled: () => !modules.fxDisabled?.(),
      onRender: onSceneRendered,
    });
    // Design 075: attack impacts draw on this context, through this camera.
    const impactHost = modules.attachSceneImpacts?.({
      gl: gl.renderer.getContext(),
      clockHost: canvas,
      placementOf: scene.impactPlacement,
      invalidate: scene.invalidate,
      resetState: () => gl.renderer.resetState(),
    });
    if (impactHost) scene.fx.setImpacts(impactHost);
    // Design 077 (prototype): `?stadiumEnv=scorched-earth` (or local storage) shows a Stadium board.
    try {
      scene.setStadiumEnvironment?.(environmentOverride(win?.localStorage, win?.location?.search ?? ''));
    } catch (error) {
      console.warn('board3d: stadium environment override unreadable', error?.message || error);
    }
    Object.assign(session, { canvas, gl, textures, clock, scene, input: createInput(canvas, scene) });
    if (doc.visibilityState !== 'hidden') clock.start();
    return true;
  }

  /** Pointer input on `canvas`, dispatched to the mirror's cards; null without a mirror. */
  function createInput(canvas, scene) {
    if (!mirror || typeof modules.createBoardInput !== 'function') return null;
    // The preview may boot after this board: it is looked up on every hover change.
    const hover = {
      setTarget: (el, pointer) => modules.getHoverPreview?.()?.setTarget(el, pointer),
    };
    const dragActions = modules.createBoardDragActions?.() ?? null;
    return modules.createBoardInput({ canvas, scene, mirror, hover, dragActions, doc });
  }

  function teardownGraphics() {
    session.input?.dispose();
    session.scene?.dispose();
    session.clock?.dispose();
    session.gl?.dispose();
    Object.assign(session, { gl: null, textures: null, clock: null, scene: null, input: null });
  }

  const initialCanvas = host.querySelector('canvas') ?? host.appendChild(doc.createElement('canvas'));
  session = { host, canvas: initialCanvas, mat: null, cleanup: [], teardownGraphics };
  if (!buildGraphics(initialCanvas)) {
    session = null;
    return fail(deps, 'no-webgl2');
  }
  if (perfHudWanted(win)) {
    perfHud = createPerfHud({ doc, renderer: () => session?.gl?.renderer ?? null });
    session.cleanup.push(() => {
      perfHud?.dispose();
      perfHud = null;
    });
  }

  session.mat = await readMat();
  if (!session) return { active: false, reason: 'context-lost-twice' };
  session.scene.setMat(session.mat);

  host.hidden = false;
  doc.body?.classList.add(ACTIVE_CLASS);
  active = true;
  relayout();

  // The settings checkbox changes the preset: re-project at once (snap, no tween).
  if (typeof modules.cameraPreset?.subscribe === 'function') {
    const unsubscribe = modules.cameraPreset.subscribe((preset) => {
      if (preset !== appliedPreset) relayout();
    });
    session.cleanup.push(unsubscribe);
  }

  const onMatApplied = async () => {
    const spec = await readMat();
    if (!session) return;
    session.mat = spec;
    session.scene.setMat(spec);
    relayout();
  };
  doc.addEventListener('mat-layout-applied', onMatApplied);
  session.cleanup.push(() => doc.removeEventListener('mat-layout-applied', onMatApplied));

  // The board model of the view apply-view.js just applied (it fires `board-view-applied`).
  const onViewApplied = () => {
    if (!session?.scene || typeof modules.boardModelFrom !== 'function') return;
    const view = modules.getLastAppliedView?.();
    if (!view) return;
    current.cards = cardsOfView(view);
    current.model = modules.boardModelFrom(view, {
      selfPlayerId: view.you?.playerId || null,
      cardBackSrcFor: (side) => {
        try {
          return modules.cardBackSrcFor?.(side) ?? '';
        } catch {
          return '';
        }
      },
      uiState: mirror?.uiState(),
      previous: current.model,
      // The hand fans in the order the page renders it (the deck-list sort, apply-view.js).
      sortHand: view.you ? (side, cards) => modules.sortZoneCards?.(side === 'self' ? 'you' : 'them', 'hand', cards) : null,
      onInvalid: (reason) => {
        if (current.warnedInvalid) return;
        current.warnedInvalid = true;
        console.warn(`board3d: view skipped (${reason})`);
      },
    });
    session.scene.applyModel(current.model);
    queueMirrorSync();
  };
  if (mirror) {
    const unobserve = mirror.observe((id, patch) => session?.scene?.setUiState(id, patch));
    session.cleanup.push(unobserve, () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = null;
    });
  }
  doc.addEventListener('board-view-applied', onViewApplied);
  session.cleanup.push(() => doc.removeEventListener('board-view-applied', onViewApplied));
  // Ticking a hand's Sort box re-fans that hand now: under server authority the legacy sort()
  // it also runs leaves the DOM alone, and the next view would be the first to show it.
  for (const root of Object.values(mirror?.roots ?? {})) {
    const sortBox = root?.getElementById?.('sortHandCheckbox');
    if (!sortBox) continue;
    sortBox.addEventListener('change', onViewApplied);
    session.cleanup.push(() => sortBox.removeEventListener('change', onViewApplied));
  }
  onViewApplied();

  if (foil) {
    Promise.resolve()
      .then(() => modules.loadFoil())
      .then(
        (loaded) => {
          if (!session || !loaded) return;
          current.foil = loaded;
          session.scene?.refreshCards?.();
        },
        (error) => console.warn('board3d: foil failed to load', error?.message || error)
      );
  }

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

  // Browser zoom resizes the host, but a window moved to a screen of another pixel density does
  // not: a resolution query for the current ratio stops matching then, and is re-armed each time.
  let pixelRatioQuery = null;
  const onPixelRatioChange = () => {
    relayout();
    watchPixelRatio();
  };
  const watchPixelRatio = () => {
    pixelRatioQuery?.removeEventListener?.('change', onPixelRatioChange);
    pixelRatioQuery = win?.matchMedia?.(`(resolution: ${win.devicePixelRatio || 1}dppx)`) ?? null;
    pixelRatioQuery?.addEventListener?.('change', onPixelRatioChange);
  };
  watchPixelRatio();
  session.cleanup.push(() => pixelRatioQuery?.removeEventListener?.('change', onPixelRatioChange));

  // The host is full-viewport, so collapsing the side menu resizes nothing it observes:
  // relayout when a body class changes the board's width share.
  const MutationObserverImpl = win?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof MutationObserverImpl === 'function' && doc.body) {
    let widthFrac = boardWidthFrac(doc.body.classList);
    const observer = new MutationObserverImpl(() => {
      const next = boardWidthFrac(doc.body.classList);
      if (next === widthFrac) return;
      widthFrac = next;
      relayout();
    });
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    session.cleanup.push(() => observer.disconnect());
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

/** Stops the 3D board and hides its host. */
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
