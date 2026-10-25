// Design 077 (prototype): Scorched Earth (customhb-299) as a procedural three.js environment, in the
// style of TCG Live's own board art (board_fire in the extracted client): chunky sculpted stones
// with a few broad facets on rounded shoulders, mid slate greys, cool shadows, thin painted
// highlights on their rims, and saturated lava glowing in the gaps. No photographic micro-detail.
// Content after the card art (Ryo Ueda, PRC 138): a volcano spills lava down its flanks into a
// lava river that splits the two halves along the seam, and its streams cross the table too. The
// ground has its own lie of plateaus, ridges and hollows, cards or not: the scene draws the
// environment first and the board over it (board-scene.js), so no card place is marked.
//
// Two stages:
// 1. Bake, once per layout: BAKE_FIELD renders the ground into a half-float target at ~1.6 texels
//    per table px (R height px, G signed px from the nearest lava bank, B lava on the volcano's
//    slopes 0..1, A stone id or -1 off the stones); BAKE_LIGHT turns it into normals, occlusion
//    and a soft sun shadow.
// 2. Per frame: TERRAIN displaces a dense grid by the baked height; LAVA is one sheet at
//    LAVA_LEVEL under the whole table that shows wherever the ground dips below it (the river, the
//    gaps between the stones beside it, the streams' channels); EMBERS and SMOKE rise off it.
//    Fragment shaders end in three's tone-mapping and colour-space chunks, so they match the
//    board's renderer (Neutral tone mapping, sRGB out, gl-renderer.js). Neutral takes ~0.04 off
//    every channel of a dark colour, so the greys below sit that much above the greys they show as.
// CUTOUT_GLSL is the same reveal mask for the table's own materials (table-mesh.js setCutout), so
// the mat disappears exactly where the environment shows.
// Geometry is in the table frame of board-layout.mjs (x right, y up the table from the near edge,
// z off the cloth, 1 unit = 1 flat CSS px).

/** Lava surface height (px below the cloth). */
export const LAVA_LEVEL = -10;
export const BAKE_TEXELS_PER_PX = 1.6;
export const BAKE_MAX_TEXELS = 4096;
/** Terrain grid spacing in table px. */
export const TERRAIN_SPACING_PX = 2.5;
/** Key light in the table frame: from the far left, ~48° up (table-mesh.js lights from there too). */
export const SUN_DIRECTION = [-0.45, 0.5, 0.74];
/** Volcano proportions, relative to its base radius: height, crater radius, crater depth. */
export const VOLCANO_SHAPE = { height: 1.2, crater: 0.24, craterDepth: 0.14 };

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const NOISE = /* glsl */ `
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

const VORONOI = /* glsl */ `
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

const TABLE_UNIFORMS = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uSize;
`;

const LAVA_RAMP = /* glsl */ `
// Lava in linear HDR, banded like painted lava: deep red at the edges, red, orange, a gold core.
// The gold stays below white after Neutral tone mapping.
vec3 lavaColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 deep = vec3(0.16, 0.004, 0.0);
  vec3 red = vec3(0.72, 0.028, 0.0);
  vec3 orange = vec3(1.15, 0.24, 0.0);
  vec3 gold = vec3(1.25, 0.62, 0.06);
  vec3 c = mix(deep, red, smoothstep(0.12, 0.2, t));
  c = mix(c, orange, smoothstep(0.42, 0.5, t));
  return mix(c, gold, smoothstep(0.72, 0.8, t));
}
`;

const REVEAL = /* glsl */ `
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

