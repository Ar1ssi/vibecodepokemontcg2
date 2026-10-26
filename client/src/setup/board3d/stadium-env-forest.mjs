// Design 077 (prototype): the forest recipe. Perilous Jungle (customhb-253) after its card art
// (Ayumi Odashima, TEF 156): a violet jungle round a clearing, bogs of glowing pink poison, tall
// trees with violet trunks, deep teal crowns and dark vines fringed in pink, lush teal and violet
// leaves in deep indigo shade, lit pink wherever they lean over the poison. The cards lie in the
// clearing; past its edge the jungle floor rises a little under thick grass, dotted with plants; the
// trees stand outside the cards' columns either side, leaning in over the clearing's edge; two bogs
// lie in opposite corners, a grassy island in each (stadium-env-forest-layout.mjs). Painted in
// the style of TCG Live's board_grass: cel-shaded leaves with a lit half and a shaded half either
// side of the midrib, dark outlines, flat tone bands.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the water's edge (negative
// in the water), B a tone 0..1, A the ground's kind (-1 clearing floor, 0 bank mud, 1 jungle floor,
// 2 tree roots, 3 stone, 4 island grass); the shared BAKE_LIGHT (stadium-environment-glsl.mjs) adds
// normals, occlusion and the sun shadow.
// Per frame: TERRAIN paints the ground, dappled in the trees' shade; POISON is one sheet at
// WATER_LEVEL for the bogs; LEAF draws every leaf, one instanced strip each, bent on its midrib; BELL
// the drooping bell flowers and SPIKE the pink flower spikes of the card art; LIMB the trees' trunks
// and branches, CROWN the clumps of their foliage, VINE the vines hanging from them; SPORE the
// glowing motes rising off the water and drifting through the jungle.
import {
  NOISE,
  OUTPUT,
  REVEAL,
  SUN_DIRECTION,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
} from './stadium-environment-glsl.mjs';
import {
  BOG_BLEND_PX,
  CLEARING_BLEND_PX,
  CLEARING_RADIUS_PX,
  CLEARING_WOBBLE_PX,
  MAX_BOG_LOBES,
  MAX_BOGS,
  MAX_CARD_RECTS,
  MAX_TREES,
  TABLE_EDGE_HEDGE_PX,
} from './stadium-env-forest-layout.mjs';

/** The poison's surface, px off the cloth. */
export const WATER_LEVEL = -4;
/** Segments along a leaf's strip. */
export const LEAF_SEGMENTS = 8;
/** Rings along a limb (bunched toward its foot) and segments round it. */
export const LIMB_SEGMENTS = { rings: 16, around: 18 };
/** Rings from pole to pole of a clump of foliage, and segments round it. */
export const PUFF_SEGMENTS = { rings: 10, around: 16 };
/** Segments down a vine. */
export const VINE_SEGMENTS = 14;

// Where the sun casts a point's shadow on the cloth: this far along x and y per px of its height.
const SHADOW_DRIFT = [-SUN_DIRECTION[0] / SUN_DIRECTION[2], -SUN_DIRECTION[1] / SUN_DIRECTION[2]];

const JUNGLE = /* glsl */ `
// The card footprints and their core (x0, y0, x1, y1; unused ones lie far off the table), the
// table's rect, every bog's lobes (centre, radius; 0: none) and every bog's island.
uniform vec4 uCards[${MAX_CARD_RECTS}];
uniform vec4 uCore;
uniform vec4 uTable;
uniform vec3 uBogs[${MAX_BOGS * MAX_BOG_LOBES}];
uniform vec3 uIslands[${MAX_BOGS}];
// The clearing traced exactly as stadium-env-forest-layout.mjs clearingDistance traces it: the
// footprints and their core merged softly, grown by the clearing's radius and its edge's wobble, cut
// off just past the table's near and far edges. Negative inside.
float clearingWobble(vec2 p) {
  return 0.5 + 0.3 * sin(p.x * 0.019 + 1.3) * sin(p.y * 0.023 + 0.4) + 0.2 * sin((p.x - p.y) * 0.011 + 2.2);
}
float mergeRect(float near, vec4 rect, vec2 p) {
  float d = length(max(max(rect.xy - p, p - rect.zw), 0.0));
  float h = max(${CLEARING_BLEND_PX.toFixed(1)} - abs(near - d), 0.0) / ${CLEARING_BLEND_PX.toFixed(1)};
  return min(near, d) - h * h * ${(CLEARING_BLEND_PX / 4).toFixed(1)};
}
float clearingDistance(vec2 p) {
  float near = 100000.0;
  for (int i = 0; i < ${MAX_CARD_RECTS}; i++) near = mergeRect(near, uCards[i], p);
  near = mergeRect(near, uCore, p);
  float reach = near - ${CLEARING_RADIUS_PX.toFixed(1)} - ${CLEARING_WOBBLE_PX.toFixed(1)} * clearingWobble(p);
  return max(reach, max(uTable.y - p.y, p.y - uTable.w) - ${TABLE_EDGE_HEDGE_PX.toFixed(1)});
}
// Signed px from the nearest island's shore, negative on it.
float islandDistance(vec2 p) {
  float near = 100000.0;
  for (int i = 0; i < ${MAX_BOGS}; i++) {
    vec3 island = uIslands[i];
    if (island.z > 0.0) near = min(near, distance(p, island.xy) - island.z);
  }
  return near;
}
`;

const CANOPY = /* glsl */ `
// The trees: each crown's centre x, y, radius and height off the cloth (radius 0: none), and each
// trunk's root x, y, radius and side (-1 left of the cards, 1 right).
uniform vec4 uCrowns[${MAX_TREES}];
uniform vec4 uTrunks[${MAX_TREES}];
const vec2 SHADOW_DRIFT = vec2(${SHADOW_DRIFT[0].toFixed(4)}, ${SHADOW_DRIFT[1].toFixed(4)});
// How deep in the trees' shade a point at height h off the cloth lies, 0..1: the sun casts each
// crown's shadow and each trunk's down toward the near right.
float canopyShade(vec2 p, float h) {
  float shade = 0.0;
  for (int i = 0; i < ${MAX_TREES}; i++) {
    vec4 crown = uCrowns[i];
    if (crown.z <= 0.0) continue;
    vec2 centre = crown.xy + SHADOW_DRIFT * max(crown.w - h, 0.0);
    shade = max(shade, 1.0 - smoothstep(0.6, 1.0, distance(p, centre) / crown.z));
    vec4 trunk = uTrunks[i];
    vec2 foot = trunk.xy;
    vec2 top = crown.xy + SHADOW_DRIFT * max(crown.w * 0.6 - h, 0.0);
    vec2 span = top - foot;
    float t = clamp(dot(p - foot, span) / max(dot(span, span), 1.0), 0.0, 1.0);
    shade = max(shade, 1.0 - smoothstep(trunk.z * 0.7, trunk.z * 1.15, distance(p, foot + span * t)));
  }
  return shade;
}
`;

