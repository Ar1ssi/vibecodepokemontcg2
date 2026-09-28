import {
  BackSide,
  CanvasTexture,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from '../../../vendor/three/RoomEnvironment.js';
import {
  CAMERA_DISTANCE,
  CAMERA_FOV_DEG,
  PACK_ASPECT,
  PIXEL_RATIO_MAX,
  STRIP_V,
  followTilt,
  packFlyParams,
  packFlyPose3d,
  packPlacement,
  packSpreadSlot3d,
  packTearLine,
  pillowZ,
  rectToWorld,
  swayPose,
  tiltTarget,
  worldPerPixel,
} from '../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import {
  PACK_FLY_MS,
  PACK_FLY_STAGGER_MS,
} from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import {
  fxDisabled,
  motionReduced,
} from '../../../setup/image-logic/mat-fx.mjs';
import { playFxSound } from '../../../setup/netcode/mat-fx/fx-audio.js';

/**
 * The Build & Battle 3D packs (design 054 § Stage API): a transparent WebGL canvas over the
 * unboxing scene draws each sealed pack as a lit pillow where the scene's invisible `.bb-bigpack`
 * anchor sits, so the DOM keeps layout, input and keyboard access. Every pose comes from
 * pack3d.mjs; this file only builds meshes and runs the one `requestAnimationFrame` clock.
 * Loaded through `import()` only (three.js is 733 KB).
 */

const GRID_X = 40;
const GRID_Y = 72;
const STRIP_GRID_Y = 8;
const MASK_W = 512;
const MASK_H = 936;
// The strip mask overlaps the body mask by this many mask pixels, so no seam shows at rest.
const MASK_OVERLAP_PX = 2;
const ALPHA_TEST = 0.5;
const SHADOW_Z = -0.2;
const SHADOW_SIZE = 1.1;
const SHADOW_ALPHA = 0.35;
// The shadow sits a little low, like the DOM pack's drop shadow.
const SHADOW_DROP = 0.06;
const SHADOW_TEXTURE_PX = 128;
const LIGHT_INTENSITY = 1.2;
const LIGHT_POSITION = [-2, 3, 4];
const ENV_BLUR = 0.04;
const FRONT_LOOK = {
  emissiveIntensity: 0.45,
  metalness: 0.35,
  roughness: 0.32,
  clearcoat: 0.6,
  clearcoatRoughness: 0.18,
  iridescence: 0.2,
  envMapIntensity: 0.35,
};
const SILVER_STOPS = ['#d9dbe0', '#9aa0aa', '#d9dbe0'];
// Created by hand so a missing WebGL2 is a quiet null, not three's console error.
const CONTEXT_ATTRIBUTES = {
  alpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
};

const radians = (deg) => (deg * Math.PI) / 180;

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * A plane over art rows `v0..v1` (v = 0 at the top) in pack space (1 wide, centred), UV-mapped to
 * that band of the art and bulged by `sign · pillowZ`: +1 for the front, −1 for the back.
 */
const pillowPlane = ({ v0, v1, rows, sign }) => {
  const geometry = new PlaneGeometry(1, (v1 - v0) * PACK_ASPECT, GRID_X, rows);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    const u = uv.getX(i);
    const v = v0 + (1 - uv.getY(i)) * (v1 - v0);
    uv.setY(i, 1 - v);
    position.setY(i, (0.5 - v) * PACK_ASPECT);
    position.setZ(i, sign * pillowZ(u, v));
  }
  geometry.computeVertexNormals();
  return geometry;
};

/** Body and strip alpha masks from the seeded tear line: body below it, strip above it. */
const tearMasks = (line) => {
  const body = makeCanvas(MASK_W, MASK_H);
  const ctx = body.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  const trace = (target) => {
    target.beginPath();
    line.forEach(({ x, y }, index) => {
      if (index === 0) target.moveTo(x * MASK_W, y * MASK_H);
      else target.lineTo(x * MASK_W, y * MASK_H);
    });
  };
  trace(ctx);
  ctx.lineTo(MASK_W, MASK_H);
  ctx.lineTo(0, MASK_H);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();

  // The exact complement of the body mask, widened along the line so the two never leave a gap.
  const strip = makeCanvas(MASK_W, MASK_H);
  const stripCtx = strip.getContext('2d');
  stripCtx.drawImage(body, 0, 0);
  stripCtx.globalCompositeOperation = 'difference';
  stripCtx.fillStyle = '#fff';
  stripCtx.fillRect(0, 0, MASK_W, MASK_H);
  stripCtx.globalCompositeOperation = 'source-over';
  trace(stripCtx);
  stripCtx.strokeStyle = '#fff';
  stripCtx.lineWidth = MASK_OVERLAP_PX;
  stripCtx.stroke();
  return { body: new CanvasTexture(body), strip: new CanvasTexture(strip) };
};