const VOLCANO = /* glsl */ `
// Centre x, y and base radius (0: no volcano) in table px.
uniform vec4 uVolcano;
uniform float uRiverY;
float angleBetween(float a, float b) {
  return mod(a - b + 3.14159265, 6.2831853) - 3.14159265;
}
float volcanoHeight() {
  return uVolcano.z * ${VOLCANO_SHAPE.height.toFixed(3)};
}
float craterRadius() {
  return uVolcano.z * ${VOLCANO_SHAPE.crater.toFixed(3)};
}
float craterRimHeight() {
  return volcanoHeight() * pow(1.0 - ${VOLCANO_SHAPE.crater.toFixed(3)}, 1.25);
}
// Lava on the volcano: the crater pool and three streams down its flanks, the middle one
// downstream into the river, the others toward the near and far sides where they run on across
// the table (STREAMS). x = 1 on lava, y = signed px from its edge.
vec2 volcanoLava(vec2 p) {
  float r = uVolcano.z;
  if (r <= 0.0) return vec2(0.0, 100000.0);
  vec2 rel = p - uVolcano.xy;
  float d = length(rel);
  float crater = craterRadius();
  float best = d - crater * 0.82;
  float angle = atan(rel.y, rel.x);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float course = (fk - 1.0) * 1.05 + 0.18 * sin(d * 0.04 + fk * 1.7);
    float width = mix(6.0, 17.0, clamp((d - crater) / r, 0.0, 1.0));
    float across = abs(angleBetween(angle, course)) * d - width;
    best = min(best, max(across, max(crater * 0.7 - d, d - r * 1.05)));
  }
  return vec2(1.0 - smoothstep(-0.8, 0.8, best), best);
}
`;

const RIVER = /* glsl */ `
// The river splits the halves the whole width of the table. It leaves the volcano (when there is
// one) at the volcano's height and bends onto the seam downstream.
float riverCenter(float x) {
  float seam = uRiverY + 16.0 * sin(x * 0.003 + 1.3) + 24.0 * (fbm3(vec2(x / 600.0, 3.1)) - 0.5);
  if (uVolcano.z <= 0.0) return seam;
  return mix(uVolcano.y, seam, smoothstep(uVolcano.x, uVolcano.x + 420.0, x));
}
float riverHalfWidth(float x) {
  return 70.0 + 22.0 * (fbm3(vec2(x / 380.0, 7.7)) - 0.5);
}
`;

const STREAMS = /* glsl */ `
// The volcano's two side streams run on from its foot across the table to the far end, one
// through each half, winding as they go. Signed px from the nearest stream bank (< 0 inside).
float streamDistance(vec2 p) {
  if (uVolcano.z <= 0.0) return 100000.0;
  float best = 100000.0;
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    vec2 foot = uVolcano.xy + uVolcano.z * vec2(0.5, 0.866 * side);
    float target = uRiverY * (1.0 + 0.55 * side);
    float centre = mix(foot.y, target, smoothstep(foot.x, foot.x + 380.0, p.x))
      + 34.0 * (fbm3(vec2(p.x / 300.0, 5.0 + float(k) * 7.0)) - 0.5) * smoothstep(foot.x, foot.x + 150.0, p.x);
    float halfWidth = mix(18.0, 30.0, fbm3(vec2(p.x / 260.0, 11.0 + float(k))));
    best = min(best, abs(p.y - centre) - halfWidth + max(foot.x - p.x, 0.0) * 2.0);
  }
  return best;
}
`;

