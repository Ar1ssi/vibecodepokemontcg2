// Design 077: what every Stadium board's shaders share. Noise, the reveal and its cutout for the
// table's own materials, the bake's light pass (normals, occlusion, soft sun shadow from the baked
// height in R) and the terrain grid's ground lookup. Each recipe (stadium-env-<family>.mjs) composes
// these with its own bake and paint. Fragment shaders end in OUTPUT, three's tone-mapping and
// colour-space chunks, so they match the board's renderer (Neutral tone mapping, sRGB out,
// gl-renderer.js). Neutral takes ~0.04 off every channel of a dark colour, so a recipe's greys sit
// that much above the greys they show as.
// Geometry is in the table frame of board-layout.mjs (x right, y up the table from the near edge,
// z off the cloth, 1 unit = 1 flat CSS px).

export const BAKE_TEXELS_PER_PX = 1.6;
export const BAKE_MAX_TEXELS = 4096;
/** Most texels a bake may hold (~5 M: ~40 MB of half-float field plus its light). */
export const BAKE_MAX_TEXEL_AREA = 5e6;
/** Terrain grid spacing in table px. */
export const TERRAIN_SPACING_PX = 2.5;
/** Key light in the table frame: from the far left, ~48° up (table-mesh.js lights from there too). */
export const SUN_DIRECTION = [-0.45, 0.5, 0.74];

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Gradient noise, quintic fade, remapped to about 0..1.
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return 0.5 + 0.9 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 TURN = mat2(0.8, 0.6, -0.6, 0.8);
float fbm3(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * gnoise(p);
    p = TURN * p * 2.03 + 11.7;
    amplitude *= 0.5;
  }
  return value / 0.875;
}
`;

export const VORONOI = /* glsl */ `
// Voronoi cell of x: distance to its border (Quilez's exact form), its hash, and the offset from x
// to the cell's point (all in cell units).
vec4 voronoiCell(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 nearestCell = vec2(0.0);
  vec2 nearestOffset = vec2(0.0);
  float best = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < best) { best = d; nearestOffset = r; nearestCell = g; }
    }
  }
  float edge = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = nearestCell + vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      vec2 between = r - nearestOffset;
      if (dot(between, between) > 0.00001) edge = min(edge, dot(0.5 * (nearestOffset + r), normalize(between)));
    }
  }
  return vec4(edge, hash12(n + nearestCell), nearestOffset);
}
`;

export const TABLE_UNIFORMS = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uSize;
`;

export const REVEAL = /* glsl */ `
uniform vec2 uOrigin;
uniform float uReveal;
uniform float uExit;
float revealReach(vec2 p) {
  return distance(p, uOrigin) / length(uSize) + (fbm3(p / 140.0) - 0.5) * 0.1;
}
float revealFront() {
  return uReveal * 1.25 - 0.05;
}
// 1 behind the front (the environment shows), 0 ahead of it (the mat shows).
float revealBurned(vec2 p) {
  return 1.0 - smoothstep(revealFront() - 0.004, revealFront(), revealReach(p));
}
float exitKeep(vec2 p) {
  float gone = uExit * 1.1;
  return smoothstep(gone - 0.04, gone, fbm3(p / 110.0 + 5.0));
}
`;

/**
 * The reveal mask for the table's own materials (table-mesh.js `setCutout`), injected after three's
 * `<common>` chunk: `environmentShown(p) >= 0.5` where the environment covers the table point `p`.
 */
