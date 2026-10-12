// TCG Live foil views (design 069): a <canvas class="tcgl-foil"> inside a holo wrapper's .card__rotator that
// shows the game's own foil shader over our card image. Every view shares one WebGL renderer (browsers cap live
// contexts): each frame a view renders into the bottom-left w×h of the shared canvas, which only grows, and
// copies that rect into its own 2-D canvas. The wrapper's `data-tcgl-foil` reads loading → live, or fallback
// (canvas removed; the card shows its plain image) on any WebGL, shader or texture failure.
import { DEFAULT_FOIL_UV } from './tcgl-foil-manifest.mjs';
import { faceOnViewProjection, multiply, poseAngles, rotationMatrix } from './tcgl-foil-pose.mjs';
import { foilManifestNow } from './tcgl-foil-store.js';

const CARD_W = 6.3;
const CARD_H = 8.8;
const CARD_ASPECT = CARD_W / CARD_H;
const FOV_DEG = 30;
// Face-on rasterization (O4) never foreshortens the card, so the camera frames it edge to edge: the TCG Live
// front covers our <img> exactly instead of leaving WebApp's 4 % margin for a visibly tilted mesh.
const CAMERA_DISTANCE = CARD_H / 2 / Math.tan(((FOV_DEG / 2) * Math.PI) / 180);
// A wrapper is built before it is placed; one never placed within this long is abandoned.
const UNPLACED_GRACE_MS = 10000;

const views = new Set();
const viewByWrapper = new WeakMap();
let runtimePromise = null;
let disabled = false;
let loopRunning = false;
let drawingView = null;

function createRuntime() {
  return (async () => {
    const [THREE, foil] = await Promise.all([import('three'), import('./tcgl-foil-material.js')]);
    await foil.loadFoilData();
    const canvas = document.createElement('canvas');
    // three r163+ is WebGL2-only and throws here without it.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    renderer.debug.onShaderError = () => {
      if (drawingView) drawingView.shaderFailed = true;
    };
    canvas.addEventListener('webglcontextlost', () => {
      disabled = true;
      for (const view of [...views]) view.fail('WebGL context lost');
    });
    return { THREE, foil, renderer, canvas, size: [0, 0], maxSize: renderer.capabilities.maxTextureSize };
  })();
}

function getRuntime() {
  if (disabled) return Promise.reject(new Error('TCG Live foil disabled for this session'));
  if (!runtimePromise) {
    runtimePromise = createRuntime();
    runtimePromise.catch((error) => {
      disabled = true;
      console.warn(`TCG Live foil disabled: ${error.message}`);
    });
  }
  return runtimePromise;
}

// Backing size: the canvas's own CSS box at the on-screen scale (zoom, transforms) times the device pixel
// ratio of the window it lives in, capped only by the GPU's texture limit.
function backingSize(canvas, rect, win, maxSize) {
  const layoutW = canvas.clientWidth || rect.width;
  const layoutH = canvas.clientHeight || rect.height;
  const screenScale = Math.max(rect.width / layoutW, rect.height / layoutH);
  let scale = screenScale * (win.devicePixelRatio || 1);
  scale = Math.min(scale, maxSize / Math.max(layoutW, layoutH));
  return [Math.max(1, Math.round(layoutW * scale)), Math.max(1, Math.round(layoutH * scale))];
}

const isDrawable = (canvas, rect, win) =>
  rect.width >= 2 &&
  rect.height >= 2 &&
  rect.right > 0 &&
  rect.bottom > 0 &&
  rect.left < win.innerWidth &&
  rect.top < win.innerHeight &&
  win.getComputedStyle(canvas).visibility !== 'hidden';

