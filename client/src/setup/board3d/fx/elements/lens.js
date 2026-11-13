// Design 079 § Kinds: the lens — a psychic field on a camera-facing quad: a ball of bent space.
// Design 089: the board behind is bent as through a glass ball (hardest at the rim), swirled at
// the heart, and rippled by crests that run outward and die before the rim; red, green and blue
// bend by different amounts, more toward the rim, so edges in the card art fringe. The field is
// clear at its heart and heavy (tinted, dimmed) at its rim, which is one thin prismatic line with
// TCG Live's wavy psychic ring turning on it. The old look tinted the whole disc and stacked three
// ring textures in it: a pink bullseye larger than the card ("psychic rings large").
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
  float inside = 1.0 - smoothstep(0.94, 1.0, r);
  float rc = clamp(r, 0.0, 1.0);
  vec2 radial = vLocal / max(r, 1e-3);
  // The ball's normal toward the camera: 1 at the heart, 0 at the rim.
  float nz = sqrt(max(1.0 - rc * rc, 0.0));
  // Crests run outward from the heart and die before the rim.
  float phase = rc * 10.0 - uTime * 3.4 - spin * 1.3 + seed;
  float reach = (1.0 - rc) * smoothstep(0.04, 0.22, rc);
  float wave = sin(phase) * reach;
  // Space swirls hardest at the heart and not at all at the rim; a slow wobble keeps it alive.
  // Under a radian at the heart: the card art turns and stays a card (2.2 rad wrung it into a knot).
  float swirl = strength * pow(1.0 - rc, 2.0) * (0.75 + 0.2 * sin(uTime * 1.7 + seed));
  vec2 bent = rotate2(vLocal, swirl);
  // A glass ball: the scene is pulled inward ever harder toward the rim; the crests push it in and out.
  vec2 offset = ((bent - vLocal) + radial * strength * (wave * 0.085 - 0.3 * rc * (1.0 - nz))) * vRadius;
  // Dispersion: red bends least and blue most, and all three part ways toward the rim.
  vec2 spread = radial * vRadius * (0.02 + 0.06 * rc * rc + 0.03 * abs(wave)) * strength;
  vec3 fallback = vB.rgb * 0.25;
  vec3 behind = vec3(
    elBoardAt(offset - spread, fallback).r,
    elBoardAt(offset, fallback).g,
    elBoardAt(offset + spread, fallback).b
  );
  // Clear at the heart, heavy at the rim: tinted and dimmed where the ball is thickest to the eye.
  float thick = pow(rc, 3.0);
  vec3 colour = behind * mix(vec3(1.0), vB.rgb * 1.35, (0.1 + 0.42 * thick) * inside) * (1.0 - 0.3 * thick * inside);
  // Light: the crests' thin lit edges, the wavy ring on the rim, and the rim itself as three
  // lines a hair apart in red, green and blue (a prism's edge), all in the kit's colours.
  float crest = pow(max(sin(phase), 0.0), 10.0) * reach;
  vec3 prism = vec3(
    exp(-pow((r - 0.925) * 30.0, 2.0)),
    exp(-pow((r - 0.95) * 30.0, 2.0)),
    exp(-pow((r - 0.975) * 30.0, 2.0))
  );
  vec3 accent = mix(vC.rgb, vec3(0.24, 0.91, 1.0), 0.5);
  vec3 light = vC.rgb * (crest * 0.5 + ringAt(vLocal, 1.0, spin) * 0.9) * vD.w
    + mix(vec3(dot(prism, vec3(0.34))), prism, 0.75) * accent * (0.45 + 0.55 * vD.w)
    + vB.rgb * pow(rc, 5.0) * inside * 0.4;
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
    maps: { uRing: 'T_VFX_Psychic_Ring_Offset.webp' },
    normalize: normalizeLens,
    pack: packLens,
  });
}