/**
 * Bake 1: the ground. The land has its own lie (terraced plateaus, ridges, hollows) and falls to
 * the lava: the river, the volcano's streams across the table, and the gaps between the stones
 * beside them, the way TCG Live's fire board glows between its rocks. Stones in three sizes ride
 * on the land; the volcano rises with broad sculpted facets, a crater and grooves where its
 * streams run.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${VOLCANO}
${RIVER}
${STREAMS}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// One stone layer: x = height 0..1, y = stone id. Each stone is a sculpted chunk: a flat top and
// five broad side facets meeting in soft creases, tilted at random, on a rounded shoulder that
// drops into the gap between neighbours.
vec2 stones(vec2 p, float size, float gapPx) {
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
  return vec2(max(top, 0.0) * shoulder, id);
}
// The volcano's cone: a nine-sided pyramid softened toward a cone, so its flanks catch the light
// in broad panels; a raised rim round a bowl for the crater pool; grooves where the streams run.
// Zero outside its foot.
float volcanoCone(vec2 p, float streams) {
  float r = uVolcano.z;
  if (r <= 0.0) return 0.0;
  vec2 rel = p - uVolcano.xy;
  float d = length(rel);
  float sector = 6.2831853 / 9.0;
  float offAxis = mod(atan(rel.y, rel.x) + 0.3, sector) - sector * 0.5;
  float panelled = mix(d, d * cos(offAxis) / cos(sector * 0.5), 0.55) + (fbm3(p / 38.0) - 0.5) * r * 0.08;
  float cone = volcanoHeight() * pow(clamp(1.0 - panelled / r, 0.0, 1.0), 1.25);
  float crater = craterRadius();
  float rim = craterRimHeight();
  if (d < crater) cone = mix(rim - r * ${VOLCANO_SHAPE.craterDepth.toFixed(3)}, rim + 2.0, smoothstep(crater * 0.45, crater, d));
  cone -= streams * 7.0 * step(crater, d);
  return cone * (1.0 - smoothstep(r * 0.92, r * 1.04, d));
}
// The land's own lie in px: terraced plateaus with soft cliffs between them, ridges, hollows.
float landHeight(vec2 p) {
  float terraces = fbm3(p / 520.0 + 4.1) * 3.2;
  float level = (floor(terraces) + smoothstep(0.35, 1.0, fract(terraces))) / 3.2;
  float ridge = 1.0 - abs(2.0 * fbm3(p / 240.0 + 1.7) - 1.0);
  float hollow = smoothstep(0.62, 0.85, fbm3(p / 300.0 + 8.8));
  return 46.0 * level + 20.0 * ridge * ridge - 22.0 * hollow - 10.0;
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 warp = vec2(fbm3(p / 260.0), fbm3(p / 260.0 + 17.3)) - 0.5;
  vec2 q = p + warp * 46.0;
  float wobble = (fbm3(p / 90.0) - 0.5) * 22.0;

  float riverSD = abs(p.y - riverCenter(p.x)) - riverHalfWidth(p.x) + wobble;
  float lavaSD = min(riverSD, streamDistance(p) + wobble * 0.5);
  float nearLava = 1.0 - smoothstep(0.0, 110.0, lavaSD);
  float inLava = 1.0 - smoothstep(-14.0, 0.0, lavaSD);
  float bank = 1.0 - smoothstep(-26.0, 0.0, lavaSD);
  float base = mix(landHeight(p), ${LAVA_LEVEL.toFixed(1)} - 7.0, nearLava) - 16.0 * bank;

  // Hills: broad swells of taller rock, so the stones vary with the land.
  float hills = fbm3(p / 340.0 + 2.3);
  float swell = 0.45 + 1.25 * smoothstep(0.25, 0.8, hills);
  vec2 big = stones(q + 31.0, mix(96.0, 150.0, fbm3(p / 500.0 + 9.0)), 4.0);
  vec2 mid = stones(q, 60.0, 3.0);
  vec2 pebble = stones(q + 113.0, 27.0, 1.6);
  float dry = smoothstep(-4.0, 60.0, lavaSD);
  // A few stones stand in the lava as islands.
  float islands = 30.0 * step(0.88, mid.y) * smoothstep(-60.0, -24.0, lavaSD);
  float hBig = big.x * 26.0 * swell * dry;
  float hMid = mid.x * max(18.0 * mix(0.7, 1.4, hills) * (1.0 - inLava), islands * inLava);
  float hPebble = pebble.x * 8.0 * (1.0 - 0.7 * inLava) * (0.4 + 0.6 * nearLava);
  float rock = max(max(hBig, hMid), hPebble);
  float id = rock < 0.6 ? -1.0 : (rock == hBig ? big.y : (rock == hMid ? mid.y : pebble.y));
  float height = base + rock;

  vec2 lava = volcanoLava(p);
  float cone = volcanoCone(p, lava.x);
  if (cone > 0.5) {
    height = max(height, base + cone);
    id = 0.61;
  }
  float slopeLava = lava.x * step(distance(p, uVolcano.xy), uVolcano.z * 0.95);

  gl_FragColor = vec4(height, lavaSD, slopeLava, id);
}
`;

/** Bake 2: normals (RG, z rebuilt), occlusion from height rings (B), soft sun shadow (A). */
export const BAKE_LIGHT_FRAGMENT = /* glsl */ `
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
  vec3 n = normalize(vec3((hl - hr) / (2.0 * pxPerTexel.x), (hd - hu) / (2.0 * pxPerTexel.y), 1.0));

  float occlusion = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float radius = ring == 0 ? 4.0 : (ring == 1 ? 10.0 : 24.0);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.7853982 + float(ring) * 0.39;
      vec2 offset = vec2(cos(angle), sin(angle)) * radius / uSize;
      occlusion += clamp((heightAt(vUv + offset) - h) / (radius * 1.2), 0.0, 1.0);
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

const TERRAIN_UNIFORMS = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uLight;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
`;

