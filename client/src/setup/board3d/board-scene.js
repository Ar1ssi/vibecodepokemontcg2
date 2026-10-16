// The three.js board's scene (design 074 §D3): camera matched to the CSS tilt, the table, and
// on-demand rendering. Slice C1 renders the table only; cards, piles and the hand join in C2–C4.
// `three` is the namespace from `import('three')`; this module never imports it statically.
import { createTable } from './table-mesh.js';

const DEG = Math.PI / 180;

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
 *   requestFrame?: (fn: FrameRequestCallback) => number, cancelFrame?: (id: number) => void }} deps
 *   The scene does not own `renderer`, `textures` or `clock`; its `dispose()` leaves them to the caller.
 * @returns {{ applyModel: (model: object) => void, setLayout: (layout: object) => void,
 *   setCamera: (desc: ReturnType<typeof import('./board-camera.mjs').cameraFromCssTilt>) => void,
 *   setViewport: (size: { w: number, h: number }) => void, invalidate: () => void, render: () => void,
 *   rects: () => object, hitTest: (x: number, y: number) => object|null,
 *   shake: (offsets: { x: number, y: number, ms: number }[]) => Promise<void>,
 *   setUiState: (id: number, patch: object) => void, setMat: (spec: object|null) => void,
 *   inspect: () => { scene: import('three').Scene, camera: import('three').PerspectiveCamera,
 *     host: HTMLElement, canvas: HTMLCanvasElement, layout: object|null, cameraDesc: object|null, model: object|null, uiState: Map<number, object> },
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

  const render = () => {
    if (disposed || contextLost()) return;
    renderer.render(scene, camera);
  };

  const invalidate = () => {
    if (disposed || frameId !== null) return;
    frameId = requestFrame(() => {
      frameId = null;
      render();
    });
  };

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
    invalidate();
  };

  const setMat = (spec) => {
    if (disposed) return;
    table.setMat(spec);
    invalidate();
  };

  /** Stores the board model; card meshes that render it arrive in slice C2. */
  const applyModel = (next) => {
    if (disposed) return;
    model = next ?? null;
    invalidate();
  };

  /** Selection/glow/mat-pick state per card instance, merged; slice C2/D3 draws it. */
  const setUiState = (id, patch) => {
    if (disposed || id === undefined || id === null || !patch || typeof patch !== 'object') return;
    uiState.set(id, { ...(uiState.get(id) || {}), ...patch });
    invalidate();
  };

  /** Screen rects by instance id: empty until the card meshes of slice C2 exist. */
  const rects = () => ({});

  /** Card under a screen point: none until slice D1 adds raycasting over the C2 meshes. */
  const hitTest = () => null;

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
  const inspect = () => ({ scene, camera, host, canvas, layout, cameraDesc, model, uiState });

  const dispose = () => {
    if (disposed) return;
    stopShake?.();
    disposed = true;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    table.dispose();
    scene.remove(tableFrame);
    uiState.clear();
    model = null;
  };

  return {
    applyModel,
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
