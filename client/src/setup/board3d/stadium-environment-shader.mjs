// Design 077 (prototype): Scorched Earth (customhb-299) as a procedural three.js environment, in the
// style of TCG Live's own board art (board_fire in the extracted client): chunky sculpted stones
// with a few broad facets on rounded shoulders, mid slate greys, cool shadows, thin painted
// highlights on their rims, and saturated lava glowing in the gaps. No photographic micro-detail.
// Content after the card art (Ryo Ueda, PRC 138): a lava river splits the two halves along the
// seam, dark rock rises either side of it, tallest where no card lies.
//
// Two stages:
// 1. Bake, once per layout: BAKE_FIELD renders the ground into a half-float target at ~1.6 texels
//    per table px (R height px, G signed px from the river bank, B card-slot plate (> 0) or shelf
//    under a Trainer-board row (< 0), A stone id or -1 off the stones); BAKE_LIGHT turns it into
//    normals, occlusion and a soft sun shadow.
// 2. Per frame: TERRAIN displaces a dense grid by the baked height; LAVA is one sheet at
//    LAVA_LEVEL under the whole table that shows wherever the ground dips below it (the river and
//    the gaps between the stones beside it); EMBERS rise off it. Fragment shaders end in three's
//    tone-mapping and colour-space chunks, so they match the board's renderer (Neutral tone
//    mapping, sRGB out, gl-renderer.js). Neutral takes ~0.04 off every channel of a dark colour,
//    so the greys below sit that much above the greys they show as.
// Geometry is in the table frame of board-layout.mjs (x right, y up the table from the near edge,
// z off the cloth, 1 unit = 1 flat CSS px). Cards lie at z = 0, so every plate top stays below it.

export const MAX_ZONES = 24;
/** Lava surface height (px below the cloth). */
export const LAVA_LEVEL = -10;
export const BAKE_TEXELS_PER_PX = 1.6;
export const BAKE_MAX_TEXELS = 4096;
/** Terrain grid spacing in table px. */
export const TERRAIN_SPACING_PX = 2.5;
/** Flagstone size on the shelves under the Trainer-board rows, in table px. */
const FLAGSTONE_PX = 62;
/** Key light in the table frame: from the far left, ~48° up. */
export const SUN_DIRECTION = [-0.45, 0.5, 0.74];

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

const FOOTPRINTS = /* glsl */ `
// Card slots first (they get a plate with an outline), then Trainer-board rows (a shelf).
uniform vec4 uZones[${MAX_ZONES}];
uniform int uSlabCount;
uniform int uZoneCount;
float rectDistance(vec2 p, vec4 zone) {
  vec2 halfSize = zone.zw * 0.5;
  vec2 d = abs(p - (zone.xy + halfSize)) - halfSize + 6.0;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 6.0;
}
// Signed px to the nearest footprint of any kind (rounded rects): < 0 inside one.
float footprintDistance(vec2 p) {
  float best = 100000.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uZoneCount) break;
    best = min(best, rectDistance(p, uZones[i]));
  }
  return best;
}
// Signed px to the nearest card slot.
float slotDistance(vec2 p) {
  float best = 100000.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uSlabCount) break;
    best = min(best, rectDistance(p, uZones[i]));
  }
  return best;
}
// Signed px to the nearest Trainer-board row.
float rowDistance(vec2 p) {
  float best = 100000.0;
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= uZoneCount) break;
    if (i >= uSlabCount) best = min(best, rectDistance(p, uZones[i]));
  }
  return best;
}
`;

const RIVER = /* glsl */ `
uniform float uRiverY;
// The river winds along the seam between the halves, the whole width of the table.
float riverCenter(float x) {
  return uRiverY + 16.0 * sin(x * 0.003 + 1.3) + 24.0 * (fbm3(vec2(x / 600.0, 3.1)) - 0.5);
}
float riverHalfWidth(float x) {
  return 70.0 + 22.0 * (fbm3(vec2(x / 380.0, 7.7)) - 0.5);
}
`;