export const TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float h = texture2D(uField, uv).r;
  float rise = 1.0 - smoothstep(revealFront() - 0.12, revealFront(), revealReach(p));
  float growth = rise * rise * (3.0 - 2.0 * rise) * exitKeep(p);
  float height = h * growth;
  // A skirt rising to the cloth along the table edge, so the sunken river never opens a gap there.
  vec2 fromEdge = min(uv, 1.0 - uv) * uSize;
  height = mix(max(height, 0.0), height, smoothstep(0.0, 8.0, min(fromEdge.x, fromEdge.y)));
  vPos = p;
  vUv = uv;
  vHeight = height;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, height, 1.0);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${LAVA_RAMP}
${REVEAL}
${VOLCANO}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float riverSD = field.g;
  float slopeLava = field.b;
  float id = field.a;
  float isStone = step(0.0, id);

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);

  // Painted three-tone ramp: cool shadow on faces turned away, mid slate on flat tops, light grey
  // on faces turned to the sun; the baked sun shadow pushes faces toward the shadow tone.
  float tone = fract(id * 13.7) * isStone;
  float facing = dot(n, sun) * mix(0.45, 1.0, light.a);
  vec3 col = mix(vec3(0.058, 0.06, 0.074), vec3(0.088, 0.092, 0.108), smoothstep(0.3, 0.5, facing));
  col = mix(col, vec3(0.138, 0.143, 0.16), smoothstep(0.8, 0.92, facing));
  col *= 0.9 + 0.2 * tone;
  col *= 0.88 + 0.16 * smoothstep(-6.0, 50.0, ground);
  // Bare ground between stones is darker ash.
  col *= mix(0.72, 1.0, isStone);

  // Painted rim: convex edges (negative height Laplacian) catch a light stroke.
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.8, 3.5, -laplace) * vGrowth;
  col = mix(col, vec3(0.2, 0.21, 0.24), convex * 0.55 * smoothstep(0.35, 0.85, n.z));

  // Painted cracks: thin light lines across the tops of some stones.
  vec4 crack = voronoiCell(p / 22.0 + id * 17.0);
  float crackLine = (1.0 - smoothstep(0.015, 0.04, crack.x)) * smoothstep(0.82, 0.95, n.z)
    * smoothstep(0.55, 0.7, gnoise(p / 26.0 + id * 5.0)) * isStone * step(0.4, tone);
  col = mix(col, col * 1.45 + 0.01, crackLine * 0.6);

  // Occlusion: crevices and the feet of stones go deep blue-grey.
  col = mix(vec3(0.036, 0.034, 0.046), col, smoothstep(0.3, 0.9, light.b));

  // Lava light: the stones' lower faces and the gaps glow red near the lava.
  float aboveLava = max(vHeight - ${LAVA_LEVEL.toFixed(1)}, 0.0);
  float nearRiver = 1.0 - smoothstep(0.0, 120.0, riverSD);
  float flicker = 0.88 + 0.12 * gnoise(vec2(uTime * 0.8, p.x / 80.0 + p.y / 120.0));
  float sideFacing = 1.0 - smoothstep(0.55, 0.95, n.z);
  float underglow = exp(-aboveLava / 6.0) * nearRiver;
  float bounce = exp(-max(riverSD, 0.0) / 45.0) * exp(-aboveLava / 24.0) * mix(0.4, 1.0, sideFacing);
  col += vec3(1.0, 0.16, 0.02) * (underglow * 0.7 + bounce * 0.28) * flicker;


  // The volcano: its streams and crater light the rock beside them, then the lava itself, flowing
  // downhill (the baked normal points down the slope).
  vec2 volcanic = volcanoLava(p);
  float besideLava = exp(-max(volcanic.y, 0.0) / 9.0) * (1.0 - slopeLava) * step(0.001, uVolcano.z);
  col += vec3(1.0, 0.14, 0.01) * besideLava * flicker * 0.75;
  if (slopeLava > 0.001) {
    vec2 downhill = length(nxy) > 0.001 ? normalize(nxy) : vec2(1.0, 0.0);
    float crater = craterRadius();
    float inPool = 1.0 - smoothstep(crater * 0.6, crater * 0.85, distance(p, uVolcano.xy));
    float period = 2.4;
    float phaseA = fract(uTime / period);
    float phaseB = fract(uTime / period + 0.5);
    float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
    vec2 travel = downhill * 22.0 * period * (1.0 - inPool);
    float streak = mix(gnoise((p - travel * phaseB) / 9.0 + 7.0), gnoise((p - travel * phaseA) / 9.0), weightA);
    float core = smoothstep(0.0, 4.0, -volcanic.y);
    float churn = gnoise(p / 8.0 + uTime * 0.6) * inPool;
    float heat = 0.4 + core * 0.3 + (streak - 0.5) * 0.5 + inPool * (0.25 + churn * 0.3);
    col = mix(col, lavaColor(heat), slopeLava);
  }

  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));

  float front = revealFront();
  col += lavaColor(0.7) * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  col += lavaColor(0.7) * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit);

  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const LAVA_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The lava sheet. Shallow lava (the gaps, the banks, the stream channels) is deep red; the open
 * river runs orange with a gold core. Banded colour, soft wavy flow lines streaming downstream
 * (+x, bending along the banks), round rafts of crust with glowing rims, bubbles that swell and pop.
 */
