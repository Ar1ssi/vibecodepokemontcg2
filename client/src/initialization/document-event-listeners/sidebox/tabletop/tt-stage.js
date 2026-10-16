import {
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MAT } from '../../../../setup/deck-builder/core/build-battle/tabletop/layout.mjs';
import { cameraBlend } from '../../../../setup/deck-builder/core/build-battle/tabletop/poses.mjs';
import { createStudioEnvironment } from './tt-environment.js';
import { cardSlab } from './tt-geometry.js';
import { EYE_ONLY_LAYER, createStudio } from './tt-studio.js';
import { clothNormalTexture, loadTexture } from './tt-textures.js';

/**
 * The tabletop's stage (design 073 § Browser modules): one WebGL canvas, the TCG Pocket studio
 * (`tt-studio.js`: backdrop, mirror floor) under its light, the camera, and the one clock every
 * animation runs on. Animations are `{durationMs, update(t)}`; each also has a wall-clock
 * backstop so a hidden tab never parks one half-way. The loop sleeps when nothing moves.
 */

const PIXEL_RATIO_MAX = 2;
// The frame-time governor's run length and its "too slow" median (≈ 30 fps).
const GOVERNOR_FRAMES = 45;
const SLOW_FRAME_MS = 34;
// The floor melts into the horizon from past what the camera frames to a few frame-depths back.
const HORIZON_NEAR = 1.4;
const HORIZON_FAR = 5;
const BACKSTOP_SLACK_MS = 700;

/**
 * @param {{host: HTMLElement, quality?: 'high'|'low', surface?: {kind: 'mat'|'art', src?: string},
 *   instant?: () => boolean, onLost?: () => void, timeScale?: number, manual?: boolean}} options —
 *   `timeScale` below 1 plays every animation in slow motion (the test bench's `?slowmo=`);
 *   `manual` stops the clock until `advance(ms)` moves it (the bench's `?film`, frame by frame)
 * @returns {object|null} null when WebGL is unavailable.
 */
