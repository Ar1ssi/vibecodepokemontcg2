// The three.js board's scene (design 074 §D3): camera matched to the CSS tilt, the table, the
// cards in play (C2), and on-demand rendering. Piles and the hand join in C3–C4.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { projectToScreen } from './board-camera.mjs';
import { diffModels, placementById } from './board-model.mjs';
import { createCardMeshPool } from './card-mesh.js';
import { posesFor } from './card-poses.mjs';
import { createTable } from './table-mesh.js';

const DEG = Math.PI / 180;
/** A card moving between slots or stacks (design 074 §D3 "Cards"). */
const CARD_POSE_MS = 180;
const FOIL_ROLES = new Set(['root', 'stage']);

const defaultRequestFrame = (fn) => globalThis.requestAnimationFrame?.(fn) ?? globalThis.setTimeout(fn, 16);
const defaultCancelFrame = (id) => (globalThis.cancelAnimationFrame ?? globalThis.clearTimeout)?.(id);

const isPoint = (offset) =>
  offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) && Number.isFinite(offset.ms);

/**
 * Screen offset at `elapsed` ms along a keyframe list `{ x, y, ms }` (ms from the shake's start,
 * ascending), interpolated linearly; past the last key it holds the last key.
 */
function offsetAt(keys, elapsed) {
  if (elapsed <= keys[0].ms) return keys[0];
  for (let i = 1; i < keys.length; i += 1) {
    const prev = keys[i - 1];
    const next = keys[i];
    if (elapsed <= next.ms) {
      const span = next.ms - prev.ms;
      const t = span > 0 ? (elapsed - prev.ms) / span : 1;
      return { x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t };
    }
  }
  return keys[keys.length - 1];
}

/**
 * @param {{ host: HTMLElement, canvas: HTMLCanvasElement, renderer: import('three').WebGLRenderer,
 *   textures: { acquire: Function, release: Function },
 *   clock: ReturnType<typeof import('./scene-clock.js').createSceneClock>,
 *   three: typeof import('three'), RoomEnvironment?: Function|null,
 *   foil?: { recordFor: (placement: object) => object|null, createMaterial: Function,
 *     uv?: Function|object }|null, motionReduced?: () => boolean,
 *   requestFrame?: (fn: FrameRequestCallback) => number, cancelFrame?: (id: number) => void }} deps
 *   The scene does not own `renderer`, `textures` or `clock`; its `dispose()` leaves them to the caller.
 *   `foil` (card-mesh.js) dresses the visible card of a stack in its TCG Live foil; null = none.
 * @returns {{ applyModel: (model: object) => void, setLayout: (layout: object) => void,
 *   setCamera: (desc: ReturnType<typeof import('./board-camera.mjs').cameraFromCssTilt>) => void,
 *   setViewport: (size: { w: number, h: number }) => void, invalidate: () => void, render: () => void,
 *   rects: () => Record<number, { left: number, top: number, width: number, height: number }>,
 *   hitTest: (clientX: number, clientY: number) => { instanceId: number, side: string, zone: string,
 *     index: number, point: number[] }|null, refreshCards: () => void,
 *   shake: (offsets: { x: number, y: number, ms: number }[]) => Promise<void>,
 *   setUiState: (id: number, patch: object) => void, setMat: (spec: object|null) => void,
 *   inspect: () => { scene: import('three').Scene, camera: import('three').PerspectiveCamera,
 *     host: HTMLElement, canvas: HTMLCanvasElement, layout: object|null, cameraDesc: object|null, model: object|null, uiState: Map<number, object>,
 *     cards: ReturnType<typeof createCardMeshPool> },
 *   dispose: () => void, clock: object }}
 */
