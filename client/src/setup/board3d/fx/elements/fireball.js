// Design 077 § Kinds: the fireball — a boiling ball of flame. A camera-facing quad shades a
// unit sphere's surface noise: domain-warped fbm boils the body, flame licks stream off its
// rim, temperature falls from a white-hot heart through the kit palette to soot at the edge.
// Moving, the quad's back half stretches along the heading into a comet. Additive light with
// a little cover, so it glows over the cloth but its soot still darkens.
import { BILLBOARD_GLSL, DISSOLVE_GLSL, FIRE_RAMP_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL } from './element-glsl.mjs';
import { FIREBALL_ATTRIBUTES, FIREBALL_FLOATS, normalizeFireball, packFireball } from './fireball.mjs';
import { defineInstancedKind } from './instanced-kind.js';

export const FIREBALL_CAPACITY = 64;
/** Quad half-size in radii: room for the licks, plus the comet tail behind a moving ball. */
const PAD = 1.55;
const TAIL = 2.6;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
in vec4 iE;
in vec4 iF;
out vec2 vLocal;
out vec3 vComet;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out vec4 vE;
flat out float vAlpha;
${BILLBOARD_GLSL}
void main() {
  float radius = iA.w;
  // The heading as the camera sees it, so the tail trails on screen whatever the board tilt.
  vec4 c0 = viewMatrix * (uStageToWorld * vec4(iA.xyz, 1.0));
  vec4 c1 = viewMatrix * (uStageToWorld * vec4(iA.xyz + vec3(iF.xy, 0.0) * radius, 1.0));
  vec2 seen = c1.xy - c0.xy;
  float seenLength = length(seen);
  vec2 dir = seenLength > 1e-3 ? seen / seenLength : vec2(1.0, 0.0);
  float stretch = iF.z * clamp(seenLength / max(radius, 1e-3), 0.0, 1.0);
  // The quad grows backwards along the heading by the tail.
  vec2 local = position.xy * 2.0 * ${PAD.toFixed(2)};
  float back = -dot(local, dir);
  if (back > 0.0) local -= dir * back * ${TAIL.toFixed(2)} * stretch / ${PAD.toFixed(2)};
  gl_Position = elBillboard(iA.xyz, local * radius, radius);
  vLocal = local;
  vComet = vec3(dir, stretch);
  vB = iB;
  vC = iC;
  vD = iD;
  vE = iE;
  vAlpha = iF.w;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uFire;
uniform float uFireReady;
in vec2 vLocal;
in vec3 vComet;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in vec4 vE;
flat in float vAlpha;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
${FIRE_RAMP_GLSL}
void main() {
  float seed = vC.w;
  float heat = vB.w;
  float boil = vE.w;
  float t = uTime;
  // Fold the comet tail back into ball space: behind the heading, distance is squeezed.
  vec2 dir = vComet.xy;
  float along = dot(vLocal, dir);
  vec2 across = vLocal - along * dir;
  float tail = along < 0.0 ? -along : 0.0;
  // Behind the ball the tail narrows as it runs out, and fades before the quad ends.
  float tailT = clamp(tail / (1.0 + ${TAIL.toFixed(2)} * vComet.z), 0.0, 1.0);
  vec2 q = across * (1.0 + 1.6 * tailT * vComet.z) + dir * (along < 0.0 ? along / (1.0 + ${TAIL.toFixed(2)} * vComet.z) : along);
  float r = length(q);
  // A sphere's surface under the quad: 3-D noise on it boils instead of sliding.
  vec3 sp = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
  vec3 warp = vec3(
    elFbm(sp * 1.6 + vec3(seed * 1.7, t * 0.55, 0.0)),
    elFbm(sp * 1.6 + vec3(5.2, seed - t * 0.45, 1.3)),
    elFbm(sp * 1.6 + vec3(2.1, 7.7, t * 0.5 + seed))
  ) - 0.5;
  float n = elFbm(sp * 2.4 + warp * 2.2 * boil + vec3(0.0, -t * 0.9, seed * 0.3));
  // Licks: noise streaming outward along each rim angle, strongest past the surface; the
  // trailing side licks harder, so a moving ball sheds flame behind it.
  float angle = atan(q.y, q.x);
  float trail = clamp(-dot(normalize(q + 1e-4), dir), 0.0, 1.0) * vComet.z;
  float licks = elFbm(vec3(cos(angle) * 1.8 + seed, sin(angle) * 1.8, r * 2.2 - t * (1.6 + 1.2 * trail)));
  float rim = r - (n - 0.5) * 0.6 * boil - (licks - 0.45) * (0.55 + 0.9 * trail) * smoothstep(0.55, 1.25, r);
  float density = (1.0 - smoothstep(0.62, 1.08, rim)) * (1.0 - smoothstep(0.55, 0.95, tailT * vComet.z));
  // TCG Live's fire swirl, flowing out from the heart, streaks the body with hotter veins.
  float veins = 0.5;
  if (uFireReady > 0.5) {
    // Two-phase flow: two samples sliding outward half a cycle apart, cross-faded, so the
    // flow never jumps back and the non-tiling texture never shows a seam.
    vec2 outward = q / max(r, 0.15);
    float phase0 = fract(t * 0.4 + seed * 0.07);
    float phase1 = fract(phase0 + 0.5);
    vec2 uv = q * 0.42 + 0.5;
    float s0 = texture(uFire, uv - outward * phase0 * 0.15).r;
    float s1 = texture(uFire, uv + vec2(0.19, 0.31) - outward * phase1 * 0.15).r;
    veins = mix(s0, s1, abs(phase0 * 2.0 - 1.0));
  }
  float temp = clamp((0.98 - r * 0.95) + (n - 0.5) * 1.0 + (veins - 0.4) * 0.45 - trail * 0.3 * r, 0.0, 1.0) * smoothstep(0.0, 0.35, density);
  vec3 colour = elFireRamp(temp, vB.rgb, vC.rgb, vD.rgb, vE.rgb, heat);
  float edge;
  float alpha = clamp(density, 0.0, 1.0) * vAlpha * elDissolve(q, vD.w, seed, edge);
  if (alpha <= 0.002) discard;
  colour *= 1.0 + 1.6 * edge;
  // Light first, a little cover: hot flame adds, cool soot dims what is under it.
  float cover = alpha * (1.0 - smoothstep(0.2, 0.6, temp)) * 0.55;
  fragColor = vec4(colour * alpha, cover);
}
`;

/** @param {{ three: object, textures: object, uniforms: object, layer: number, debug?: Function }} options */
export function defineFireball(options) {
  return defineInstancedKind({
    ...options,
    kind: 'fireball',
    floats: FIREBALL_FLOATS,
    attributes: FIREBALL_ATTRIBUTES,
    capacity: FIREBALL_CAPACITY,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blend: 'over',
    renderOrder: 32,
    maps: { uFire: 'T_VFX_Fire_Radial_NoTile.webp' },
    normalize: normalizeFireball,
    pack: packFireball,
  });
}
