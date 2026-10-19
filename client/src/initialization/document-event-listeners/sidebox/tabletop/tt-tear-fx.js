import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  ZeroFactor,
} from 'three';
import { packSpaceY, pillowZ, tearHingeV } from '../../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import { PACK } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { EYE_ONLY_LAYER } from './tt-studio.js';

/**
 * The light of a TCG Pocket tear (design 073, iteration 13), drawn over a held pack in its own
 * space (mm, +y up the art, +z out of the front), as on a 60 fps recording of the game: a soft
 * glow at the seam's start until the finger comes; a rainbow ring where it lands; a white-hot cut
 * following it along the tear with a bright head; and once the cut is through, a yellow-white
 * flash over the header inside an elliptical rainbow halo, which folds flat into a beam across the
 * whole screen that thins to a hairline, while the cut edge glints cyan. Light only, never mirrored
 * by the floor, not tone mapped: its white glows add to what is behind, while its rainbow bands
 * also cover a little of it (premultiplied "over"), or on the studio's pale floor added colour
 * would only wash out to white. `pocketTearLight` (poses.mjs) times the flash, halo, beam, glint.
 */

const PW = PACK.width;
// The light rides this far in front of the wrapper's face.
const LIFT_MM = 0.6;
const TRAIL_HALF_MM = 3.8;
const TRAIL_SAMPLES = 48;
// The halo's half extents round the cut (mm), as wide as the pack and a bit, flat as an eye.
const HALO_HALF = { x: 0.95 * PW, y: 0.42 * PW };
const BEAM_LENGTH_MM = 1800;
// The beam's quad reaches this many beam half-heights from its middle: room for its fringes and
// bloom to fade out before the quad's edge.
const BEAM_SPAN = 3.2;
const GLINT_COLOR = new Color(0.36, 0.9, 1);
const HOT_COLOR = new Color(1, 0.99, 0.95);

const SPECTRUM = /* glsl */ `
// The tear's rainbow, t 0 → 1: magenta, gold, cyan, violet.
vec3 ttSpectrum(float t) {
  float x = clamp(t, 0.0, 1.0) * 3.0;
  vec3 magenta = vec3(1.0, 0.36, 0.86);
  vec3 gold = vec3(1.0, 0.86, 0.34);
  vec3 cyan = vec3(0.36, 0.95, 1.0);
  vec3 violet = vec3(0.62, 0.5, 1.0);
  return x < 1.0 ? mix(magenta, gold, x) : x < 2.0 ? mix(gold, cyan, x - 1.0) : mix(cyan, violet, x - 2.0);
}`;

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A soft round glow: the seam's hint, and the cut's head.
const SPOT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float glow = exp(-r2 * 5.0) * 0.7 + exp(-r2 * 22.0);
  gl_FragColor = vec4(uColor * glow * uAlpha, 0.0);
}`;

// A rainbow ring (cyan inside, magenta outside) round a white haze: the touch, and the halo.
const RING_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uRadius;
uniform float uWidth;
uniform float uHaze;
varying vec2 vUv;
${SPECTRUM}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float across = (r - uRadius) / uWidth;
  float band = exp(-across * across * 2.2);
  vec3 color = ttSpectrum(0.335 - 0.335 * across) * band * 1.1;
  color += vec3(uHaze * (1.0 - smoothstep(0.2, uRadius, r)));
  gl_FragColor = vec4(color, band * 0.6) * uAlpha;
}`;

// The beam: a white core with a cyan line above and a magenta-gold one below, fading at its ends.
const BEAM_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uSpan;
varying vec2 vUv;
${SPECTRUM}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float across = abs(p.y) * uSpan;
  float core = exp(-across * across * 4.0);
  float bloom = exp(-across * across * 1.6) * 0.22;
  float fringe = exp(-pow((across - 1.2) * 4.0, 2.0));
  vec3 color = vec3(1.0, 0.98, 0.9) * (core + bloom) + ttSpectrum(p.y > 0.0 ? 0.62 : 0.12) * fringe * 0.8;
  float along = 1.0 - smoothstep(0.35, 1.0, abs(p.x));
  float edge = 1.0 - smoothstep(0.75, 1.0, abs(p.y));
  gl_FragColor = vec4(color, fringe * 0.6 + core * 0.25) * (along * edge * uAlpha);
}`;

// The flash over the header: yellow-white, greener toward the start of the cut.
const WASH_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uSide;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float fall = exp(-p.x * p.x * 2.2) * exp(-p.y * p.y * 3.5) * (1.0 - smoothstep(0.6, 1.0, max(abs(p.x), abs(p.y))));
  vec3 color = mix(vec3(0.82, 1.0, 0.78), vec3(1.0, 0.96, 0.7), smoothstep(-0.8, 0.2, p.x * uSide));
  gl_FragColor = vec4(color * fall * uAlpha * 0.8, 0.0);
}`;

