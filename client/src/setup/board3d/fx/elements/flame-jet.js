// Design 077 § Kinds: the flame jet — a tongue of fire from base to tip. A ribbon faces the
// camera along the jet's on-screen axis; noise streams from base to tip, the outline narrows
// and licks harder toward the tip, the TCG Live pointy-flame texture adds its tear, and the
// shared fire ramp colours it from a white-hot root to deep red licks.
import { BILLBOARD_GLSL, DISSOLVE_GLSL, FIRE_RAMP_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { FLAME_JET_ATTRIBUTES, FLAME_JET_FLOATS, normalizeFlameJet, packFlameJet } from './flame-jet.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const FLAME_JET_CAPACITY = 128;
/** The ribbon is wider than the flame so its licks have room; the root reaches back a little. */
const SPREAD = 1.4;
const ROOT = 0.12;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
in vec4 iF;
out vec2 vUv;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out vec4 vE;
flat out vec4 vF;
${BILLBOARD_GLSL}
void main() {
  vec4 base = viewMatrix * (uStageToWorld * vec4(iA.xyz, 1.0));
  vec4 tip = viewMatrix * (uStageToWorld * vec4(iB.xyz, 1.0));
  vec2 axis = tip.xy - base.xy;
  float span = length(axis);
  vec2 dir = span > 1e-3 ? axis / span : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  // position.y runs −.5 (root) … .5 (tip); position.x across.
  float u = position.y + 0.5;
  float width = iA.w;
  vec4 at = mix(base, tip, u);
  at.xy += side * position.x * width * ${SPREAD.toFixed(2)} - dir * width * ${ROOT.toFixed(2)} * (1.0 - u);
  at.xyz += normalize(-at.xyz) * width * 0.5;
  gl_Position = projectionMatrix * at;
  vUv = vec2(u, position.x * 2.0 * ${SPREAD.toFixed(2)});
  vB = iB;
  vC = iC;
  vD = iD;
  vE = iE;
  vF = iF;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uFlame;
uniform float uFlameReady;
in vec2 vUv;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in vec4 vE;
flat in vec4 vF;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${FIRE_RAMP_GLSL}
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float seed = vD.w;
  float heat = vC.w;
  float flow = uTime * vF.w;
  // Widest just past the root, tapering to the tip.
  float envelope = u < 0.18 ? sqrt(max(u, 0.0) / 0.18) : pow(max(1.0 - (u - 0.18) / 0.82, 0.0), 0.75);
  float n = elFbm(vec3(v * 1.9, u * 2.8 - flow * 2.3, seed));
  float n2 = elFbm(vec3(v * 4.2 + n * 1.4, u * 5.5 - flow * 3.6, seed + 3.1));
  // The licks sway more the further out they burn.
  float sway = (n2 - 0.5) * (0.25 + 0.9 * u);
  float shape = envelope * (0.8 + 0.5 * (n - 0.5)) - abs(v + sway);
  if (uFlameReady > 0.5) {
    float tear = texture(uFlame, vec2(0.5 + (v + sway) * 0.42, fract(u * 0.9 - flow * 0.6 + seed * 0.17))).r;
    shape += (tear - 0.45) * 0.35 * u;
  }
  // Roots fade (design 075's lesson): a fan of jets meets at one point, and full roots stacked
  // there would add up to a white disc; the body drawn at the hub fills it instead.
  float density = smoothstep(0.0, 0.22, shape) * smoothstep(0.02, 0.3, u);
  float temp = clamp(shape * 1.7 + (n2 - 0.5) * 0.45 - u * 0.3 + 0.12, 0.0, 1.0);
  vec3 colour = elFireRamp(temp, vC.rgb, vD.rgb, vE.rgb, vF.rgb, heat);
  float edge;
  float alpha = density * vB.w * elDissolve(vec2(u * 2.0, v), vE.w, seed, edge);
  if (alpha <= 0.002) discard;
  colour *= 1.0 + 1.6 * edge;
  float cover = alpha * (1.0 - smoothstep(0.2, 0.6, temp)) * 0.45;
  fragColor = vec4(colour * alpha, cover);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineFlameJet(options) {
  return defineInstancedKind({
    ...options,
    kind: 'flameJet',
    floats: FLAME_JET_FLOATS,
    attributes: FLAME_JET_ATTRIBUTES,
    capacity: FLAME_JET_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 31,
    maps: { uFlame: 'TEX_VFX_Fire_Flame_Pointy.webp' },
    normalize: normalizeFlameJet,
    pack: packFlameJet,
  });
}
