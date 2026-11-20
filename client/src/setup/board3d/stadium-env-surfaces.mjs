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

/**
 * `boxShadow(o, sun, box, top)`: how much of a box is in the way of the sun from the ground point o
 * (0..1, twelve taps over the sun's disc so its edge is soft): the box covers `box` = (x0, y0, x1, y1)
 * from the ground up to `top`.
 */
export const BOX_SHADOW = /* glsl */ `
float boxShadow(vec3 o, vec3 sun, vec4 box, float top) {
  float shade = 0.0;
  for (int k = 0; k < 12; k++) {
    float turn = float(k) * 2.399963;
    vec3 s = normalize(sun + vec3(cos(turn), sin(turn), 0.0) * 0.045 * sqrt((float(k) + 0.5) / 12.0));
    vec3 inv = 1.0 / s;
    vec3 t0 = (vec3(box.xy, 0.0) - o) * inv;
    vec3 t1 = (vec3(box.zw, top) - o) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float a = max(max(tmin.x, tmin.y), tmin.z);
    float b = min(min(tmax.x, tmax.y), tmax.z);
    shade += step(max(a, 0.0), b) * step(0.0, b);
  }
  return shade / 12.0;
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
