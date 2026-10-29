// Design 077 § Kinds: plasma — a ball of electricity on a camera-facing quad. Thin ridged-noise
// arcs crawl over a sphere's surface (3-D noise on it, re-rolled in steps like a discharge), a
// Fresnel shell brightens the rim, the glow colour falls off outside, and the heart is white.
// The TCG Live electric-crack flipbook adds forked filaments when it has loaded.
import { BILLBOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { PLASMA_ATTRIBUTES, PLASMA_FLOATS, normalizePlasma, packPlasma } from './plasma.mjs';

export const PLASMA_CAPACITY = 64;
/** Quad half-size in radii: room for the outer glow. */
const PAD = 1.8;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
out vec2 vLocal;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
${BILLBOARD_GLSL}
void main() {
  vec2 local = position.xy * 2.0 * ${PAD.toFixed(2)};
  gl_Position = elBillboard(iA.xyz, local * iA.w, iA.w);
  vLocal = local;
  vB = iB;
  vC = iC;
  vD = iD;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uCrack;
uniform float uCrackReady;
in vec2 vLocal;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
void main() {
  float r = length(vLocal);
  float seed = vC.w;
  float heat = vD.x;
  float arcs = vD.y;
  float shellAmount = vD.w;
  float flicker = floor(uTime * 18.0);
  vec3 sp = vec3(vLocal, sqrt(max(1.0 - r * r, 0.0)));
  // Arcs: the zero-crossings of two noise fields on the sphere, sharpened into filaments.
  float n1 = elFbm(sp * 2.2 + vec3(seed, flicker * 0.31, 0.0));
  float n2 = elFbm(sp * 3.1 + vec3(flicker * 0.17, seed * 1.3, 4.0));
  float ridge = pow(1.0 - abs(n1 - 0.5) * 2.0, 18.0) + 0.6 * pow(1.0 - abs(n2 - 0.5) * 2.0, 24.0);
  if (uCrackReady > 0.5) {
    // Two of the flipbook's forks, picked by the flicker step.
    float frame = mod(flicker + seed, 8.0);
    vec2 cell = vec2(mod(frame, 2.0), floor(frame / 2.0));
    vec2 uv = (vLocal / ${PAD.toFixed(2)} * 0.5 + 0.5);
    float crack = texture(uCrack, (cell + uv) / vec2(2.0, 4.0)).r;
    ridge += 0.8 * crack * crack;
  }
  float inside = 1.0 - smoothstep(0.92, 1.02, r);
  float shell = pow(clamp(r, 0.0, 1.0), 6.0) * inside;
  // Outside only: a halo round the ball, never a fill over it.
  float glow = smoothstep(0.82, 1.0, r) * exp(-max(r - 1.0, 0.0) * 3.0) * (1.0 - smoothstep(1.3, ${PAD.toFixed(2)}, r));
  float heart = (1.0 - smoothstep(0.0, 0.35, r)) * heat;
  // Mostly dark inside: the light is in the arcs, the rim and the heart, as a real discharge.
  vec3 colour = vC.rgb * glow * 0.45
    + vC.rgb * inside * 0.1
    + vB.rgb * ridge * arcs * inside * 1.6
    + mix(vC.rgb, vB.rgb, 0.5) * shell * shellAmount * 1.2
    + vec3(1.0) * heart * heart * 1.4;
  float edge;
  float keep = elDissolve(vLocal, vD.z, seed, edge);
  colour *= vB.a * keep * (1.0 + 1.5 * edge);
  if (max(colour.r, max(colour.g, colour.b)) <= 0.002) discard;
  fragColor = vec4(colour, 0.0);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function definePlasma(options) {
  return defineInstancedKind({
    ...options,
    kind: 'plasma',
    floats: PLASMA_FLOATS,
    attributes: PLASMA_ATTRIBUTES,
    capacity: PLASMA_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'add',
    renderOrder: 33,
    maps: { uCrack: 'TEX_VFX_ElectricCrack_SubUV_2x4.webp' },
    normalize: normalizePlasma,
    pack: packPlasma,
  });
}
