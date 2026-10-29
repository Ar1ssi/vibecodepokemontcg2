// Design 077 § Kinds: the bolt — lightning segments as camera-facing capsules. The fragment
// measures its distance to the segment on screen (in core widths), shakes it with fast noise
// along the line so the bolt crackles without moving, and lights it: white-hot core past 1.0
// (it blooms), the hot colour inside, the glow colour falling off outside. Blending takes the
// brightest (MAX), so overlapping segments meet without a bright knot at every joint.
import { NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { BOLT_ATTRIBUTES, BOLT_FLOATS, normalizeBoltSegment, packBoltSegment } from './bolt.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const BOLT_CAPACITY = 1024;
/** How far the glow reaches, in core widths: the quad is padded by it on every side. */
const REACH = 6.0;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
out vec2 vView;
flat out vec2 vA;
flat out vec2 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out float vWidth;
flat out float vAlpha;
void main() {
  vec4 a = viewMatrix * (uStageToWorld * vec4(iA.xyz, 1.0));
  vec4 b = viewMatrix * (uStageToWorld * vec4(iB.xyz, 1.0));
  vec2 axis = b.xy - a.xy;
  float span = length(axis);
  vec2 dir = span > 1e-3 ? axis / span : vec2(1.0, 0.0);
  vec2 side = vec2(-dir.y, dir.x);
  float reach = iA.w * ${REACH.toFixed(1)};
  // position.y −.5 … .5 runs a → b, padded by the reach at both ends; x across.
  float u = position.y + 0.5;
  vec4 at = mix(a, b, u);
  at.xy += dir * reach * (u * 2.0 - 1.0) + side * position.x * 2.0 * reach;
  // Distances are measured in the segment's own view plane, before the quad leans to the camera.
  vView = at.xy;
  at.xyz += normalize(-at.xyz) * reach * 0.5;
  gl_Position = projectionMatrix * at;
  vA = a.xy;
  vB = b.xy;
  vC = iC;
  vD = iD;
  vWidth = iA.w;
  vAlpha = iB.w;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
in vec2 vView;
flat in vec2 vA;
flat in vec2 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in float vWidth;
flat in float vAlpha;
out vec4 fragColor;
${NOISE_GLSL}
void main() {
  vec2 ab = vB - vA;
  float len2 = max(dot(ab, ab), 1e-6);
  float h = clamp(dot(vView - vA, ab) / len2, 0.0, 1.0);
  vec2 nearest = vA + ab * h;
  vec2 off = vView - nearest;
  float span = sqrt(len2);
  vec2 dir = ab / span;
  vec2 side = vec2(-dir.y, dir.x);
  float seed = vC.w;
  float along = (vD.w + h * span) / max(vWidth, 1.0);
  // Crackle: the core shakes across the line, re-rolled ~30 times a second.
  float flicker = floor(uTime * 30.0);
  float shake = (elNoise3(vec3(along * 0.9, flicker * 0.37, seed)) - 0.5) * 1.1;
  // Capsule distance in core widths: across (shaken) and, past either end, along.
  float d = length(vec2(dot(off, side) / vWidth - shake, dot(off, dir) / vWidth));
  // A bolt strobes: brightness steps between frames like a discharge.
  float strobe = 0.78 + 0.22 * step(0.35, elHash3(vec3(flicker, seed, 2.0)));
  float core = 1.0 - smoothstep(0.18, 0.42, d);
  float inner = exp(-d * d * 0.9);
  // The glow falls off slowly and fades out before the quad's edge.
  float glow = exp(-d * 0.6) * 0.7 * (1.0 - smoothstep(${(REACH * 0.7).toFixed(1)}, ${REACH.toFixed(1)}, d));
  vec3 colour = vD.rgb * glow + vC.rgb * inner * 0.9 + vec3(1.0) * core * 1.8;
  colour *= vAlpha * strobe;
  if (max(colour.r, max(colour.g, colour.b)) <= 0.002) discard;
  fragColor = vec4(colour, 0.0);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineBolt(options) {
  const kind = defineInstancedKind({
    ...options,
    kind: 'bolt',
    floats: BOLT_FLOATS,
    attributes: BOLT_ATTRIBUTES,
    capacity: BOLT_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'add',
    renderOrder: 34,
    normalize: normalizeBoltSegment,
    pack: packBoltSegment,
  });
  // Brightest wins: segments overlap at every joint, and summing them would knot the bolt.
  const { three } = options;
  const material = kind.object3d.material;
  material.blendEquation = three.MaxEquation;
  material.blendEquationAlpha = three.MaxEquation;
  return kind;
}