function drawView(view, rt, nowMs) {
  const { wrapper, canvas } = view;
  const win = wrapper.ownerDocument?.defaultView;
  if (!wrapper.isConnected || !canvas.isConnected || !win) {
    if (view.placed || !canvas.parentNode || nowMs - view.createdAt > UNPLACED_GRACE_MS) view.destroy();
    return;
  }
  view.placed = true;
  if (view.state !== 'ready' && view.state !== 'live') return;
  const rect = canvas.getBoundingClientRect();
  if (!isDrawable(canvas, rect, win)) return;
  const [w, h] = backingSize(canvas, rect, win, rt.maxSize);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (rt.size[0] < w || rt.size[1] < h) {
    rt.size = [Math.max(rt.size[0], w), Math.max(rt.size[1], h)];
    rt.renderer.setSize(rt.size[0], rt.size[1], false);
  }

  const { camera, mesh, material } = view;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // Our scans run 0.707–0.727 wide; stretch the 63 × 88 mesh (≤ 1.6 %) so it fills the canvas edge to edge.
  const stretchX = camera.aspect / CARD_ASPECT;
  const { rx, ry } = poseAngles(wrapper.__foilTilt ?? {});
  const rotation = rotationMatrix(rx, ry);
  mesh.matrix.fromArray(multiply(rotation, [stretchX, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  mesh.matrixWorldNeedsUpdate = true;
  const rasterVP = faceOnViewProjection(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements, rotation);

  rt.renderer.setViewport(0, 0, w, h);
  rt.renderer.setScissor(0, 0, w, h);
  drawingView = view;
  material.update(mesh, camera, nowMs / 1000, { rasterVP });
  rt.renderer.render(view.scene, camera);
  drawingView = null;
  if (view.shaderFailed) {
    view.fail('shader failed to compile');
    return;
  }
  view.ctx.clearRect(0, 0, w, h);
  view.ctx.drawImage(rt.canvas, 0, rt.size[1] - h, w, h, 0, 0, w, h);
  if (view.state === 'ready') {
    view.state = 'live';
    wrapper.dataset.tcglFoil = 'live';
  }
}

function frame(nowMs) {
  if (!views.size || !runtimePromise) {
    loopRunning = false;
    return;
  }
  requestAnimationFrame(frame);
  runtimePromise.then(
    (rt) => {
      for (const view of [...views]) drawView(view, rt, nowMs);
    },
    () => {}
  );
}

function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  requestAnimationFrame(frame);
}

async function setUpView(view) {
  const rt = await getRuntime();
  if (view.state === 'destroyed') return;
  const material = rt.foil.createFoilMaterial(view.record);
  view.material = material;
  const uv = foilManifestNow()?.uv ?? DEFAULT_FOIL_UV;
  view.scene = new rt.THREE.Scene();
  view.camera = new rt.THREE.PerspectiveCamera(FOV_DEG, CARD_ASPECT, 0.1, 100);
  view.camera.position.set(0, 0, CAMERA_DISTANCE);
  view.camera.lookAt(0, 0, 0);
  view.mesh = new rt.THREE.Mesh(rt.foil.foilGeometry(CARD_W, CARD_H, uv), material);
  view.mesh.matrixAutoUpdate = false;
  view.mesh.frustumCulled = false;
  view.scene.add(view.mesh);
  await material.ready;
  if (view.state === 'destroyed') return;
  view.state = 'ready';
  startLoop();
}

/**
 * Mounts the TCG Live foil on a holo wrapper built by buildHoloCard. Returns the view, or null when the
 * wrapper has no rotator, no record was given, or TCG Live foil is disabled for the session (then the
 * wrapper is marked `fallback`).
 */
export function mountTcglFoil(wrapper, record) {
  if (!wrapper || !record) return null;
  const existing = viewByWrapper.get(wrapper);
  if (existing && existing.state !== 'destroyed') return existing;
  const rotator = wrapper.querySelector('.card__rotator');
  if (!rotator) return null;
  if (disabled) {
    wrapper.dataset.tcglFoil = 'fallback';
    return null;
  }
  const canvas = wrapper.ownerDocument.createElement('canvas');
  canvas.className = 'tcgl-foil';
  canvas.setAttribute('aria-hidden', 'true');
  const img = rotator.querySelector('img');
  if (img) img.after(canvas);
  else rotator.appendChild(canvas);
  wrapper.dataset.tcglFoil = 'loading';

  const view = {
    wrapper,
    canvas,
    ctx: canvas.getContext('2d'),
    record,
    state: 'loading',
    createdAt: performance.now(),
    placed: false,
    shaderFailed: false,
    material: null,
    destroy() {
      if (view.state === 'destroyed') return;
      view.state = 'destroyed';
      views.delete(view);
      if (viewByWrapper.get(wrapper) === view) viewByWrapper.delete(wrapper);
      view.material?.release();
      view.mesh?.geometry.dispose();
      canvas.remove();
    },
    fail(reason) {
      if (view.state === 'destroyed') return;
      console.warn(`TCG Live foil fallback for ${record.tcglId}: ${reason}`);
      view.destroy();
      if (wrapper.dataset.tcglFoil) wrapper.dataset.tcglFoil = 'fallback';
    },
  };
  views.add(view);
  viewByWrapper.set(wrapper, view);
  setUpView(view).catch((error) => view.fail(error.message));
  return view;
}

/** Releases a wrapper's foil view now (it would also go on the next frame once the wrapper is detached). */
export function unmountTcglFoil(wrapper) {
  viewByWrapper.get(wrapper)?.destroy();
}

/**
 * A cloned wrapper (full-view preview) carries a blank copy of the source's canvas: replace it with a view of
 * its own showing the source's card. A source without a live view leaves the clone on its copied state.
 */
export function remountTcglFoil(clone, sourceWrapper) {
  if (!clone) return null;
  const record = viewByWrapper.get(sourceWrapper)?.record;
  if (!record) return null;
  clone.querySelectorAll('canvas.tcgl-foil').forEach((canvas) => canvas.remove());
  delete clone.dataset.tcglFoil;
  return mountTcglFoil(clone, record);
}
