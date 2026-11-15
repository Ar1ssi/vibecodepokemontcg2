// The shell element: a ball of energy closed round a card, on a camera-facing quad with a sphere's
// normal. It is matter you can see through: at its heart the board behind shows, bent a little as
// through a glass ball; toward its rim the shell thickens into its own colour. Bands of noise
// flow over it and slide across as it turns about its upright axis, so it reads as a turning
// ball and not a disc; it is lit from up-left with a small glint; hot veins run between the
// bands, a Fresnel rim takes the accent colour, and light cracks spread over it from one side
// as `crack` rises. A thin halo leaves its edge. `dissolve` eats it by noise, the holes' rims
// burning in the hot colour.
import { BILLBOARD_GLSL, BOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { defineInstancedKind } from './instanced-kind.js';
import { SHELL_ATTRIBUTES, SHELL_FLOATS, normalizeShell, packShell } from './shell.mjs';

export const SHELL_CAPACITY = 16;
/** Quad half-size in radii: room for the halo. */
const PAD = 1.3;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
in vec4 iF;
out vec2 vLocal;
flat out float vRadius;
flat out vec4 vBody;
flat out vec4 vDeep;
flat out vec4 vHot;
flat out vec4 vRim;
flat out vec4 vShape;
${BILLBOARD_GLSL}
void main() {
  vec2 local = position.xy * 2.0 * ${PAD.toFixed(2)};
  gl_Position = elBillboard(iA.xyz, local * iA.w, iA.w * 0.5);
  vLocal = local;
  vRadius = iA.w;
  vBody = iB;
  vDeep = iC;
  vHot = iD;
  vRim = iE;
  vShape = iF;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
in vec2 vLocal;
flat in float vRadius;
flat in vec4 vBody;
flat in vec4 vDeep;
flat in vec4 vHot;
flat in vec4 vRim;
flat in vec4 vShape;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${BOARD_GLSL}
void main() {
  float r = length(vLocal);
  float seed = vDeep.w;
  float crack = vHot.w;
  float thickness = vShape.w;
  float inside = 1.0 - smoothstep(0.97, 1.0, r);
  float rc = min(r, 1.0);
  float nz = sqrt(max(1.0 - rc * rc, 0.0));
  // The point of the ball facing the camera, and the same point on the ball as it has turned.
  vec3 sp = vec3(vLocal / max(r, 1.0), nz);
  float ct = cos(vShape.x);
  float st = sin(vShape.x);
  vec3 q = vec3(ct * sp.x + st * sp.z, sp.y, -st * sp.x + ct * sp.z);
  float flow = elFbm(q * 2.1 + vec3(seed, uTime * 0.22, 0.0));
  float fine = elFbm(q * 5.2 + vec3(0.0, -uTime * 0.5, seed));
  float bands = clamp(flow * (0.55 + 0.9 * fine), 0.0, 1.0);
  float veins = pow(1.0 - abs(flow - 0.5) * 2.0, 7.0);
  vec3 light = normalize(vec3(-0.5, 0.75, 0.45));
  float lambert = max(dot(sp, light), 0.0);
  float rim = pow(1.0 - nz, 2.2);
  vec3 shell = mix(vDeep.rgb, vBody.rgb, smoothstep(0.22, 0.6, bands)) * (0.42 + 0.7 * lambert);
  // Through the ball: the board behind, pulled inward ever harder toward the rim.
  vec2 radial = vLocal / max(r, 1e-3);
  vec2 offset = -radial * vShape.y * rc * (1.0 - nz) * vRadius;
  vec3 behind = elBoardAt(offset, vDeep.rgb * 0.4);
  // Clear at the heart, heavy at the rim; the bands are where the shell is thickest.
  float thick = clamp(thickness * (0.14 + 0.72 * pow(rc, 2.4) + 0.34 * smoothstep(0.3, 0.62, bands) * (0.35 + 0.65 * rc)), 0.0, 0.94);
  vec3 colour = mix(behind, shell, thick);
  // Light on it: veins between the bands, the rim, one glint, and the glow at its heart.
  float glint = pow(max(dot(reflect(-light, sp), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
  float heart = (1.0 - smoothstep(0.0, 0.75, rc)) * vShape.z;
  vec3 lightSum = vHot.rgb * veins * (0.2 + 0.5 * rc) * thickness
    + vRim.rgb * rim * 0.85 * thickness
    + mix(vHot.rgb, vec3(1.0), 0.6) * glint * 0.6 * thickness
    + vHot.rgb * heart * 0.2;
  // Cracks: thin lines of a second noise, opening across the ball from one side.
  float split = elFbm(q * 3.4 + vec3(11.0, seed * 1.7, 3.0));
  float line = pow(1.0 - abs(split - 0.5) * 2.0, 22.0);
  float order = 0.45 + 0.45 * dot(q, normalize(vec3(0.6, 0.5, 0.62)));
  float open = smoothstep(order, order + 0.14, crack * 1.2);
  lightSum += mix(vHot.rgb, vec3(1.0), 0.45) * line * open * 2.6;
  float edge;
  float keep = elDissolve(q.xy * 1.6 + q.z, vRim.w, seed, edge) * vBody.a;
  float cover = inside * keep;
  // The halo: a thin light that leaves the ball's edge, never a fill over it.
  float halo = step(1.0, r) * exp(-(r - 1.0) * 9.0) * (1.0 - smoothstep(1.15, ${PAD.toFixed(2)}, r)) * thickness * vBody.a * (1.0 - vRim.w);
  vec3 rgb = colour * cover + lightSum * cover * (1.0 + 1.5 * edge) + vHot.rgb * edge * cover * 0.8 + mix(vRim.rgb, vBody.rgb, 0.5) * halo * 0.4;
  if (max(max(rgb.r, rgb.g), max(rgb.b, cover)) <= 0.002) discard;
  fragColor = vec4(rgb, cover);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineShell(options) {
  return defineInstancedKind({
    ...options,
    kind: 'shell',
    floats: SHELL_FLOATS,
    attributes: SHELL_ATTRIBUTES,
    capacity: SHELL_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 23,
    needsBoard: true,
    normalize: normalizeShell,
    pack: packShell,
  });
}
