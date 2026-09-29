import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from '../../../vendor/three/RoomEnvironment.js';
import {
  CAMERA_DISTANCE,
  CAMERA_FOV_DEG,
  CARDS_RISE_AT,
  CARDS_RISE_MS,
  CARD_TEXTURE_TIMEOUT_MS,
  GRAB_LEVEL_MS,
  PACK_ASPECT,
  PACK_DROP_AT,
  PACK_DROP_MS,
  PIXEL_RATIO_MAX,
  RIP_FINISH_MS,
  SPRING_BACK_MS,
  STACK_CARD_ASPECT,
  STACK_CARD_WIDTH,
  STACK_DEPTH,
  STACK_SETTLE_MS,
  STRIP_FLIGHT_MS,
  STRIP_V,
  cardsEmergePose,
  followTilt,
  grabLevelPose,
  linearBrightness,
  packDropPose,
  packFlyParams,
  packFlyPose3d,
  packPlacement,
  packSpaceY,
  packSpreadSlot3d,
  packTearLine,
  peelAngleDeg,
  peelVertex,
  packShapeKey,
  pillowZ,
  rectToWorld,
  ripTicksCrossed,
  stackSettlePose,
  stripFlightPose,
  swayPose,
  tearFarEnd,
  tearHingeV,
  tearProgressPose,
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
  spawnParticles,
} from '../../../setup/image-logic/mat-fx.mjs';
import { playFxSound } from '../../../setup/netcode/mat-fx/fx-audio.js';
import { burstParticles } from '../../../setup/netcode/mat-fx/particles.mjs';

/**
 * The Build & Battle 3D packs (design 055 § Stage API): a transparent WebGL canvas over the
 * unboxing scene draws each sealed pack as a lit pillow where the scene's invisible `.bb-bigpack`
 * anchor sits, so the DOM keeps layout, input and keyboard access. The finger peels the focus
 * pack's strip; the rip flies the strip off, lifts the card stack out of the mouth and drops the
 * pack; the stack then settles onto the DOM pocket's top card for the hand-off. Every pose comes
 * from pack3d.mjs; this file only builds meshes and runs the one `requestAnimationFrame` clock.
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
// The rip's flecks: silver foil shards from the far end of the tear line (design 055 § rip).
const FLECK_COUNT = 14;
const FLECK_MS = 560;
const FLECK_SIZE_PX = [2, 5];
const FLECK_REACH = 0.3; // share of the pack's on-screen width
const FLECK_GRAVITY = 0.2; // share of the pack's on-screen width
const FLECK_SPREAD_DEG = 150;
// A stack without its card back texture yet: the back's blue.
const STACK_FALLBACK_COLOR = 0x1d3f8f;
// BoxGeometry material order: +x, −x, +y, −y, +z, −z.
const STACK_FACE_FRONT = 4;
// A clip plane this far away clips nothing.
const NO_CLIP = 1e6;
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
const UP = new Vector3(0, 1, 0);
const UPRIGHT = new Quaternion();

const radians = (deg) => (deg * Math.PI) / 180;
const clamp01 = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * A plane over art rows `v0..v1` (v = 0 at the top) in pack space (1 wide, centred), UV-mapped to
 * that band of the art and bulged by `sign · pillowZ` for the front's measured `shape`: +1 for the
 * front, −1 for the back.
 */
