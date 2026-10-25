// Design 077 (prototype): a Stadium's place drawn under the real board. Bakes the ground once per
// layout, draws terrain, lava, embers and crater smoke in the table frame, and hands the table a
// cutout (table-mesh.js setCutout) so the mat disappears where the environment shows. Cards, piles,
// labels and the zone-outline overlay stay the board's own, where and as large as they always are.
import * as env from './stadium-environment-shader.mjs';
import { ENVIRONMENT_KEYS, environmentFootprints, volcanoSpot } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const INTRO_MS = 1600;
/** Render layer of the environment: board-scene.js draws it in a pass of its own, under the board. */
export const STADIUM_ENV_LAYER = 3;
export const AMBIENT_FPS = 30;
const EMBER_COUNT = 220;
const SMOKE_COUNT = 14;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * @param {{ three: typeof import('three'), renderer: import('three').WebGLRenderer,
 *   parent: import('three').Object3D, motionReduced?: () => boolean, onNeedsRender?: () => void,
 *   isHidden?: () => boolean, random?: () => number }} deps
 *   `parent` is the table frame (board-scene.js `tableFrame`); `onNeedsRender` asks the scene for a
 *   frame (ambient animation, 30 fps while shown).
 * @returns {{ setLayout: (layout: object) => void, setKey: (key: string|null) => boolean,
 *   update: (now: number, camera?: import('three').PerspectiveCamera) => boolean, active: () => boolean,
 *   cutout: { glsl: string, uniforms: object }, dispose: () => void }}
 *   `setKey` returns true when the shown environment changed; `update` (each frame, before the
 *   scene renders) bakes when needed and returns true while the reveal still runs.
 */