export function createStage({
  host,
  quality = 'high',
  surface = { kind: 'mat' },
  instant = () => false,
  onLost,
  timeScale = 1,
  manual = false,
}) {
  const speed = Number.isFinite(timeScale) ? Math.min(1, Math.max(0.02, timeScale)) : 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'tt-canvas';
  const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, context: gl, antialias: true });
  } catch {
    return null;
  }
  host.append(canvas);
  const low = quality === 'low';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : PIXEL_RATIO_MAX));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = createStudioEnvironment();
  const envMap = pmrem.fromScene(environment.scene, 0.02).texture;
  environment.dispose();

  const camera = new PerspectiveCamera(30, 1, 10, 6000);
  camera.layers.enable(EYE_ONLY_LAYER);

  // Studio light: a white key from the front left (casts the shadows), a cool rim behind, a sky
  // over a white floor. Calibrated so a card squarely facing the light shows about its printed
  // colour (key ≈ half, the room's softboxes the rest); brighter only where it mirrors a light.
  const key = new DirectionalLight(0xfffaf2, 2.1);
  key.position.set(-300, 640, 420);
  key.target.position.set(0, 0, 10);
  key.castShadow = !low;
  key.shadow.mapSize.set(2048, 2048);
  const shadowCam = key.shadow.camera;
  shadowCam.left = -430;
  shadowCam.right = 430;
  shadowCam.top = 360;
  shadowCam.bottom = -360;
  shadowCam.near = 200;
  shadowCam.far = 1700;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.35;
  // A studio's soft key: wider than this and the five-tap PCF goes grainy.
  key.shadow.radius = 6;
  const rim = new DirectionalLight(0xd2e2ff, 0.7);
  rim.position.set(340, 300, -460);
  const sky = new HemisphereLight(0xeaf1ff, 0xd8e2f0, 0.4);
  scene.add(key, key.target, rim, sky);

  const disposables = [envMap, pmrem];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };

  // ── The studio, and a mat on its floor when one is chosen ───────────────
  const studio = track(createStudio({ renderer, scene, camera, reflect: !low }));
  const cloth = track(clothNormalTexture(renderer));
  cloth.wrapS = cloth.wrapT = RepeatWrapping;
  const matFace = track(
    new MeshStandardMaterial({
      color: new Color(0x2a2c33),
      normalMap: cloth,
      normalScale: new Vector2(1.4, 1.4),
      roughness: 0.94,
      metalness: 0,
      envMap,
      envMapIntensity: 0.25,
    })
  );
  const matEdge = track(new MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.9, envMap, envMapIntensity: 0.2 }));
  const matGeometry = track(cardSlab(MAT.width, MAT.depth, MAT.thickness, 14, 8));
  // The cloth's tooth repeats every few millimetres across the mat.
  const uv = matGeometry.getAttribute('uv');
  const clothUv = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i += 1) {
    clothUv[i * 2] = uv.getX(i) * 60;
    clothUv[i * 2 + 1] = uv.getY(i) * 35;
  }
  matGeometry.setAttribute('uv1', new Float32BufferAttribute(clothUv, 2));
  cloth.channel = 1;
  const mat = new Mesh(matGeometry, [matFace, matEdge, matEdge]);
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(MAT.x, -MAT.thickness / 2, MAT.z);
  mat.receiveShadow = true;
  mat.visible = false;
  scene.add(mat);

  // Bare, things stand on the studio floor itself; on a mat, the floor drops to the mat's underside.
  const showMat = (shown) => {
    mat.visible = shown;
    studio.setFloorY(shown ? -MAT.thickness : 0);
  };
  /**
   * What the table is: `floor` the bare studio floor, `mat` the black rubber mat on it, `art` a
   * mat printed with `src` (the black mat when the print won't load).
   */
  const setSurface = async (next) => {
    if (next?.kind === 'art' && next.src) {
      const texture = await loadTexture(next.src, renderer);
      if (texture) {
        track(texture);
        matFace.map = texture;
        matFace.color.set(0xffffff);
        matFace.roughness = 0.9;
        matFace.needsUpdate = true;
        showMat(true);
        requestRender();
        return;
      }
    }
    matFace.map = null;
    matFace.color.set(0x2a2c33);
    matFace.needsUpdate = true;
    showMat(next?.kind === 'mat' || next?.kind === 'art');
    requestRender();
  };

  // ── Clock ───────────────────────────────────────────────────────────────
  // Scene time (ms): wall time scaled by `speed`, or moved by hand on a manual clock. Animations,
  // their delays, waits and tickers all run on it, so slow motion and frame-stepping slow them all.
  const animations = new Set();
  const tickers = new Set();
  let frame = 0;
  let lastNow = 0;
  let clock = 0;
  let disposed = false;
  let lost = false;
  let drawn = false;
  let size = { width: 1, height: 1 };

  const finish = (animation) => {
    if (!animations.has(animation)) return;
    animations.delete(animation);
    clearTimeout(animation.backstop);
    animation.update(1, animation);
    animation.resolve();
  };

  // One tick: scene time moves on, every animation past its start updates, tickers run, one frame.
  const tick = (sceneMs) => {
    clock += sceneMs;
    for (const animation of [...animations]) {
      if (clock < animation.start) continue;
      const t = (clock - animation.start) / animation.durationMs;
      if (t >= 1) finish(animation);
      else animation.update(Math.max(0, t), animation);
    }
    for (const ticker of [...tickers]) ticker(clock, Math.min(100, sceneMs));
    // The mirror reuses the shadow maps the eye's pass last drew, so it waits for the first.
    if (drawn) studio.renderReflection();
    renderer.render(scene, camera);
    drawn = true;
  };

  // A device that can't hold ~30 fps while things move steps down: first to one pixel per CSS
  // pixel, then to a coarser shadow map, last to a floor without its mirror (the studio's look
  // keeps longest). Judged on the median of runs of moving frames.
  const frameTimes = [];
  let stepDowns = 0;
  const govern = (elapsed) => {
    frameTimes.push(elapsed);
    if (frameTimes.length < GOVERNOR_FRAMES) return;
    const median = [...frameTimes].sort((a, b) => a - b)[frameTimes.length >> 1];
    frameTimes.length = 0;
    if (median < SLOW_FRAME_MS) return;
    if (stepDowns === 0 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      sizeReflection();
    } else if (key.castShadow && key.shadow.mapSize.x > 1024) {
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    } else studio.stopReflection();
    stepDowns += 1;
  };

  const step = (now) => {
    frame = 0;
    if (disposed || lost) return;
    // A manual clock only draws here; `advance` moves it.
    if (manual) {
      tick(0);
      return;
    }
    const elapsed = lastNow ? now - lastNow : 16;
    if (lastNow) govern(elapsed);
    lastNow = now;
    tick(elapsed * speed);
    if (animations.size || tickers.size) frame = requestAnimationFrame(step);
    else lastNow = 0;
  };

  /** Moves a manual clock on by `sceneMs` and draws the frame. */
  const advance = (sceneMs) => {
    if (!manual || disposed || lost) return;
    tick(Math.max(0, Number(sceneMs) || 0));
  };

  function requestRender() {
    if (!frame && !disposed && !lost) frame = requestAnimationFrame(step);
  }

  /**
   * Plays `update(t)` for t 0 → 1 over `durationMs` on the clock. Instant scenes (reduced motion)
   * land on t = 1 at once.
   * @returns {Promise<void>}
   */
  const animate = ({ durationMs, update, delayMs = 0 }) =>
    new Promise((resolve) => {
      const delay = Math.max(0, Number(delayMs) || 0);
      const animation = { durationMs, update, resolve, start: clock + delay, backstop: 0 };
      if (instant() || !(durationMs > 0)) {
        update(1, animation);
        requestRender();
        resolve();
        return;
      }
      if (disposed) {
        resolve();
        return;
      }
      if (!delay) update(0, animation);
      animations.add(animation);
      // A hidden tab parks the clock: the backstop lands the animation anyway. A manual clock
      // moves only when told, so it has none.
      if (!manual) {
        animation.backstop = setTimeout(() => finish(animation), (delay + durationMs) / speed + BACKSTOP_SLACK_MS);
      }
      requestRender();
    });

  /** Resolves after `ms` of scene time (at once in an instant scene). */
  const wait = (ms) => animate({ durationMs: ms, update: () => {} });

  /** Lands every running animation on its last frame. */
  const finishAll = () => {
    for (const animation of [...animations]) finish(animation);
    requestRender();
  };

  /** Runs `fn(now, dtMs)` every frame until the returned stop is called. */
  const addTicker = (fn) => {
    tickers.add(fn);
    requestRender();
    return () => {
      tickers.delete(fn);
    };
  };

  // ── Camera ──────────────────────────────────────────────────────────────
  let cameraPose = null;
  const lookTarget = new Vector3();
  const applyCamera = (pose) => {
    cameraPose = pose;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    lookTarget.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(lookTarget);
    const reach = camera.position.distanceTo(lookTarget);
    studio.setFade(reach * HORIZON_NEAR, reach * HORIZON_FAR);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    requestRender();
  };
  const blendCamera = (to, durationMs) => {
    const from = cameraPose || to;
    return animate({ durationMs, update: (t) => applyCamera(cameraBlend(from, to, t)) });
  };

  // ── Size ────────────────────────────────────────────────────────────────
  const drawingBuffer = new Vector2();
  function sizeReflection() {
    renderer.getDrawingBufferSize(drawingBuffer);
    studio.setSize(drawingBuffer.x, drawingBuffer.y);
  }
  const resizeListeners = new Set();
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    if (width === size.width && height === size.height) return;
    size = { width, height };
    renderer.setSize(width, height, false);
    sizeReflection();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    resizeListeners.forEach((listener) => listener(size));
    requestRender();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  resize();

  // ── Picking ─────────────────────────────────────────────────────────────
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pick = (clientX, clientY, objects) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, true);
  };
  /** A world point projected to client pixels. */
  const toClient = (point) => {
    const rect = canvas.getBoundingClientRect();
    const p = point.clone().project(camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  const onContextLost = (event) => {
    event.preventDefault();
    lost = true;
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  return {
    renderer,
    scene,
    camera,
    canvas,
    envMap,
    key,
    get size() {
      return size;
    },
    animate,
    wait,
    advance,
    manual,
    timeScale: speed,
    finishAll,
    addTicker,
    requestRender,
    applyCamera,
    blendCamera,
    get cameraPose() {
      return cameraPose;
    },
    onResize: (listener) => {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    pick,
    toClient,
    setSurface,
    /** The floor receding to blue behind a held thing, 0 → 1 (draws on the next frame). */
    setFocus: (amount) => {
      studio.setFocus(amount);
      requestRender();
    },
    /** Draws the floor's mirror now (the loading screen's warm-up draws it once). */
    renderReflection: () => studio.renderReflection(),
    compileForMirror: (object) => studio.compileForMirror(object),
    track,
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      animations.forEach((animation) => clearTimeout(animation.backstop));
      animations.clear();
      tickers.clear();
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((node) => {
        if (node.isMesh) node.geometry?.dispose?.();
      });
      disposables.forEach((thing) => thing.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