const pillowPlane = ({ v0, v1, rows, sign, shape }) => {
  const geometry = new PlaneGeometry(1, (v1 - v0) * PACK_ASPECT, GRID_X, rows);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    const u = uv.getX(i);
    const v = v0 + (1 - uv.getY(i)) * (v1 - v0);
    uv.setY(i, 1 - v);
    position.setY(i, packSpaceY(v));
    position.setZ(i, sign * pillowZ(u, v, shape));
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

// Cards are printed flat: unlit and untoned, so the settled stack matches the DOM card pixel for
// pixel at the hand-off.
const cardMaterial = (map, clippingPlanes) =>
  new MeshBasicMaterial({
    map,
    color: map ? 0xffffff : STACK_FALLBACK_COLOR,
    toneMapped: false,
    alphaTest: map ? ALPHA_TEST : 0,
    clippingPlanes,
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
 * @param {{url: string, shape: object|null}[]} options.packArts each pack's front and its measured
 *   seals (design 055 § Every box's art; null: the default shape), in pack order
 * @param {string} [options.cardBackUrl] the card back of the rising stack
 * @param {() => void} [options.onLost] the stage can no longer draw (context lost, FX switched off)
 * @returns {Promise<object|null>} the stage, or null when WebGL or a pack texture is unavailable
 */
export async function createPackStage({
  host,
  seed,
  packArts,
  cardBackUrl,
  onLost,
}) {
  if (!host || !Array.isArray(packArts) || packArts.length === 0 || fxDisabled()) {
    return null;
  }
  const packArtUrls = packArts.map((art) => art.url);
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
  loader.setCrossOrigin('anonymous');
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
      packShapes: packArts.map((art) => art.shape ?? null),
      cardBackUrl,
      onLost,
      canvas,
      renderer,
      loader,
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
  packShapes,
  cardBackUrl,
  onLost,
  canvas,
  renderer,
  loader,
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

  // Shared by every pack of one shape: the body is never deformed; the strips peel, so they are
  // per pack.
  const bodies = new Map();
  const bodyFor = (shape) => {
    const key = packShapeKey(shape);
    if (!bodies.has(key)) {
      bodies.set(key, {
        front: pillowPlane({ v0: 0, v1: 1, rows: GRID_Y, sign: 1, shape }),
        back: pillowPlane({ v0: 0, v1: 1, rows: GRID_Y, sign: -1, shape }),
      });
    }
    return bodies.get(key);
  };
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
  // Card faces by URL (a failed load is null); every loaded texture, for dispose.
  const cardLoads = new Map();
  const cardTextures = new Set();
  let cardBack = null;
  // The rising / settling card stack of the last rip, until the hand-off clears it.
  let cards = null;
  let focus = 0;
  let pointer = null;
  let rafId = 0;
  let lastFrame = 0;
  let disposed = false;

  const loadCardTexture = (url) => {
    if (!url) return Promise.resolve(null);
    if (!cardLoads.has(url)) {
      cardLoads.set(
        url,
        loader.loadAsync(url).then(
          (texture) => {
            texture.colorSpace = SRGBColorSpace;
            texture.anisotropy = anisotropy;
            cardTextures.add(texture);
            if (disposed) texture.dispose();
            return texture;
          },
          () => null
        )
      );
    }
    return cardLoads.get(url);
  };

  const withCardBack = (material) => {
    material.map = cardBack;
    material.color.set(0xffffff);
    material.alphaTest = ALPHA_TEST;
    material.needsUpdate = true;
  };

  loadCardTexture(cardBackUrl).then((texture) => {
    if (!texture || disposed) return;
    cardBack = texture;
    cards?.materials.filter((material) => !material.map).forEach(withCardBack);
    requestRender();
  });

  const buildPack = (packIndex) => {
    const url = packArtUrls[packIndex] ?? packArtUrls[0];
    const shape = packShapes[packIndex] ?? packShapes[0] ?? null;
    const body = bodyFor(shape);
    const art = arts.get(url);
    const silver = silvers.get(url);
    const line = packTearLine(seed, packIndex);
    const masks = tearMasks(line);
    const stripFront = pillowPlane({
      v0: 0,
      v1: STRIP_V,
      rows: STRIP_GRID_Y,
      sign: 1,
      shape,
    });
    const stripBack = pillowPlane({
      v0: 0,
      v1: STRIP_V,
      rows: STRIP_GRID_Y,
      sign: -1,
      shape,
    });
    const fronts = [
      frontMaterial(art, masks.body, envMap),
      frontMaterial(art, masks.strip, envMap),
    ];
    const backs = [
      backMaterial(silver, masks.body, envMap),
      backMaterial(silver, masks.strip, envMap),
    ];
    const stripMeshes = [
      new Mesh(stripFront, fronts[1]),
      new Mesh(stripBack, backs[1]),
    ];
    // A peeled strip leaves its bounding sphere; it is always on screen anyway.
    stripMeshes.forEach((mesh) => {
      mesh.frustumCulled = false;
    });
    const group = new Group();
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(0, -SHADOW_DROP, SHADOW_Z);
    shadow.renderOrder = -1;
    group.add(
      shadow,
      new Mesh(body.front, fronts[0]),
      new Mesh(body.back, backs[0]),
      ...stripMeshes
    );
    group.visible = false;
    scene.add(group);
    const pack = {
      packIndex,
      group,
      fronts,
      backs,
      line,
      hingeY: packSpaceY(tearHingeV(line)),
      strip: [stripFront, stripBack].map((geometry) => ({
        geometry,
        rest: Float32Array.from(geometry.attributes.position.array),
      })),
      stripMeshes,
      stripMaterials: [fronts[1], backs[1]],
      flight: null,
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
      // Tear state: the peel's progress and direction, how level the grabbed pack is, the rip.
      progress: 0,
      side: 1,
      level: 0,
      grabbed: false,
      torn: false,
      frozen: null,
      drop: null,
      gone: false,
      lastHome: null,
      lastSlot: null,
    };
    packs.set(packIndex, pack);
    return pack;
  };

  const setBrightness = (pack, brightness) => {
    if (pack.brightness === brightness) return;
    pack.brightness = brightness;
    // `brightness` is linear light (`linearBrightness`). The base colour already scales the room's
    // diffuse light and the foil's tinted reflection, so `envMapIntensity` stays put (scaling it too
    // would dim those twice); the printed (emissive) colours and the clear gloss dim once.
    for (const material of [...pack.fronts, ...pack.backs]) {
      material.color.setScalar(brightness);
      material.clearcoat = FRONT_LOOK.clearcoat * brightness;
    }
    for (const material of pack.fronts)
      material.emissiveIntensity = FRONT_LOOK.emissiveIntensity * brightness;
  };

  /** Fold the strip `progress` across (0 flat, 1 fully peeled), column by column. */
  const peel = (pack, progress) => {
    pack.progress = progress;
    for (const { geometry, rest } of pack.strip) {
      const position = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i += 1) {
        const bent = peelVertex(
          { y: rest[i * 3 + 1], z: rest[i * 3 + 2] },
          {
            hingeY: pack.hingeY,
            angleDeg: peelAngleDeg(uv.getX(i), progress, pack.side),
          }
        );
        position.setY(i, bent.y);
        position.setZ(i, bent.z);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  };

  // ── Clock ─────────────────────────────────────────────────────────────
  const still = () => motionReduced();
  const needsLoop = () =>
    !disposed &&
    (animations.size > 0 ||
      (!still() &&
        [...packs.values()].some((pack) => pack.anchor && !pack.torn)));

  const requestRender = () => {
    if (!disposed && !rafId) rafId = requestAnimationFrame(frame);
  };

  const finish = (animation) => {
    animations.delete(animation);
    animation.done?.();
    animation.resolve();
  };

  const begin = (animation) => {
    if (animation.started) return false;
    animation.started = true;
    animation.setup?.();
    return true;
  };

  // Every animation is a pure pose sampled on this clock. Before its delay it holds frame 0, unless
  // it has a `setup` (a mesh that does not exist yet). `onStart` is its sound or spray: played when
  // it starts on time, skipped when it is landed early.
  const stepAnimations = (now) => {
    for (const animation of [...animations]) {
      const local = now - animation.start - animation.delay;
      if (local < 0) {
        if (!animation.setup) animation.apply(animation.pose(0));
        continue;
      }
      if (begin(animation)) animation.onStart?.();
      const t = Math.min(1, local / animation.durationMs);
      animation.apply(animation.pose(t));
      if (t >= 1) finish(animation);
    }
  };

  /** Play `pose` over `durationMs`; reduced motion applies the last frame at once. */
  const animate = (spec) => {
    const animation = {
      delay: 0,
      ...spec,
      start: performance.now(),
      started: false,
      resolve: null,
    };
    const done = new Promise((resolve) => {
      animation.resolve = resolve;
    });
    if (still() || !(animation.durationMs > 0)) {
      begin(animation);
      animation.onStart?.();
      animation.apply(animation.pose(1));
      animation.done?.();
      animation.resolve();
    } else {
      animations.add(animation);
    }
    requestRender();
    return done;
  };

  /** Land the matching animations on their last frame now. */
  const land = (match = () => true) => {
    for (const animation of [...animations]) {
      if (!match(animation)) continue;
      begin(animation);
      animation.apply(animation.pose(1));
      finish(animation);
    }
    requestRender();
  };

  /** Drop the matching animations where they are (a newer one takes over). */
  const stop = (match) => {
    for (const animation of [...animations]) {
      if (match(animation)) finish(animation);
    }
  };

  const jumpToEnd = () => land();

  const levelTo = (pack, to) => {
    stop((animation) => animation.kind === 'level' && animation.pack === pack);
    const from = pack.level;
    return animate({
      kind: 'level',
      pack,
      durationMs: GRAB_LEVEL_MS,
      pose: (t) => from + (to - from) * grabLevelPose(t),
      apply: (level) => {
        pack.level = level;
      },
    });
  };

  const viewportRect = () => canvas.getBoundingClientRect();
  const viewportWorldH = () => {
    const viewport = viewportRect();
    return worldPerPixel(viewport.height) * viewport.height;
  };
  const relativeTo = (rect, viewport) => ({
    left: rect.left - viewport.left,
    top: rect.top - viewport.top,
    width: rect.width,
    height: rect.height,
  });

  const placePacks = (now, dtMs) => {
    const viewport = viewportRect();
    const perPx = worldPerPixel(viewport.height);
    const moving = !still();
    const focusWidth = packs.get(focus)?.anchor?.offsetWidth || 200;
    for (const pack of packs.values()) {
      let rect = null;
      let home;
      let slot;
      if (pack.gone) {
        pack.group.visible = false;
        continue;
      }
      if (pack.torn && pack.frozen?.home) {
        // A torn pack no longer follows its anchor: it falls from where it was ripped.
        ({ home, slot } = pack.frozen);
      } else if (pack.anchor?.isConnected) {
        rect = pack.anchor.getBoundingClientRect();
        home = rectToWorld(relativeTo(rect, viewport), viewport);
        slot = packSpreadSlot3d(pack.packIndex, focus, focusWidth);
      } else {
        pack.group.visible = false;
        continue;
      }
      pack.lastHome = home;
      pack.lastSlot = slot;
      const target =
        moving && rect && pack.packIndex === focus
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
        level: pack.level,
        drop: pack.drop,
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
      setBrightness(
        pack,
        linearBrightness((slot?.brightness ?? 1) * (pack.drop?.brightness ?? 1))
      );
    }
  };

  // The stack shows only above the torn pack's mouth, so it rises out of the pack, not through it.
  const mouthPoint = new Vector3();
  const mouthNormal = new Vector3();
  const packTurn = new Quaternion();
  const clipAtMouth = () => {
    if (!cards) return;
    const pack = cards.pack;
    if (!cards.clipped || pack.gone || !pack.group.visible) {
      cards.plane.set(UP, NO_CLIP);
      return;
    }
    pack.group.updateMatrixWorld(true);
    mouthPoint.set(0, pack.hingeY, 0).applyMatrix4(pack.group.matrixWorld);
    mouthNormal
      .copy(UP)
      .applyQuaternion(pack.group.getWorldQuaternion(packTurn));
    cards.plane.setFromNormalAndCoplanarPoint(mouthNormal, mouthPoint);
  };

  const draw = () => {
    if (
      !canvas.isConnected ||
      !(canvas.clientWidth > 0) ||
      !(canvas.clientHeight > 0)
    )
      return;
    renderer.render(scene, camera);
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
    if (canvas.isConnected) {
      placePacks(now, dtMs);
      clipAtMouth();
      draw();
    }
    if (needsLoop()) rafId = requestAnimationFrame(frame);
    else lastFrame = 0;
  }

  // ── The rip: strip flight, flecks, card stack ────────────────────────
  /** The peeled strip leaves the pack, keeping its world transform, pivoting on the tear line. */
  const detachStrip = (pack) => {
    pack.group.updateMatrixWorld(true);
    const group = new Group();
    pack.group.matrixWorld.decompose(
      group.position,
      group.quaternion,
      group.scale
    );
    const pivot = new Group();
    pivot.position.set(0, pack.hingeY, 0);
    group.add(pivot);
    for (const mesh of pack.stripMeshes) {
      mesh.position.set(0, -pack.hingeY, 0);
      pivot.add(mesh);
    }
    scene.add(group);
    for (const material of pack.stripMaterials) {
      material.transparent = true;
      material.needsUpdate = true;
    }
    pack.flight = { group, pivot, origin: group.position.clone() };
  };

  const flyStrip = (pack, pose) => {
    const flight = pack.flight;
    if (!flight) return;
    flight.group.position.set(
      flight.origin.x + pose.x,
      flight.origin.y + pose.y,
      flight.origin.z + pose.z
    );
    flight.pivot.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    for (const material of pack.stripMaterials) material.opacity = pose.opacity;
  };

  const dropStrip = (pack) => {
    if (!pack.flight) return;
    scene.remove(pack.flight.group);
    pack.flight = null;
  };

  /** Silver flecks from the far end of the tear line, in the DOM over the canvas. */
  const sprayFlecks = (pack) => {
    if (still() || !host.isConnected) return;
    const end = tearFarEnd(pack.line, pack.side);
    const point = new Vector3(end.x, end.y, 0)
      .applyMatrix4(pack.group.matrixWorld)
      .project(camera);
    const viewport = viewportRect();
    const packWidthPx = pack.group.scale.x / worldPerPixel(viewport.height);
    if (!(packWidthPx > 0)) return;
    const spot = document.createElement('div');
    spot.className = 'bb-flecks';
    spot.style.left = `${viewport.left + ((point.x + 1) / 2) * viewport.width}px`;
    spot.style.top = `${viewport.top + ((1 - point.y) / 2) * viewport.height}px`;
    host.append(spot);
    const flecks = spawnParticles(
      spot,
      burstParticles({
        count: FLECK_COUNT,
        distance: packWidthPx * FLECK_REACH,
        direction: pack.side === -1 ? 180 : 0,
        spread: FLECK_SPREAD_DEG,
        size: FLECK_SIZE_PX,
        gravity: packWidthPx * FLECK_GRAVITY,
        maxDelay: 0.12,
        seed: seed + pack.packIndex,
      }),
      {
        className: 'fx-particle--shard',
        color: SILVER_STOPS[0],
        duration: FLECK_MS,
      }
    );
    Promise.all(flecks).then(() => spot.remove());
    setTimeout(() => spot.remove(), FLECK_MS * 2);
  };

  const clearCards = () => {
    if (!cards) return;
    scene.remove(cards.group);
    cards.geometry.dispose();
    cards.materials.forEach((material) => material.dispose());
    cards = null;
    // Drawn now, in the same frame the DOM stack appears (the hand-off).
    draw();
    requestRender();
  };

  const buildStack = (pack) => {
    const plane = new Plane(UP.clone(), NO_CLIP);
    const geometry = new BoxGeometry(
      STACK_CARD_WIDTH,
      STACK_CARD_WIDTH * STACK_CARD_ASPECT,
      STACK_DEPTH
    );
    const materials = Array.from({ length: 6 }, () =>
      cardMaterial(cardBack, [plane])
    );
    const mesh = new Mesh(geometry, materials);
    mesh.frustumCulled = false;
    const group = new Group();
    group.add(mesh);
    group.visible = false;
    scene.add(group);
    return { pack, plane, geometry, materials, mesh, group, clipped: true };
  };

  // The top card's face, when it is not a hidden hit and arrives within the timeout (row 4).
  const dressStack = (stack, topCard) => {
    if (!topCard?.imageUrl || topCard.faceDown) return;
    Promise.race([
      loadCardTexture(topCard.imageUrl),
      sleep(CARD_TEXTURE_TIMEOUT_MS).then(() => null),
    ]).then((texture) => {
      if (!texture || disposed || cards !== stack) return;
      const face = stack.materials[STACK_FACE_FRONT];
      face.map = texture;
      face.color.set(0xffffff);
      face.alphaTest = ALPHA_TEST;
      face.needsUpdate = true;
      requestRender();
    });
  };

  /** The stack starts inside the pack, in the pack's frame at the moment it rises. */
  const launchStack = (stack) => {
    const pack = stack.pack;
    pack.group.updateMatrixWorld(true);
    pack.group.matrixWorld.decompose(
      stack.group.position,
      stack.group.quaternion,
      stack.group.scale
    );
    stack.mesh.position.set(0, cardsEmergePose(0).y, 0);
    stack.group.visible = true;
  };

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
  const releaseAnchors = () => {
    for (const pack of packs.values()) {
      pack.anchor = null;
      if (pack.torn) continue;
      pack.fly = null;
      pack.grabbed = false;
      pack.level = 0;
      if (pack.progress > 0) peel(pack, 0);
    }
  };

  /**
   * Draw the packs of `anchors` (the `.bb-bigpack` elements, `data-pack` = pack index) with pack
   * `focus` centred. With `fromBoxRect` they fly out of the box mouth first, one after another.
   * `topCard` (`{imageUrl, faceDown}`) is the focus pack's first card: its face starts loading.
   */
  const showSpread = ({
    anchors = [],
    focus: focusIndex = 0,
    fromBoxRect = null,
    topCard = null,
  } = {}) => {
    if (disposed) return Promise.resolve();
    land((animation) => ['fly', 'spring', 'level'].includes(animation.kind));
    focus = focusIndex;
    releaseAnchors();
    if (topCard && !topCard.faceDown) loadCardTexture(topCard.imageUrl);
    const entries = [...anchors]
      .filter((anchor) => Number.isInteger(Number(anchor?.dataset?.pack)))
      .map((anchor) => {
        const packIndex = Number(anchor.dataset.pack);
        const pack = packs.get(packIndex) || buildPack(packIndex);
        pack.anchor = anchor;
        return pack;
      })
      .filter((pack) => !pack.torn);
    requestRender();
    if (!fromBoxRect) return Promise.resolve();
    const flights = entries.map((pack, order) => {
      const params = packFlyParams(
        fromBoxRect,
        pack.anchor.getBoundingClientRect()
      );
      if (!params) return Promise.resolve();
      return animate({
        kind: 'fly',
        durationMs: PACK_FLY_MS,
        delay: order * PACK_FLY_STAGGER_MS,
        pose: (t) => packFlyPose3d(t, params),
        apply: (pose) => {
          pack.fly = pose;
        },
        onStart: () => playFxSound({ effect: 'unbox-unwrap' }),
        done: () => {
          pack.fly = null;
        },
      });
    });
    return Promise.all(flights).then(() => undefined);
  };

  /** Draw no spread (pocket and summary views); a torn pack still falls, a stack still settles. */
  const hide = () => {
    if (disposed) return;
    land((animation) => animation.kind === 'fly');
    releaseAnchors();
    requestRender();
  };

  const tearable = (pack) => pack && !pack.torn && !disposed;

  /** The finger is down on the focus pack's top: it levels, sway and tilt pause. */
  const beginTear = ({ packIndex, side = 1 } = {}) => {
    const pack = packs.get(packIndex);
    if (!tearable(pack)) return;
    stop((animation) => animation.kind === 'spring' && animation.pack === pack);
    pack.side = side === -1 ? -1 : 1;
    pack.grabbed = true;
    levelTo(pack, 1);
  };

  /** The peel follows the finger; a soft tick sounds at every 10 %. */
  const setTearProgress = (progress) => {
    const pack = packs.get(focus);
    if (!tearable(pack)) return;
    const next = clamp01(progress);
    const ticks = ripTicksCrossed(pack.progress, next);
    for (let tick = 0; tick < ticks; tick += 1)
      playFxSound({ effect: 'unbox-rip-tick' });
    peel(pack, next);
    requestRender();
  };

  /** Let go short of the rip: the strip lies back down, then the pack sways again. */
  const springBack = () => {
    const pack = packs.get(focus);
    if (!tearable(pack)) return Promise.resolve();
    const from = pack.progress;
    pack.grabbed = false;
    return animate({
      kind: 'spring',
      pack,
      durationMs: SPRING_BACK_MS,
      pose: (t) => tearProgressPose(t, from, 0),
      apply: (progress) => peel(pack, progress),
    }).then(() => {
      if (!pack.grabbed && !pack.torn && !disposed) levelTo(pack, 0);
    });
  };

  /**
   * Finish the rip from `fromProgress`: the strip tears off and flies, flecks spray, the cards rise
   * out of the mouth (face = `topCard` unless it is face down) and the pack drops away. Resolves
   * when the stack is up; the pack is still falling then.
   */
  const rip = ({ fromProgress = 0, topCard = null } = {}) => {
    const pack = packs.get(focus);
    if (!tearable(pack) || !pack.lastHome) return Promise.resolve();
    land((animation) => ['spring', 'fly'].includes(animation.kind));
    if (!pack.grabbed) pack.side = 1;
    pack.grabbed = false;
    pack.torn = true;
    pack.frozen = { home: pack.lastHome, slot: pack.lastSlot };
    if (pack.level < 1) levelTo(pack, 1);
    clearCards();
    const stack = buildStack(pack);
    cards = stack;
    dressStack(stack, topCard);
    const startProgress = Math.max(pack.progress, clamp01(fromProgress));
    const riseDelay = RIP_FINISH_MS + CARDS_RISE_AT * STRIP_FLIGHT_MS;
    animate({
      kind: 'peel',
      durationMs: RIP_FINISH_MS,
      pose: (t) => tearProgressPose(t, startProgress, 1),
      apply: (progress) => peel(pack, progress),
    });
    animate({
      kind: 'strip',
      delay: RIP_FINISH_MS,
      durationMs: STRIP_FLIGHT_MS,
      setup: () => detachStrip(pack),
      onStart: () => sprayFlecks(pack),
      pose: (t) => stripFlightPose(t, { side: pack.side }),
      apply: (pose) => flyStrip(pack, pose),
      done: () => dropStrip(pack),
    });
    const risen = animate({
      kind: 'rise',
      delay: riseDelay,
      durationMs: CARDS_RISE_MS,
      setup: () => launchStack(stack),
      pose: cardsEmergePose,
      apply: (pose) => {
        stack.mesh.position.y = pose.y;
      },
    });
    animate({
      kind: 'drop',
      delay: riseDelay + PACK_DROP_AT * CARDS_RISE_MS,
      durationMs: PACK_DROP_MS,
      pose: (t) => packDropPose(t, { viewportWorldH: viewportWorldH() }),
      apply: (pose) => {
        pack.drop = pose;
      },
      done: () => {
        pack.gone = true;
        pack.group.visible = false;
      },
    });
    return risen;
  };

  /** The risen stack glides onto the DOM top card's client `rect`, upright, face to the camera. */
  const settleStackTo = (rect) => {
    const stack = cards;
    if (disposed || !stack) return Promise.resolve();
    land((animation) => ['peel', 'strip', 'rise'].includes(animation.kind));
    const viewport = viewportRect();
    const target = rect && rectToWorld(relativeTo(rect, viewport), viewport);
    if (!target || !stack.group.visible) return Promise.resolve();
    stack.mesh.updateWorldMatrix(true, false);
    const fromPosition = new Vector3();
    const fromTurn = new Quaternion();
    const fromScale = new Vector3();
    stack.mesh.matrixWorld.decompose(fromPosition, fromTurn, fromScale);
    stack.group.position.set(0, 0, 0);
    stack.group.quaternion.identity();
    stack.group.scale.setScalar(1);
    stack.clipped = false;
    const toScale = target.width / STACK_CARD_WIDTH;
    const from = { ...fromPosition, scale: fromScale.x };
    // The card's face lies on the z = 0 plane, where the DOM rect maps exactly.
    const to = {
      x: target.x,
      y: target.y,
      z: (-STACK_DEPTH / 2) * toScale,
      scale: toScale,
    };
    return animate({
      kind: 'settle',
      durationMs: STACK_SETTLE_MS,
      pose: (t) => stackSettlePose(t, from, to),
      apply: (pose) => {
        stack.mesh.position.set(pose.x, pose.y, pose.z);
        stack.mesh.quaternion.slerpQuaternions(fromTurn, UPRIGHT, pose.turn);
        stack.mesh.scale.setScalar(pose.scale);
      },
    });
  };

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
    if (cards) {
      cards.geometry.dispose();
      cards.materials.forEach((material) => material.dispose());
      cards = null;
    }
    for (const pack of packs.values())
      pack.owned.forEach((resource) => resource.dispose());
    packs.clear();
    for (const texture of [
      ...arts.values(),
      ...silvers.values(),
      ...cardTextures,
    ])
      texture.dispose();
    for (const body of bodies.values()) {
      body.front.dispose();
      body.back.dispose();
    }
    bodies.clear();
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
  return {
    canvas,
    showSpread,
    hide,
    beginTear,
    setTearProgress,
    springBack,
    rip,
    settleStackTo,
    clearCards,
    jumpToEnd,
    dispose,
  };
}