/** The pack's back: the art's silhouette filled with the silver of the real pack. */
const silverBack = (image) => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-in';
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  SILVER_STOPS.forEach((stop, index) =>
    gradient.addColorStop(index / (SILVER_STOPS.length - 1), stop)
  );
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const shadowTexture = () => {
  const size = SHADOW_TEXTURE_PX;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, `rgba(0, 0, 0, ${SHADOW_ALPHA})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
};

// The env map is bound per material: with `scene.environment` three ignores `envMapIntensity`.
const frontMaterial = (art, alphaMap, envMap) =>
  new MeshPhysicalMaterial({
    ...FRONT_LOOK,
    envMap,
    map: art,
    emissiveMap: art,
    emissive: 0xffffff,
    alphaMap,
    alphaTest: ALPHA_TEST,
    side: FrontSide,
  });

const backMaterial = (silver, alphaMap, envMap) =>
  new MeshPhysicalMaterial({
    ...FRONT_LOOK,
    envMap,
    emissiveIntensity: 0,
    map: silver,
    alphaMap,
    alphaTest: ALPHA_TEST,
    side: BackSide,
  });

const loadTexture = (loader, url) =>
  loader.loadAsync(url).then((texture) => {
    texture.colorSpace = SRGBColorSpace;
    return texture;
  });

/**
 * @param {object} options
 * @param {HTMLElement} options.host `#bbUnboxing`; the canvas and the pointer listener live on it
 * @param {number} options.seed the box seed (tear lines)
 * @param {string[]} options.packArtUrls the art of each pack, in pack order
 * @param {string} [options.cardBackUrl] the card back of the rising stack (design 054 slice 3)
 * @param {() => void} [options.onLost] the stage can no longer draw (context lost, FX switched off)
 * @returns {Promise<object|null>} the stage, or null when WebGL or a pack texture is unavailable
 */
export async function createPackStage({ host, seed, packArtUrls, onLost }) {
  if (
    !host ||
    !Array.isArray(packArtUrls) ||
    packArtUrls.length === 0 ||
    fxDisabled()
  )
    return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'bb-gl';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    if (!context) return null;
    renderer = new WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
    });
  } catch {
    return null;
  }
  let lostEarly = false;
  const onLostEarly = (event) => {
    event.preventDefault();
    lostEarly = true;
  };
  canvas.addEventListener('webglcontextlost', onLostEarly);

  const release = () => {
    canvas.removeEventListener('webglcontextlost', onLostEarly);
    renderer.dispose();
    renderer.forceContextLoss();
  };

  const loader = new TextureLoader();
  const urls = [...new Set(packArtUrls)];
  let arts;
  try {
    arts = await Promise.all(urls.map((url) => loadTexture(loader, url)));
  } catch {
    release();
    return null;
  }
  if (lostEarly || fxDisabled()) {
    arts.forEach((texture) => texture.dispose());
    release();
    return null;
  }
  canvas.removeEventListener('webglcontextlost', onLostEarly);
  try {
    return buildStage({
      host,
      seed,
      packArtUrls,
      onLost,
      canvas,
      renderer,
      arts: new Map(urls.map((url, i) => [url, arts[i]])),
    });
  } catch {
    arts.forEach((texture) => texture.dispose());
    release();
    return null;
  }
}