export const CUTOUT_GLSL = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uCutoutOn;
${NOISE}
${REVEAL}
float environmentShown(vec2 p) {
  // Inset a few px: along the edge the table's own floor stays under the terrain's skirt.
  vec2 inside = step(uMin + 4.0, p) * step(p, uMin + uSize - 4.0);
  return uCutoutOn * inside.x * inside.y * revealBurned(p) * exitKeep(p);
}
`;

/**
 * Bake 2: normals (RG, z rebuilt), occlusion from height rings (B), soft sun shadow (A). With
 * `aoFollowsSlope` occlusion counts only ground above the local slope's plane, so a steep mountain
 * face stays lit and only creases and feet darken; without it, any higher ground nearby occludes
 * (low stony ground, where that reads as crevices).
 * @param {{ aoFollowsSlope?: boolean }} [options]
 */
export const bakeLightFragment = ({ aoFollowsSlope = false } = {}) => /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform vec3 uSun;
varying vec2 vUv;
float heightAt(vec2 uv) {
  return texture2D(uField, uv).r;
}
void main() {
  vec2 pxPerTexel = uSize * uTexel;
  float h = heightAt(vUv);
  float hl = heightAt(vUv - vec2(uTexel.x, 0.0));
  float hr = heightAt(vUv + vec2(uTexel.x, 0.0));
  float hd = heightAt(vUv - vec2(0.0, uTexel.y));
  float hu = heightAt(vUv + vec2(0.0, uTexel.y));
  vec2 slope = vec2((hr - hl) / (2.0 * pxPerTexel.x), (hu - hd) / (2.0 * pxPerTexel.y));
  vec3 n = normalize(vec3(-slope, 1.0));
  vec2 alongSlope = ${aoFollowsSlope ? 'slope' : 'vec2(0.0)'};

  float occlusion = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float radius = ring == 0 ? 4.0 : (ring == 1 ? 10.0 : 24.0);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.7853982 + float(ring) * 0.39;
      vec2 offsetPx = vec2(cos(angle), sin(angle)) * radius;
      float expected = h + dot(alongSlope, offsetPx);
      occlusion += clamp((heightAt(vUv + offsetPx / uSize) - expected) / (radius * 1.2), 0.0, 1.0);
    }
  }
  float ao = 1.0 - clamp(occlusion / 24.0, 0.0, 1.0);

  vec3 sun = normalize(uSun);
  vec2 towardSun = normalize(sun.xy);
  float climb = sun.z / length(sun.xy);
  float lit = 1.0;
  for (int i = 1; i <= 32; i++) {
    float d = float(i) * (2.0 + float(i) * 0.3);
    vec2 uv = vUv + towardSun * d / uSize;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float above = heightAt(uv) - (h + d * climb);
    lit = min(lit, clamp(1.0 - above / (4.0 + d * 0.18), 0.0, 1.0));
  }

  gl_FragColor = vec4(n.xy * 0.5 + 0.5, ao, lit);
}
`;

export const BAKE_LIGHT_FRAGMENT = bakeLightFragment();

export const TERRAIN_UNIFORMS = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uLight;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
// The camera's eye in the table frame (createStadiumEnvironment's update).
uniform vec3 uEye;
`;

/** For terrain vertex shaders, after TERRAIN_UNIFORMS, NOISE and REVEAL. */
export const TERRAIN_GROUND = /* glsl */ `
// The ground averaged over one grid cell, so a stone's edge crossing the grid at a slant doesn't
// zig-zag; the shading keeps the full-resolution edge.
float groundAt(vec2 uv) {
  vec2 halfCell = vec2(${(TERRAIN_SPACING_PX / 2).toFixed(2)}) / uSize;
  return 0.5 * texture2D(uField, uv).r + 0.125 * (
    texture2D(uField, uv + vec2(halfCell.x, 0.0)).r + texture2D(uField, uv - vec2(halfCell.x, 0.0)).r
    + texture2D(uField, uv + vec2(0.0, halfCell.y)).r + texture2D(uField, uv - vec2(0.0, halfCell.y)).r);
}
// How far the ground at p has risen behind the reveal front (0 flat on the cloth, 1 full height),
// and sunk back as the exit passes.
float terrainGrowth(vec2 p) {
  float rise = 1.0 - smoothstep(revealFront() - 0.12, revealFront(), revealReach(p));
  return rise * rise * (3.0 - 2.0 * rise) * exitKeep(p);
}
// A skirt meeting the cloth along the table edge, so the edge stays one straight line on screen and
// the ground never opens a gap against the table's floor there.
float edgeSkirt(vec2 uv) {
  vec2 fromEdge = min(uv, 1.0 - uv) * uSize;
  return smoothstep(0.0, 14.0, min(fromEdge.x, fromEdge.y));
}
`;

/** Sculpted stones, after VORONOI: TCG Live's chunky board rock. */
export const STONES = /* glsl */ `
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// One stone layer: x = height 0..1, y = stone id, z = px from the gap to its neighbours. Each stone
// is a sculpted chunk: a flat top and five broad side facets meeting in soft creases, tilted at
// random, on a rounded shoulder that drops into the gap.
vec3 stones(vec2 p, float size, float gapPx) {
  vec4 cell = voronoiCell(p / size);
  float edge = cell.x * size;
  vec2 local = -cell.zw;
  float id = cell.y;
  float top = 0.86;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float angle = id * 40.0 + fk * 1.2566 + (hash12(vec2(id * 9.1, fk)) - 0.5) * 0.9;
    float slope = 0.4 + 0.5 * hash12(vec2(fk * 3.7, id * 17.0));
    top = smin(top, 1.02 - slope * dot(local, vec2(cos(angle), sin(angle))), 0.06);
  }
  vec2 tilt = hash22(vec2(id * 57.0, 3.0)) - 0.5;
  top = top * mix(0.68, 1.0, fract(id * 7.31)) + dot(local, tilt) * 0.2;
  float inner = clamp((edge - gapPx) / (size * 0.2), 0.0, 1.0);
  float shoulder = sqrt(inner * (2.0 - inner));
  return vec3(max(top, 0.0) * shoulder, id, edge - gapPx);
}
`;
