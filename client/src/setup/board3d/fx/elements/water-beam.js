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
  // Refraction: the board bends through the tube, more toward its sides (a lens), and ripples.
  vec2 bend = vec2(nv * 16.0 + ripple * 10.0, ripple * 10.0);
  vec3 behind = elBoardAt(bend, vC.rgb * 0.35);
  // Clear water: the scene shows through, tinted. In-scattered body colour keeps the column
  // saturated blue over the dark cloth (pale glass over black reads as ice, not water).
  vec3 tinted = behind * mix(vec3(1.0), vD.rgb * 1.2, 0.65) + vD.rgb * 0.3;
  // The beam texture is a mask, not a colour: its cells run the water between deep and body so
  // the column stays saturated (mixing it toward white made the beam a pale slab); its white cell
  // web, sharpened, is the foam skin of running water.
  float cells = 0.5;
  if (uBeamReady > 0.5) {
    cells = texture(uBeam, vec2(0.5 + nv * 0.45, along * 0.22 - flow * 1.3)).r;
  }
  vec3 water = mix(vC.rgb, vD.rgb, 0.35 + 0.65 * cells);
  // A beam is mostly refracted scene (that is its clarity); a thin tongue is mostly its own colour.
  vec3 colour = mix(tinted, water, mix(0.45, 0.72, taper));
  // Darker toward the tube's sides: that gradient is the volume.
  colour = mix(colour, vC.rgb, (1.0 - nz) * 0.4);
  // A thin stream carries light at its crest only; its sides stay water-coloured, or it reads as ice.
  colour = mix(colour, vE.rgb, 0.3 * taper * nz);
  // Foam, tinted white (pure white over blue reads as frost), three kinds: the cell web; long
  // streaks stretched along the flow (SV's white lines: the top ~12 % of a noise squashed along the
  // axis); froth where the water tears, at the edges and the breaking head. A splash tongue
  // (taper 1) froths far more than the column that feeds it: that contrast reads as "splash".
  float web = smoothstep(0.58, 0.85, cells) * (0.35 + 0.65 * nz);
  // The streaks wander with the ripple and break into lengths, or they are ruler-straight speed lines.
  float streak = elFbm(vec3(nv * 2.6 + ripple * 1.6, along * 0.12 - flow * 4.0, seed + 9.0));
  float streakCut = 0.74 - 0.14 * taper;
  float lines = smoothstep(streakCut, streakCut + 0.08, streak) * (0.45 + 0.55 * smoothstep(0.35, 0.65, elFbm(vec3(nv * 4.0, along * 0.5 - flow * 3.0, seed + 5.0))));
  // Froth is a wide, blobby band (coarse noise over the outer ~30 % of each side), not a hairline.
  float froth = (1.0 - smoothstep(0.0, 0.3 + 0.1 * taper, shape)) * smoothstep(0.3, 0.75, elFbm(vec3(nv * 2.0, along * 0.6 - flow * 3.5, seed + 21.0))) * 1.4;
  float head = smoothstep(0.88, 1.05, t);
  float foam = clamp(web + lines * 0.9 + froth * (1.0 + 0.3 * taper) + head * (0.5 + 0.3 * taper), 0.0, 1.0) * vF.y;
  vec3 foamColour = mix(vE.rgb, vec3(1.0), 0.8);
  colour = mix(colour, foamColour, foam);
  // Shine is light, added after coverage: a thin hot Fresnel rim, a glossy stripe up-left broken
  // into glints by the streaks, a thinner reflection stripe on the far side, and sparkle points.
  float fresnel = pow(1.0 - nz, 4.0);
  float stripe = exp(-pow((nv + 0.42) * 11.0, 2.0)) * (0.55 + 0.45 * smoothstep(0.3, 0.7, streak));
  float stripe2 = exp(-pow((nv - 0.72) * 16.0, 2.0)) * 0.5;
  float sparkle = smoothstep(0.78, 0.86, elFbm(vec3(nv * 7.0, along * 1.6 - flow * 5.0, seed + 33.0))) * nz;
  vec3 light = vE.rgb * fresnel * 0.5 + mix(vE.rgb, vec3(1.0), 0.8) * (stripe * 0.9 + stripe2 * 0.5) + vec3(1.0) * sparkle * 0.7;
  float edge;
  float alpha = coverage * vB.w * elDissolve(vec2(along * 0.4, v), vF.x, seed, edge);
  if (alpha <= 0.002) discard;
  colour = mix(colour, vE.rgb * 1.6, edge);
  // Water is clearest down its middle and opaque at its grazing sides; foam covers fully.
  float opacity = max(mix(0.55, 0.9, 1.0 - nz), foam * 0.95);
  float a = alpha * opacity;
  fragColor = vec4(colour * a + light * alpha, a);
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
