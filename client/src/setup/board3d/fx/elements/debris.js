// Design 079 § Kinds: debris — real 3-D stones. Each instance is the jagged rock mesh tumbled
// about an axis of its own (from its seed), stretched along its heading for a shard or a spike,
// scaled and placed in the stage. The fragment takes the face normal from screen-space slopes
// (flat facets), lights it from up-left with a rim toward the camera, and grains its surface.
// Opaque and depth-writing: a stone hides its own far side and the stones behind it.
import { DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { DEBRIS_ATTRIBUTES, DEBRIS_FLOATS, normalizeDebris, packDebris, rockMesh } from './debris.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const DEBRIS_CAPACITY = 256;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
out vec3 vView;
out vec3 vLocal;
out vec3 vRound;
flat out vec4 vB;
flat out vec4 vC;
flat out float vDissolve;
flat out vec2 vFinish;
float h1(float n) { return fract(sin(n) * 43758.5453); }
vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}
void main() {
  float seed = iC.w;
  vec3 axis = normalize(vec3(h1(seed * 12.9), h1(seed * 78.2 + 1.0), h1(seed * 37.7 + 2.0)) - 0.5 + 1e-3);
  vec3 shape = mix(position, normalize(position), iE.y);
  vec3 p = rotateAxis(shape, axis, iD.z + seed);
  p.x *= iD.x;
  float c = cos(iD.y);
  float s = sin(iD.y);
  p = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
  // The sphere's own normal, carried the same way (stretch aside), for rounded stones.
  vec3 round_ = rotateAxis(normalize(position), axis, iD.z + seed);
  round_ = vec3(c * round_.x - s * round_.y, s * round_.x + c * round_.y, round_.z);
  vRound = mat3(viewMatrix) * mat3(uStageToWorld) * round_;
  vec4 view = viewMatrix * (uStageToWorld * vec4(iA.xyz + p * iA.w, 1.0));
  gl_Position = projectionMatrix * view;
  vView = view.xyz;
  vLocal = position;
  vB = iB;
  vC = iC;
  vDissolve = iD.w;
  vFinish = iE.xy;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
in vec3 vView;
in vec3 vLocal;
in vec3 vRound;
flat in vec4 vB;
flat in vec4 vC;
flat in float vDissolve;
flat in vec2 vFinish;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
void main() {
  // A smooth stone takes its normal from the sphere it was rounded toward; a jagged one is faceted.
  vec3 facet = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 normal = normalize(mix(facet, normalize(vRound), vFinish.y));
  vec3 toCamera = normalize(-vView);
  if (dot(normal, toCamera) < 0.0) normal = -normal;
  // Light from up-left and a little toward the camera, in view space.
  vec3 light = normalize(vec3(-0.5, 0.75, 0.45));
  float lambert = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, toCamera), 0.0), 2.5);
  float grain = elFbm(vLocal * 6.0 + vC.w);
  float gloss = vFinish.x;
  vec3 colour = vB.rgb * (0.28 + 0.9 * lambert) * mix(0.8 + 0.4 * grain, 1.0, gloss) + vC.rgb * rim * 0.45;
  // Metal and ice: a sharp white glint (it blooms) and a sky-over-floor reflection by the normal.
  vec3 halfway = normalize(light + toCamera);
  float glint = pow(max(dot(normal, halfway), 0.0), mix(12.0, 90.0, gloss));
  vec3 sky = mix(vB.rgb * 0.25, vec3(1.0), smoothstep(-0.2, 0.8, normal.y));
  colour = mix(colour, colour * 0.45 + sky * 0.55, gloss * 0.6) + vec3(1.0) * glint * gloss * 1.8;
  float edge;
  float keep = elDissolve(vLocal.xy * 1.5 + vLocal.z, vDissolve, vC.w, edge);
  float alpha = vB.w * keep;
  if (alpha < 0.5) discard;
  colour = mix(colour, vC.rgb * 1.4, edge);
  fragColor = vec4(colour, 1.0);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineDebris(options) {
  return defineInstancedKind({
    ...options,
    kind: 'debris',
    floats: DEBRIS_FLOATS,
    attributes: DEBRIS_ATTRIBUTES,
    capacity: DEBRIS_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 21,
    depthWrite: true,
    geometry: rockMesh(),
    normalize: normalizeDebris,
    pack: packDebris,
  });
}
