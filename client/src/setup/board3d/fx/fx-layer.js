// Design 075 § FX layer: attack FX drawn inside the board's three.js scene on its one context.
// The board renders to the canvas exactly as before; while an attack scene runs, the FX render
// into a HalfFloat target after a depth prepass of the card meshes, are bloomed there (only
// the hot cores, see BLOOM), and are composited over the canvas premultiplied. Idle, it costs nothing.
import { FX_LAYER, OCCLUDER_LAYER } from './fx-layers.mjs';
import { createGpuCanvas } from './gpu-canvas.mjs';
import { createGpuCanvasMesh } from './gpu-canvas-mesh.js';
import { stageToWorldMatrix } from './fx-stage.mjs';

// UnrealBloomPass passes a texel's whole colour once its luma clears the threshold and sums five
// mips, so its glow is ~3 × strength × the source: ordinary additive overlaps (luma 1–2) stay out,
// only the hot cores the styles push past 2.4 bloom (design 075 slice 9; awaits the user's look check).
export const BLOOM = Object.freeze({ strength: 0.2, radius: 0.3, threshold: 2.4 });

const COMPOSITE_VERTEX = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const COMPOSITE_FRAGMENT = `
precision highp float;
uniform sampler2D uFx;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 fx = texture(uFx, vUv);
  outColor = vec4(clamp(fx.rgb, 0.0, 1.0), clamp(fx.a, 0.0, 1.0));
}
`;

/**
 * @param {{ three: typeof import('three'), renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene, camera: import('three').Camera, clock: { now: () => number },
 *   tiltDeg?: () => number, UnrealBloomPass?: Function|null, motionReduced?: () => boolean,
 *   triangulate?: Function, debug?: (...args: unknown[]) => void }} options
 * @returns {{ add: (entry: { frame: (nowMs: number, ctx: object) => boolean }) => () => void,
 *   active: () => boolean, render: () => boolean, setImpacts: (host: object|null) => void,
 *   impactsActive: () => boolean,
 *   group: import('three').Group, canvas: object, dispose: () => void }}
 *   `entry.frame` records this frame's drawing on `ctx` (the gpu-canvas recorder) and returns false
 *   when it has finished. `render` is called after the board's own render; it returns whether
 *   another frame is needed.
 */