export function createStadiumEnvironment({
  three,
  renderer,
  parent,
  motionReduced = () => false,
  onNeedsRender = () => {},
  isHidden = () => globalThis.document?.hidden === true,
  random = Math.random,
}) {
  const group = new three.Group();
  group.name = 'board3d-stadium-env';
  group.visible = false;
  parent.add(group);

  const uniforms = {
    uMin: { value: new three.Vector2() },
    uSize: { value: new three.Vector2(1, 1) },
    uOrigin: { value: new three.Vector2() },
    uReveal: { value: 0 },
    uExit: { value: 0 },
    uTime: { value: 0 },
    uRiverY: { value: 0 },
    uSun: { value: new three.Vector3(...env.SUN_DIRECTION).normalize() },
    uVolcano: { value: new three.Vector4() },
    uField: { value: null },
    uLight: { value: null },
    uTexel: { value: new three.Vector2() },
    uFocal: { value: 1000 },
  };
  const cutout = {
    glsl: env.CUTOUT_GLSL,
    uniforms: {
      uMin: uniforms.uMin,
      uSize: uniforms.uSize,
      uOrigin: uniforms.uOrigin,
      uReveal: uniforms.uReveal,
      uExit: uniforms.uExit,
      uCutoutOn: { value: 0 },
      uTableFromWorld: { value: new three.Matrix4() },
    },
  };

  const shader = (vertexShader, fragmentShader, extra = {}) =>
    new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms, ...extra });
  const bakeOptions = { depthTest: false, depthWrite: false, toneMapped: false };
  const materials = {
    terrain: shader(env.TERRAIN_VERTEX, env.TERRAIN_FRAGMENT),
    // Pushed back a hair so ground lying right at the river's level wins the depth test, not flickers.
    lava: shader(env.LAVA_VERTEX, env.LAVA_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    embers: shader(env.EMBER_VERTEX, env.EMBER_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
    smoke: shader(env.SMOKE_VERTEX, env.SMOKE_FRAGMENT, { transparent: true, depthWrite: false }),
    bakeField: shader(env.FULLSCREEN_VERTEX, env.BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: shader(env.FULLSCREEN_VERTEX, env.BAKE_LIGHT_FRAGMENT, bakeOptions),
  };

  const seeded = (count) => {
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new three.BufferAttribute(Float32Array.from({ length: count * 4 }, () => random()), 4));
    return geometry;
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const lava = new three.Mesh(new three.BufferGeometry(), materials.lava);
  const embers = new three.Points(seeded(EMBER_COUNT), materials.embers);
  const smoke = new three.Points(seeded(SMOKE_COUNT), materials.smoke);
  smoke.renderOrder = 1;
  embers.renderOrder = 2;
  for (const object of [terrain, lava, embers, smoke]) {
    object.frustumCulled = false;
    object.layers.set(STADIUM_ENV_LAYER);
    group.add(object);
  }

  const bakeCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bakeQuad = new three.Mesh(new three.PlaneGeometry(2, 2), materials.bakeField);
  bakeQuad.frustumCulled = false;
  const bakeScene = new three.Scene();
  bakeScene.add(bakeQuad);
  const bufferSize = new three.Vector2();

  let key = null;
  let layout = null;
  let dirty = false;
  let bakedFor = '';
  let targets = null;
  let revealStartedAt = null;
  let ambientTimer = null;
  let disposed = false;
  let unsupported = false;

  const stopAmbient = () => {
    if (ambientTimer !== null) clearTimeout(ambientTimer);
    ambientTimer = null;
  };

  const scheduleAmbient = () => {
    if (ambientTimer !== null || motionReduced() || isHidden()) return;
    ambientTimer = setTimeout(() => {
      ambientTimer = null;
      if (key && !disposed) onNeedsRender();
    }, 1000 / AMBIENT_FPS);
  };

  /** Fits the terrain grid and the lava sheet to the table. */
  const place = (bounds) => {
    const centreX = bounds.x + bounds.w / 2;
    const centreY = bounds.y + bounds.h / 2;
    const columns = Math.max(1, Math.round(bounds.w / env.TERRAIN_SPACING_PX));
    const rows = Math.max(1, Math.round(bounds.h / env.TERRAIN_SPACING_PX));
    terrain.geometry.dispose();
    terrain.geometry = new three.PlaneGeometry(bounds.w, bounds.h, columns, rows).translate(centreX, centreY, 0);
    lava.geometry.dispose();
    lava.geometry = new three.PlaneGeometry(bounds.w, bounds.h).translate(centreX, centreY, env.LAVA_LEVEL);
  };

  const renderBake = (target, material) => {
    bakeQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, bakeCamera);
  };

  /** The ground field and its light, at ~BAKE_TEXELS_PER_PX texels per table px. */
  const bake = (bounds) => {
    const width = Math.max(2, Math.min(env.BAKE_MAX_TEXELS, Math.round(bounds.w * env.BAKE_TEXELS_PER_PX)));
    const height = Math.max(2, Math.round((width * bounds.h) / bounds.w));
    if (!targets || targets.field.width !== width || targets.field.height !== height) {
      targets?.field.dispose();
      targets?.light.dispose();
      targets = {
        field: new three.WebGLRenderTarget(width, height, {
          type: three.HalfFloatType,
          minFilter: three.LinearFilter,
          magFilter: three.LinearFilter,
          depthBuffer: false,
        }),
        light: new three.WebGLRenderTarget(width, height, {
          type: three.UnsignedByteType,
          minFilter: three.LinearMipmapLinearFilter,
          magFilter: three.LinearFilter,
          generateMipmaps: true,
          depthBuffer: false,
        }),
      };
    }
    uniforms.uTexel.value.set(1 / width, 1 / height);
    const previous = renderer.getRenderTarget();
    renderBake(targets.field, materials.bakeField);
    uniforms.uField.value = targets.field.texture;
    renderBake(targets.light, materials.bakeLight);
    uniforms.uLight.value = targets.light.texture;
    renderer.setRenderTarget(previous);
  };

  /** Volcano and river from the layout; rebakes only when they changed. */
  const applyLayout = () => {
    const bounds = tableBounds(layout);
    if (!(bounds.w > 0 && bounds.h > 0)) return false;
    const volcano = volcanoSpot(layout, environmentFootprints(layout));
    const stadium = layout.stadium;
    const origin = stadium
      ? { x: stadium.x + stadium.w / 2, y: stadium.y + stadium.h / 2 }
      : { x: bounds.x + bounds.w / 2, y: layout.depth };
    const signature = JSON.stringify([bounds, volcano, origin]);
    if (signature === bakedFor) return true;
    uniforms.uVolcano.value.set(volcano?.x ?? 0, volcano?.y ?? 0, volcano?.r ?? 0, 0);
    uniforms.uMin.value.set(bounds.x, bounds.y);
    uniforms.uSize.value.set(bounds.w, bounds.h);
    uniforms.uRiverY.value = layout.depth;
    uniforms.uOrigin.value.set(origin.x, origin.y);
    place(bounds);
    bake(bounds);
    bakedFor = signature;
    return true;
  };

  const setLayout = (next) => {
    if (disposed || !next) return;
    layout = next;
    dirty = true;
  };

  const setKey = (next) => {
    if (disposed) return false;
    const wanted = ENVIRONMENT_KEYS.includes(next) ? next : null;
    if (wanted && !unsupported && renderer.extensions?.has?.('EXT_color_buffer_float') === false) {
      console.warn('board3d: stadium environment needs EXT_color_buffer_float; the mat stays');
      unsupported = true;
    }
    const shown = unsupported ? null : wanted;
    if (shown === key) return false;
    key = shown;
    group.visible = Boolean(key);
    cutout.uniforms.uCutoutOn.value = key ? 1 : 0;
    uniforms.uReveal.value = 0;
    revealStartedAt = null;
    dirty = true;
    stopAmbient();
    onNeedsRender();
    return true;
  };

  const update = (now, camera) => {
    if (disposed || !key || !layout) return false;
    if (dirty) {
      if (!applyLayout()) return false;
      dirty = false;
    }
    const reduced = motionReduced();
    if (revealStartedAt === null) revealStartedAt = now;
    const progress = reduced ? 1 : Math.min(1, Math.max(0, (now - revealStartedAt) / INTRO_MS));
    uniforms.uReveal.value = easeOutCubic(progress);
    uniforms.uTime.value = reduced ? 0 : now / 1000;
    if (camera) {
      renderer.getDrawingBufferSize(bufferSize);
      uniforms.uFocal.value = (camera.projectionMatrix.elements[5] * bufferSize.y) / 2;
    }
    group.updateWorldMatrix(true, false);
    cutout.uniforms.uTableFromWorld.value.copy(group.matrixWorld).invert();
    const revealing = progress < 1;
    if (!revealing) scheduleAmbient();
    return revealing;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopAmbient();
    key = null;
    cutout.uniforms.uCutoutOn.value = 0;
    parent.remove(group);
    for (const object of [terrain, lava, embers, smoke, bakeQuad]) object.geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    targets?.field.dispose();
    targets?.light.dispose();
    targets = null;
  };

  return { setLayout, setKey, update, active: () => key !== null, cutout, dispose };
}
