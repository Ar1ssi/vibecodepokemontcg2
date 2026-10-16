import {
  BackSide,
  CircleGeometry,
  Color,
  DepthTexture,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';

/**
 * The TCG Pocket studio the table stands in (design 073, iteration 13): a white floor — whitest
 * under the things on it, cooling to the backdrop's pale blue toward its edges and far off — under
 * a pale blue dome that glows white just above the horizon, and the floor mirrors what stands on
 * it. The mirror is the scene drawn again from below the floor (a planar reflection, half
 * resolution) and faded by the height of what it shows, as in the game: about a third as strong as
 * the object where it meets the floor, gone by about one object height, softer as it rises.
 * Measured on a TCG Pocket screen recording (scratch `pocketvid/`).
 *
 * Both the floor and the backdrop are drawn in display colour (no tone mapping) so they hold the
 * game's whites; the mirrored scene, which is drawn without tone mapping into its target, is tone
 * mapped by the floor itself so what it shows matches what the eye sees directly.
 */

// Drawn by the eye, never by the mirror: the floor itself, the backdrop, contact shadows, light FX.
export const EYE_ONLY_LAYER = 1;

const DOME_RADIUS = 4500;
const REFLECTION_SCALE = 0.5;
const REFLECTION_SAMPLES = 4;
// Mirror strength at the contact line, and the height (mm) by which it has faded out.
const REFLECT_STRENGTH = 0.42;
const REFLECT_FADE_MM = 130;
// The floor is whitest within this radius (mm) of the stage, and blue past the outer one.
const STAGE_CENTER = new Vector2(0, -10);
const STAGE_GLOW_MM = new Vector2(300, 950);

const display = (hex) => new Color(hex);

const DOME_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The far floor's blue at the horizon, a white glow just above it, the backdrop's blue overhead.
const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFar;
varying vec3 vDirection;
void main() {
  float up = max(normalize(vDirection).y, 0.0);
  vec3 color = mix(uFar, uHorizon, smoothstep(0.0, 0.04, up));
  color = mix(color, uTop, smoothstep(0.04, 0.6, up));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

const FLOOR_VERTEX = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
uniform mat4 uReflectMatrix;
varying vec3 vWorld;
varying vec4 vReflectCoord;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vReflectCoord = uReflectMatrix * world;
}`;

const FLOOR_FRAGMENT = /* glsl */ `
uniform vec3 uFloor;
uniform vec3 uFloorEdge;
uniform vec3 uFar;
uniform vec3 uShadowTint;
uniform vec3 uFocusColor;
uniform float uFocus;
uniform vec2 uStageCenter;
uniform vec2 uStageGlow;
uniform vec2 uFade;
uniform float uReflect;
uniform sampler2D tReflect;
uniform sampler2D tReflectDepth;
uniform mat4 uReflectProjectionInverse;
uniform mat4 uReflectWorld;
uniform vec2 uReflectTexel;
uniform float uFloorY;
uniform float uReflectStrength;
uniform float uReflectFade;
uniform float uExposure;
varying vec3 vWorld;
varying vec4 vReflectCoord;
#include <common>
#include <packing>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

// three's NeutralToneMapping, which the eye's view goes through.
vec3 ttNeutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

// How high above the floor the mirrored surface at reflection uv stands (mm); far for none.
float ttMirroredHeight(vec2 uv) {
  float depth = texture2D(tReflectDepth, uv).x;
  if (depth >= 0.99999) return 1e5;
  vec4 view = uReflectProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  view /= view.w;
  return (uReflectWorld * view).y - uFloorY;
}

// One neighbour's say in how much the mirror shows: its rise (0 at the floor, 1 faded out), and
// whether it saw anything at all.
void ttTap(vec2 uv, inout float rise, inout float seen) {
  float height = ttMirroredHeight(uv);
  if (height > 1e4) return;
  rise += smoothstep(0.0, uReflectFade, height);
  seen += 1.0;
}

void main() {
  float fromStage = length(vWorld.xz - uStageCenter);
  vec3 color = mix(uFloor, uFloorEdge, smoothstep(uStageGlow.x, uStageGlow.y, fromStage));
  color = mix(color, uFar, smoothstep(uFade.x, uFade.y, distance(vWorld, cameraPosition)));
  color = mix(color, uFocusColor, uFocus);
  color *= mix(uShadowTint, vec3(1.0), getShadowMask());

  vec2 uv = vReflectCoord.xy / vReflectCoord.w;
  vec2 o = uReflectTexel * 1.5;
  // Averaged over four neighbours that saw something: where the mirror passes from one surface to
  // another at a different height its fade steps, and the depth it reads is not antialiased. Empty
  // neighbours keep out of it, so a silhouette's edge fades with the thing it edges.
  float rise = 0.0;
  float seen = 0.0;
  ttTap(uv + vec2(o.x, o.y), rise, seen);
  ttTap(uv + vec2(-o.x, o.y), rise, seen);
  ttTap(uv + vec2(o.x, -o.y), rise, seen);
  ttTap(uv - o, rise, seen);
  rise = seen > 0.0 ? rise / seen : 1.0;
  float strength = uReflect * uReflectStrength * (1.0 - rise);
  if (strength > 0.002) {
    vec4 mirrored = textureLod(tReflect, uv, 0.6 + 2.2 * rise);
    float coverage = clamp(mirrored.a, 0.0, 1.0);
    vec3 seen = ttNeutral(mirrored.rgb / max(coverage, 1e-4) * uExposure) * coverage;
    color = color * (1.0 - coverage * strength) + seen * strength;
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

/** The studio's colours (sRGB), sampled from the recording: the backdrop, the floor, its shadows. */
export const STUDIO_COLORS = Object.freeze({
  top: 0xc3d8ef,
  horizon: 0xf4fafe,
  floor: 0xfbfdff,
  floorEdge: 0xd6e6f7,
  // Far off the floor takes the backdrop's blue: the camera always looks down at the table, so
  // that blue is what fills the top of the frame, where the game shows its backdrop.
  far: 0xc9ddf2,
  // What a full shadow multiplies the floor's white by: a cool, light grey.
  shadow: 0xc6d0e2,
  // While something is held up the floor recedes to the backdrop's blue: the game opens a pack
  // against it, and a white glow can't show on white.
  focus: 0xc4d8ee,
});
const FOCUS_MAX = 0.85;

/**
 * @param {{renderer: object, scene: object, camera: object, reflect?: boolean}} options —
 *   `reflect` false (low quality) draws the floor without its mirror.
 */
export function createStudio({ renderer, scene, camera, reflect = true }) {
  const disposables = [];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };

  const dome = new Mesh(
    track(new SphereGeometry(DOME_RADIUS, 64, 32)),
    track(
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uTop: { value: display(STUDIO_COLORS.top) },
          uHorizon: { value: display(STUDIO_COLORS.horizon) },
          uFar: { value: display(STUDIO_COLORS.far) },
        },
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
      })
    )
  );
  dome.name = 'tt-backdrop';
  dome.layers.set(EYE_ONLY_LAYER);
  // three sorts opaque draws by material before depth, which put the dome and the floor first:
  // drawn last instead, the depth test skips them wherever something stands in front.
  dome.renderOrder = 2;
  scene.add(dome);

  // ── The mirror ──────────────────────────────────────────────────────────
  const halfFloat =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = reflect
    ? track(
        new WebGLRenderTarget(1, 1, {
          type: halfFloat ? HalfFloatType : UnsignedByteType,
          samples: REFLECTION_SAMPLES,
          generateMipmaps: true,
          minFilter: LinearMipmapLinearFilter,
          depthTexture: new DepthTexture(1, 1),
        })
      )
    : null;
  if (target) track(target.depthTexture);
  const mirror = new PerspectiveCamera();
  mirror.layers.set(0);
  const reflectMatrix = new Matrix4();

  const uniforms = UniformsUtils.merge([
    UniformsLib.lights,
    {
      uFloor: { value: display(STUDIO_COLORS.floor) },
      uFloorEdge: { value: display(STUDIO_COLORS.floorEdge) },
      uFar: { value: display(STUDIO_COLORS.far) },
      uShadowTint: { value: display(STUDIO_COLORS.shadow) },
      uFocusColor: { value: display(STUDIO_COLORS.focus) },
      uFocus: { value: 0 },
      uStageCenter: { value: STAGE_CENTER.clone() },
      uStageGlow: { value: STAGE_GLOW_MM.clone() },
      uFade: { value: new Vector2(1500, 5000) },
      uReflect: { value: 0 },
      tReflect: { value: null },
      tReflectDepth: { value: null },
      uReflectMatrix: { value: new Matrix4() },
      uReflectProjectionInverse: { value: new Matrix4() },
      uReflectWorld: { value: new Matrix4() },
      uReflectTexel: { value: new Vector2(1, 1) },
      uFloorY: { value: 0 },
      uReflectStrength: { value: REFLECT_STRENGTH },
      uReflectFade: { value: REFLECT_FADE_MM },
      uExposure: { value: 1 },
    },
  ]);
  // Textures and matrices are shared by reference, not cloned by `merge`.
  uniforms.tReflect.value = target?.texture || null;
  uniforms.tReflectDepth.value = target?.depthTexture || null;
  uniforms.uReflectMatrix.value = reflectMatrix;
  const floorMaterial = track(
    new ShaderMaterial({
      lights: true,
      toneMapped: false,
      uniforms,
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
    })
  );
  const floor = new Mesh(track(new CircleGeometry(DOME_RADIUS, 128)), floorMaterial);
  floor.name = 'tt-floor';
  floor.renderOrder = 1;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.layers.set(EYE_ONLY_LAYER);
  scene.add(floor);

  const eye = new Vector3();
  const ahead = new Vector3();
  const up = new Vector3();
  const plane = new Plane();
  const clip = new Vector4();
  const q = new Vector4();
  const normal = new Vector3(0, 1, 0);
  const onFloor = new Vector3();
  const clearColor = new Color();
  const bounds = new Sphere();
  const tooHigh = [];
  // Mirror about the floor: y → 2·floorY − y.
  const mirrorPoint = (point, floorY) => point.setY(2 * floorY - point.y);
  // What stands wholly above the height the mirror fades out by (a held pack, the fanned cards)
  // can't show in it: the mirror skips drawing it.
  const hideTooHigh = (floorY) => {
    scene.updateMatrixWorld();
    scene.traverseVisible((node) => {
      if (!node.isMesh || !node.layers.test(mirror.layers) || !node.geometry) return;
      if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
      bounds.copy(node.geometry.boundingSphere).applyMatrix4(node.matrixWorld);
      if (bounds.center.y - bounds.radius > floorY + REFLECT_FADE_MM) tooHigh.push(node);
    });
    tooHigh.forEach((node) => {
      node.visible = false;
    });
  };
  const showTooHigh = () => {
    tooHigh.splice(0).forEach((node) => {
      node.visible = true;
    });
  };

  let reflecting = Boolean(target);

  /** Draws the scene as the floor mirrors it, into the reflection target. Call before the eye's. */
  const renderReflection = () => {
    if (!reflecting || !floor.visible) return;
    const floorY = floor.position.y;
    camera.updateMatrixWorld();
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= floorY + 1) return;
    ahead.set(0, 0, -1).transformDirection(camera.matrixWorld).add(eye);
    up.set(0, 1, 0).transformDirection(camera.matrixWorld);
    mirror.position.copy(mirrorPoint(eye.clone(), floorY));
    mirror.up.set(up.x, -up.y, up.z);
    mirror.lookAt(mirrorPoint(ahead, floorY));
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    reflectMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflectMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

    // An oblique near plane on the floor (Lengyel), so nothing below it is drawn.
    plane.setFromNormalAndCoplanarPoint(normal, onFloor.set(0, floorY, 0)).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mirror.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1;
    e[14] = clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
    uniforms.uReflectProjectionInverse.value.copy(mirror.projectionMatrixInverse);
    uniforms.uReflectWorld.value.copy(mirror.matrixWorld);
    uniforms.uFloorY.value = floorY;
    uniforms.uExposure.value = renderer.toneMappingExposure;

    const previous = renderer.getRenderTarget();
    const shadowsUpdate = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    // The eye's pass that follows redraws the shadow maps; this one reuses the last frame's.
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    // A transparent last draw can leave the depth mask off, and the clear would keep old depth.
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    hideTooHigh(floorY);
    try {
      renderer.render(scene, mirror);
    } finally {
      showTooHigh();
    }
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = shadowsUpdate;
    uniforms.uReflect.value = 1;
  };

  /**
   * Compiles `object`'s shaders as the mirror draws them (untone-mapped, into its target), so the
   * first reflection of something new does not stall on the compile.
   */
  const compileForMirror = async (object) => {
    if (!target) return;
    const previous = renderer.getRenderTarget();
    let pending = null;
    renderer.setRenderTarget(target);
    try {
      pending = renderer.compileAsync(object, mirror, scene);
    } finally {
      renderer.setRenderTarget(previous);
    }
    await pending;
  };

  return {
    floor,
    dome,
    renderReflection,
    compileForMirror,
    /** The floor's height: 0 bare, under a mat its underside. */
    setFloorY: (y) => {
      floor.position.y = y;
    },
    /**
     * Stops drawing the mirror for good (a device too slow for it): the floor stays bare. The
     * target is kept until `dispose`, so the floor's samplers never point at a freed texture.
     */
    stopReflection: () => {
      reflecting = false;
      uniforms.uReflect.value = 0;
    },
    /** How far the floor has receded to blue behind a held thing, 0 → 1. */
    setFocus: (amount) => {
      uniforms.uFocus.value = FOCUS_MAX * Math.max(0, Math.min(1, Number(amount) || 0));
    },
    /** Where the floor melts into the horizon: from `near` to `far` mm from the eye. */
    setFade: (near, far) => {
      uniforms.uFade.value.set(near, far);
    },
    /** The drawing buffer's size in pixels: the mirror draws at half of it. */
    setSize: (width, height) => {
      if (!target) return;
      const w = Math.max(1, Math.round(width * REFLECTION_SCALE));
      const h = Math.max(1, Math.round(height * REFLECTION_SCALE));
      if (target.width === w && target.height === h) return;
      target.setSize(w, h);
      uniforms.uReflectTexel.value.set(1 / w, 1 / h);
    },
    dispose: () => {
      scene.remove(floor, dome);
      disposables.forEach((thing) => thing.dispose?.());
    },
  };
}