const WATER = /* glsl */ `
// Signed px from the bogs' edge (negative in them): each lobe's shore wobbling round its circle by
// 6% at most, the lobes merged softly as stadium-env-forest-layout.mjs waterDistance merges them.
float bogDistance(vec2 p) {
  float near = 100000.0;
  for (int i = 0; i < ${MAX_BOGS * MAX_BOG_LOBES}; i++) {
    vec3 lobe = uBogs[i];
    if (lobe.z <= 0.0) continue;
    vec2 rel = p - lobe.xy;
    float d = length(rel);
    d -= lobe.z * (0.94 + 0.12 * clamp(fbm3(rel / max(d, 1.0) * 2.2 + 4.3 + float(i) * 1.7), 0.0, 1.0));
    float h = max(${BOG_BLEND_PX.toFixed(1)} - abs(near - d), 0.0) / ${BOG_BLEND_PX.toFixed(1)};
    near = min(near, d) - h * h * ${(BOG_BLEND_PX / 4).toFixed(1)};
  }
  return near;
}
// Signed px from the water's edge: the bogs' shores a little ragged, the islands dry.
float waterDistance(vec2 p) {
  float water = bogDistance(p) + (fbm3(p / 70.0) - 0.5) * 8.0;
  return max(water, -islandDistance(p) + (fbm3(p / 30.0) - 0.5) * 10.0);
}
`;