export const LAVA_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
${NOISE}
${LAVA_RAMP}
${REVEAL}
varying vec2 vPos;

// One flow phase: x heat noise 0..1, y flow-line strength 0..1.
vec2 flowPhase(vec2 q) {
  float swirl = fbm3(q / 110.0);
  float ripple = gnoise(q / 34.0 + 4.0);
  float wave = sin((q.y + (swirl - 0.5) * 70.0 + (ripple - 0.5) * 18.0) / 9.0);
  float line = smoothstep(0.82, 0.97, wave) * smoothstep(0.35, 0.65, gnoise(q / vec2(140.0, 60.0) + 2.0));
  return vec2(swirl * 0.7 + ripple * 0.3, line);
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 uv = (p - uMin) / uSize;
  vec4 field = texture2D(uField, uv);
  float ground = field.r;
  if (ground > ${LAVA_LEVEL.toFixed(1)} + 1.0) discard;
  float depth = ${LAVA_LEVEL.toFixed(1)} - ground;
  float riverSD = field.g;

  // Flow follows the smooth bank distance (G), never the stones under the lava.
  vec2 e = uTexel * 6.0;
  vec2 towardBank = vec2(
    texture2D(uField, uv + vec2(e.x, 0.0)).g - texture2D(uField, uv - vec2(e.x, 0.0)).g,
    texture2D(uField, uv + vec2(0.0, e.y)).g - texture2D(uField, uv - vec2(0.0, e.y)).g);
  vec2 downstream = vec2(1.0, 0.0);
  vec2 bankNormal = length(towardBank) > 0.0001 ? normalize(towardBank) : vec2(0.0);
  vec2 alongBank = downstream - bankNormal * dot(downstream, bankNormal);
  // Mid-stream (where the bank normal flips) runs straight downstream; near banks it follows them.
  vec2 direction = normalize(downstream + (alongBank - downstream) * (1.0 - smoothstep(4.0, 24.0, -riverSD)));
  float openRiver = 1.0 - smoothstep(-20.0, 4.0, riverSD);
  float smoothDepth = mix(min(depth, 6.0), clamp(-riverSD * 0.35, 0.0, 16.0), openRiver);
  float speed = mix(2.0, 20.0, openRiver * smoothstep(2.0, 16.0, smoothDepth));
  vec2 velocity = direction * speed;

  float period = 4.0;
  float jitter = fbm3(p / 260.0) * 2.0;
  float phaseA = fract(uTime / period + jitter);
  float phaseB = fract(uTime / period + jitter + 0.5);
  float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
  vec2 flow = mix(flowPhase(p - velocity * phaseB * period + vec2(53.0, 29.0)), flowPhase(p - velocity * phaseA * period), weightA);

  float pools = smoothstep(0.35, 0.75, fbm3((p - vec2(uTime * 6.0, 0.0)) / 180.0));
  float core = smoothstep(-24.0, -58.0, riverSD);
  float heat = smoothstep(1.0, 16.0, smoothDepth) * 0.36 + openRiver * 0.06 + core * 0.16 + (flow.x - 0.5) * 0.6
    + pools * 0.16 + flow.y * 0.38;
  heat += 0.06 * sin(uTime * 1.1 + p.x / 90.0);
  vec3 col = lavaColor(heat);

  // Crust: round cartoon rafts of cooled rock, domed, with a glowing rim, drifting downstream as
  // one rigid sheet so they never stretch or ghost.
  vec2 raft = p - vec2(uTime * 7.0, 0.0);
  vec2 raftCell = floor(raft / 40.0);
  vec2 raftCentre = (raftCell + 0.3 + 0.4 * hash22(raftCell + 5.0)) * 40.0;
  float raftRadius = mix(8.0, 16.0, hash12(raftCell + 9.0));
  vec2 fromCentre = (raft - raftCentre) / vec2(1.35, 1.0);
  float raftDistance = length(fromCentre) + (gnoise(raft / 9.0) - 0.5) * 4.0 - raftRadius;
  float coverage = mix(0.55, 0.16, openRiver) + (fbm3(raft / 220.0) - 0.5) * 0.5;
  float hasRaft = step(hash12(raftCell + 2.0), coverage) * smoothstep(3.0, 9.0, smoothDepth);
  float body = (1.0 - smoothstep(-1.0, 0.0, raftDistance)) * hasRaft;
  float raftRim = (1.0 - smoothstep(0.0, 3.0, raftDistance)) * hasRaft;
  vec3 raftNormal = normalize(vec3(fromCentre / raftRadius * 0.9, 1.0));
  float raftKey = smoothstep(0.55, 0.95, dot(raftNormal, normalize(uSun)));
  vec3 crust = mix(vec3(0.06, 0.06, 0.07), vec3(0.12, 0.12, 0.135), raftKey);
  crust += vec3(0.45, 0.05, 0.0) * smoothstep(-3.5, -0.5, raftDistance);
  col = mix(col, lavaColor(0.88), raftRim * (1.0 - body));
  col = mix(col, crust, body);

  // Bubbles: swell for most of their life, then pop as a widening ring.
  vec2 cell = floor(raft / 42.0);
  float bubblePeriod = 2.6 + 2.4 * hash12(cell + 3.0);
  float life = fract(uTime / bubblePeriod + hash12(cell));
  float hasBubble = step(0.55, hash12(cell + 11.0)) * smoothstep(6.0, 12.0, smoothDepth) * (1.0 - body);
  vec2 centre = (cell + 0.2 + 0.6 * hash22(cell + 7.0)) * 42.0;
  float r = distance(raft, centre);
  float swell = smoothstep(0.0, 0.8, life) * 7.0;
  float dome = (1.0 - smoothstep(swell - 1.2, swell, r)) * step(life, 0.82);
  float pop = smoothstep(0.82, 1.0, life);
  float ring = (1.0 - smoothstep(0.6, 1.6, abs(r - (7.0 + pop * 9.0)))) * step(0.82, life) * (1.0 - pop);
  col = mix(col, lavaColor(0.95) * (1.0 + 0.25 * (1.0 - r / max(swell, 0.001))), dome * hasBubble * 0.85);
  col += lavaColor(0.9) * ring * hasBubble * 0.8;

  float front = revealFront();
  col += lavaColor(0.7) * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Motes and embers (TCG Live's board motes): most rise off the river, a share bursts from the
 * crater. Size in table px, perspective-scaled; HDR so they read as glowing.
 */
export const EMBER_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${VOLCANO}
${RIVER}
attribute vec4 aSeed;
varying float vLife;
varying float vKind;
void main() {
  float fromCrater = step(aSeed.w, 0.3) * step(0.001, uVolcano.z);
  float period = mix(3.5 + aSeed.w * 4.5, 2.2 + aSeed.z * 1.6, fromCrater);
  float life = mod(uTime + aSeed.z * period, period) / period;
  float cycle = floor((uTime + aSeed.z * period) / period);
  vec2 jitter = hash22(aSeed.xy * 97.0 + cycle) - 0.5;
  float x = uMin.x + fract(aSeed.x + jitter.x * 0.3) * uSize.x;
  float y = riverCenter(x) + (aSeed.y - 0.5) * 150.0 + jitter.y * 40.0;
  vec3 pos = vec3(x, y, ${LAVA_LEVEL.toFixed(1)} + 2.0);
  pos.x += life * 36.0 + sin(life * 6.0 + aSeed.z * 20.0) * 10.0 * life;
  pos.y += sin(life * 4.0 + aSeed.w * 30.0) * 8.0 * life;
  pos.z += life * (100.0 + 120.0 * aSeed.w);
  vec2 spread = (hash22(aSeed.zy * 53.0 + cycle) - 0.5) * craterRadius() * 1.2;
  vec3 crater = vec3(uVolcano.xy + spread + jitter * life * 70.0, craterRimHeight() - 4.0 + life * (130.0 + 90.0 * aSeed.y));
  pos = mix(pos, crater, fromCrater);
  float onTable = smoothstep(uMin.x + 20.0, uMin.x + 90.0, pos.x) * (1.0 - smoothstep(uMin.x + uSize.x - 90.0, uMin.x + uSize.x - 20.0, pos.x));
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * max(onTable, fromCrater);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.6 + aSeed.z * 2.4) * (1.0 - life * 0.5);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.4 * shown;
  vLife = life;
  vKind = max(step(0.75, aSeed.w), fromCrater);
}
`;

export const EMBER_FRAGMENT = /* glsl */ `
varying float vLife;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.35, 0.5, d);
  float glow = exp(-d * d * 3.0) * 0.5;
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  vec3 hot = mix(vec3(2.0, 0.55, 0.05), vec3(2.0, 1.3, 0.3), vKind);
  vec3 col = mix(hot, vec3(0.7, 0.05, 0.0), smoothstep(0.3, 1.0, vLife));
  gl_FragColor = vec4(col * (core + glow) * fade, 1.0);
