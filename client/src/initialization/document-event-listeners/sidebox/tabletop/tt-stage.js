import {
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
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
import { WOOD_TILE_MM, clothNormalTexture, loadTexture, woodTextures } from './tt-textures.js';

/**
 * The tabletop's stage (design 073 § Browser modules): one WebGL canvas, a desk under studio
 * light, the camera, and the one clock every animation runs on. Animations are `{durationMs,
 * update(t)}`; each also has a wall-clock backstop so a hidden tab never parks one half-way.
 * The loop sleeps when nothing moves.
 */

const PIXEL_RATIO_MAX = 2;
// Fog starts past what the camera frames and closes in a few frame-depths further back.
const FOG_NEAR = 1.4;
const FOG_FAR = 4.5;
const BACKSTOP_SLACK_MS = 700;

/**
 * @param {{host: HTMLElement, quality?: 'high'|'low', surface?: {kind: 'mat'|'art', src?: string},
 *   instant?: () => boolean, onLost?: () => void, timeScale?: number}} options — `timeScale`
 *   below 1 plays every animation in slow motion (the test bench's `?slowmo=`)
 * @returns {object|null} null when WebGL is unavailable.
 */
export function createStage({
  host,
  quality = 'high',
  surface = { kind: 'mat' },
  instant = () => false,
  onLost,
  timeScale = 1,
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
  scene.background = new Color(0x141210);
  // The desk fades into the dim room instead of ending on a hard edge.
  // The far desk fades into the dark room; the fog is set from the camera's distance to what it
  // looks at (`applyCamera`), so whatever is framed stays clear on any screen.
  scene.fog = new Fog(0x141210, 600, 2400);
  const pmrem = new PMREMGenerator(renderer);
  const environment = createStudioEnvironment();
  const envMap = pmrem.fromScene(environment.scene, 0.02).texture;
  environment.dispose();

  const camera = new PerspectiveCamera(30, 1, 10, 6000);

  // Studio light: a warm key from the front left (casts the shadows), a cool rim behind, a sky.
  // Calibrated so a card squarely facing the light shows about its printed colour (key ≈ half,
  // the room's softboxes the rest); brighter only where it mirrors a light.
  const key = new DirectionalLight(0xfff1df, 2.2);
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
  key.shadow.radius = 4;
  const rim = new DirectionalLight(0xd2e2ff, 0.85);
  rim.position.set(340, 300, -460);
  const sky = new HemisphereLight(0xe6edff, 0x2e2219, 0.45);
  scene.add(key, key.target, rim, sky);

  const disposables = [envMap, pmrem];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };

  // ── The desk and the mat ────────────────────────────────────────────────
  const DESK = { width: 4200, depth: 3200 };
  const wood = woodTextures(renderer);
  for (const texture of [wood.color, wood.normal]) {
    texture.repeat.set(DESK.width / WOOD_TILE_MM.x, DESK.depth / WOOD_TILE_MM.z);
  }
  track(wood.color);
  track(wood.normal);
  const desk = new Mesh(
    track(new PlaneGeometry(DESK.width, DESK.depth)),
    track(
      new MeshStandardMaterial({
        map: wood.color,
        // Walnut under a warm lamp still reads brown, not orange.
        color: new Color(0xd6cfc9),
        normalMap: wood.normal,
        roughness: 0.48,
        metalness: 0,
        envMap,
        envMapIntensity: 0.45,
      })
    )
  );
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -MAT.thickness;
  desk.receiveShadow = true;
  scene.add(desk);

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
  scene.add(mat);

  /** Prints playmat art on the mat (null: the plain black cloth). */
  const setSurface = async (next) => {
    if (next?.kind === 'art' && next.src) {
      const texture = await loadTexture(next.src, renderer);
      if (texture) {
        track(texture);
        matFace.map = texture;
        matFace.color.set(0xffffff);
        matFace.roughness = 0.9;
        matFace.needsUpdate = true;
        requestRender();
        return;
      }
    }
    matFace.map = null;
    matFace.color.set(0x2a2c33);
    matFace.needsUpdate = true;
    requestRender();
  };

  // ── Clock ───────────────────────────────────────────────────────────────
  const animations = new Set();
  const tickers = new Set();
  let frame = 0;
  let lastNow = 0;
  // Scene time: wall time scaled by `speed`. Animations and tickers run on it.
  let clock = 0;
  let disposed = false;
  let lost = false;
  let size = { width: 1, height: 1 };

  const finish = (animation) => {
    if (!animations.has(animation)) return;
    animations.delete(animation);
    clearTimeout(animation.backstop);
    animation.update(1, animation);
    animation.resolve();
  };

  const step = (now) => {
    frame = 0;
    if (disposed || lost) return;
    const elapsed = lastNow ? now - lastNow : 16;
    lastNow = now;
    clock += elapsed * speed;
    for (const animation of [...animations]) {
      if (animation.start === null) animation.start = clock;
      const t = animation.durationMs > 0 ? (clock - animation.start) / animation.durationMs : 1;
      if (t >= 1) finish(animation);
      else animation.update(Math.max(0, t), animation);
    }
    for (const ticker of [...tickers]) ticker(clock, Math.min(100, elapsed) * speed);
    renderer.render(scene, camera);
    if (animations.size || tickers.size) frame = requestAnimationFrame(step);
    else lastNow = 0;
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
      const animation = { durationMs, update, resolve, start: null, backstop: 0 };
      if (instant() || !(durationMs > 0)) {
        update(1, animation);
        requestRender();
        resolve();
        return;
      }
      const begin = () => {
        if (disposed) {
          resolve();
          return;
        }
        update(0, animation);
        animations.add(animation);
        animation.backstop = setTimeout(() => finish(animation), durationMs / speed + BACKSTOP_SLACK_MS);
        requestRender();
      };
      if (delayMs > 0) setTimeout(begin, delayMs / speed);
      else begin();
    });

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
    scene.fog.near = reach * FOG_NEAR;
    scene.fog.far = reach * FOG_FAR;
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
  const resizeListeners = new Set();
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    if (width === size.width && height === size.height) return;
    size = { width, height };
    renderer.setSize(width, height, false);
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

  // A faint dark plate under an object: the soft occlusion where it meets the mat.
  const contactMaterial = track(
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );

  return {
    renderer,
    scene,
    camera,
    canvas,
    envMap,
    key,
    contactMaterial,
    get size() {
      return size;
    },
    animate,
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
