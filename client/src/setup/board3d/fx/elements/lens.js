// Design 077 § Kinds: the lens — a psychic field on a camera-facing quad. Inside the disc the
// board behind is swirled (stronger toward the heart) and split into red / green / blue at
// slightly different bends; TCG Live's psychic ring turns at three sizes over it, the spectrum
// ring shimmers, and the rim glows. Covers the disc with the bent board; the rings add light.
import { BILLBOARD_GLSL, BOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { LENS_ATTRIBUTES, LENS_FLOATS, normalizeLens, packLens } from './lens.mjs';

export const LENS_CAPACITY = 32;
const PAD = 1.3;

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
  vec2 local = position.xy * 2.0 * ${PAD.toFixed(2)};
  gl_Position = elBillboard(iA.xyz, local * iA.w, iA.w * 0.5);
  vLocal = local;
  vRadius = iA.w;
  vB = iB;
  vC = iC;
  vD = iD;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uRing;
uniform float uRingReady;
uniform sampler2D uSpectrum;
uniform float uSpectrumReady;
in vec2 vLocal;
flat in float vRadius;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${BOARD_GLSL}
vec2 rotate2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
// The textures repeat: outside its own disc a ring must read nothing, or it tiles over the quad.
float ringAt(vec2 p, float scale, float turn) {
  float r = length(p) / scale;
  if (r > 1.0) return 0.0;
  if (uRingReady > 0.5) return texture(uRing, rotate2(p / scale, turn) * 0.5 + 0.5).a;
  return exp(-pow((r - 0.96) * 30.0, 2.0));
}
void main() {
  float r = length(vLocal);
  float seed = vC.w;
  float spin = vD.x;
  float strength = vD.y;
  float inside = 1.0 - smoothstep(0.9, 1.0, r);
  // Space swirls hardest at the heart and not at all at the rim; a slow wobble keeps it alive.
  float swirl = strength * pow(1.0 - clamp(r, 0.0, 1.0), 2.0) * (2.2 + 0.6 * sin(uTime * 1.7 + seed));
  vec2 bent = rotate2(vLocal, swirl) * (1.0 - 0.18 * strength * inside);
  vec2 offset = (bent - vLocal) * vRadius;
  vec3 fallback = vB.rgb * 0.25;
  vec3 behind = vec3(
    elBoardAt(offset * 1.0, fallback).r,
    elBoardAt(offset * 1.08, fallback).g,
    elBoardAt(offset * 1.16, fallback).b
  );
  vec3 colour = behind * mix(vec3(1.0), vB.rgb * 1.4, 0.35 * inside);
  float rings = ringAt(vLocal, 1.0, spin) + 0.8 * ringAt(vLocal, 0.72, -spin * 1.4) + 0.6 * ringAt(vLocal, 0.46, spin * 2.0);
  vec3 light = vC.rgb * rings * 1.5 * vD.w;
  if (uSpectrumReady > 0.5 && r < 1.05) light += texture(uSpectrum, rotate2(vLocal / 1.05, spin * 0.5) * 0.5 + 0.5).rgb * 0.5 * vD.w;
  light += vB.rgb * pow(clamp(r, 0.0, 1.0), 4.0) * inside * 0.6;
  float edge;
  float keep = elDissolve(vLocal, vD.z, seed, edge) * vB.w;
  float cover = inside * keep;
  vec3 rgb = colour * cover + light * keep * (1.0 + 1.5 * edge);
  if (max(max(rgb.r, rgb.g), max(rgb.b, cover)) <= 0.002) discard;
  fragColor = vec4(rgb, cover);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineLens(options) {
  return defineInstancedKind({
    ...options,
    kind: 'lens',
    floats: LENS_FLOATS,
    attributes: LENS_ATTRIBUTES,
    capacity: LENS_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 24,
    needsBoard: true,
    maps: { uRing: 'T_VFX_Psychic_Ring_Offset.webp', uSpectrum: 'TEX_VFX_Spectrum_Ring.webp' },
    normalize: normalizeLens,
    pack: packLens,
  });
}