${OUTPUT}
}
`;

/** Smoke from the crater: soft round cartoon puffs, light grey, lit orange from below, drifting right. */
export const SMOKE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${VOLCANO}
attribute vec4 aSeed;
varying float vLife;
varying float vSeed;
void main() {
  float period = 5.0 + aSeed.w * 2.5;
  float life = mod(uTime + aSeed.z * period, period) / period;
  vec2 wobble = vec2(sin(life * 5.0 + aSeed.x * 20.0), cos(life * 4.0 + aSeed.y * 20.0)) * 8.0;
  vec3 pos = vec3(uVolcano.xy + (aSeed.xy - 0.5) * craterRadius() + wobble + vec2(55.0, 14.0) * life,
    craterRimHeight() + 6.0 + life * 150.0);
  float shown = step(0.001, uVolcano.z) * revealBurned(uVolcano.xy) * (1.0 - uExit);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = mix(18.0, 58.0, sqrt(life)) * (0.8 + 0.4 * aSeed.z) * uVolcano.z / 100.0;
  gl_PointSize = sizePx * uFocal / -mv.z * shown;
  vLife = life;
  vSeed = aSeed.x * 31.0;
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
${NOISE}
${LAVA_RAMP}
varying float vLife;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float edge = length(c) * 2.0 + (gnoise(c * 4.0 + vSeed) - 0.5) * 0.35;
  float puff = 1.0 - smoothstep(0.62, 0.9, edge);
  float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
  float litFromBelow = smoothstep(-0.1, 0.4, c.y) * (1.0 - smoothstep(0.0, 0.5, vLife));
  vec3 smoke = mix(vec3(0.2, 0.19, 0.24), vec3(0.38, 0.37, 0.43), smoothstep(0.3, -0.4, c.y));
  vec3 col = mix(smoke, lavaColor(0.45) * 0.6, litFromBelow * 0.6);
  gl_FragColor = vec4(col, puff * fade * 0.7);
${OUTPUT}
}
`;
