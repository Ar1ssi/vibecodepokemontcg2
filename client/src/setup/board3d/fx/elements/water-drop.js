// Design 079 § Kinds: the water drop — a ball of water on a camera-facing quad. The sphere's
// normal bends the board behind it (more at the rim, as a lens), tints it, and lights a Fresnel
// rim, a soft caustic shimmer inside and a white glint up-left. Covers what is under it.
import { BILLBOARD_GLSL, BOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { WATER_DROP_ATTRIBUTES, WATER_DROP_FLOATS, normalizeWaterDrop, packWaterDrop } from './water-drop.mjs';

export const WATER_DROP_CAPACITY = 256;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
out vec2 vLocal;
flat out float vRadius;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
${BILLBOARD_GLSL}
void main() {
  vec2 local = position.xy * 2.1;
  gl_Position = elBillboard(iA.xyz, local * iA.w, iA.w);
  vLocal = local;
  vRadius = iA.w;
  vB = iB;
  vC = iC;
  vD = iD;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uCaustic;
uniform float uCausticReady;
in vec2 vLocal;
flat in float vRadius;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${BOARD_GLSL}
void main() {
  float seed = vC.w;
  float wob = (elFbm(vec3(vLocal * 1.5, uTime * 0.8 + seed)) - 0.5) * 0.08;
  float r = length(vLocal) * (1.0 + wob);
  float coverage = 1.0 - smoothstep(0.96, 1.02, r);
  if (coverage <= 0.002) discard;
  vec3 normal = vec3(vLocal, sqrt(max(1.0 - r * r, 0.0)));
  // A lens: the board behind bends outward toward the rim, by up to half a radius.
  vec3 behind = elBoardAt(normal.xy * vRadius * 0.5 * (1.0 - normal.z * 0.6), vD.rgb * 0.4);
  vec3 colour = behind * mix(vec3(1.0), vB.rgb * 1.2, 0.55);
  if (uCausticReady > 0.5) {
    float caustic = texture(uCaustic, vLocal * 0.45 + 0.5 + vec2(seed * 0.21, uTime * 0.05)).a;
    colour += vC.rgb * caustic * 0.35 * normal.z;
  }
  vec3 light = normalize(vec3(-0.45, 0.55, 0.7));
  float glint = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  float fresnel = pow(1.0 - normal.z, 2.5);
  colour = mix(colour, vC.rgb, fresnel * 0.55) + vec3(1.0) * glint * 1.4;
  float edge;
  float alpha = coverage * vB.w * elDissolve(vLocal, vD.w, seed, edge);
  if (alpha <= 0.002) discard;
  colour = mix(colour, vC.rgb * 1.5, edge);
  fragColor = vec4(colour * alpha, alpha * (0.72 + 0.25 * fresnel));
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineWaterDrop(options) {
  return defineInstancedKind({
    ...options,
    kind: 'waterDrop',
    floats: WATER_DROP_FLOATS,
    attributes: WATER_DROP_ATTRIBUTES,
    capacity: WATER_DROP_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 27,
    needsBoard: true,
    maps: { uCaustic: 'T_VFX_Caustic_Noodly.webp' },
    normalize: normalizeWaterDrop,
    pack: packWaterDrop,
  });
}