function buildStage({
  host,
  seed,
  packArtUrls,
  onLost,
  canvas,
  renderer,
  arts,
}) {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  renderer.setPixelRatio(
    Math.min(globalThis.devicePixelRatio || 1, PIXEL_RATIO_MAX)
  );
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEG,
    1,
    0.1,
    CAMERA_DISTANCE * 4
  );
  camera.position.set(0, 0, CAMERA_DISTANCE);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, ENV_BLUR);
  room.dispose();
  pmrem.dispose();
  const envMap = environment.texture;
  const light = new DirectionalLight(0xffffff, LIGHT_INTENSITY);
  light.position.set(...LIGHT_POSITION);
  scene.add(light);

  // Shared by every pack: the body is never deformed; the strips are (slice 3), so they are per pack.
  const bodyFront = pillowPlane({ v0: 0, v1: 1, rows: GRID_Y, sign: 1 });
  const bodyBack = pillowPlane({ v0: 0, v1: 1, rows: GRID_Y, sign: -1 });
  const shadowGeometry = new PlaneGeometry(
    SHADOW_SIZE,
    SHADOW_SIZE * PACK_ASPECT
  );
  const shadowMaterial = new MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const silvers = new Map();
  for (const [url, art] of arts) {
    art.anisotropy = anisotropy;
    const silver = silverBack(art.image);
    silver.anisotropy = anisotropy;
    silvers.set(url, silver);
  }

  const packs = new Map();
  const animations = new Set();
  let focus = 0;
  let pointer = null;
  let rafId = 0;
  let lastFrame = 0;
  let disposed = false;

  const buildPack = (packIndex) => {
    const url = packArtUrls[packIndex] ?? packArtUrls[0];
    const art = arts.get(url);
    const silver = silvers.get(url);
    const masks = tearMasks(packTearLine(seed, packIndex));
    const stripFront = pillowPlane({
      v0: 0,
      v1: STRIP_V,
      rows: STRIP_GRID_Y,
      sign: 1,
    });
    const stripBack = pillowPlane({
      v0: 0,
      v1: STRIP_V,
      rows: STRIP_GRID_Y,
      sign: -1,
    });
    const fronts = [
      frontMaterial(art, masks.body, envMap),
      frontMaterial(art, masks.strip, envMap),
    ];
    const backs = [
      backMaterial(silver, masks.body, envMap),
      backMaterial(silver, masks.strip, envMap),
    ];
    const group = new Group();
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(0, -SHADOW_DROP, SHADOW_Z);
    shadow.renderOrder = -1;
    group.add(
      shadow,
      new Mesh(bodyFront, fronts[0]),
      new Mesh(bodyBack, backs[0]),
      new Mesh(stripFront, fronts[1]),
      new Mesh(stripBack, backs[1])
    );
    group.visible = false;
    scene.add(group);
    const pack = {
      packIndex,
      group,
      fronts,
      backs,
      owned: [
        masks.body,
        masks.strip,
        stripFront,
        stripBack,
        ...fronts,
        ...backs,
      ],
      anchor: null,
      fly: null,
      tilt: { rotateYDeg: 0, rotateXDeg: 0 },
      brightness: -1,
    };
    packs.set(packIndex, pack);
    return pack;
  };

  const setBrightness = (pack, brightness) => {
    if (pack.brightness === brightness) return;
    pack.brightness = brightness;
    // The printed colours are emissive and the foil reflects the room: both dim with the pack.
    for (const material of [...pack.fronts, ...pack.backs]) {
      material.color.setScalar(brightness);
      material.envMapIntensity = FRONT_LOOK.envMapIntensity * brightness;
    }
    for (const material of pack.fronts)
      material.emissiveIntensity = FRONT_LOOK.emissiveIntensity * brightness;
  };

  // ── Clock ─────────────────────────────────────────────────────────────
  const shownPacks = () => [...packs.values()].filter((pack) => pack.anchor);
  const still = () => motionReduced();
  const needsLoop = () =>
    !disposed && (animations.size > 0 || (!still() && shownPacks().length > 0));

  const requestRender = () => {
    if (!disposed && !rafId) rafId = requestAnimationFrame(frame);
  };

  const finish = (animation) => {
    animations.delete(animation);
    animation.resolve();
  };

  // Every animation is a pure pose sampled on this clock; before its delay it holds frame 0.
  const stepAnimations = (now) => {
    for (const animation of [...animations]) {
      const local = now - animation.start - animation.delay;
      if (local < 0) {
        animation.apply(animation.pose(0));
        continue;
      }
      if (!animation.started) {
        animation.started = true;
        animation.onStart?.();
      }
      const t = Math.min(1, local / animation.durationMs);
      animation.apply(animation.pose(t));
      if (t >= 1) finish(animation);
    }
  };

  /** Play `pose` over `durationMs`; reduced motion applies the last frame at once. */
  const animate = ({ durationMs, delay = 0, pose, apply, onStart }) => {
    if (still() || !(durationMs > 0)) {
      onStart?.();
      apply(pose(1));
      requestRender();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      animations.add({
        start: performance.now(),
        delay,
        durationMs,
        pose,
        apply,
        onStart,
        resolve,
        started: false,
      });
      requestRender();
    });
  };

  const jumpToEnd = () => {
    for (const animation of [...animations]) {
      animation.apply(animation.pose(1));
      finish(animation);
    }
    requestRender();
  };

  const viewportRect = () => canvas.getBoundingClientRect();

  const placePacks = (now, dtMs) => {
    const viewport = viewportRect();
    const perPx = worldPerPixel(viewport.height);
    const moving = !still();
    const focusWidth = packs.get(focus)?.anchor?.offsetWidth || 200;
    for (const pack of packs.values()) {
      if (!pack.anchor?.isConnected) {
        pack.group.visible = false;
        continue;
      }
      const rect = pack.anchor.getBoundingClientRect();
      const home = rectToWorld(
        {
          left: rect.left - viewport.left,
          top: rect.top - viewport.top,
          width: rect.width,
          height: rect.height,
        },
        viewport
      );
      const slot = packSpreadSlot3d(pack.packIndex, focus, focusWidth);
      const target =
        moving && pack.packIndex === focus
          ? tiltTarget(pointer, rect)
          : { rotateYDeg: 0, rotateXDeg: 0 };
      pack.tilt = moving ? followTilt(pack.tilt, target, dtMs) : target;
      const placed = packPlacement({
        home,
        slot,
        sway: moving ? swayPose(now, pack.packIndex) : null,
        tilt: pack.tilt,
        fly: pack.fly,
        worldPerPx: perPx,
      });
      pack.group.visible = Boolean(placed);
      if (!placed) continue;
      pack.group.position.set(placed.x, placed.y, placed.z);
      pack.group.rotation.set(
        radians(placed.rotateXDeg),
        radians(placed.rotateYDeg),
        radians(placed.rotateZDeg)
      );
      pack.group.scale.setScalar(placed.scale);
      setBrightness(pack, slot.brightness);
    }
  };

  function frame() {
    rafId = 0;
    if (disposed) return;
    if (fxDisabled()) {
      onLost?.();
      return;
    }
    const now = performance.now();
    const dtMs = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    stepAnimations(now);
    if (
      canvas.isConnected &&
      canvas.clientWidth > 0 &&
      canvas.clientHeight > 0
    ) {
      placePacks(now, dtMs);
      renderer.render(scene, camera);
    }
    if (needsLoop()) rafId = requestAnimationFrame(frame);
    else lastFrame = 0;
  }

  // ── Viewport, pointer, context ────────────────────────────────────────
  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (disposed || !(width > 0) || !(height > 0)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  observer?.observe(canvas);

  const onPointerMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  // A finger that lifts leaves no hover to follow.
  const onPointerEnd = (event) => {
    if (event.type === 'pointerleave' || event.pointerType !== 'mouse')
      pointer = null;
  };
  // The anchors ease between slots with a CSS transition; a still stage redraws where they land.
  const onTransitionEnd = () => requestRender();
  host.addEventListener('pointermove', onPointerMove, { passive: true });
  host.addEventListener('pointerup', onPointerEnd, { passive: true });
  host.addEventListener('pointerleave', onPointerEnd, { passive: true });
  host.addEventListener('transitionend', onTransitionEnd);

  const onContextLost = (event) => {
    event.preventDefault();
    if (disposed) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // ── Stage API ─────────────────────────────────────────────────────────
  /**
   * Draw the packs of `anchors` (the `.bb-bigpack` elements, `data-pack` = pack index) with pack
   * `focus` centred. With `fromBoxRect` they fly out of the box mouth first, one after another.
   */
  const showSpread = ({
    anchors = [],
    focus: focusIndex = 0,
    fromBoxRect = null,
  } = {}) => {
    if (disposed) return Promise.resolve();
    jumpToEnd();
    focus = focusIndex;
    for (const pack of packs.values()) {
      pack.anchor = null;
      pack.fly = null;
    }
    const shown = [...anchors].filter((anchor) =>
      Number.isInteger(Number(anchor?.dataset?.pack))
    );
    const entries = shown.map((anchor) => {
      const packIndex = Number(anchor.dataset.pack);
      const pack = packs.get(packIndex) || buildPack(packIndex);
      pack.anchor = anchor;
      return pack;
    });
    requestRender();
    if (!fromBoxRect) return Promise.resolve();
    const flights = entries.map((pack, order) => {
      const params = packFlyParams(
        fromBoxRect,
        pack.anchor.getBoundingClientRect()
      );
      if (!params) return Promise.resolve();
      return animate({
        durationMs: PACK_FLY_MS,
        delay: order * PACK_FLY_STAGGER_MS,
        pose: (t) => packFlyPose3d(t, params),
        apply: (pose) => {
          pack.fly = pose;
        },
        onStart: () => playFxSound({ effect: 'unbox-unwrap' }),
      }).then(() => {
        pack.fly = null;
      });
    });
    return Promise.all(flights).then(() => undefined);
  };

  /** Draw nothing (pocket and summary views); the loop idles. */
  const hide = () => showSpread({ anchors: [] });

  const dispose = () => {
    if (disposed) return;
    for (const animation of [...animations]) finish(animation);
    disposed = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    observer?.disconnect();
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', onPointerEnd);
    host.removeEventListener('pointerleave', onPointerEnd);
    host.removeEventListener('transitionend', onTransitionEnd);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const pack of packs.values())
      pack.owned.forEach((resource) => resource.dispose());
    packs.clear();
    for (const texture of [...arts.values(), ...silvers.values()])
      texture.dispose();
    bodyFront.dispose();
    bodyBack.dispose();
    shadowGeometry.dispose();
    shadowMaterial.map?.dispose();
    shadowMaterial.dispose();
    environment.dispose();
    renderer.dispose();
    // Frees the context now instead of at GC (row 14); a lost context has nothing left to free.
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    canvas.remove();
  };

  resize();
  return { canvas, showSpread, hide, jumpToEnd, dispose };
}