/**
 * Bake 1: the ground. The clearing's floor swells softly in low tussocks; past the clearing's edge
 * the jungle floor rises in a low bank of soft mounds; surface roots spread from every trunk; the
 * banks dip to the poison, mossy stones along them; the bed sinks under the sheet; the island in
 * each bog is a low grassy mound.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${JUNGLE}
${CANOPY}
${WATER}
// Round mounds: the soft union of domes in two sizes. x: height px, y: the tallest dome's id.
vec2 mounds(vec2 p) {
  float weight = 1.0;
  float top = 0.0;
  float id = 0.0;
  for (int scale = 0; scale < 2; scale++) {
    float size = scale == 0 ? 110.0 : 56.0;
    float seed = float(scale) * 19.0 + 3.0;
    vec2 cell = floor(p / size);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 c = cell + vec2(float(i), float(j));
        vec2 centre = (c + 0.15 + 0.7 * hash22(c + seed)) * size;
        float radius = size * (0.55 + 0.35 * hash12(c + seed * 3.0));
        float under = radius * radius - dot(p - centre, p - centre);
        if (under <= 0.0) continue;
        float h = sqrt(under) * 0.85 + float(scale) * 12.0;
        weight += exp(0.1 * h);
        if (h > top) {
          top = h;
          id = hash12(c + seed * 7.0);
        }
      }
    }
  }
  return vec2(log(weight) / 0.1, id);
}
// Low oval stones in a share of the Voronoi cells of this size, x height px, y id.
vec2 stones(vec2 p, float size, float share) {
  vec4 cell = voronoiCell(p / size + 7.0);
  if (fract(cell.y * 37.3) >= share) return vec2(0.0, cell.y);
  float radius = size * (0.18 + 0.12 * fract(cell.y * 13.7));
  float angle = cell.y * 40.0;
  vec2 local = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * cell.zw * size;
  float across = length(local * vec2(1.0, 1.5)) / radius;
  return vec2(across < 1.0 ? sqrt(1.0 - across * across) * radius * 0.55 : 0.0, cell.y);
}
// The mound every trunk's foot stands on (x) and the surface roots winding out from it (y), height
// px. Roots heading for the cards stop just past the trunk's flare.
vec2 treeRoots(vec2 p) {
  float mound = 0.0;
  float ridges = 0.0;
  for (int i = 0; i < ${MAX_TREES}; i++) {
    vec4 trunk = uTrunks[i];
    if (trunk.z <= 0.0) continue;
    vec2 rel = p - trunk.xy;
    float d = length(rel);
    float reach = trunk.z * 1.3 + 34.0;
    if (d > reach) continue;
    mound = max(mound, 8.0 * (1.0 - smoothstep(trunk.z * 0.8, trunk.z * 2.1, d)));
    float seed = hash12(trunk.xy);
    for (int k = 0; k < 5; k++) {
      float heading = (float(k) + 0.6 * hash12(trunk.xy + float(k))) * 1.2566371 + seed * 6.2831853;
      heading += 0.25 * sin(d * 0.06 + float(k) * 1.7);
      vec2 dir = vec2(cos(heading), sin(heading));
      float along = dot(rel, dir);
      if (along <= 0.0) continue;
      float rootLength = mix(reach, trunk.z * 1.9, max(dir.x * -trunk.w, 0.0));
      float t = along / rootLength;
      if (t >= 1.0) continue;
      float across = abs(dot(rel, vec2(-dir.y, dir.x)));
      float width = mix(trunk.z * 0.6, 5.0, t);
      float ridge = 1.0 - smoothstep(width * 0.55, width, across);
      ridges = max(ridges, ridge * mix(10.0, 3.0, t) * sqrt(1.0 - t));
    }
  }
  return vec2(mound, ridges);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  float waterSD = waterDistance(p);
  float outside = clearingDistance(p);
  float onIsland = 1.0 - smoothstep(-12.0, 8.0, islandDistance(p));

  // The clearing's floor: soft swells of moss and low tussocks.
  float floorHeight = 4.0 * (fbm3(p / 210.0) - 0.5) + 1.6 * smoothstep(0.55, 0.8, gnoise(p / 24.0 + 9.0));

  // The jungle floor: a low bank rising past the clearing's edge in soft mounds; none on the island.
  vec2 mound = mounds(p);
  float rise = smoothstep(0.0, 60.0, outside) * (1.0 - onIsland);
  float dry = smoothstep(4.0, 110.0, waterSD);
  float bank = rise * (8.0 + mound.x * 0.28 * mix(0.6, 1.0, smoothstep(40.0, 260.0, outside))) * dry;
  vec2 rooted = treeRoots(p) * smoothstep(0.0, 12.0, waterSD);
  float roots = max(rooted.x, rooted.y);

  vec2 stone = stones(p, 30.0, 0.35);
  float onShore = smoothstep(-6.0, 0.0, waterSD) * (1.0 - smoothstep(18.0, 36.0, waterSD));
  float shoreStone = stone.x * onShore * (1.0 - rise);

  float land = floorHeight + shoreStone + bank + roots + onIsland * 5.0 * smoothstep(4.0, 30.0, waterSD);
  float shore = smoothstep(0.0, 24.0, waterSD);
  float bed = ${(WATER_LEVEL - 1).toFixed(1)} - 10.0 * smoothstep(0.0, 28.0, -waterSD);
  // A few stones stand out of the poison.
  float inWater = step(waterSD, 0.0);
  float wetStone = stone.x * step(0.9, fract(stone.y * 11.3)) * smoothstep(-40.0, -12.0, waterSD) * inWater;
  float height = waterSD < 0.0 ? max(bed, bed + wetStone * 1.4) : mix(${(WATER_LEVEL - 1).toFixed(1)}, land, shore);

  float kind = -1.0;
  if (bank > 2.0) kind = 1.0;
  if (rooted.y > max(1.5, rooted.x * 0.6)) kind = 2.0;
  if (onIsland > 0.5) kind = 4.0;
  if (waterSD < mix(16.0, 5.0, onIsland)) kind = 0.0;
  if (shoreStone > 0.6 || wetStone > 0.6) kind = 3.0;
  gl_FragColor = vec4(height, waterSD, kind > 2.5 && kind < 3.5 ? stone.y : mound.y, kind);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
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

const PALETTE = /* glsl */ `
// The card art's palette in linear RGB, a little above the art (Neutral tone mapping darkens).
const vec3 INDIGO = vec3(0.016, 0.014, 0.05);
const vec3 LAVENDER = vec3(0.2, 0.16, 0.46);
const vec3 POISON_GLOW = vec3(1.0, 0.2, 0.66);
// Haze toward the scene's edges, past which the table's own floor shows.
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.55, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${CANOPY}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float waterSD = field.g;
  float tone = field.b;
  float kind = field.a;

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float facing = dot(n, sun) * mix(0.45, 1.0, light.a);
  float lit = smoothstep(0.35, 0.5, facing);
  float bright = smoothstep(0.82, 0.94, facing);

  // The clearing's floor: violet earth under teal moss, tufts catching the light, tiny pink and
  // white flowers in the moss.
  float moss = smoothstep(0.3, 0.75, fbm3(p / 160.0 + 3.3) + 0.15 * (gnoise(p / 30.0) - 0.5));
  vec3 earth = mix(vec3(0.03, 0.027, 0.072), vec3(0.058, 0.05, 0.125), lit);
  vec3 mossCol = mix(vec3(0.022, 0.048, 0.066), vec3(0.04, 0.098, 0.105), lit);
  mossCol = mix(mossCol, vec3(0.07, 0.19, 0.17), bright * 0.6);
  vec3 col = mix(earth, mossCol, moss);
  float grain = gnoise(p / 3.5);
  col *= 0.92 + 0.16 * grain;
  vec4 tuft = voronoiCell(p / 15.0 + 1.7);
  vec2 fromTuft = -tuft.zw * 15.0;
  // Each tuft fans its blades up the table, as standing grass leans to a camera looking up it;
  // the blades taper to their tips.
  float bladeAngle = atan(fromTuft.x, fromTuft.y + 0.001);
  float bladeRun = length(fromTuft) / 8.0;
  float fan = 1.0 - smoothstep(0.8, 1.15, abs(bladeAngle));
  float blades = smoothstep(0.4 + 0.5 * bladeRun, 0.55 + 0.42 * bladeRun, cos(bladeAngle * 9.0 + tuft.y * 30.0))
    * fan * (1.0 - smoothstep(0.75, 1.05, bladeRun));
  float hasTuft = step(fract(tuft.y * 41.7), 0.55) * smoothstep(0.25, 0.7, moss);
  vec3 blade = mix(vec3(0.03, 0.09, 0.08), vec3(0.08, 0.24, 0.19), smoothstep(1.0, 6.0, length(fromTuft)));
  col = mix(col, blade * mix(0.7, 1.15, lit), blades * hasTuft);
  // Light falling through the canopy in soft flecks, drifting as the leaves stir.
  float fleck = smoothstep(0.6, 0.72, fbm3(p / 70.0 + vec2(uTime * 0.02, 0.0) + 11.0));
  col = mix(col, col * 1.5 + vec3(0.01, 0.02, 0.03), fleck * 0.3);
  vec4 bloom = voronoiCell(p / 26.0 + 5.0);
  float flower = (1.0 - smoothstep(1.4, 2.2, length(bloom.zw) * 26.0)) * step(fract(bloom.y * 23.1), 0.16) * moss;
  vec3 petal = fract(bloom.y * 7.7) < 0.6 ? vec3(1.0, 0.32, 0.68) : vec3(0.78, 0.74, 1.0);
  col = mix(col, petal * mix(0.6, 1.0, lit), flower);

  // Bank mud: dark and wet, the poison's light on it.
  vec3 mud = mix(vec3(0.03, 0.016, 0.04), vec3(0.075, 0.04, 0.09), lit);
  col = mix(col, mud, step(-0.5, kind) * step(kind, 0.5));
  // The jungle floor: thick grass, tufts packed edge to edge, their blades fanning up the table to
  // lit tips over deep teal shade.
  vec4 clump = voronoiCell(p / 11.0 + 8.3);
  vec2 fromClump = -clump.zw * 11.0;
  float clumpAngle = atan(fromClump.x, fromClump.y + 0.001);
  float clumpRun = length(fromClump) / 9.0;
  float grass = smoothstep(0.3 + 0.5 * clumpRun, 0.45 + 0.45 * clumpRun, cos(clumpAngle * 7.0 + clump.y * 30.0))
    * (1.0 - smoothstep(0.85, 1.25, abs(clumpAngle))) * (1.0 - smoothstep(0.8, 1.1, clumpRun));
  vec3 under = mix(vec3(0.012, 0.022, 0.04), vec3(0.025, 0.05, 0.07), lit) * (0.8 + 0.4 * tone);
  vec3 grassBlade = mix(vec3(0.02, 0.07, 0.07), vec3(0.06, 0.2, 0.16), smoothstep(0.1, 0.9, clumpRun));
  grassBlade = mix(grassBlade, vec3(0.1, 0.3, 0.22), bright * 0.5) * mix(0.65, 1.1, lit) * (0.85 + 0.3 * fract(clump.y * 7.3));
  vec3 jungleFloor = mix(under, grassBlade, grass);
  col = mix(col, jungleFloor, step(0.5, kind) * step(kind, 1.5));
  // Roots: violet bark, ridged along their length, moss on their backs.
  vec3 bark = mix(vec3(0.04, 0.02, 0.075), vec3(0.13, 0.07, 0.21), lit) * (0.85 + 0.3 * gnoise(p / 5.0));
  bark = mix(bark, vec3(0.04, 0.14, 0.12), smoothstep(0.86, 0.97, n.z) * smoothstep(0.5, 0.65, gnoise(p / 11.0)));
  col = mix(col, bark, step(1.5, kind) * step(kind, 2.5));
  // Stones: blue-violet, moss on their tops.
  vec3 rock = mix(vec3(0.035, 0.034, 0.08), vec3(0.13, 0.12, 0.25), lit) * (0.85 + 0.3 * fract(tone * 9.0));
  rock = mix(rock, vec3(0.05, 0.16, 0.14), smoothstep(0.82, 0.95, n.z) * smoothstep(0.45, 0.6, gnoise(p / 9.0)));
  col = mix(col, rock, step(2.5, kind) * step(kind, 3.5));
  // The island: lush teal-green grass, thick with pink and white flowers, as in the card art.
  vec3 islandGrass = mix(vec3(0.03, 0.12, 0.06), vec3(0.08, 0.32, 0.15), lit);
  islandGrass = mix(islandGrass, vec3(0.18, 0.5, 0.24), bright * 0.7) * (0.85 + 0.3 * grain);
  vec4 blossom = voronoiCell(p / 9.0 + 2.0);
  float bud = (1.0 - smoothstep(1.2, 2.0, length(blossom.zw) * 9.0)) * step(fract(blossom.y * 17.3), 0.3);
  islandGrass = mix(islandGrass, fract(blossom.y * 5.3) < 0.55 ? vec3(1.0, 0.3, 0.62) : vec3(0.85, 0.82, 1.0), bud);
  col = mix(col, islandGrass, step(3.5, kind));

  // Convex edges catch a lavender stroke; occlusion sinks into indigo.
  vec2 t2 = uTexel * 3.0;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.6, 3.0, -laplace) * vGrowth * step(1.5, kind) * step(kind, 2.5);
  col = mix(col, vec3(0.32, 0.26, 0.55), convex * 0.5);
  col = mix(INDIGO, col, smoothstep(0.25, 0.9, light.b));

  // The trees' shade, broken by flecks of light through the leaves.
  float dapple = smoothstep(0.52, 0.68, fbm3(p / 44.0 + vec2(uTime * 0.03, 0.0) + 21.0));
  col *= 1.0 - mix(0.28, 0.5, step(0.5, kind)) * canopyShade(p, ground) * vGrowth * (1.0 - 0.75 * dapple);

  // The poison tints the banks right by it pink, side faces most, flickering slowly: a faint sheen,
  // not a halo, so the bogs read as water.
  float flicker = 0.85 + 0.15 * gnoise(vec2(uTime * 0.7, p.x / 90.0 + p.y / 130.0));
  float sideFacing = 1.0 - smoothstep(0.55, 0.95, n.z);
  float glow = exp(-max(waterSD, 0.0) / 22.0) * exp(-max(ground - ${WATER_LEVEL.toFixed(1)}, 0.0) / 24.0);
  col += POISON_GLOW * glow * mix(0.08, 0.26, sideFacing) * flicker * mix(1.0, 0.35, step(3.5, kind));

  col = edgeHaze(col, vUv);
  vec3 toxic = vec3(1.1, 0.3, 0.85);
  float front = revealFront();
  col += toxic * smoothstep(front - 0.03, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  col += toxic * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit);

  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const POISON_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The poison: glowing pink in painted bands, deep magenta in the middle, slow marbled currents,
 * pale lines following the shore and drifting in from it, pale cyan ripple rings spreading where
 * drops fall, bubbles swelling and popping, a bright lip of foam along the shore, the trees' shade on
 * it.
 */
export const POISON_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uLight;
uniform vec2 uTexel;
uniform float uTime;
${NOISE}
${REVEAL}
${JUNGLE}
${CANOPY}
varying vec2 vPos;

vec3 poisonColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 deep = vec3(0.32, 0.025, 0.22);
  vec3 body = vec3(0.86, 0.15, 0.56);
  vec3 lighter = vec3(1.0, 0.4, 0.78);
  vec3 pale = vec3(1.04, 0.7, 0.95);
  vec3 c = mix(deep, body, smoothstep(0.2, 0.28, t));
  c = mix(c, lighter, smoothstep(0.58, 0.64, t));
  return mix(c, pale, smoothstep(0.84, 0.9, t));
}
// Pale lines following the shore at even steps out from it, wavering, drifting in from the shore
// and fading toward the middle: 0..1.
float shoreLines(vec2 p, float waterSD) {
  float band = fract(-waterSD / 13.0 - uTime * 0.07 + (fbm3(p / 48.0) - 0.5) * 0.9);
  float line = 1.0 - smoothstep(0.0, 0.16, band);
  return line * smoothstep(4.0, 12.0, -waterSD) * (1.0 - smoothstep(28.0, 56.0, -waterSD));
}
// Ripple rings round drops falling at random: 0..1 ring strength.
float ripples(vec2 p) {
  vec2 cell = floor(p / 64.0);
  float strength = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      if (hash12(c + 11.0) > 0.55) continue;
      float period = 3.0 + 3.0 * hash12(c);
      float life = fract(uTime / period + hash12(c + 3.0));
      vec2 centre = (c + 0.2 + 0.6 * hash22(c + 7.0)) * 64.0;
      float r = distance(p, centre);
      float radius = 4.0 + life * 26.0;
      float rings = (1.0 - smoothstep(0.5, 1.3, abs(r - radius))) + 0.7 * (1.0 - smoothstep(0.5, 1.2, abs(r - radius * 0.62)));
      strength = max(strength, rings * (1.0 - life) * smoothstep(0.0, 0.08, life));
    }
  }
  return strength;
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 uv = (p - uMin) / uSize;
  vec4 field = texture2D(uField, uv);
  float ground = field.r;
  if (ground > ${WATER_LEVEL.toFixed(1)} + 0.4) discard;
  float waterSD = field.g;
  float depth = smoothstep(0.0, 30.0, -waterSD);

  // Slow currents: marbling warped by a drifting field, so the poison seems to stir in place.
  vec2 warp = vec2(fbm3(p / 90.0 + vec2(uTime * 0.02, 1.7)), fbm3(p / 90.0 + vec2(7.7, -uTime * 0.02)));
  float swirl = fbm3(p / 60.0 + warp * 1.4 + 3.1);

  float heat = 0.68 - depth * 0.38 + (swirl - 0.5) * 0.62 + shoreLines(p, waterSD) * 0.3;
  vec3 col = poisonColor(heat);

  // Bubbles: swell for most of their life, then pop as a widening ring.
  vec2 cell = floor(p / 46.0);
  float period = 2.4 + 2.6 * hash12(cell + 3.0);
  float life = fract(uTime / period + hash12(cell));
  float hasBubble = step(0.6, hash12(cell + 13.0)) * smoothstep(6.0, 16.0, -waterSD);
  vec2 centre = (cell + 0.25 + 0.5 * hash22(cell + 5.0)) * 46.0;
  float r = distance(p, centre);
  float swell = smoothstep(0.0, 0.8, life) * 5.5;
  float dome = (1.0 - smoothstep(swell - 1.0, swell, r)) * step(life, 0.82);
  float pop = smoothstep(0.82, 1.0, life);
  float ring = (1.0 - smoothstep(0.5, 1.4, abs(r - (5.5 + pop * 8.0)))) * step(0.82, life) * (1.0 - pop);
  float glint = (1.0 - smoothstep(0.6, 1.4, distance(p, centre + vec2(-0.35, 0.35) * swell))) * dome;
  col = mix(col, poisonColor(0.95), dome * hasBubble * 0.8);
  col += vec3(0.9, 1.0, 1.1) * (glint * 0.8 + ring * 0.5) * hasBubble;

  // Ripples: pale cyan rings, as the card art draws them.
  col = mix(col, vec3(0.78, 0.96, 1.08), ripples(p) * 0.65 * smoothstep(3.0, 12.0, -waterSD));

  // Foam along the shore, broken here and there.
  float lip = 1.0 - smoothstep(1.2, 3.6, -waterSD);
  float broken = smoothstep(0.35, 0.6, gnoise(p / 14.0 + vec2(0.0, waterSD / 6.0)));
  col = mix(col, vec3(1.06, 0.78, 0.98), lip * mix(0.45, 1.0, broken));

  // The undergrowth's shadow and the trees' shade fall on the poison a little.
  col *= mix(0.78, 1.0, texture2D(uLight, uv).a) * (1.0 - 0.3 * canopyShade(p, ${WATER_LEVEL.toFixed(1)}));

  vec2 edgeUv = min(uv, 1.0 - uv);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
  float front = revealFront();
  col += vec3(1.1, 0.3, 0.85) * smoothstep(front - 0.03, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * A leaf: an instanced strip (three columns across: the midrib between its halves) bent into an arc
 * that leaves the ground at `lift` and curls over by `droop` toward its tip; the halves rise from
 * the midrib by `fold`, so each takes the light as one plane. Rooted on the baked ground, turned to
 * face downhill when it follows the ground, nodding on the breeze, unfurling as the reveal passes,
 * darker in the trees' shade.
 */
export const LEAF_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${CANOPY}
// Root x, y, heading (rad), follow (1: turn to the ground's downhill).
attribute vec4 aRoot;
// Length px, width px, kind, tint.
attribute vec4 aShape;
// Lift, droop, fold (rad), seed 0..1.
attribute vec4 aBend;
varying vec2 vLeaf;
varying vec3 vNormalA;
varying vec3 vNormalB;
varying vec4 vInfo;
varying vec3 vSize;
varying vec2 vUv;
varying float vHeight;
void main() {
  vec2 root = aRoot.xy;
  vec2 uv = clamp((root - uMin) / uSize, 0.0, 1.0);
  float growth = terrainGrowth(root);
  float base = groundAt(uv) * growth * edgeSkirt(uv) - 1.5;

  vec2 own = vec2(cos(aRoot.z), sin(aRoot.z));
  vec4 rootLight = texture2D(uLight, uv);
  vec2 nxy = rootLight.rg * 2.0 - 1.0;
  float slope = length(nxy);
  vec2 downhill = slope > 0.001 ? nxy / slope : own;
  float jitter = (aBend.w - 0.5) * 1.2;
  vec2 turned = mat2(cos(jitter), sin(jitter), -sin(jitter), cos(jitter)) * downhill;
  vec2 heading = normalize(mix(own, turned, aRoot.w * smoothstep(0.02, 0.2, slope)) + vec2(0.00001, 0.0));

  vec3 forward = vec3(heading, 0.0);
  vec3 side = vec3(-heading.y, heading.x, 0.0);
  vec3 up = vec3(0.0, 0.0, 1.0);
  float leafLength = aShape.x * growth;
  float halfWidth = aShape.y * 0.5 * growth;
  float lift = aBend.x + 0.06 * sin(uTime * 1.3 + aBend.w * 40.0 + root.x * 0.01);
  float droop = aBend.y;
  float t = position.y;
  float angle = lift - droop * t;
  vec2 arc = abs(droop) > 0.001 ? vec2(sin(lift) - sin(angle), cos(angle) - cos(lift)) / droop : vec2(cos(lift), sin(lift)) * t;
  vec3 centre = vec3(root, base) + (forward * arc.x + up * arc.y) * leafLength;
  vec3 tangent = forward * cos(angle) + up * sin(angle);
  vec3 normal = cross(tangent, side);
  float fold = aBend.z;
  vec3 halfA = -side * cos(fold) + normal * sin(fold);
  vec3 halfB = side * cos(fold) + normal * sin(fold);
  float across = position.x;
  vec3 pos = centre + (across < 0.0 ? halfA : halfB) * abs(across) * halfWidth;

  vLeaf = vec2(across, t);
  vNormalA = normalize(cross(halfA, tangent));
  vNormalB = normalize(cross(tangent, halfB));
  vInfo = vec4(aShape.z, aShape.w, exp(-max(texture2D(uField, uv).g, 0.0) / 40.0), aBend.w);
  // Px size as drawn (the outline's widths), and the shade at its root: low in the undergrowth, or
  // under a tree.
  float treeShade = canopyShade(root, base + 20.0) * growth;
  vSize = vec3(leafLength, halfWidth, mix(0.72, 1.0, smoothstep(0.2, 0.8, rootLight.b)) * (1.0 - 0.4 * treeShade));
  vUv = uv;
  vHeight = pos.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * A leaf painted like TCG Live's board_grass leaves: one half lit and one in shade either side of a
 * pale midrib, darker veins, a light stroke inside a dark outline, its base deep in shade; teal,
 * deep green, violet or near-black indigo, rimmed and lit pink over the poison. Edges by alpha to
 * coverage, so they stay smooth under the board's multisampling.
 */
export const LEAF_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec2 uMin;
uniform vec2 uSize;
uniform float uReveal;
${PALETTE}
varying vec2 vLeaf;
varying vec3 vNormalA;
varying vec3 vNormalB;
varying vec4 vInfo;
varying vec3 vSize;
varying vec2 vUv;
varying float vHeight;

vec3 leafBase(float tint) {
  if (tint < 0.5) return vec3(0.03, 0.19, 0.17);
  if (tint < 1.5) return vec3(0.014, 0.1, 0.085);
  if (tint < 2.5) return vec3(0.075, 0.045, 0.2);
  return vec3(0.026, 0.022, 0.07);
}
// px inside the leaf's outline (negative outside) at along t, across a (-1..1 of its half width).
float leafEdge(float kind, float t, float a, float leafLength, float halfWidth) {
  float across = abs(a) * halfWidth;
  if (kind < 0.5) return (pow(sin(3.14159 * pow(t, 0.72)), 0.62) * halfWidth - across);
  if (kind < 1.5) return (pow(sin(3.14159 * t), 0.9) * (1.0 - 0.3 * t) * halfWidth - across);
  // A frond: leaflets slanting forward off the rib, shorter toward the tip.
  float envelope = pow(sin(3.14159 * min(t * 1.04, 1.0)), 0.7) * halfWidth - across;
  float spacing = leafLength / 9.0;
  float band = fract((t * leafLength - across * 0.9) / spacing);
  float leaflet = min(band - 0.08, 0.66 - band) * spacing * 0.75;
  float rib = 1.2 - across;
  return max(rib, min(envelope, leaflet));
}

void main() {
  float kind = vInfo.x;
  float t = vLeaf.y;
  float leafLength = vSize.x;
  float halfWidth = vSize.y;
  float edge = leafEdge(kind, t, vLeaf.x, leafLength, halfWidth);
  float aa = max(fwidth(edge), 0.05);
  float coverage = smoothstep(-aa, aa, edge);
  if (coverage < 0.02) discard;

  vec3 n = normalize(vLeaf.x < 0.0 ? vNormalA : vNormalB);
  if (!gl_FrontFacing) n = -n;
  float light = dot(n, normalize(uSun));
  vec3 base = leafBase(vInfo.y) * (0.85 + 0.3 * fract(vInfo.w * 13.1));
  vec3 col = mix(base * 0.42, base, smoothstep(0.12, 0.26, light));
  col = mix(col, base * 1.75 + 0.012, smoothstep(0.6, 0.72, light));
  if (!gl_FrontFacing) col = mix(col, vec3(0.045, 0.02, 0.085), 0.55);

  // Midrib and veins on the broad and pointed leaves; the frond's rib.
  float across = abs(vLeaf.x) * halfWidth;
  float rib = 1.0 - smoothstep(0.5, 1.3, across);
  float veins = (1.0 - smoothstep(0.04, 0.12, fract((t * leafLength - across * 0.7) / max(leafLength / 7.0, 1.0))))
    * step(kind, 1.5) * smoothstep(1.5, 3.0, across);
  col = mix(col, col * 0.7, veins * 0.6);
  col = mix(col, base * 2.1 + 0.02, rib * 0.65);

  // A light stroke inside a dark outline: teal, or pink over the poison.
  vec3 rim = mix(base * 2.4 + vec3(0.03, 0.06, 0.07), vec3(0.9, 0.3, 0.7), smoothstep(0.25, 0.7, vInfo.z));
  col = mix(col, rim, (1.0 - smoothstep(1.2, 2.6, edge)) * 0.55);
  col = mix(col, vec3(0.006, 0.005, 0.018), 1.0 - smoothstep(0.35, 1.1, edge));
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.32, t)) * vSize.z;
  // Leaves standing tall catch the light; low ones sink into the shade.
  col *= mix(0.8, 1.12, smoothstep(0.0, 90.0, vHeight));

  col += POISON_GLOW * vInfo.z * (gl_FrontFacing ? 0.1 : 0.32) * mix(1.0, 0.6, t);
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, coverage);
${OUTPUT}
}
`;

