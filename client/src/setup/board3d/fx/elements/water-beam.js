// Design 079 § Kinds: the water beam — a column of running water. A ribbon faces the camera along
// the beam's on-screen axis; across it the shader rebuilds a round tube's normal, bends the board
// behind through it (refraction), runs TCG Live's water-beam caustics and white foam streaks from
// root to head, and lights a Fresnel rim and a glossy stripe. Water covers what is under it
// (premultiplied over), so it tints a bright card instead of adding to white.
import { BOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { WATER_BEAM_ATTRIBUTES, WATER_BEAM_FLOATS, normalizeWaterBeam, packWaterBeam } from './water-beam.mjs';

export const WATER_BEAM_CAPACITY = 128;
/** The ribbon is a little wider than the water so its wobbling edge has room. */
const SPREAD = 1.25;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
in vec4 iF;
out vec2 vUv;
flat out float vLength;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out vec4 vE;
flat out vec4 vF;
void main() {
  vec4 root = viewMatrix * (uStageToWorld * vec4(iA.xyz, 1.0));
  vec4 head = viewMatrix * (uStageToWorld * vec4(iB.xyz, 1.0));
  vec2 axis = head.xy - root.xy;
  float span = length(axis);
  vec2 dir = span > 1e-3 ? axis / span : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  float width = iA.w;
  // position.y −.5 (root) … .5 (head), the head padded by half a width for its round cap.
  float u = position.y + 0.5;
  vec4 at = mix(root, head, u);
  at.xy += dir * width * 0.5 * u + side * position.x * width * ${SPREAD.toFixed(2)};
  at.xyz += normalize(-at.xyz) * width * 0.5;
  gl_Position = projectionMatrix * at;
  // u in widths from the root (the cap runs past the head); v in half-widths across.
  vUv = vec2(u * (span / max(width, 1.0) + 0.5), position.x * 2.0 * ${SPREAD.toFixed(2)});
  vLength = span / max(width, 1.0);
  vB = iB;
  vC = iC;
  vD = iD;
  vE = iE;
  vF = iF;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uBeam;
uniform float uBeamReady;
in vec2 vUv;
flat in float vLength;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in vec4 vE;
flat in vec4 vF;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${BOARD_GLSL}
void main() {
  float along = vUv.x;            // widths from the root
  float t = along / max(vLength, 1e-3);  // 0 root … 1 head
  float v = vUv.y;
  float seed = vC.w;
  float flow = uTime * vD.w;
  float taper = vE.w;
  // Half-width: even for a beam, a tongue for a tapering stream; the head is a round cap.
  // A tongue swells out of its root and thins to a rounded tip (smooth: no wedge corners).
  float tongue = smoothstep(0.0, 0.3, t) * pow(max(1.0 - t, 0.0), 0.55) * 1.25;
  float body = mix(1.0, tongue, taper);
  float past = max(along - vLength, 0.0);
  float half_ = body * sqrt(max(1.0 - pow(past / 0.5, 2.0), 0.0));
  // Churn: the outline boils at two scales as the water runs.
  float wobble = (elFbm(vec3(along * 0.35 - flow * 1.4, v * 0.5, seed)) - 0.5) * 0.45
    + (elFbm(vec3(along * 1.3 - flow * 3.0, v * 1.4, seed + 2.0)) - 0.5) * 0.3;
  float shape = half_ * (1.0 + wobble) - abs(v);
  // A thin stream's edge is spray, not glass: softer the more it tapers.
  float coverage = smoothstep(0.0, mix(0.06, 0.22, taper), shape) * smoothstep(0.0, 0.25, along);
  if (coverage <= 0.002) discard;
  // The tube's normal across it: nv −1 … 1 side to side, nz toward the camera.
  float nv = clamp(v / max(half_, 1e-3), -1.0, 1.0);
  float nz = sqrt(max(1.0 - nv * nv, 0.0));
  float ripple = elFbm(vec3(along * 0.7 - flow * 2.2, nv * 1.5, seed + 4.0)) - 0.5;
  vec2 bend = vec2(nv * 10.0 + ripple * 8.0, ripple * 8.0);
  vec3 behind = elBoardAt(bend, vC.rgb * 0.35);
  vec3 tinted = behind * mix(vec3(1.0), vD.rgb * 1.15, 0.6);
  vec3 caustic = vD.rgb;
  if (uBeamReady > 0.5) {
    caustic = texture(uBeam, vec2(0.5 + nv * 0.45, along * 0.22 - flow * 1.3)).rgb;
  }
  // Thin streams show less of the (often dark) board through them and more of the water's own light.
  vec3 colour = mix(tinted, caustic * mix(vD.rgb, vec3(1.0), 0.35), mix(0.5, 0.75, taper));
  colour = mix(colour, vC.rgb, (1.0 - nz) * 0.35 * (1.0 - taper));
  // Splash and spray read pale: a thin stream is mostly lit water and air, not deep blue.
  colour = mix(colour, vE.rgb, 0.5 * taper);
  // White water: streaks stretched along the flow, running fast toward the head.
  float streak = elFbm(vec3(nv * 2.2, along * 0.45 - flow * 3.2, seed + 9.0));
  // Froth at the edges where the water tears, and at the head where it breaks.
  float froth = 1.0 - smoothstep(0.0, 0.28, shape);
  float foam = clamp(smoothstep(0.5, 0.68, streak) * (0.5 + 0.7 * (1.0 - nz)) + froth * (0.7 + 0.5 * taper) + smoothstep(0.85, 1.05, t) * 0.5, 0.0, 1.0) * vF.y;
  colour = mix(colour, vec3(1.0), foam);
  float fresnel = pow(1.0 - nz, 3.0);
  float stripe = exp(-pow((nv + 0.42) * 7.0, 2.0)) * (0.7 + 0.3 * ripple);
  colour += vE.rgb * fresnel * 0.6 + vec3(1.0) * stripe * 0.7;
  float edge;
  float alpha = coverage * vB.w * elDissolve(vec2(along * 0.4, v), vF.x, seed, edge);
  if (alpha <= 0.002) discard;
  colour = mix(colour, vE.rgb * 1.6, edge);
  fragColor = vec4(colour * alpha, alpha * (0.78 + 0.2 * nz));
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineWaterBeam(options) {
  return defineInstancedKind({
    ...options,
    kind: 'waterBeam',
    floats: WATER_BEAM_FLOATS,
    attributes: WATER_BEAM_ATTRIBUTES,
    capacity: WATER_BEAM_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 26,
    needsBoard: true,
    maps: { uBeam: 'T_VFX_Water_Beam.webp' },
    normalize: normalizeWaterBeam,
    pack: packWaterBeam,
  });
}