/**
 * Bake 1: the ground. The ground beside the river sinks, so the gaps between nearby stones fill
 * with lava the way TCG Live's fire board glows between its rocks. Stones come in three sizes:
 * boulders where there is room (tallest along the far edge), stones between the cards, pebbles
 * filling in toward the banks. Every card slot sits on a flat plate with a raised lip and each
 * Trainer-board row on a smooth shelf, so nothing ever lies on lava or rock.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${FOOTPRINTS}
${RIVER}
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
void main() {
  vec2 p = uMin + vUv * uSize;
  float yn = vUv.y;
  vec2 warp = vec2(fbm3(p / 260.0), fbm3(p / 260.0 + 17.3)) - 0.5;
  vec2 q = p + warp * 46.0;

  float clearance = footprintDistance(p) + (fbm3(p / 64.0) - 0.5) * 18.0;
  float riverSD = abs(p.y - riverCenter(p.x)) - riverHalfWidth(p.x) + (fbm3(p / 90.0) - 0.5) * 22.0;
  float nearRiver = 1.0 - smoothstep(0.0, 110.0, riverSD);
  float inRiver = 1.0 - smoothstep(-14.0, 0.0, riverSD);
  float base = mix(0.0, ${LAVA_LEVEL.toFixed(1)} - 7.0, nearRiver) - 16.0 * (1.0 - smoothstep(-26.0, 0.0, riverSD));

  float farRidge = smoothstep(0.8, 0.98, yn);
  float nearRidge = 1.0 - smoothstep(0.02, 0.14, yn);
  float open = smoothstep(10.0, 44.0, clearance);
  float roomy = smoothstep(50.0, 120.0, clearance);

  vec2 big = stones(q + 31.0, 124.0, 4.0);
  vec2 mid = stones(q, 60.0, 3.0);
  vec2 pebble = stones(q + 113.0, 27.0, 1.6);
  float bigAmp = (26.0 + 62.0 * farRidge + 22.0 * nearRidge) * roomy * smoothstep(-4.0, 60.0, riverSD);
  // A few stones stand in the river as islands.
  float islands = 30.0 * step(0.88, mid.y) * smoothstep(-60.0, -24.0, riverSD) * open;
  float midAmp = max((16.0 + 18.0 * max(farRidge, nearRidge)) * open * (1.0 - inRiver), islands * inRiver);
  float pebbleAmp = 8.0 * open * (1.0 - 0.7 * inRiver) * (0.4 + 0.6 * nearRiver);
  float hBig = big.x * bigAmp;
  float hMid = mid.x * midAmp;
  float hPebble = pebble.x * pebbleAmp;
  float rock = max(max(hBig, hMid), hPebble);
  float id = rock < 0.6 ? -1.0 : (rock == hBig ? big.y : (rock == hMid ? mid.y : pebble.y));
  float height = base + rock;

  // Shelves: cooled basalt split into flagstones, each tilted a little, with sunken joints.
  float shelfSD = rowDistance(p) - 14.0 + (fbm3(p / 50.0) - 0.5) * 20.0;
  float shelf = 1.0 - smoothstep(-3.0, 3.0, shelfSD);
  vec4 flag = voronoiCell(p / ${FLAGSTONE_PX.toFixed(1)} + 3.7);
  float flagstone = -1.0 + (flag.y - 0.5) * 0.6 + dot(-flag.zw, hash22(vec2(flag.y * 31.0, 1.0)) - 0.5) * 0.8;
  flagstone -= 1.6 * (1.0 - smoothstep(0.02, 0.06, flag.x));
  height = mix(height, flagstone, shelf);
  if (shelf > 0.5) id = -1.0;

  float plateSD = slotDistance(p) - 12.0;
  float plate = 1.0 - smoothstep(-1.5, 1.5, plateSD);
  float lip = smoothstep(-7.0, -5.0, plateSD) * (1.0 - smoothstep(-2.5, -0.5, plateSD));
  height = mix(height, -0.6 + lip * 1.4, plate);
  if (plate > 0.5) id = -1.0;

  gl_FragColor = vec4(height, riverSD, plate > 0.0 ? plate : -shelf * (1.0 - plate), id);
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
uniform float uRelief;
uniform float uTime;
uniform float uHeat;
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
  float height = (h > 0.0 ? h * uRelief : h) * growth;
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
${LAVA_RAMP}
${REVEAL}
${FOOTPRINTS}
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
  float plate = max(field.b, 0.0);
  float shelf = max(-field.b, 0.0);
  float id = field.a;
  float isStone = step(0.0, id);

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  float steep = ground > 0.0 ? uRelief * vGrowth : vGrowth;
  vec3 n = normalize(vec3(nxy / nz * steep, 1.0));
  vec3 sun = normalize(uSun);

  // Painted three-tone ramp: cool shadow on faces turned away, mid slate on flat tops, light grey
  // on faces turned to the sun; the baked sun shadow pushes faces toward the shadow tone.
  float tone = fract(id * 13.7) * isStone;
  float facing = dot(n, sun) * mix(0.45, 1.0, light.a);
  vec3 col = mix(vec3(0.058, 0.06, 0.074), vec3(0.088, 0.092, 0.108), smoothstep(0.3, 0.5, facing));
  col = mix(col, vec3(0.138, 0.143, 0.16), smoothstep(0.8, 0.92, facing));
  col *= 0.9 + 0.2 * tone;
  col *= 0.88 + 0.16 * smoothstep(-6.0, 50.0, ground);
  // Bare ground between stones is darker ash; plates and shelves are smooth basalt.
  col *= mix(0.7, 1.0, max(isStone, max(plate, shelf)));
  col = mix(col, col * 0.8, plate);

  // Painted rim: convex edges (negative height Laplacian) catch a light stroke.
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.8, 3.5, -laplace) * steep;
  col = mix(col, vec3(0.2, 0.21, 0.24), convex * 0.55 * smoothstep(0.35, 0.85, n.z));

  // Painted cracks: thin light lines across the tops of some stones and the shelves.
  vec4 crack = voronoiCell(p / 22.0 + id * 17.0);
  float crackLine = (1.0 - smoothstep(0.015, 0.04, crack.x)) * smoothstep(0.82, 0.95, n.z)
    * smoothstep(0.55, 0.7, gnoise(p / 26.0 + id * 5.0)) * max(isStone * step(0.4, tone), shelf);
  col = mix(col, col * 1.45 + 0.01, crackLine * 0.6);

  // Occlusion: crevices and the feet of stones go deep blue-grey.
  col = mix(vec3(0.036, 0.034, 0.046), col, smoothstep(0.3, 0.9, light.b));

  // Lava light: the stones' lower faces and the gaps glow red near the river; flat plates and
  // shelves, lit from the side only, take a little at their edges.
  float aboveLava = max(vHeight - ${LAVA_LEVEL.toFixed(1)}, 0.0);
  float nearRiver = 1.0 - smoothstep(0.0, 120.0, riverSD);
  float flicker = 0.88 + 0.12 * gnoise(vec2(uTime * 0.8, p.x / 80.0 + p.y / 120.0));
  float sideFacing = 1.0 - smoothstep(0.55, 0.95, n.z);
  float flatness = max(plate, shelf);
  float underglow = exp(-aboveLava / 6.0) * nearRiver * mix(1.0, 0.15, flatness);
  float bounce = exp(-max(riverSD, 0.0) / 45.0) * exp(-aboveLava / 24.0) * mix(0.4, 1.0, sideFacing) * mix(1.0, 0.25, flatness);
  col += vec3(1.0, 0.16, 0.02) * (underglow * 0.7 + bounce * 0.28) * flicker * uHeat;

  // Shelf flagstones: one tone each, dark joints that still glow near the river.
  vec4 flag = voronoiCell(p / ${FLAGSTONE_PX.toFixed(1)} + 3.7);
  float joint = (1.0 - smoothstep(0.02, 0.05, flag.x)) * shelf;
  col *= 1.0 + (flag.y - 0.5) * 0.2 * shelf;
  col = mix(col, vec3(0.032, 0.03, 0.038), joint);
  col += lavaColor(0.6) * joint * (1.0 - smoothstep(10.0, 100.0, riverSD)) * flicker * uHeat * 0.7;

  // Card-slot outlines on the plates (TCG Live draws glowing card borders).
  float fp = slotDistance(p);
  float outline = 1.0 - smoothstep(0.6, 1.5, abs(fp + 1.8));
  col *= 1.0 - (1.0 - smoothstep(-5.0, -1.0, fp)) * 0.2 * plate;
  col += vec3(1.1, 0.32, 0.04) * outline * 0.55;

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
 * The lava sheet. Shallow lava (the gaps and the banks) is deep red; the open river runs orange
 * with a gold core. Banded colour, soft wavy flow lines streaming downstream (+x, bending along
 * the banks), dark rafts of crust with glowing rims, bubbles that swell and pop.
 */