/** Glowing motes rising off the poison, and others drifting up through the jungle like fireflies. */
export const SPORE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${JUNGLE}
attribute vec4 aSeed;
varying float vLife;
varying float vKind;
void main() {
  float period = 4.5 + aSeed.w * 4.0;
  float life = mod(uTime + aSeed.z * period, period) / period;
  float cycle = floor((uTime + aSeed.z * period) / period);
  vec2 jitter = hash22(aSeed.xy * 91.0 + cycle);
  vec2 start;
  float inJungle = 1.0;
  // A share of the spores rise off the bogs, each cycle off a lobe picked at random.
  float lobes = 0.0;
  for (int i = 0; i < ${MAX_BOGS * MAX_BOG_LOBES}; i++) lobes += step(0.001, uBogs[i].z);
  float pick = floor(fract(jitter.x * 17.0) * lobes);
  vec3 lobe = vec3(0.0);
  float seen = 0.0;
  for (int i = 0; i < ${MAX_BOGS * MAX_BOG_LOBES}; i++) {
    if (uBogs[i].z <= 0.0) continue;
    if (seen == pick) lobe = uBogs[i];
    seen += 1.0;
  }
  if (aSeed.w < 0.35 && lobe.z > 0.0) {
    float angle = jitter.x * 6.2831853;
    start = lobe.xy + vec2(cos(angle), sin(angle)) * sqrt(jitter.y) * lobe.z * 0.85;
  } else {
    start = uMin + jitter * uSize;
    inJungle = step(0.0, clearingDistance(start));
  }
  vec3 pos = vec3(start, ${(WATER_LEVEL + 1).toFixed(1)});
  pos.xy += vec2(sin(life * 5.0 + aSeed.x * 30.0), cos(life * 4.0 + aSeed.y * 30.0)) * 12.0 * life;
  pos.z += life * (46.0 + 64.0 * aSeed.y);
  vec2 inside = step(uMin + 30.0, start) * step(start, uMin + uSize - 30.0);
  float shown = revealBurned(start) * exitKeep(start) * inside.x * inside.y * inJungle;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.4 + aSeed.z * 2.2) * (1.0 - life * 0.4);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.4 * shown;
  vLife = life;
  vKind = step(0.8, aSeed.x);
}
`;

export const SPORE_FRAGMENT = /* glsl */ `
varying float vLife;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.3, 0.5, d);
  float glow = exp(-d * d * 3.0) * 0.55;
  float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
  vec3 col = mix(vec3(1.6, 0.4, 1.15), vec3(0.6, 1.3, 1.2), vKind);
  gl_FragColor = vec4(col * (core + glow) * fade, 1.0);