export function createFxLayer({
  three,
  renderer,
  scene,
  camera,
  clock,
  tiltDeg = () => 0,
  UnrealBloomPass = null,
  motionReduced = () => false,
  triangulate = (contour, holes) =>
    three.ShapeUtils.triangulateShape(
      contour.map((p) => new three.Vector2(p.x, p.y)),
      holes.map((hole) => hole.map((p) => new three.Vector2(p.x, p.y)))
    ),
  debug = (...args) => console.debug(...args),
}) {
  const group = new three.Group();
  group.name = 'board3d-fx';
  group.layers.set(FX_LAYER);
  scene.add(group);

  const recorder = createGpuCanvas({ triangulate, debug });
  const mesh = createGpuCanvasMesh({ three });
  group.add(mesh.object3d);

  const entries = new Set();
  const failed = new Set();
  let impacts = null;
  let disposed = false;

  const depthOnly = new three.MeshBasicMaterial({ colorWrite: false });
  const size = new three.Vector2();
  let target = null;
  let bloom = null;
  const clearColour = new three.Color();

  const compositeMaterial = new three.RawShaderMaterial({
    glslVersion: three.GLSL3,
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: { uFx: { value: null } },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: three.CustomBlending,
    blendEquation: three.AddEquation,
    blendSrc: three.OneFactor,
    blendDst: three.OneMinusSrcAlphaFactor,
    blendSrcAlpha: three.OneFactor,
    blendDstAlpha: three.OneMinusSrcAlphaFactor,
  });
  const fullScreen = new three.BufferGeometry();
  fullScreen.setAttribute('position', new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const compositeQuad = new three.Mesh(fullScreen, compositeMaterial);
  compositeQuad.frustumCulled = false;
  const compositeScene = new three.Scene();
  compositeScene.add(compositeQuad);
  const compositeCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /** The FX target and bloom at the drawing-buffer size (re-made when it changes). */
  const ensureTarget = () => {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, size.x);
    const height = Math.max(1, size.y);
    if (!target) {
      target = new three.WebGLRenderTarget(width, height, {
        type: three.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: true,
        samples: 0,
      });
      target.texture.name = 'board3d-fx-target';
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    if (UnrealBloomPass && !bloom) {
      bloom = new UnrealBloomPass(new three.Vector2(width, height), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
      // The pass adds its own alpha on composite, which would darken the board under every
      // glow; glow is light only, so its alpha write is turned off.
      bloom.blendMaterial.blending = three.CustomBlending;
      bloom.blendMaterial.blendEquation = three.AddEquation;
      bloom.blendMaterial.blendSrc = three.OneFactor;
      bloom.blendMaterial.blendDst = three.OneFactor;
      bloom.blendMaterial.blendSrcAlpha = three.ZeroFactor;
      bloom.blendMaterial.blendDstAlpha = three.OneFactor;
    } else if (bloom && (bloom.resolution.x !== width || bloom.resolution.y !== height)) {
      bloom.resolution.set(width, height);
      bloom.setSize(width, height);
    }
    return target;
  };

  const add = (entry) => {
    if (disposed || typeof entry?.frame !== 'function') return () => {};
    entries.add(entry);
    return () => entries.delete(entry);
  };

  const active = () => !disposed && (entries.size > 0 || Boolean(impacts?.active?.()));

  const recordEntries = (now) => {
    recorder.reset();
    for (const entry of [...entries]) {
      let keep = false;
      try {
        keep = entry.frame(now, recorder) !== false;
      } catch (error) {
        if (!failed.has(entry)) {
          failed.add(entry);
          console.warn('board3d fx: an effect stopped', error?.message || error);
        }
      }
      if (!keep) entries.delete(entry);
    }
  };

  const render = () => {
    if (!active()) return false;
    const now = clock.now();
    recordEntries(now);
    mesh.upload(recorder.recording(), { timeSeconds: now / 1000, stageToWorld: stageToWorldMatrix(tiltDeg()) });

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColour);
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousMask = camera.layers.mask;
    // The board's own render already drew this frame's shadow maps.
    const shadowMap = renderer.shadowMap;
    const previousShadowUpdate = shadowMap?.autoUpdate;
    if (shadowMap) shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(ensureTarget());
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.autoClear = false;
      scene.background = null;

      // Depth of the card meshes only: the FX back layer hides behind them.
      camera.layers.set(OCCLUDER_LAYER);
      scene.overrideMaterial = depthOnly;
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;

      camera.layers.set(FX_LAYER);
      renderer.render(scene, camera);
      camera.layers.mask = previousMask;

      if (impacts?.active?.()) {
        impacts.draw({ renderer, target, camera });
        renderer.resetState();
        renderer.setRenderTarget(target);
      }
      if (bloom && !motionReduced()) bloom.render(renderer, null, target, 0, false);

      renderer.setRenderTarget(previousTarget);
      compositeMaterial.uniforms.uFx.value = target.texture;
      renderer.render(compositeScene, compositeCamera);
    } finally {
      camera.layers.mask = previousMask;
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(clearColour, previousAlpha);
      renderer.setRenderTarget(previousTarget);
      if (shadowMap) shadowMap.autoUpdate = previousShadowUpdate;
    }
    return active();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    entries.clear();
    impacts?.detach?.();
    impacts = null;
    mesh.dispose();
    scene.remove(group);
    depthOnly.dispose();
    compositeMaterial.dispose();
    fullScreen.dispose();
    target?.dispose();
    bloom?.dispose();
  };

  return {
    add,
    active,
    render,
    /** Design 075 slice 7: the impact stage running on this context (`active`, `draw`, `detach`). */
    setImpacts: (host) => {
      impacts = host ?? null;
    },
    /** Whether an impact prefab is playing now (fx-preview scripts read it). */
    impactsActive: () => !disposed && Boolean(impacts?.active?.()),
    group,
    canvas: recorder,
    dispose,
  };
}