export const LAVA_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uTime;
uniform float uHeat;
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

  col *= mix(0.3, 1.0, clamp(uHeat, 0.0, 1.0)) * (1.0 + max(uHeat - 1.0, 0.0) * 0.5);
  float front = revealFront();
  col += lavaColor(0.7) * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const MAT_VERTEX = /* glsl */ `
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vPos = position.xy;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The playmat wherever the environment is not shown: ahead of the reveal front (it chars just
 * before the front reaches it) and wherever the exit has already cleared the ground.
 */
export const MAT_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uMap;
${NOISE}
${REVEAL}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) >= 0.5) discard;
  vec3 col = texture2D(uMap, vUv).rgb;
  float ahead = revealReach(p) - revealFront();
  float charred = (1.0 - smoothstep(0.0, 0.07, ahead)) * step(0.001, uReveal) * step(uReveal, 0.999);
  col = mix(col, col * vec3(0.22, 0.14, 0.1), charred * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Motes and embers (TCG Live's board motes) rising off the river. Size in table px,
 * perspective-scaled; HDR so they read as glowing.
 */
export const EMBER_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${RIVER}
attribute vec4 aSeed;
varying float vLife;
varying float vKind;
void main() {
  float period = 3.5 + aSeed.w * 4.5;
  float life = mod(uTime + aSeed.z * period, period) / period;
  float cycle = floor((uTime + aSeed.z * period) / period);
  vec2 jitter = hash22(aSeed.xy * 97.0 + cycle) - 0.5;
  float x = uMin.x + fract(aSeed.x + jitter.x * 0.3) * uSize.x;
  float y = riverCenter(x) + (aSeed.y - 0.5) * 150.0 + jitter.y * 40.0;
  vec3 pos = vec3(x, y, ${LAVA_LEVEL.toFixed(1)} + 2.0);
  pos.x += life * 36.0 + sin(life * 6.0 + aSeed.z * 20.0) * 10.0 * life;
  pos.y += sin(life * 4.0 + aSeed.w * 30.0) * 8.0 * life;
  pos.z += life * (100.0 + 120.0 * aSeed.w);
  float onTable = smoothstep(uMin.x + 20.0, uMin.x + 90.0, pos.x) * (1.0 - smoothstep(uMin.x + uSize.x - 90.0, uMin.x + uSize.x - 20.0, pos.x));
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * onTable;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.6 + aSeed.z * 2.4) * (1.0 - life * 0.5);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.4 * shown;
  vLife = life;
  vKind = step(0.75, aSeed.w);
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