${OUTPUT}
}
`;

const FLOWER_SHADING = /* glsl */ `
// Cel shade for the flowers: shadow, body and highlight bands, a dark outline where the surface
// turns edge-on to the eye.
vec3 celShade(vec3 base, vec3 n, vec3 toEye) {
  float light = dot(n, normalize(uSun));
  vec3 col = mix(base * 0.45, base, smoothstep(0.05, 0.22, light));
  col = mix(col, base * 1.55 + 0.02, smoothstep(0.62, 0.75, light));
  float edgeOn = 1.0 - abs(dot(n, toEye));
  return mix(col, vec3(0.012, 0.006, 0.02), smoothstep(0.78, 0.93, edgeOn));
}
`;

/** Rings and segments round a bell, segments along its stem. */
export const BELL_SEGMENTS = { rings: 8, around: 12, stem: 8 };

/**
 * The drooping bell flowers: an instanced stem and bell. The stem (part 0, a flat ribbon) rises from
 * the bank and arches out over the water; the bell (part 1, a lathe) hangs from its tip, swinging
 * a little on the breeze. Rooted on the baked ground, growing in as the reveal passes.
 */
export const BELL_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
// part (0 stem, 1 bell), s (0..1 up the stem or down the bell), across (-1..1 on the stem) or the
// angle round the bell.
attribute vec3 aPart;
// Root x, y, heading (rad), seed.
attribute vec4 aRoot;
// Stem tip height and reach px, bell radius px.
attribute vec3 aSize;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vPart;
varying float vSeed;
varying float vWater;
varying vec2 vUv;
float bellProfile(float s) {
  return mix(0.24, 1.0, smoothstep(0.0, 0.42, s)) - 0.16 * smoothstep(0.45, 0.85, s) + 0.1 * smoothstep(0.86, 1.0, s);
}
void main() {
  vec2 root = aRoot.xy;
  vec2 uv = clamp((root - uMin) / uSize, 0.0, 1.0);
  float growth = terrainGrowth(root);
  float base = groundAt(uv) * growth * edgeSkirt(uv) - 1.0;
  vec3 forward = vec3(cos(aRoot.z), sin(aRoot.z), 0.0);
  vec3 side = vec3(-forward.y, forward.x, 0.0);
  vec3 up = vec3(0.0, 0.0, 1.0);
  float height = aSize.x * growth;
  float reach = aSize.y * growth;
  float radius = aSize.z * growth;
  float swing = sin(uTime * 1.1 + aRoot.w * 30.0) * 0.08;
  vec3 p0 = vec3(root, base);
  vec3 p1 = p0 + up * height * 1.2 + forward * reach * 0.1;
  vec3 p2 = p0 + up * height + forward * reach + side * swing * reach;
  vec3 pos;
  vec3 normal;
  if (aPart.x < 0.5) {
    float t = aPart.y;
    vec3 tangent = normalize(mix(p1 - p0, p2 - p1, t) + vec3(0.0, 0.0, 0.0001));
    vec3 across = cross(tangent, up);
    across = length(across) > 0.001 ? normalize(across) : side;
    pos = mix(mix(p0, p1, t), mix(p1, p2, t), t) + across * aPart.z * mix(1.5, 1.0, t) * growth;
    normal = normalize(cross(across, tangent));
  } else {
    // The bell hangs from the stem's tip, tipped a little outward and swinging.
    vec3 axis = normalize(-up + forward * 0.35 + side * swing * 2.0);
    vec3 u = normalize(cross(axis, side));
    vec3 v = cross(axis, u);
    float s = aPart.y;
    vec3 radial = u * cos(aPart.z) + v * sin(aPart.z);
    float slope = (bellProfile(s + 0.01) - bellProfile(s - 0.01)) / 0.02;
    pos = p2 + axis * (s * radius * 1.5 + radius * 0.15) + radial * radius * bellProfile(s);
    normal = normalize(radial * 1.5 - axis * slope);
  }
  vNormal = normal;
  vPos = pos;
  vPart = aPart;
  vSeed = aRoot.w;
  vWater = exp(-max(texture2D(uField, uv).g, 0.0) / 40.0);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * A drooping bell, painted as in the card art: a green cap, the body mauve-pink deepening from its
 * shoulder, green stripes running down it, a pale pink mouth; the stem dark magenta. Lit pink from
 * the poison below.
 */
export const BELL_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uEye;
${PALETTE}
${FLOWER_SHADING}
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vPart;
varying float vSeed;
varying float vWater;
varying vec2 vUv;
void main() {
  vec3 toEye = normalize(uEye - vPos);
  vec3 n = normalize(vNormal);
  if (dot(n, toEye) < 0.0) n = -n;
  vec3 base;
  if (vPart.x < 0.5) {
    base = vec3(0.2, 0.035, 0.16);
  } else {
    float s = vPart.y;
    vec3 body = mix(vec3(0.5, 0.1, 0.34), vec3(0.85, 0.22, 0.55), smoothstep(0.2, 0.9, s)) * (0.9 + 0.2 * vSeed);
    body = mix(body, vec3(1.0, 0.5, 0.8), smoothstep(0.88, 1.0, s));
    float stripe = smoothstep(0.82, 0.96, cos(vPart.z * 6.0)) * smoothstep(0.12, 0.3, s) * (1.0 - smoothstep(0.8, 0.95, s));
    body = mix(body, vec3(0.05, 0.17, 0.12), stripe * 0.8);
    base = mix(vec3(0.06, 0.24, 0.13), body, smoothstep(0.1, 0.22, s));
  }
  vec3 col = celShade(base, n, toEye);
  col += POISON_GLOW * vWater * 0.3 * max(-n.z, 0.0);
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Rings up a flower spike and segments round it. */
export const SPIKE_SEGMENTS = { rings: 14, around: 10 };

/**
 * A flower spike: an instanced lathe, a short green stalk under a spire of florets tapering to its
 * tip, leaning a little, nodding on the breeze, rising as the reveal passes.
 */
export const SPIKE_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
// s (0..1 up the spike), angle round it.
attribute vec2 aCone;
// Root x, y, the heading it leans to (rad), seed.
attribute vec4 aRoot;
// Height px, base radius px, lean (rad).
attribute vec3 aSize;
varying vec3 vNormal;
varying vec3 vPos;
varying vec2 vCone;
varying float vSeed;
varying float vWater;
varying vec2 vUv;
// The spike's radius up its height, a share of its base radius: a short stalk, then the spire.
float spireProfile(float s) {
  float spire = pow(max(1.0 - (s - 0.12) / 0.88, 0.0), 0.75);
  return s < 0.12 ? 0.22 : max(spire * mix(0.85, 1.0, smoothstep(0.12, 0.3, s)), 0.02);
}
void main() {
  vec2 root = aRoot.xy;
  vec2 uv = clamp((root - uMin) / uSize, 0.0, 1.0);
  float growth = terrainGrowth(root);
  float base = groundAt(uv) * growth * edgeSkirt(uv) - 1.0;
  float lean = aSize.z + 0.04 * sin(uTime * 0.9 + aRoot.w * 20.0);
  vec3 leanTo = vec3(cos(aRoot.z), sin(aRoot.z), 0.0);
  vec3 axis = normalize(vec3(0.0, 0.0, 1.0) + leanTo * lean);
  vec3 u = normalize(cross(axis, vec3(-leanTo.y, leanTo.x, 0.0)));
  vec3 v = cross(axis, u);
  float s = aCone.x;
  float height = aSize.x * growth;
  float radius = aSize.y * growth;
  vec3 radial = u * cos(aCone.y) + v * sin(aCone.y);
  float slope = (spireProfile(s + 0.01) - spireProfile(s - 0.01)) / 0.02 * radius / max(height, 0.001);
  vec3 pos = vec3(root, base) + axis * s * height + radial * radius * spireProfile(s);
  vNormal = normalize(radial - axis * slope);
  vPos = pos;
  vCone = aCone;
  vSeed = aRoot.w;
  vWater = exp(-max(texture2D(uField, uv).g, 0.0) / 40.0);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * Florets in tiers up the spire, hot pink to pale at the tip, deep magenta between them; a green
 * stalk below.
 */
export const SPIKE_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uEye;
${PALETTE}
${FLOWER_SHADING}
varying vec3 vNormal;
varying vec3 vPos;
varying vec2 vCone;
varying float vSeed;
varying float vWater;
varying vec2 vUv;
void main() {
  vec3 toEye = normalize(uEye - vPos);
  vec3 n = normalize(vNormal);
  if (dot(n, toEye) < 0.0) n = -n;
  float s = vCone.x;
  float tier = (s - 0.12) / 0.88 * 11.0;
  float row = floor(tier);
  float around = vCone.y / 6.2831853 * 7.0 + (mod(row, 2.0) < 0.5 ? 0.0 : 0.5);
  vec2 cell = vec2(fract(around), fract(tier)) - 0.5;
  float floret = 1.0 - smoothstep(0.28, 0.46, length(cell));
  vec3 pink = mix(vec3(0.78, 0.12, 0.46), vec3(1.05, 0.5, 0.82), smoothstep(0.3, 1.0, s)) * (0.9 + 0.2 * vSeed);
  vec3 base = mix(vec3(0.26, 0.03, 0.18), pink, floret);
  base = mix(vec3(0.05, 0.2, 0.12), base, step(0.12, s));
  vec3 col = celShade(base, n, toEye);
  col += POISON_GLOW * vWater * 0.18;
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Shared by the trees' vertex shaders: a part placed off its tree's root, grown in with the reveal. */
const TREE_PLACE = /* glsl */ `
// A point given px off the ground at the tree's root (root x, y), on the baked ground, the whole
// tree scaled up from its root as the reveal passes.
vec3 onTree(vec2 root, vec3 local, out vec2 uv) {
  uv = clamp((root - uMin) / uSize, 0.0, 1.0);
  float growth = terrainGrowth(root);
  vec3 grown = vec3(root, 0.0) + (local - vec3(root, 0.0)) * growth;
  grown.z += groundAt(uv) * growth * edgeSkirt(uv);
  return grown;
}
`;

/**
 * A trunk or branch: an instanced tube along a quadratic curve, tapering from its foot to its end;
 * the trunk's foot swells into five buttress roots.
 */
export const LIMB_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${TREE_PLACE}
// s (0..1 along the limb), angle round it.
attribute vec2 aLathe;
// The tree's root x, y; seed; flare (1: the trunk).
attribute vec4 aRoot;
// Foot x, y, z (px off the ground at the root), radius px.
attribute vec4 aFrom;
// The curve's control point x, y, z.
attribute vec4 aVia;
// End x, y, z, radius px.
attribute vec4 aTo;
varying vec3 vNormal;
varying vec3 vPos;
varying vec2 vLathe;
varying vec3 vInfo;
varying vec2 vUv;
void main() {
  float s = aLathe.x;
  vec3 a = aFrom.xyz;
  vec3 b = aVia.xyz;
  vec3 c = aTo.xyz;
  vec3 spine = mix(mix(a, b, s), mix(b, c, s), s);
  vec3 tangent = normalize(mix(b - a, c - b, s) + vec3(0.0, 0.0, 0.0001));
  vec3 side = cross(tangent, vec3(0.0, 0.0, 1.0));
  side = length(side) > 0.01 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  vec3 bin = cross(side, tangent);
  float angle = aLathe.y;
  vec3 radial = side * cos(angle) + bin * sin(angle);
  float radius = mix(aFrom.w, aTo.w, s);
  // Buttress roots: five flanges swelling out of the trunk's foot.
  float flange = 0.5 + 0.5 * cos(angle * 5.0 + aRoot.z * 6.2831853);
  float rise = max(spine.z - a.z, 0.0);
  radius *= 1.0 + aRoot.w * 0.9 * exp(-rise / 15.0) * (0.15 + 0.85 * flange);
  vec2 uv;
  vec3 pos = onTree(aRoot.xy, spine + radial * radius, uv);
  vNormal = normalize(radial + vec3(0.0, 0.0, aRoot.w * 0.7 * exp(-rise / 15.0)));
  vPos = pos;
  vLathe = aLathe;
  vInfo = vec3(aRoot.z, aRoot.w, exp(-max(texture2D(uField, uv).g, 0.0) / 60.0));
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * Bark, painted: violet, ridged along the limb, lavender where the sun catches it, a dark outline,
 * moss on the upper faces; the trunk darkening up into its crown's shade, lit pink near the poison.
 */
export const LIMB_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uEye;
${NOISE}
${PALETTE}
${FLOWER_SHADING}
varying vec3 vNormal;
varying vec3 vPos;
varying vec2 vLathe;
varying vec3 vInfo;
varying vec2 vUv;
void main() {
  vec3 toEye = normalize(uEye - vPos);
  vec3 n = normalize(vNormal);
  float s = vLathe.x;
  float ridges = sin(vLathe.y * 8.0 + s * 5.0 * (1.0 + vInfo.x) + 1.6 * sin(s * 11.0 + vLathe.y * 2.0 + vInfo.x * 9.0));
  vec3 bark = mix(vec3(0.13, 0.07, 0.22), vec3(0.055, 0.028, 0.1), smoothstep(0.4, 0.85, ridges));
  float mossy = smoothstep(0.5, 0.8, n.z) * smoothstep(0.45, 0.6, gnoise(vPos.xy / 14.0 + vPos.z / 20.0));
  bark = mix(bark, vec3(0.03, 0.15, 0.12), mossy);
  vec3 col = celShade(bark, n, toEye);
  float underCrown = vInfo.y > 0.5 ? smoothstep(0.3, 1.0, s) : 0.85;
  col *= 1.0 - 0.5 * underCrown;
  col += POISON_GLOW * vInfo.z * 0.4 * (1.0 - abs(n.z)) * (1.0 - underCrown);
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * One clump of a crown's foliage: an instanced sphere, flattened a little and lumpy, scaled up from
 * its tree's root as the reveal passes.
 */
export const CROWN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${TREE_PLACE}
// The unit sphere.
attribute vec3 aSphere;
// The tree's root x, y; seed; palette (0 teal, 1 violet).
attribute vec4 aRoot;
// Centre x, y, z (px off the ground at the root), radius px.
attribute vec4 aPuff;
// Shade 0..1 (0 low and deep in the crown).
attribute float aShade;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec4 vInfo;
varying float vRadius;
varying vec2 vUv;
void main() {
  vec3 dir = aSphere;
  float lumps = sin(dir.x * 4.1 + aRoot.z * 20.0) * sin(dir.y * 3.7 + aPuff.x * 0.05) * sin(dir.z * 3.3 + 1.0);
  vec3 offset = dir * aPuff.w * (1.0 + 0.12 * lumps);
  offset.z *= 0.84;
  vec2 uv;
  vec3 pos = onTree(aRoot.xy, aPuff.xyz + offset, uv);
  vNormal = normalize(dir * vec3(1.0, 1.0, 1.0 / 0.84));
  vPos = pos;
  vSphere = dir;
  vInfo = vec4(aRoot.z, aRoot.w, aShade, exp(-max(texture2D(uField, uv).g, 0.0) / 60.0));
  vRadius = aPuff.w;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * Foliage blocked in as a painter does: round leaf clusters packed over each clump (one per cell of
 * a pattern over it), each bulging like a little dome so it takes the light on its own sunward side,
 * dark hollows between them; deep teal or blue-violet in three flat bands, darker low and deep in the
 * crown, a dark outline where it turns edge-on, lit pink from below near the poison.
 */
export const CROWN_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uEye;
${NOISE}
${VORONOI}
${PALETTE}
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec4 vInfo;
varying float vRadius;
varying vec2 vUv;
void main() {
  vec3 toEye = normalize(uEye - vPos);
  vec3 n = normalize(vNormal);
  vec2 q = vSphere.xy / (1.3 + vSphere.z) * (1.0 + vRadius / 13.0) + vInfo.x * 17.0;
  vec4 cluster = voronoiCell(q);
  float fromCentre = length(cluster.zw);
  float size = 0.5 + 0.2 * fract(cluster.y * 13.0);
  float inCluster = 1.0 - smoothstep(size - 0.08, size, fromCentre);
  vec3 bulged = normalize(n - vec3(cluster.zw / size, 0.0) * 0.55 * inCluster);
  float light = dot(bulged, normalize(uSun));
  vec3 base = (vInfo.y < 0.5 ? vec3(0.03, 0.16, 0.15) : vec3(0.065, 0.06, 0.22)) * (0.9 + 0.2 * fract(cluster.y * 7.0));
  vec3 col = mix(base * 0.4, base, smoothstep(0.05, 0.2, light));
  col = mix(col, base * 1.8 + vec3(0.02, 0.04, 0.05), smoothstep(0.6, 0.72, light));
  col *= mix(0.5, 1.0, inCluster);
  col *= mix(0.5, 1.0, vInfo.z);
  float edgeOn = 1.0 - abs(dot(n, toEye));
  col = mix(col, vec3(0.006, 0.008, 0.024), smoothstep(0.7, 0.88, edgeOn));
  col += POISON_GLOW * vInfo.w * 0.35 * max(-n.z, 0.0);
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * A cluster hanging from a crown on its vine: an instanced ribbon turned to face the eye, swaying
 * from its anchor.
 */
export const VINE_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${TREE_PLACE}
// across (-1..1), t (0 at the anchor, 1 at the tip).
attribute vec2 aStrip;
// The tree's root x, y; seed; width px.
attribute vec4 aRoot;
// Anchor x, y, z (px off the ground at the root), length px.
attribute vec4 aVine;
varying vec2 vStrip;
varying vec3 vInfo;
varying vec2 vUv;
void main() {
  float t = aStrip.y;
  float sway = sin(uTime * 0.9 + aRoot.z * 30.0) * 5.0 * t * t;
  vec3 centre = aVine.xyz + vec3(sway * 0.6, sway * 0.4, -aVine.w * t);
  vec3 toEye = uEye - centre;
  vec3 across = cross(vec3(0.0, 0.0, 1.0), toEye);
  across = length(across) > 0.001 ? normalize(across) : vec3(1.0, 0.0, 0.0);
  vec2 uv;
  vec3 pos = onTree(aRoot.xy, centre + across * aStrip.x * aRoot.w * 0.5, uv);
  vStrip = aStrip;
  vInfo = vec3(aRoot.z, aVine.w, aRoot.w);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * A hanging cluster as the card art paints them: a chain of berries, smaller toward the tip, each
 * cel-shaded dark violet to magenta with a pink highlight and a dark outline. Edges by alpha to
 * coverage.
 */
export const VINE_FRAGMENT = /* glsl */ `
uniform vec2 uMin;
uniform vec2 uSize;
${PALETTE}
varying vec2 vStrip;
varying vec3 vInfo;
varying vec2 vUv;
// A bead's radius px: its share of the half width, smaller toward the tip.
float beadRadius(float index, float halfPx, float spacing, float lengthPx) {
  float t = clamp(index * spacing / lengthPx, 0.0, 1.0);
  return halfPx * mix(1.0, 0.45, t) * (0.72 + 0.28 * fract(sin(index * 12.9898 + vInfo.x * 78.233) * 43758.5453));
}
void main() {
  float lengthPx = vInfo.y;
  float halfPx = vInfo.z * 0.5;
  float along = vStrip.y * lengthPx;
  float across = vStrip.x * halfPx;
  float spacing = halfPx * 1.25;
  float nearest = floor(along / spacing + 0.5);
  // The nearest bead and its neighbours, so overlapping beads join into one cluster.
  float edge = -100.0;
  vec2 local = vec2(0.0);
  for (int k = -1; k <= 1; k++) {
    float index = nearest + float(k);
    if (index < 0.0 || index * spacing > lengthPx) continue;
    float radius = beadRadius(index, halfPx, spacing, lengthPx);
    float inside = radius - length(vec2(across, along - index * spacing));
    if (inside > edge) {
      edge = inside;
      local = vec2(across, along - index * spacing) / radius;
    }
  }
  float aa = max(fwidth(edge), 0.05);
  float coverage = smoothstep(-aa, aa, edge);
  if (coverage < 0.02) discard;
  // Each berry a ball lit from above and to one side (down the strip is down).
  vec3 n = vec3(local.x, -local.y, sqrt(max(1.0 - dot(local, local), 0.0)));
  float light = dot(n, normalize(vec3(-0.45, 0.5, 0.75)));
  vec3 col = mix(vec3(0.05, 0.015, 0.08), vec3(0.3, 0.06, 0.28), smoothstep(0.2, 0.35, light));
  col = mix(col, vec3(0.95, 0.36, 0.75), smoothstep(0.76, 0.86, light));
  col = mix(col, vec3(0.02, 0.008, 0.035), smoothstep(0.8, 0.95, length(local)));
  col = edgeHaze(col, vUv);
  gl_FragColor = vec4(col, coverage);
${OUTPUT}
}
`;