export function createBoardScene({
  host,
  canvas,
  renderer,
  textures,
  clock,
  three,
  RoomEnvironment = null,
  foil = null,
  motionReduced = () => false,
  requestFrame = defaultRequestFrame,
  cancelFrame = defaultCancelFrame,
}) {
  const scene = new three.Scene();
  scene.name = 'board3d';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = three.PCFSoftShadowMap;

  // The table frame of board-layout.mjs, turned by the tilt about the pivot (board-camera.mjs).
  const tableFrame = new three.Group();
  tableFrame.name = 'board3d-table-frame';
  scene.add(tableFrame);

  const table = createTable({ scene, textures, three, renderer, RoomEnvironment });
  tableFrame.add(table.group);

  const camera = new three.PerspectiveCamera(30, 1, 1, 10000);
  let cameraDesc = null;
  let layout = null;
  let model = null;
  const uiState = new Map();
  let shakeOffset = { x: 0, y: 0 };
  let stopShake = null;
  let frameId = null;
  let disposed = false;

  const contextLost = () => {
    try {
      return renderer.getContext().isContextLost();
    } catch {
      return true;
    }
  };

  // Cards live in world space: card-mesh.js places them with tableToWorld (the camera's tilt).
  const cardsGroup = new three.Group();
  cardsGroup.name = 'board3d-cards';
  scene.add(cardsGroup);
  const raycaster = new three.Raycaster();

  /** Renders one frame; keeps rendering on the next frame while a card tween or foil runs. */
  const render = () => {
    if (disposed || contextLost()) return;
    const animating = pool.update(clock.now());
    renderer.render(scene, camera);
    if (animating) invalidate();
  };

  const invalidate = () => {
    if (disposed || frameId !== null) return;
    frameId = requestFrame(() => {
      frameId = null;
      render();
    });
  };

  const pool = createCardMeshPool({
    group: cardsGroup,
    three,
    textures,
    clock,
    foil,
    motionReduced,
    onNeedsRender: invalidate,
  });

  table.onChange(invalidate);

  /** A screen-px shake moves the image, so it shifts the view window, not the eye. */
  const applyViewOffset = () => {
    if (!cameraDesc) return;
    const view = cameraDesc.viewOffset;
    camera.setViewOffset(
      view.fullWidth,
      view.fullHeight,
      view.x - shakeOffset.x,
      view.y - shakeOffset.y,
      view.width,
      view.height
    );
  };

  const setCamera = (desc) => {
    if (disposed || !desc) return;
    cameraDesc = desc;
    camera.fov = desc.fov;
    camera.aspect = desc.aspect;
    camera.near = desc.near;
    camera.far = desc.far;
    camera.position.set(...desc.position);
    camera.up.set(...desc.up);
    camera.lookAt(...desc.target);
    tableFrame.rotation.x = -desc.tiltDeg * DEG;
    camera.updateProjectionMatrix();
    applyViewOffset();
    pool.setCamera(desc);
    invalidate();
  };

  const setViewport = ({ w, h } = {}) => {
    if (disposed || !(w > 0 && h > 0)) return;
    renderer.setSize(Math.round(w), Math.round(h), false);
    if (!cameraDesc) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    invalidate();
  };

  const setLayout = (next) => {
    if (disposed || !next) return;
    layout = next;
    table.setLayout(next);
    syncCards(model, model, { relayout: true });
    invalidate();
  };

  const setMat = (spec) => {
    if (disposed) return;
    table.setMat(spec);
    invalidate();
  };

  /** The visible card of a stack (no offset, not a Tool/Energy) keeps its foil, as apply-view does. */
  const foilRecordOf = (placement) => {
    if (!foil || placement.face !== 'front' || !FOIL_ROLES.has(placement.role)) return null;
    const [right, up] = placement.stackOffset ?? [0, 0];
    if (right !== 0 || up !== 0) return null;
    try {
      return foil.recordFor?.(placement) ?? null;
    } catch (error) {
      console.warn('board3d: foil lookup failed', error);
      return null;
    }
  };

  const facesOf = (placement) => ({
    src: placement.face === 'front' ? placement.src : null,
    backSrc: placement.backSrc,
    face: placement.face,
    foilRecord: foilRecordOf(placement),
  });

  /**
   * Reconciles the card meshes with `next` (§D3 "Reconcile"): new cards appear at their pose,
   * moved or restyled ones tween there, cards without a pose in this slice (hand, piles, prizes,
   * Energy tokens) or gone from the view are released. `relayout` snaps every card to the new
   * layout; `refresh` re-applies every card's faces (the foil manifest arrived).
   */
  function syncCards(prev, next, { relayout = false, refresh = false } = {}) {
    const poses = layout && next ? posesFor(next, layout) : new Map();
    for (const id of pool.ids()) if (!poses.has(id)) pool.release(id);
    const diff = diffModels(prev, next);
    for (const [id, pose] of poses) {
      const placement = placementById(next, id);
      if (!pool.has(id)) {
        pool.acquire(id, { widthPx: pose.widthPx });
        pool.setFaces(id, facesOf(placement));
        pool.setHidden(id, pose.hidden);
        pool.setPose(id, pose, 0);
        continue;
      }
      const restyled = diff.restyled.has(id);
      if (restyled || refresh) {
        pool.setFaces(id, facesOf(placement));
        pool.setHidden(id, pose.hidden);
      }
      if (relayout) pool.setPose(id, pose, 0);
      else if (restyled || diff.moved.has(id)) pool.setPose(id, pose, CARD_POSE_MS);
    }
  }

  /** Renders a board model (board-model.mjs `boardModelFrom`): reconciles the card meshes. */
  const applyModel = (next) => {
    if (disposed) return;
    const prev = model;
    model = next ?? null;
    syncCards(prev, model);
    invalidate();
  };

  /** Re-applies every card's faces, e.g. once the foil manifest has loaded. */
  const refreshCards = () => {
    if (disposed) return;
    syncCards(model, model, { refresh: true });
    invalidate();
  };

  /** Selection/glow/mat-pick state per card instance, merged; slices C5/D3 draw it. */
  const setUiState = (id, patch) => {
    if (disposed || id === undefined || id === null || !patch || typeof patch !== 'object') return;
    uiState.set(id, { ...(uiState.get(id) || {}), ...patch });
    invalidate();
  };

  const canvasBox = () => {
    const box = canvas.getBoundingClientRect?.();
    return box && box.width > 0 && box.height > 0 ? box : null;
  };

  /**
   * Client-px rects of every visible card: the bounding box of its front face's four corners,
   * projected with the pure camera description (board-camera.mjs `projectToScreen`, the same
   * math `PerspectiveCamera` runs) and offset by the canvas's page position. A running shake
   * is not included.
   */
  const rects = () => {
    const out = {};
    if (disposed || !cameraDesc) return out;
    pool.update(clock.now());
    const box = canvasBox() ?? { left: 0, top: 0 };
    for (const id of pool.ids()) {
      if (!pool.meshOf(id)?.visible) continue;
      const points = (pool.cornersOf(id) ?? []).map((corner) => projectToScreen(cameraDesc, corner));
      if (points.length !== 4 || points.some((point) => !point)) continue;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      out[id] = {
        left: box.left + left,
        top: box.top + top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
      };
    }
    return out;
  };

  /** Nearest visible card under a client-px point (raycast against the card meshes), or null. */
  const hitTest = (clientX, clientY) => {
    if (disposed || !cameraDesc || !model) return null;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const box = canvasBox();
    if (!box) return null;
    pool.update(clock.now());
    const ndc = new three.Vector2(
      ((clientX - box.left) / box.width) * 2 - 1,
      -((clientY - box.top) / box.height) * 2 + 1
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const meshes = pool
      .ids()
      .map((id) => pool.meshOf(id))
      .filter((mesh) => mesh?.visible);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const id = pool.idAt(hit.object);
      const placement = id === null ? null : placementById(model, id);
      if (!placement) continue;
      return {
        instanceId: id,
        side: placement.side,
        zone: placement.zone,
        index: placement.index,
        point: hit.point.toArray(),
      };
    }
    return null;
  };

  /**
   * Screen shake as a camera view-offset sequence on the scene clock. `offsets` are keyframes
   * `{ x, y, ms }` in screen px, `ms` from the start (combat-pose.mjs `screenShakeOffsets`
   * spread over its duration). A new shake replaces a running one. Resolves when it ends.
   */
  const shake = (offsets) => {
    const keys = Array.isArray(offsets) ? offsets.filter(isPoint).sort((a, b) => a.ms - b.ms) : [];
    stopShake?.();
    if (disposed || keys.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const start = clock.now();
      let unsubscribe = null;
      const finish = () => {
        unsubscribe?.();
        unsubscribe = null;
        if (stopShake === finish) stopShake = null;
        shakeOffset = { x: 0, y: 0 };
        applyViewOffset();
        invalidate();
        resolve();
      };
      stopShake = finish;
      unsubscribe = clock.onTick((time) => {
        const elapsed = time - start;
        const offset = offsetAt(keys, elapsed);
        shakeOffset = { x: offset.x, y: offset.y };
        applyViewOffset();
        render();
        if (elapsed >= keys[keys.length - 1].ms) finish();
      });
    });
  };

  // `host` sizes the canvas; the boot code observes it and calls setViewport/setCamera.
  const inspect = () => ({ scene, camera, host, canvas, layout, cameraDesc, model, uiState, cards: pool });

  const dispose = () => {
    if (disposed) return;
    stopShake?.();
    disposed = true;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    pool.dispose();
    scene.remove(cardsGroup);
    table.dispose();
    scene.remove(tableFrame);
    uiState.clear();
    model = null;
  };

  return {
    applyModel,
    refreshCards,
    setLayout,
    setCamera,
    setViewport,
    invalidate,
    render,
    rects,
    hitTest,
    shake,
    setUiState,
    setMat,
    inspect,
    dispose,
    clock,
  };
}
