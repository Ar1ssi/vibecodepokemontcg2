// Design 079 § Kinds: smoke — a billowing puff on a camera-facing quad. TCG Live's cloud tile,
// sampled twice and slid along its RG flow map (two-phase, so it never jumps), rolls inside a
// soft round mass; the density's own slope lights it from above, so a puff has a lit top and a
// shaded underside instead of a flat gradient. `glow` lights its heart in the light colour.
// Covers what is under it (premultiplied over): soot and ink darken the board.
import { BILLBOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { SMOKE_ATTRIBUTES, SMOKE_FLOATS, normalizeSmoke, packSmoke } from './smoke.mjs';

export const SMOKE_CAPACITY = 128;
const PAD = 1.35;

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
uniform sampler2D uClouds;
uniform float uCloudsReady;
uniform sampler2D uFlow;
uniform float uFlowReady;
in vec2 vLocal;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
float massAt(vec2 p, float seed, float t, float rise) {
  float r = length(p);
  // Billows: the cloud tile slid along its flow map, else fbm; both roll upward with time.
  vec2 uv = p * 0.32 + vec2(seed * 0.17, seed * 0.29 - t * rise * 0.12);
  float cloud;
  if (uCloudsReady > 0.5) {
    vec2 flow = uFlowReady > 0.5 ? texture(uFlow, uv * 0.7).rg * 2.0 - 1.0 : vec2(0.0);
    float phase0 = fract(t * 0.25);
    float phase1 = fract(phase0 + 0.5);
    float c0 = texture(uClouds, uv + flow * phase0 * 0.12).r;
    float c1 = texture(uClouds, uv + vec2(0.37, 0.11) + flow * phase1 * 0.12).r;
    cloud = mix(c0, c1, abs(phase0 * 2.0 - 1.0));
  } else {
    cloud = elFbm(vec3(p * 1.6 + vec2(0.0, -t * rise), seed));
  }
  float billow = elFbm(vec3(p * 2.4 + vec2(seed, -t * rise * 1.4), t * 0.2));
  return 1.0 - smoothstep(0.35, 1.05, r + (0.55 - cloud) * 0.7 + (0.5 - billow) * 0.35);
}
void main() {
  float seed = vC.w;
  float t = uTime;
  float rise = vD.y;
  float mass = massAt(vLocal, seed, t, rise);
  if (mass <= 0.002) discard;
  // Light from above: the mass's slope is a normal; its top catches the light, its belly is shaded.
  float e = 0.08;
  float up = massAt(vLocal + vec2(0.0, e), seed, t, rise);
  float side = massAt(vLocal + vec2(e, 0.0), seed, t, rise);
  vec3 normal = normalize(vec3((mass - side) / e, (mass - up) / e, 0.6));
  float lit = clamp(dot(normal, normalize(vec3(-0.3, 0.8, 0.6))), 0.0, 1.0);
  vec3 colour = vB.rgb * (0.55 + 0.8 * lit) + vC.rgb * 0.18 * pow(lit, 3.0);
  float r = length(vLocal);
  colour += vC.rgb * vD.z * pow(1.0 - clamp(r, 0.0, 1.0), 2.0) * 1.4;
  float edge;
  float alpha = clamp(mass * (0.45 + 0.55 * vD.x), 0.0, 1.0) * vB.w * elDissolve(vLocal, vD.w, seed, edge);
  if (alpha <= 0.002) discard;
  colour = mix(colour, vC.rgb * 1.4, edge);
  fragColor = vec4(colour * alpha, alpha);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineSmoke(options) {
  return defineInstancedKind({
    ...options,
    kind: 'smoke',
    floats: SMOKE_FLOATS,
    attributes: SMOKE_ATTRIBUTES,
    capacity: SMOKE_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 22,
    maps: { uClouds: 'TEX_VFX_RenderClouds_Minimize.webp', uFlow: 'T_VFX_Direction_RG_Clouds.webp' },
    normalize: normalizeSmoke,
    pack: packSmoke,
  });
}