const RIBBON_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aAcross;
varying float vAlong;
varying float vAcross;
void main() {
  vAlong = aAlong;
  vAcross = aAcross;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Along the tear from its start to the cut's front (`uFront`, in u; `uSide` 1 cuts from u = 0).
const RIBBON_FRAGMENT = /* glsl */ `
uniform float uFront;
uniform float uSide;
uniform float uAlpha;
uniform vec3 uCore;
uniform float uFringe;
uniform float uHead;
varying float vAlong;
varying float vAcross;
${SPECTRUM}
void main() {
  float ahead = uSide > 0.0 ? vAlong - uFront : uFront - vAlong;
  float cut = 1.0 - smoothstep(-0.012, 0.012, ahead);
  float head = uHead * exp(-pow(ahead / 0.045, 2.0));
  float a = abs(vAcross);
  float core = exp(-a * a * 10.0) * 1.4;
  float glow = exp(-a * a * 2.4) * 0.6;
  vec3 color = uCore * (core + glow) + ttSpectrum(0.15 + 0.5 * a) * glow * uFringe;
  gl_FragColor = vec4(color, glow * uFringe * 0.5) * ((cut + head) * uAlpha * (1.0 - smoothstep(0.85, 1.0, a)));
}`;

const lightMaterial = (fragmentShader, uniforms, vertexShader = QUAD_VERTEX) =>
  new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    // Premultiplied over: rgb is added, alpha says how much of what is behind it covers.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });

/**
 * The tear's path in pack space: the line sampled evenly across the pack and smoothed over about
 * a tooth, so the light runs as one clean cut (the game's seam is straight) near the teeth.
 * @returns {{u: number, x: number, y: number, z: number}[]}
 */
function cutPath(line, shape) {
  const points = [...line].sort((a, b) => a.x - b.x);
  const vAt = (u) => {
    const k = points.findIndex((point) => point.x >= u);
    if (k < 0) return points.at(-1).y;
    if (k === 0) return points[0].y;
    const a = points[k - 1];
    const b = points[k];
    return a.y + ((b.y - a.y) * (u - a.x)) / Math.max(1e-6, b.x - a.x);
  };
  const raw = Array.from({ length: TRAIL_SAMPLES }, (_, i) => vAt(i / (TRAIL_SAMPLES - 1)));
  const reach = Math.round(TRAIL_SAMPLES / 12 / 2);
  const hinge = tearHingeV(line);
  return raw.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - reach); j <= Math.min(raw.length - 1, i + reach); j += 1) {
      sum += raw[j];
      count += 1;
    }
    const u = i / (TRAIL_SAMPLES - 1);
    const v = (sum / count + hinge) / 2;
    return { u, x: (u - 0.5) * PW, y: packSpaceY(v) * PW, z: pillowZ(u, v, shape) * PW + LIFT_MM };
  });
}

