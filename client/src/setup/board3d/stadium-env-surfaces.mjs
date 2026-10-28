// Design 077 (prototype): painted-surface GLSL the later Stadium boards share, and the terrain's
// vertex shader every one of them uses unchanged. Chunks go after NOISE (and VORONOI where they
// say so) in a board's fragment shader. Colours are the board's own: nothing here sets one.
import { NOISE, REVEAL, TERRAIN_GROUND, TERRAIN_UNIFORMS } from './stadium-environment-glsl.mjs';

/** The terrain grid's vertex shader: the baked height, grown from the reveal, the table-edge skirt. */
export const STANDARD_TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float growth = terrainGrowth(p);
  vPos = p;
  vUv = uv;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * growth * edgeSkirt(uv), 1.0);
}
`;

/** The scene's rim fades toward `floorShade` over the last few px, so no hard cut shows. */
export const EDGE_HAZE = /* glsl */ `
vec3 edgeHaze(vec3 col, vec2 uv, float floorShade) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(floorShade, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

/** The normal, shaded sun and bake light every terrain fragment starts from (after the field and light reads). */
export const SURFACE_LIGHT = /* glsl */ `
vec3 surfaceNormal(vec4 light, float growth) {
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  return normalize(vec3(nxy / nz * growth, 1.0));
}
`;

/**
 * Grass and reeds: `bladeFan(v, h, len)` is a fan of `blades` strokes out of a tuft's foot, as
 * (stroke 0..1, how far up the blade 0..1); v is the px offset from the foot, h the tuft's hash,
 * len the longest blade (px). Each blade bends over as it rises.
 */
export const BLADES = /* glsl */ `
vec2 bladeFan(vec2 v, float h, float len) {
  float stroke = 0.0;
  float tip = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = 1.571 + (float(k) - 1.5) * 0.46 + (fract(h * (7.0 + float(k) * 3.1)) - 0.5) * 0.7;
    vec2 d = vec2(cos(a), sin(a));
    float l = len * (0.55 + 0.45 * fract(h * (11.0 + float(k))));
    float s = clamp(dot(v, d), 0.0, l);
    vec2 bent = d * s + vec2(-d.y, d.x) * (s * s / l) * 0.17;
    float m = 1.0 - smoothstep(0.3, 0.95, length(v - bent) / mix(1.15, 0.4, s / l));
    stroke = max(stroke, m);
    tip = max(tip, m * s / l);
  }
  return vec2(stroke, tip);
}
`;

/**
 * Paving cut in rows: `paving(p, size, stagger)` is (px to the nearest joint, the slab's id 0..1,
 * the slab's along-row position 0..1), rows of slabs `size.y` deep and `size.x` long, each row
 * shifted by `stagger` of a slab, so a field of it never lines up. After NOISE.
 */
export const PAVING = /* glsl */ `
vec3 paving(vec2 p, vec2 size, float stagger) {
  float row = floor(p.y / size.y);
  float shift = fract(row * 0.618 + hash12(vec2(row, 3.0))) * stagger;
  float col = floor(p.x / size.x + shift);
  vec2 local = vec2(fract(p.x / size.x + shift) - 0.5, fract(p.y / size.y) - 0.5);
  float joint = min((0.5 - abs(local.x)) * size.x, (0.5 - abs(local.y)) * size.y);
  return vec3(joint, hash12(vec2(col, row) + 0.37), local.x + 0.5);
}
`;
