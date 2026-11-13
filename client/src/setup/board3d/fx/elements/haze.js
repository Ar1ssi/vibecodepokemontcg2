// Design 089 § D6: heat haze — the air round a fire on a camera-facing quad. Cells of hot air
// climb through a soft disc and push the board behind them a few pixels this way and that, so
// the cloth and the card art under a flame shimmer. It draws before every other element (they
// go over it) and adds no colour: with no copy of the board to bend it draws nothing.
import { BILLBOARD_GLSL, BOARD_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { HAZE_ATTRIBUTES, HAZE_FLOATS, HAZE_REACH, normalizeHaze, packHaze } from './haze.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const HAZE_CAPACITY = 96;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
out vec2 vLocal;
flat out float vRadius;
flat out vec4 vB;
${BILLBOARD_GLSL}
void main() {
  vec2 local = position.xy * 2.0;
  gl_Position = elBillboard(iA.xyz, local * iA.w, iA.w * 0.5);
  vLocal = local;
  vRadius = iA.w;
  vB = iB;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
in vec2 vLocal;
flat in float vRadius;
flat in vec4 vB;
out vec4 fragColor;
${NOISE_GLSL}
${BOARD_GLSL}
void main() {
  if (uHasBoard < 0.5) discard;
  float r = length(vLocal);
  // Strongest at the heart, gone by the rim: no edge to see.
  float mask = 1.0 - smoothstep(0.25, 1.0, r);
  float cover = mask * vB.x;
  if (cover <= 0.004) discard;
  float seed = vB.w;
  // The cells climb the screen (the camera looks down the heat's way up) at two sizes.
  vec3 p = vec3(vLocal.x * 3.2, vLocal.y * 2.2 - uTime * vB.z * 1.9, seed);
  vec2 wobble = vec2(
    elNoise3(p) + 0.5 * elNoise3(p * 2.1 + vec3(3.7, 0.0, 1.1)),
    elNoise3(p + vec3(7.3, 1.9, 4.1)) + 0.5 * elNoise3(p * 2.1 + vec3(9.2, 5.5, 0.0))
  ) / 1.5 - 0.5;
  vec3 behind = elBoardAt(wobble * 2.0 * vRadius * ${HAZE_REACH.toFixed(3)} * vB.y * mask, vec3(0.0));
  fragColor = vec4(behind * cover, cover);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineHaze(options) {
  return defineInstancedKind({
    ...options,
    kind: 'haze',
    floats: HAZE_FLOATS,
    attributes: HAZE_ATTRIBUTES,
    capacity: HAZE_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    // Under the gpu-canvas mesh (10) and every other kind: they are drawn over the bent board.
    renderOrder: 5,
    needsBoard: true,
    normalize: normalizeHaze,
    pack: packHaze,
  });
}