function ribbonGeometry(path) {
  const n = path.length;
  const positions = new Float32Array(n * 6);
  const along = new Float32Array(n * 2);
  const across = new Float32Array(n * 2);
  path.forEach((point, i) => {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(n - 1, i + 1)];
    const length = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const nx = -(next.y - prev.y) / length;
    const ny = (next.x - prev.x) / length;
    [-1, 1].forEach((side, k) => {
      const j = i * 2 + k;
      positions.set([point.x + nx * TRAIL_HALF_MM * side, point.y + ny * TRAIL_HALF_MM * side, point.z], j * 3);
      along[j] = point.u;
      across[j] = side;
    });
  });
  // Counter-clockwise seen from the front (+z), so the ribbon faces the eye.
  const index = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  geometry.setAttribute('aAcross', new BufferAttribute(across, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * @param {{model: {group: object, line: object[]}, shape: object|null}} options — the held pack
 *   (its tear line from `packTearLine`) and its measured seal shape.
 */
export function createTearFx({ model, shape }) {
  const disposables = [];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };
  const group = new Group();
  group.name = 'tt-tear-fx';
  model.group.add(group);
  const path = cutPath(model.line, shape);
  const hingeY = packSpaceY(tearHingeV(model.line)) * PW;
  const quad = track(new PlaneGeometry(2, 2));
  const add = (mesh, order) => {
    mesh.layers.set(EYE_ONLY_LAYER);
    mesh.renderOrder = 30 + order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const show = (mesh, alpha) => {
    mesh.visible = alpha > 0.002;
    mesh.material.uniforms.uAlpha.value = alpha;
  };
  const spot = (color, halfMm, order) => {
    const uniforms = { uColor: { value: new Color(...color) }, uAlpha: { value: 0 } };
    const mesh = add(new Mesh(quad, track(lightMaterial(SPOT_FRAGMENT, uniforms))), order);
    mesh.scale.set(halfMm, halfMm, 1);
    return mesh;
  };
  const ring = (radius, width, haze, order) =>
    add(
      new Mesh(
        quad,
        track(
          lightMaterial(RING_FRAGMENT, {
            uAlpha: { value: 0 },
            uRadius: { value: radius },
            uWidth: { value: width },
            uHaze: { value: haze },
          })
        )
      ),
      order
    );

  const ribbon = track(ribbonGeometry(path));
  const cutUniforms = (color, fringe, head) => ({
    uFront: { value: 0 },
    uSide: { value: 1 },
    uAlpha: { value: 0 },
    uCore: { value: color.clone() },
    uFringe: { value: fringe },
    uHead: { value: head },
  });
  const cutMaterial = (color, fringe, head) =>
    track(lightMaterial(RIBBON_FRAGMENT, cutUniforms(color, fringe, head), RIBBON_VERTEX));
  const trail = add(new Mesh(ribbon, cutMaterial(HOT_COLOR, 0.9, 1.6)), 2);
  const glint = add(new Mesh(ribbon, cutMaterial(GLINT_COLOR, 0.25, 0)), 3);
  glint.material.uniforms.uFront.value = 1.2;

  const hint = spot([0.86, 0.95, 1], 12, 1);
  hint.position.set(path[0].x + 1.5, path[0].y, path[0].z + 0.2);
  const head = spot([1, 0.98, 0.94], 5.5, 4);
  const touch = ring(0.62, 0.16, 0.12, 5);
  touch.scale.set(13, 13, 1);
  const wash = add(
    new Mesh(quad, track(lightMaterial(WASH_FRAGMENT, { uAlpha: { value: 0 }, uSide: { value: 1 } }))),
    6
  );
  wash.scale.set(0.78 * PW, 0.36 * PW, 1);
  wash.position.set(0, hingeY + 0.08 * PW, LIFT_MM + 0.4);
  const halo = ring(0.82, 0.08, 0.14, 7);
  halo.position.set(0, hingeY, LIFT_MM + 0.6);
  const beamMaterial = track(lightMaterial(BEAM_FRAGMENT, { uAlpha: { value: 0 }, uSpan: { value: BEAM_SPAN } }));
  const beam = add(new Mesh(track(new PlaneGeometry(BEAM_LENGTH_MM, 2)), beamMaterial), 8);
  beam.position.set(0, hingeY, LIFT_MM + 0.8);

  /** The cut's front in pack space at `front` (u). */
  const frontPoint = (front) => {
    const i = Math.max(0, Math.min(path.length - 1, Math.round(front * (path.length - 1))));
    return path[i];
  };

  return {
    group,
    /** The glow at the seam's start, 0 → 1. */
    setHint: (alpha) => show(hint, alpha),
    /** The ring where the finger landed (`local`, pack space), `t` 0 → 1 over its life. */
    setTouch: (local, t) => {
      const life = Math.max(0, Math.min(1, t));
      if (local) touch.position.set(local.x, local.y, LIFT_MM + 0.3);
      const grow = 0.55 + 0.6 * (1 - (1 - life) ** 3);
      touch.scale.set(13 * grow, 13 * grow, 1);
      show(touch, life >= 1 ? 0 : (1 - life) ** 1.5 * 0.85);
    },
    /** The cut, white-hot from its start to `front` (u, 0 → 1, from `side`), `alpha` 0 → 1. */
    setCut: (front, side = 1, alpha = 1) => {
      const along = side === -1 ? 1 - front : front;
      for (const mesh of [trail, glint]) mesh.material.uniforms.uSide.value = side;
      trail.material.uniforms.uFront.value = along;
      wash.material.uniforms.uSide.value = side;
      show(trail, alpha);
      const at = frontPoint(along);
      head.position.set(at.x, at.y, at.z + 0.2);
      show(head, alpha * (front > 0 && front < 1 ? 1 : 0.4));
    },
    /** The light after the cut, from `pocketTearLight`. */
    setLight: (light) => {
      show(wash, light.flash);
      show(halo, light.halo);
      halo.scale.set(HALO_HALF.x * light.haloScale, HALO_HALF.y * light.haloScale * light.haloSquash, 1);
      show(beam, light.beam);
      beam.scale.y = light.beamMm * BEAM_SPAN;
      glint.material.uniforms.uFront.value = glint.material.uniforms.uSide.value > 0 ? 1.2 : -0.2;
      show(glint, light.glint);
      show(trail, light.cut);
      show(head, light.cut * 0.4);
    },
    dispose: () => {
      group.removeFromParent();
      disposables.forEach((thing) => thing.dispose());
    },
  };
}
