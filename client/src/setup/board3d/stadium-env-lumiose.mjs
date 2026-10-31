// Design 077 (prototype): Lumiose City (customhb-351) after its card art (POR 77, Marina Chikazawa)
// and the city of the games (Pokemon X and Y, Legends Z-A): a Parisian plaza on a bright day, pale
// stone paving inlaid with the plaza's compass of rings and spokes, a band of blue-grey setts along the
// building fronts, long lawn beds in salmon-tan curbs, trimmed street trees in iron grates, black iron
// lampposts hung with green banners, cafe tables under striped parasols, cream and taupe stone blocks
// five to seven floors high with iron balconies, shopfronts and steep slate mansard roofs with dormers
// (a dark purple one carries a big screen, one a Poke Ball sign over the Pokemon Center's red awning),
// and the white lattice Prism Tower standing over it all. The art looks down the avenue at the tower;
// the board looks down on the plaza, so the plaza holds every card, the beds, trees, lamps, benches and
// cafes stand in the strips either side of it, the buildings rise in rows beyond them and across the
// far end (their faces to the cards), and the tower stands in the left strip a little past its middle, leaning
// off the top of the view, its lattice shadow laid across the paving.
// World scale: a card's footprint is a paving slab; a floor of the buildings is about half a card
// high; the tower is four and a half cards tall.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the buildings' blocks, so the shared light bake
// casts their sun shadows and darkens their feet), G px from the plaza's edge (negative on it), B
// the bed mask, A the kind (0 street, 1 plaza, 2 bed). The ground stays flat: this board's terrain
// vertex shader ignores the height. Per frame: TERRAIN paints the paving, its inlay, the setts, the beds,
// the tree grates, the street, the baked shadows and the tower's; PROPS the buildings, trees, lamps,
// benches, cafes and the tower (stadium-env-props).
import {
  FILTERING,
  FOOTPRINTS,
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
} from './stadium-environment-glsl.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { disc, wallBand, windowRun } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, BOX_SHADOW, EDGE_HAZE, PAVING } from './stadium-env-surfaces.mjs';

export const LUMIOSE_KEY = 'lumiose-city';
/** The bright day's sun (toward it, table frame): high from the far left, so the buildings' shadows fall across the plaza. */
export const LUMIOSE_SUN = Object.freeze([-0.55, 0.32, 0.77]);
/** The strips of plaza either side of the cards, and the least gap kept between a prop's foot and a card. */
export const STRIP_PX = 250;
export const MAX_BUILDINGS = 20;
export const MAX_TREES = 8;
export const MAX_LAMPS = 10;
export const MAX_BEDS = 2;
export const MAX_CAFES = 3;
const BUILDING_GAP_PX = 14;
/** The Prism Tower's height in card-scale px. */
export const TOWER_HEIGHT_PX = 460;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The Prism Tower's radius at share `s` (0 foot, 1 tip) of its height `h`: legs flaring from the foot, a
 * slim waist, a swollen crown, closing to the spire. The terrain shader's `towerRadius` is its twin.
 */
export const towerRadius = (s, h) => h * (0.036 + 0.082 * Math.exp(-s * 9) + 0.034 * Math.exp(-(((s - 0.83) / 0.1) ** 2))) * (1 - smoothstep(0.93, 1, s));

/** The wall palettes (aColor, linear): cream, taupe, pale stone, sand, purple-grey brick, rose, dark purple (the screen's building). */
const WALLS = [
  [0.77, 0.657, 0.519],
  [0.62, 0.5, 0.4],
  [0.7, 0.66, 0.62],
  [0.68, 0.53, 0.3],
  [0.302, 0.249, 0.345],
  [0.592, 0.345, 0.302],
  [0.142, 0.105, 0.221],
];
const DARK_PURPLE = 6;
/** The palettes the plain blocks draw from: limestone, taupe, pale stone, sand, limestone, taupe. */
const FACADES = [0, 1, 2, 3, 0, 1];
/** The roofs: a steep slope in slate, a shallow top in zinc; blue-grey, patina green, dark violet, terracotta. */
const ROOFS = [
  { steep: [0.116, 0.133, 0.184], top: [0.235, 0.286, 0.372] },
  { steep: [0.24, 0.42, 0.33], top: [0.345, 0.519, 0.392] },
  { steep: [0.15, 0.13, 0.2], top: [0.28, 0.27, 0.36] },
  { steep: [0.36, 0.13, 0.09], top: [0.442, 0.18, 0.12] },
];
/** aColor w of a roof's slates (courses across the slope) and of its zinc (seams down it). */
const SLATE = 0.07;
const ZINC = 0.08;

/**
 * Lumiose City's layout: the plaza, the beds, trees, lamps, benches and cafes in its strips, the rows of
 * buildings, the Prism Tower. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function lumioseSpots(layout) {
  const ctx = boardContext(layout, LUMIOSE_KEY);
  if (!ctx) return null;
  const { scene, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const strip = STRIP_PX * u;
  const square = { x0: core.x - strip, x1: core.x + core.w + strip, y0: core.y - 70 * u, y1: handEnd + 60 * u };
  // Buildings: rows down both sides, then across the far end; each block a few floors, its face to the plaza.
  const buildings = [];
  const along = (from, to, make) => {
    let at = from;
    let k = 0;
    while (at < to - 60 * u && buildings.length < MAX_BUILDINGS) {
      const roll = (salt) => hash(at, k, salt);
      const len = (190 + 80 * roll(1)) * u;
      make(at, Math.min(len, to - at), roll, k);
      at += len + BUILDING_GAP_PX * u;
      k += 1;
    }
  };
  const depth = 250 * u;
  const base = (roll) => ({ palette: FACADES[Math.floor(roll(3) * FACADES.length)], roof: Math.floor(roll(5) * ROOFS.length), seed: roll(4), role: null });
  for (const side of [-1, 1]) {
    const edge = side < 0 ? square.x0 : square.x1;
    along(scene.y + 20 * u, scene.y + scene.h - 10 * u, (y, len, roll) => {
      const floors = 5 + Math.floor(roll(2) * 3);
      const box = { x0: side < 0 ? edge - depth : edge, x1: side < 0 ? edge : edge + depth, y0: y, y1: y + len };
      buildings.push({ ...box, ...base(roll), side, floors, height: (floors * 50 + 20) * u, face: side < 0 ? 'right' : 'left' });
    });
  }
  // The Pokemon Center in the left row and the screen's dark purple corner in the right.
  const left = buildings.filter((b) => b.side < 0);
  const right = buildings.filter((b) => b.side > 0);
  if (left.length) Object.assign(left[Math.min(2, left.length - 1)], { role: 'center', palette: 0, roof: 0 });
  if (right.length) Object.assign(right[Math.min(1, right.length - 1)], { role: 'screen', palette: DARK_PURPLE, roof: 2 });
  // Across the far end, lower, beyond the opponent's hand, between the two rows.
  const farY = square.y1 + 20 * u;
  along(square.x0 + 40 * u, square.x1 - 40 * u, (x, len, roll) => {
    if (buildings.length >= MAX_BUILDINGS) return;
    const floors = 4 + Math.floor(roll(2) * 3);
    buildings.push({ x0: x, x1: x + len, y0: farY, y1: farY + 200 * u, ...base(roll), side: 0, floors, height: (floors * 50 + 20) * u, face: 'near' });
  });
  // The beds: grass in a salmon curb, a long rectangle down each strip's middle, the near half of it.
  const beds = [-1, 1].map((side) => {
    const x = side < 0 ? square.x0 + strip * 0.52 : square.x1 - strip * 0.52;
    return { x0: x - 20 * u, x1: x + 20 * u, y0: core.y + core.h * 0.06, y1: core.y + core.h * (side < 0 ? 0.4 : 0.56) };
  });
  // Trees at the strips' outer edge, lamps along their inner edge, benches between.
  const trees = [];
  const lamps = [];
  const benches = [];
  const treeShares = { '-1': [0.1, 0.3, 0.88], 1: [0.1, 0.34, 0.58, 0.82] };
  const benchShares = { '-1': [0.2, 0.45], 1: [0.22, 0.56] };
  for (const side of [-1, 1]) {
    const outer = side < 0 ? square.x0 + 36 * u : square.x1 - 36 * u;
    const inner = side < 0 ? square.x0 + strip * 0.88 : square.x1 - strip * 0.88;
    treeShares[side].forEach((share, k) => {
      trees.push({ x: outer, y: core.y + core.h * share, r: (42 + 10 * hash(side, k, 1)) * u, h: (78 + 20 * hash(side, k, 2)) * u, seed: hash(side, k, 3) });
    });
    for (let k = 0; k < 4; k += 1) {
      lamps.push({ x: inner, y: core.y + core.h * (0.05 + 0.3 * k), h: 118 * u, side });
    }
    for (const share of benchShares[side]) {
      benches.push({ x: inner, y: core.y + core.h * share, side, w: 14 * u, d: 50 * u });
    }
  }
  // Cafe tables under parasols in the right strip's far half.
  const cafes = [0.68, 0.9].map((share, k) => ({ x: square.x1 - strip * 0.5, y: core.y + core.h * share, r: 36 * u, seed: hash(share, k, 7), k }));
  const keep = (list, r) => list.filter((item) => ctx.clear(item.x, item.y, typeof r === 'function' ? r(item) : r, 10 * u));
  const keptTrees = keep(trees, (t) => t.r).slice(0, MAX_TREES);
  // The tower: in the left strip a little past its middle, its foot clear of the cards, its crown leaning up toward the view's corner.
  const h = TOWER_HEIGHT_PX * u;
  const tower = { x: core.x - strip * 0.5, y: core.y + core.h * 0.62, h, r: towerRadius(0, h) };
  return {
    ...ctx,
    handEnd,
    square,
    buildings,
    beds,
    trees: keptTrees,
    pits: keptTrees.map((t) => ({ x: t.x, y: t.y, half: 11 * u })),
    lamps: keep(lamps, 8 * u).slice(0, MAX_LAMPS),
    benches: keep(benches, 26 * u),
    cafes: keep(cafes, (c) => c.r).slice(0, MAX_CAFES),
    tower,
    medal: { x: centre.x, y: centre.y, r: core.w * 0.4 },
    strip,
    centre,
  };
}

const LUMIOSE = /* glsl */ `
// The plaza (x0, y0, x1, y1); the beds (x0, y0, x1, y1), the tree grates (x, y, half size), the scale of a card (u).
uniform vec4 uSquare;
uniform vec4 uBeds[${MAX_BEDS}];
uniform vec4 uPits[${MAX_TREES}];
uniform float uUnit;
// Every building (x0, y0, x1, y1) and its height.
uniform vec4 uBlocks[${MAX_BUILDINGS}];
uniform float uBlockHeights[${MAX_BUILDINGS}];
float squareDistance(vec2 p) {
  vec2 centre = (uSquare.xy + uSquare.zw) * 0.5;
  vec2 q = abs(p - centre) - (uSquare.zw - uSquare.xy) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// px from p to a bed's rectangle, negative inside.
float bedDistance(vec2 p, vec4 bed) {
  if (bed.z <= bed.x) return 1e5;
  vec2 centre = (bed.xy + bed.zw) * 0.5;
  vec2 q = abs(p - centre) - (bed.zw - bed.xy) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
`;

/** Bake: the buildings' blocks (their heights, for the light bake's shadows); the plaza and beds as masks. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${LUMIOSE}
void main() {
  vec2 p = uMin + vUv * uSize;
  float h = 0.0;
  for (int i = 0; i < ${MAX_BUILDINGS}; i++) {
    vec4 block = uBlocks[i];
    if (block.z <= block.x) continue;
    if (p.x > block.x && p.x < block.z && p.y > block.y && p.y < block.w) h = max(h, uBlockHeights[i]);
  }
  float sd = squareDistance(p);
  float bed = 1e5;
  for (int i = 0; i < ${MAX_BEDS}; i++) bed = min(bed, bedDistance(p, uBeds[i]));
  float kind = bed < 0.0 ? 2.0 : (sd < 0.0 ? 1.0 : 0.0);
  gl_FragColor = vec4(h, sd, bed, kind);
}
`;

/**
 * Bake 2: the buildings' sun shadows worked out exactly (a ray from the ground toward the sun against
 * every block, over a dozen taps across the sun's disc, so the edges are smooth however tall the
 * block), and occlusion in the blocks' feet. R, G: a flat ground's normal; B: occlusion; A: sun.
 */
export const BAKE_LIGHT_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform vec3 uSun;
varying vec2 vUv;
${LUMIOSE}
${BOX_SHADOW}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec3 sun = normalize(uSun);
  float shade = 0.0;
  for (int i = 0; i < ${MAX_BUILDINGS}; i++) {
    vec4 block = uBlocks[i];
    if (block.z <= block.x) continue;
    // Skip a block whose shadow cannot reach p: its farthest reach along the sun's way.
    float reach = uBlockHeights[i] * length(sun.xy) / sun.z + 40.0;
    vec2 nearest = clamp(p, block.xy, block.zw);
    if (distance(p, nearest) > reach) continue;
    shade = max(shade, boxShadow(vec3(p, 0.0), sun, block, uBlockHeights[i]));
  }
  float occlusion = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float radius = ring == 0 ? 6.0 : (ring == 1 ? 14.0 : 30.0);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.7853982 + float(ring) * 0.39;
      vec2 q = vUv + vec2(cos(angle), sin(angle)) * radius / uSize;
      occlusion += clamp(texture2D(uField, q).r / 40.0, 0.0, 1.0);
    }
  }
  gl_FragColor = vec4(0.5, 0.5, 1.0 - clamp(occlusion / 24.0, 0.0, 1.0) * 0.9, 1.0 - shade);
}
`;

/** The terrain grid: the ground stays flat (the field's heights are the buildings', which the props draw). */
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
  vPos = p;
  vUv = (p - uMin) / uSize;
  vGrowth = terrainGrowth(p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

// The card art's colours (pixel samples, inverted through Neutral tone mapping), the paving a shade
// darker than the art's so white card borders keep their edges.
const PALETTE = /* glsl */ `
// Design 080: the plaza a step darker than the art's pale stone, so white card borders keep their edge.
const vec3 SLAB = vec3(0.42, 0.392, 0.344);
const vec3 SLAB_LO = vec3(0.3, 0.284, 0.256);
const vec3 SLAB_HI = vec3(0.6, 0.57, 0.515);
const vec3 INLAY = vec3(0.33, 0.345, 0.4);
const vec3 SETT = vec3(0.345, 0.372, 0.442);
const vec3 CURB = vec3(0.698, 0.485, 0.382);
const vec3 CURB_CAP = vec3(0.817, 0.74, 0.66);
const vec3 BED_GRASS = vec3(0.196, 0.416, 0.101);
const vec3 BED_GRASS_DARK = vec3(0.09, 0.22, 0.07);
const vec3 PETAL_PINK = vec3(0.836, 0.168, 0.264);
const vec3 PETAL_YELLOW = vec3(1.008, 0.752, 0.095);
const vec3 PETAL_WHITE = vec3(0.92, 0.9, 0.88);
const vec3 GRATE = vec3(0.05, 0.05, 0.058);
const vec3 ASPHALT = vec3(0.129, 0.133, 0.157);
const vec3 SHADE_TINT = vec3(0.58, 0.68, 0.98);
`;

/** The Prism Tower's and the plaza's inlay: the tower (x, y, height, foot radius) and the compass (x, y, radius). */
const TOWER_GLSL = /* glsl */ `
uniform vec4 uTower;
uniform vec3 uMedal;
float towerRadius(float s) {
  float q = (s - 0.83) / 0.1;
  return uTower.z * (0.036 + 0.082 * exp(-s * 9.0) + 0.034 * exp(-q * q)) * (1.0 - smoothstep(0.93, 1.0, s));
}
// The tower's shadow on the ground at p, 0..1: its axis cast from the foot away from the sun, the lattice
// leaving gaps: the legs along its edges, a ring every cell and the braces crossing between them.
float towerShadow(vec2 p, vec3 sun) {
  if (uTower.z <= 0.0) return 0.0;
  vec2 dir = -sun.xy / sun.z;
  vec2 rel = p - uTower.xy;
  // Only the ground the tower's height reaches: past its tip there is no shadow.
  float reach = dot(rel, dir) / dot(dir, dir);
  if (reach > uTower.z) return 0.0;
  float z = max(reach, 0.0);
  vec2 off = rel - dir * z;
  float side = dot(off, vec2(-dir.y, dir.x)) / length(dir);
  float s = z / uTower.z;
  float r = max(towerRadius(s) * 0.92, 1.5);
  float body = 1.0 - smoothstep(r * 0.92, r * 1.12, abs(side));
  float cell = uTower.z * 0.05;
  float f = fract(z / cell);
  float across = side / r;
  float leg = smoothstep(0.66, 0.8, abs(across));
  float ring = 1.0 - smoothstep(0.06, 0.15, f);
  float brace = max(1.0 - smoothstep(0.08, 0.2, abs(across - (2.0 * f - 1.0))), 1.0 - smoothstep(0.08, 0.2, abs(across + (2.0 * f - 1.0))));
  float lattice = max(leg, max(ring, brace * 0.9));
  // Glass panels fill the long window in the shaft's middle.
  float glass = smoothstep(0.3, 0.34, s) * (1.0 - smoothstep(0.66, 0.7, s)) * 0.5;
  return body * max(lattice, glass) * (1.0 - 0.25 * smoothstep(0.5, 1.0, s));
}
// Two rings of inlay round the tower's foot.
float towerFoot(vec2 p) {
  if (uTower.w <= 0.0) return 0.0;
  float r = distance(p, uTower.xy);
  float w0 = 0.8 * uUnit;
  float w1 = 2.2 * uUnit;
  return max(1.0 - smoothstep(w0, w1, abs(r - uTower.w * 1.5)), 1.0 - smoothstep(w0, w1, abs(r - uTower.w * 1.78)));
}
// The plaza's compass: two rings, eight spokes between them and the outer ring, a hub, in inlaid stone.
float medallion(vec2 p) {
  if (uMedal.z <= 0.0) return 0.0;
  vec2 rel = p - uMedal.xy;
  float r = length(rel);
  float w0 = 0.8 * uUnit;
  float w1 = 2.2 * uUnit;
  float rings = max(1.0 - smoothstep(w0, w1, abs(r - uMedal.z)), 1.0 - smoothstep(w0, w1, abs(r - uMedal.z * 0.78)));
  float sector = 0.7853982;
  float toSpoke = abs(fract(atan(rel.y, rel.x) / sector + 0.5) - 0.5) * sector * r;
  float spokes = (1.0 - smoothstep(w0, w1 * 0.9, toSpoke)) * step(uMedal.z * 0.78, r) * step(r, uMedal.z);
  float hub = 1.0 - smoothstep(w0, w1, abs(r - uMedal.z * 0.16));
  return max(max(rings, spokes), hub);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${FILTERING}
${VORONOI}
${REVEAL}
${PAVING}
${BLADES}
${EDGE_HAZE}
${PALETTE}
${LUMIOSE}
${TOWER_GLSL}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float sd = field.g;
  float kind = field.a;
  vec3 sun = normalize(uSun);
  float u = uUnit;

  // The street past the plaza: dark asphalt with a worn crown.
  vec3 col = mix(ASPHALT, ASPHALT * 1.25, smoothstep(0.3, 0.7, fbm3(p / 140.0 + 3.0)));
  col *= 0.93 + 0.14 * grain(p, 3.0);
  // The plaza: big pale slabs in staggered rows, each its own tone, hairline joints, wear and stain.
  if (kind > 0.5) {
    vec3 slab = paving(p, vec2(108.0, 72.0) * u, 0.5);
    vec3 stone = mix(SLAB * 0.92, SLAB * 1.08, slab.y);
    stone *= 0.94 + 0.12 * fbm3(p / 28.0 + slab.y * 7.0);
    stone *= 0.97 + 0.06 * grain(p, 3.2);
    // Design 080: the joints are shallower round the cards, so the slabs read as one floor under them.
    stone = mix(stone, stone * mix(0.7, 0.84, fieldCalm(p, 100.0)), 1.0 - smoothstep(0.4, 1.4, slab.x));
    // A paler diagonal polish across some slabs.
    stone *= 1.0 + 0.06 * step(0.6, slab.y) * smoothstep(0.35, 0.65, gnoise(vec2(dot(p, vec2(0.7, 0.7)) / 60.0, slab.y * 9.0)));
    stone = mix(stone, SLAB_LO, 0.35 * smoothstep(0.62, 0.78, fbm3(p / 52.0 + 8.0)));
    // The compass inlaid in blue-grey stone, worn a little.
    stone = mix(stone, INLAY * (0.9 + 0.2 * grain(p, 5.0)), max(medallion(p), towerFoot(p)) * 0.85);
    col = stone;
    // Along the building fronts a band of setts, small blue-grey stones in running bond, a pale kerb line at its edge.
    float band = 1.0 - smoothstep(30.0 * u, 31.5 * u, -sd);
    vec3 sett = paving(p, vec2(9.0, 6.0) * u, 0.5);
    vec3 setts = mix(SETT * 0.82, SETT * 1.12, sett.y) * (0.94 + 0.1 * grain(p, 2.2));
    setts *= 1.0 - 0.4 * (1.0 - smoothstep(0.25, 0.8, sett.x)) * patternFade(filterPixel, 6.0 * u);
    col = mix(col, setts, band);
    col = mix(col, SLAB_HI, 0.6 * (1.0 - smoothstep(0.5, 1.6 * u, abs(-sd - 31.5 * u))));
    col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 14.0 * u, -sd));
  }
  // The beds: grass in tufts and a few flowers, under a curb of salmon-tan stone with a pale cap.
  if (kind > 1.5) {
    vec4 tuft = voronoiCell(p / (10.0 * u) + 1.3);
    vec2 blades = bladeFan(-tuft.zw * 10.0 * u, tuft.y, 9.0 * u);
    vec3 grass = mix(BED_GRASS_DARK, BED_GRASS, 0.5 + 0.5 * fbm3(p / 30.0 + 2.0));
    grass = mix(grass, mix(BED_GRASS, BED_GRASS * 1.4, blades.y), blades.x * 0.85);
    float cellSize = 13.0 * u;
    vec4 bloom = voronoiCell(p / cellSize + 7.7);
    float flower = step(0.82, bloom.y) * (1.0 - smoothstep(0.9 * u, 1.9 * u, length(bloom.zw) * cellSize));
    vec3 petal = mix(mix(PETAL_PINK, PETAL_YELLOW, step(0.5, fract(bloom.y * 13.0))), PETAL_WHITE, step(0.7, fract(bloom.y * 29.0)));
    col = mix(grass, petal, flower);
  }
  // The curb: the bed's outer 9 px, laid in blocks with a pale lip along its outer edge.
  float inCurb = step(-9.0 * u, field.b) * step(field.b, 0.0);
  float jointAt = (0.5 - abs(fract(p.y / (26.0 * u)) - 0.5)) * 26.0 * u;
  float joint = 1.0 - smoothstep(0.3, 0.9, jointAt);
  vec3 curb = mix(CURB, CURB_CAP, smoothstep(-3.2 * u, -1.6 * u, field.b)) * (0.94 + 0.1 * grain(p, 3.0)) * (1.0 - 0.2 * joint);
  col = mix(col, curb, inCurb);
  // The street trees' iron grates, set in the paving.
  for (int i = 0; i < ${MAX_TREES}; i++) {
    vec4 pit = uPits[i];
    if (pit.z <= 0.0) continue;
    vec2 q = abs(p - pit.xy) - pit.z;
    float edge = max(q.x, q.y);
    float slits = step(0.45, fract((p.x - pit.x) / (3.6 * u))) * step(0.3, fract((p.y - pit.y) / (11.0 * u)));
    vec3 grate = GRATE * (0.8 + 0.7 * slits) + vec3(0.06, 0.05, 0.045) * smoothstep(0.0, 0.7, grain(p, 2.0));
    col = mix(col, CURB_CAP * 0.9, (1.0 - smoothstep(-0.3, 0.8, abs(edge - 2.2 * u) - 2.2 * u)) * step(0.0, edge));
    col = mix(col, grate, 1.0 - smoothstep(-0.6, 0.4, edge));
  }

  // The baked sun: the buildings' shadows (alpha), their feet's occlusion (blue); the tower's lattice shadow.
  float lit = light.a;
  col *= mix(0.78, 1.0, light.b);
  float shade = max((1.0 - lit) * step(field.r, 1.0), towerShadow(p, sun));
  col = mix(col, col * SHADE_TINT, shade * 0.8);
  // Clouds' shadows drifting over it all, slowly.
  float cloud = smoothstep(0.58, 0.74, fbm3((p - vec2(uTime * 6.0, uTime * 2.0)) / 380.0 + 4.0));
  col = mix(col, col * vec3(0.8, 0.88, 1.0), cloud * 0.4 * (1.0 - 0.7 * fieldCalm(p, 120.0)));

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.9, 1.0, 1.1);
  col += spark * revealGlow(p, 0.035) * 0.55;
  col += spark * exitGlow(p) * 0.55;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.05 foliage, 0.07 slate, 0.08 zinc, 0.3 iron, 0.9 glass, 2 and up a light at w - 1).
const GLASS = [0.11, 0.15, 0.25, 0.9];
const GLASS_DARK = [0.07, 0.09, 0.17, 0.9];
const TRIM = [0.793, 0.72, 0.618, 0.02];
const IRON = [0.07, 0.066, 0.09, 0.3];
const AWNINGS = [
  [0.592, 0.091, 0.105, 0.02],
  [0.101, 0.345, 0.167, 0.02],
  [0.101, 0.196, 0.442, 0.02],
];
const AWNING_RED = [0.684, 0.071, 0.071, 0.02];
const BANNER = [0.142, 0.555, 0.196, 0.02];
const FOLIAGE = [0.094, 0.215, 0.114, 0.05];
const FOLIAGE_LIT = [0.25, 0.5, 0.33, 0.05];
const FOLIAGE_MID = [0.16, 0.36, 0.2, 0.05];
const TRUNK = [0.142, 0.1, 0.09, 0];
const BENCH_WOOD = [0.142, 0.101, 0.101, 0];
const BRICK = [0.35, 0.18, 0.15, 0];
const ROOF_TRIM = [0.46, 0.5, 0.58, 0.3];
const TOWER_WHITE = [1.19, 1.33, 1.5, 0.4];
const TOWER_SHADE = [0.302, 0.442, 0.65, 0.4];
const TOWER_GLASS = [0.353, 0.637, 0.9, 0.9];
const TOWER_GLASS_DEEP = [0.101, 0.302, 0.555, 0.9];
const LAMP_GLOBE = [1.5, 1.45, 1.2, 2.3];
const SIGN_ROSE = [0.9, 0.2, 0.3, 2.0];
const SIGN_BLUE = [0.2, 0.5, 1.1, 2.0];
const BALL_RED = [0.684, 0.071, 0.071, 0.3];
const BALL_WHITE = [1.1, 1.1, 1.08, 0.3];
const BALL_BLACK = [0.04, 0.04, 0.05, 0.3];
const PARASOLS = [
  [[0.684, 0.071, 0.071, 0.02], [1.1, 1.08, 1.0, 0.02]],
  [[0.101, 0.196, 0.442, 0.02], [1.1, 1.08, 1.0, 0.02]],
  [[0.101, 0.345, 0.167, 0.02], [1.1, 1.08, 1.0, 0.02]],
];
const TABLE_TOP = [0.9, 0.88, 0.84, 0.3];
const POT = [0.38, 0.17, 0.12, 0];
const FLOWER_PINK = [0.836, 0.168, 0.264, 0.02];

/** The point `t` px inside a building's face from `s` px along it, at height z. */
const onFace = (face, s, t, z) => [face.a[0] + face.along[0] * s - face.out[0] * t, face.a[1] + face.along[1] * s - face.out[1] * t, z];

/**
 * A mansard roof: a steep slate slope all round, a shallow zinc slope up to a small flat top, dormers
 * on the face to the plaza, chimneys and skylights on the top.
 */
function roof(props, b, face, u) {
  const H = b.height;
  const kind = ROOFS[b.roof];
  const steep = [...kind.steep, SLATE];
  const top = [...kind.top, ZINC];
  const i1 = 14 * u;
  const rise1 = 36 * u;
  const rise2 = 22 * u;
  const ix = Math.min(88 * u, (b.x1 - b.x0) / 2 - 4 * u);
  const iy = Math.min(88 * u, (b.y1 - b.y0) / 2 - 4 * u);
  const z1 = H + rise1;
  const z2 = z1 + rise2;
  const rim = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const mid = [[b.x0 + i1, b.y0 + i1], [b.x1 - i1, b.y0 + i1], [b.x1 - i1, b.y1 - i1], [b.x0 + i1, b.y1 - i1]];
  const ridge = [[b.x0 + ix, b.y0 + iy], [b.x1 - ix, b.y0 + iy], [b.x1 - ix, b.y1 - iy], [b.x0 + ix, b.y1 - iy]];
  for (let k = 0; k < 4; k += 1) {
    const n = (k + 1) % 4;
    props.quad([...rim[k], H], [...rim[n], H], [...mid[n], z1], [...mid[k], z1], steep);
    props.quad([...mid[k], z1], [...mid[n], z1], [...ridge[n], z2], [...ridge[k], z2], top);
  }
  props.quad([...ridge[0], z2], [...ridge[1], z2], [...ridge[2], z2], [...ridge[3], z2], top);
  // Metal trims: the four hips, the break between the slopes, the edge of the flat top.
  for (let k = 0; k < 4; k += 1) props.tube([[...rim[k], H + 1], [...mid[k], z1], [...ridge[k], z2]], 1 * u, ROOF_TRIM, { sides: 4 });
  props.tube([...mid, mid[0]].map((p) => [...p, z1 + 0.4]), 0.9 * u, ROOF_TRIM, { sides: 4 });
  props.tube([...ridge, ridge[0]].map((p) => [...p, z2 + 0.4]), 0.9 * u, ROOF_TRIM, { sides: 4 });
  // Dormers in the steep slope on the face to the plaza: a front wall with a window, a gable roof back into the slope.
  const count = Math.max(2, Math.round(face.length / (62 * u)));
  const slope = rise1 / i1;
  for (let k = 0; k < count; k += 1) {
    const s = (face.length * (k + 0.5)) / count;
    const half = 8.5 * u;
    const front = 3 * u;
    const zFront = H + slope * front;
    const eave = H + 26 * u;
    const apex = H + 34 * u;
    const wall = (ds, z) => onFace(face, s + ds, front, z);
    props.quad(wall(-half, zFront), wall(half, zFront), wall(half, eave), wall(-half, eave), TRIM);
    props.triangle(wall(-half, eave), wall(half, eave), wall(0, apex), TRIM);
    const backApex = onFace(face, s, apex / slope - H / slope, apex);
    const backEave = (ds) => onFace(face, s + ds, (eave - H) / slope, eave);
    props.quad(wall(-half, eave), wall(0, apex), backApex, backEave(-half), steep);
    props.quad(wall(0, apex), wall(half, eave), backEave(half), backApex, steep);
    props.quad(
      onFace(face, s - 5.2 * u, front - 0.3 * u, H + 11 * u),
      onFace(face, s + 5.2 * u, front - 0.3 * u, H + 11 * u),
      onFace(face, s + 5.2 * u, front - 0.3 * u, H + 23 * u),
      onFace(face, s - 5.2 * u, front - 0.3 * u, H + 23 * u),
      GLASS_DARK
    );
  }
  // Chimneys on the top and two skylights.
  const w = b.x1 - b.x0 - 2 * ix;
  const d = b.y1 - b.y0 - 2 * iy;
  for (const share of [0.28, 0.74]) {
    const cx = (b.x0 + b.x1) / 2 + (hash(b.seed, share, 4) - 0.5) * w;
    const cy = b.y0 + iy + d * share;
    props.box({ x: cx, y: cy, z0: z2 - 2, z1: z2 + 26 * u, hw: 8 * u, hh: 6 * u, color: BRICK, topColor: [0.12, 0.1, 0.1, 0] });
    for (const dx of [-3.2, 3.2]) props.cylinder({ x: cx + dx * u, y: cy, z0: z2 + 26 * u, z1: z2 + 33 * u, r: 2.2 * u, color: BRICK, capColor: [0.1, 0.09, 0.09, 0], sides: 8 });
  }
  const sky = { x: (b.x0 + b.x1) / 2, y: b.y0 + iy + d * 0.5 };
  props.box({ x: sky.x, y: sky.y, z0: z2, z1: z2 + 4 * u, hw: Math.min(10 * u, w / 2 - 1), hh: 8 * u, color: TRIM, topColor: GLASS });
}

/** The Pokemon Center's blade sign: a Poke Ball on a bracket, standing out from the wall. */
function pokeSign(props, b, face, u) {
  const r = 17 * u;
  const s = face.length * 0.5;
  const z = 128 * u;
  const wall = onFace(face, s, 0, z);
  const centre = [wall[0] + face.out[0] * (r + 8 * u), wall[1] + face.out[1] * (r + 8 * u), z];
  props.tube([wall, [wall[0] + face.out[0] * 8 * u, wall[1] + face.out[1] * 8 * u, z]], 1.3 * u, IRON, { sides: 6 });
  const across = [face.along[0] * 0.4 * u, face.along[1] * 0.4 * u, 0];
  const lift = (p, k) => [p[0] + across[0] * k, p[1] + across[1] * k, p[2]];
  for (const side of [-1, 1]) {
    const c = lift(centre, side);
    disc(props, { centre: c, out: face.out, r, color: BALL_RED, from: 0, to: Math.PI });
    disc(props, { centre: c, out: face.out, r, color: BALL_WHITE, from: Math.PI, to: 2 * Math.PI });
    const band = 2.6 * u;
    props.quad(
      [c[0] - face.out[0] * r, c[1] - face.out[1] * r, z - band],
      [c[0] + face.out[0] * r, c[1] + face.out[1] * r, z - band],
      [c[0] + face.out[0] * r, c[1] + face.out[1] * r, z + band],
      [c[0] - face.out[0] * r, c[1] - face.out[1] * r, z + band],
      BALL_BLACK
    );
    const sideShift = lift(c, side * 0.5);
    disc(props, { centre: sideShift, out: face.out, r: r * 0.36, color: BALL_BLACK });
    disc(props, { centre: lift(sideShift, side * 0.4), out: face.out, r: r * 0.24, color: BALL_WHITE });
  }
}

/** One building: a stone block, long windows in floors with a trim band between, a shopfront awning, a cornice, a mansard roof. */
function building(props, b, u) {
  const wall = WALLS[b.palette];
  const mid = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  props.box({ x: mid[0], y: mid[1], z0: -2, z1: b.height, hw: (b.x1 - b.x0) / 2, hh: (b.y1 - b.y0) / 2, color: [...wall, 0], topColor: [...ROOFS[b.roof].steep, SLATE] });
  // The face to the plaza: a to b runs so its outer side is on the right.
  let a;
  let c;
  let out;
  if (b.face === 'right') {
    a = [b.x1, b.y0];
    c = [b.x1, b.y1];
    out = [1, 0];
  } else if (b.face === 'left') {
    a = [b.x0, b.y1];
    c = [b.x0, b.y0];
    out = [-1, 0];
  } else {
    a = [b.x0, b.y0];
    c = [b.x1, b.y0];
    out = [0, -1];
  }
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const along = [(c[0] - a[0]) / length, (c[1] - a[1]) / length];
  const trim = [...wall.map((v) => Math.min(1.4, v * 1.2 + 0.05)), 0.02];
  const glass = b.palette === DARK_PURPLE ? GLASS_DARK : GLASS;
  const isCenter = b.role === 'center';
  // Ground floor: a stone plinth, a shopfront of glass, a striped awning over it (red for the Pokemon Center).
  wallBand(props, { a, b: c, depth: 10 * u, z0: -2, z1: 7 * u, over: 2 * u, color: trim });
  windowRun(props, { a, b: c, z0: 8 * u, z1: 34 * u, panes: Math.max(2, Math.round(length / (isCenter ? 70 : 52) / u)), rows: 1, glass: isCenter ? GLASS : GLASS_DARK, frame: IRON, frameW: 9 * u });
  const awning = isCenter ? AWNING_RED : AWNINGS[Math.floor(b.seed * AWNINGS.length) % AWNINGS.length];
  wallBand(props, { a, b: c, depth: 4 * u, z0: 36 * u, z1: 44 * u, over: 15 * u, color: awning, topColor: awning });
  wallBand(props, { a, b: c, depth: 8 * u, z0: 44 * u, z1: 50 * u, over: 4 * u, color: isCenter ? [1.1, 1.08, 1.0, 0.02] : trim });
  // Upper floors: long windows in stone piers, a trim band every floor, a balcony slab and rail on some.
  for (let floor = 0; floor < b.floors - 1; floor += 1) {
    const z0 = (52 + floor * 50) * u;
    windowRun(props, { a, b: c, z0: z0 + 4 * u, z1: z0 + 42 * u, panes: Math.max(2, Math.round(length / (40 * u))), rows: 1, glass, frame: trim, frameW: 22 * u });
    wallBand(props, { a, b: c, depth: 8 * u, z0: z0 + 44 * u, z1: z0 + 50 * u, over: 3 * u, color: trim });
    if ((floor + Math.floor(b.seed * 5)) % 2 === 0) {
      wallBand(props, { a, b: c, depth: 4 * u, z0, z1: z0 + 3.5 * u, over: 9 * u, color: trim, topColor: trim });
      props.tube([[a[0] + out[0] * 8.5 * u, a[1] + out[1] * 8.5 * u, z0 + 13 * u], [c[0] + out[0] * 8.5 * u, c[1] + out[1] * 8.5 * u, z0 + 13 * u]], 1.1 * u, IRON, { sides: 6 });
    }
  }
  wallBand(props, { a, b: c, depth: 10 * u, z0: b.height - 7 * u, z1: b.height, over: 7 * u, color: trim });
  const face = { a, along, out, length };
  roof(props, b, face, u);
  if (isCenter) pokeSign(props, b, face, u);
}

/** A round street tree: a slim trunk and a crown of overlapping balls, pale where the sun lands. */
function tree(props, t, u) {
  props.tube([[t.x, t.y, -2], [t.x, t.y, t.h * 0.3], [t.x, t.y, t.h * 0.62]], [3.6 * u, 2.6 * u, 2 * u], TRUNK, { sides: 8 });
  const balls = [[0, 0, 0.2, 1], [-0.55, 0.25, -0.05, 0.74], [0.55, -0.2, 0, 0.76], [0.1, 0.55, 0.1, 0.64], [-0.15, -0.55, 0.08, 0.66], [0, 0, 0.6, 0.66], [0.3, 0.3, 0.45, 0.5]];
  balls.forEach(([dx, dy, dz, s], k) => {
    props.sphere({ x: t.x + dx * t.r, y: t.y + dy * t.r, z: t.h + dz * t.r, r: t.r * s, color: [FOLIAGE, FOLIAGE_LIT, FOLIAGE_MID][k % 3], sides: 14, rings: 9, squash: 0.9 });
  });
}

/** A lamppost: a fluted iron post, a bracket with three globes, a green banner hung from it. */
function lamp(props, l, u) {
  props.tube([[l.x, l.y, -2], [l.x, l.y, l.h * 0.5], [l.x, l.y, l.h]], [6 * u, 3.6 * u, 2.6 * u], IRON, { sides: 12 });
  props.cylinder({ x: l.x, y: l.y, z0: -2, z1: 14 * u, r: 9 * u, color: IRON, sides: 12 });
  props.ring({ x: l.x, y: l.y, z0: l.h * 0.46, z1: l.h * 0.46 + 3 * u, r: 5 * u, color: IRON, sides: 12 });
  props.cylinder({ x: l.x, y: l.y, z0: l.h, z1: l.h + 4 * u, r: 5 * u, color: IRON, sides: 12 });
  for (const s of [-1, 0, 1]) {
    props.tube([[l.x, l.y, l.h - 4 * u], [l.x, l.y + s * 10 * u, l.h + 6 * u], [l.x, l.y + s * 17 * u, l.h + 6 * u]], 1.5 * u, IRON, { sides: 6 });
    props.cylinder({ x: l.x, y: l.y + s * 17 * u, z0: l.h + 4 * u, z1: l.h + 6.5 * u, r: 4 * u, color: IRON, sides: 8 });
    props.sphere({ x: l.x, y: l.y + s * 17 * u, z: l.h + 12 * u, r: 6.2 * u, color: LAMP_GLOBE, sides: 12, rings: 8 });
  }
  // A basket of flowers hung from the post, and the banner.
  props.sphere({ x: l.x + l.side * 7 * u, y: l.y, z: l.h * 0.62, r: 5 * u, color: FOLIAGE_MID, sides: 10, rings: 7, squash: 0.7 });
  props.sphere({ x: l.x + l.side * 7 * u, y: l.y + 1.5 * u, z: l.h * 0.62 + 3 * u, r: 2.4 * u, color: FLOWER_PINK, sides: 8, rings: 5 });
  props.quad([l.x + l.side * -0.6 * u, l.y - 5 * u, l.h * 0.46], [l.x + l.side * -0.6 * u, l.y + 5 * u, l.h * 0.46], [l.x + l.side * -0.6 * u, l.y + 5 * u, l.h * 0.78], [l.x + l.side * -0.6 * u, l.y - 5 * u, l.h * 0.78], BANNER);
}

/** A bench: two dark slats on iron legs, its back to the strip's edge. */
function bench(props, b, u) {
  props.box({ x: b.x, y: b.y, z0: 6 * u, z1: 9 * u, hw: b.w / 2, hh: b.d / 2, color: BENCH_WOOD });
  props.box({ x: b.x - b.side * 6 * u, y: b.y, z0: 9 * u, z1: 22 * u, hw: 1.5 * u, hh: b.d / 2, color: BENCH_WOOD });
  for (const y of [b.y - b.d / 2 + 4 * u, b.y + b.d / 2 - 4 * u]) props.box({ x: b.x, y, z0: -1, z1: 6 * u, hw: b.w / 2 - 1 * u, hh: 1.2 * u, color: IRON });
}

/** A cafe table under a parasol: a round top on a pedestal, three chairs round it, eight striped wedges overhead. */
function cafe(props, c, u) {
  const [stripe, white] = PARASOLS[Math.floor(c.seed * PARASOLS.length) % PARASOLS.length];
  props.cylinder({ x: c.x, y: c.y, z0: -2, z1: 2.5 * u, r: 8 * u, color: IRON, sides: 14 });
  props.tube([[c.x, c.y, 0], [c.x, c.y, 24 * u]], 1.3 * u, IRON, { sides: 8 });
  props.cylinder({ x: c.x, y: c.y, z0: 24 * u, z1: 26 * u, r: 15 * u, color: TABLE_TOP, sides: 18 });
  for (let k = 0; k < 3; k += 1) {
    const angle = c.seed * 6 + (k / 3) * 2 * Math.PI;
    const cx = c.x + Math.cos(angle) * 24 * u;
    const cy = c.y + Math.sin(angle) * 24 * u;
    props.box({ x: cx, y: cy, z0: 10 * u, z1: 12 * u, hw: 6 * u, hh: 6 * u, yaw: angle, color: IRON });
    props.box({ x: cx + Math.cos(angle) * 5.4 * u, y: cy + Math.sin(angle) * 5.4 * u, z0: 12 * u, z1: 25 * u, hw: 0.8 * u, hh: 6 * u, yaw: angle, color: IRON });
    for (const [dx, dy] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) props.box({ x: cx + dx * u, y: cy + dy * u, z0: -1, z1: 10 * u, hw: 0.7 * u, hh: 0.7 * u, color: IRON });
  }
  props.tube([[c.x, c.y, 26 * u], [c.x, c.y, 82 * u]], 1.1 * u, IRON, { sides: 8 });
  const rim = (k) => [c.x + Math.cos((k / 8) * 2 * Math.PI) * c.r, c.y + Math.sin((k / 8) * 2 * Math.PI) * c.r, 62 * u];
  const apex = [c.x, c.y, 82 * u];
  for (let k = 0; k < 8; k += 1) props.triangle(apex, rim(k), rim(k + 1), k % 2 ? white : stripe);
  props.sphere({ x: c.x, y: c.y, z: 83 * u, r: 2 * u, color: IRON, sides: 8, rings: 5 });
}

/**
 * The Prism Tower: a white lattice square in section that flares to four legs at the foot, narrows to a
 * waist, swells to a crown whose four corners rise as fins around a mast; light-blue glass fills the long
 * window of the shaft and the arches of the foot. Four corner legs, a ring of bars and a pair of braces
 * on each face at every level.
 */
function prismTower(props, t, u) {
  const levels = 20;
  const radius = (s) => towerRadius(s, t.h);
  const corner = (k, s, scale = 1) => {
    const angle = (k / 4) * 2 * Math.PI + Math.PI / 4;
    return [t.x + Math.cos(angle) * radius(s) * scale, t.y + Math.sin(angle) * radius(s) * scale, -2 + s * t.h];
  };
  const top = 0.93;
  for (let k = 0; k < 4; k += 1) {
    props.tube(Array.from({ length: levels + 1 }, (_, i) => corner(k, (i / levels) * top)), [3 * u, 2.4 * u, 2 * u, ...Array(levels - 2).fill(2 * u)], TOWER_WHITE, { sides: 6 });
  }
  const glassBands = [[0.06, 0.15, TOWER_GLASS_DEEP], [0.3, 0.7, TOWER_GLASS]];
  for (let i = 0; i < levels; i += 1) {
    const s0 = (i / levels) * top;
    const s1 = ((i + 1) / levels) * top;
    for (let k = 0; k < 4; k += 1) {
      const n = (k + 1) % 4;
      props.tube([corner(k, s1), corner(n, s1)], 1.5 * u, TOWER_WHITE, { sides: 6 });
      props.tube([corner(k, s0), corner(n, s1)], 1.1 * u, TOWER_SHADE, { sides: 4 });
      props.tube([corner(n, s0), corner(k, s1)], 1.1 * u, TOWER_SHADE, { sides: 4 });
    }
    for (const [from, to, color] of glassBands) {
      if (s0 < from || s1 > to + 0.001) continue;
      for (let k = 0; k < 4; k += 1) props.quad(corner(k, s0, 0.9), corner((k + 1) % 4, s0, 0.9), corner((k + 1) % 4, s1, 0.9), corner(k, s1, 0.9), color);
    }
  }
  // The foot: a white pavilion between the legs, arched windows on its faces.
  const pavilion = radius(0.02) * 0.62;
  props.box({ x: t.x, y: t.y, z0: -2, z1: 0.075 * t.h, hw: pavilion, hh: pavilion, yaw: Math.PI / 4, color: TOWER_WHITE, topColor: [0.5, 0.58, 0.68, 0.3] });
  for (let k = 0; k < 4; k += 1) {
    const angle = (k / 4) * 2 * Math.PI;
    const px = t.x + Math.cos(angle) * (pavilion * 1.0 + 0.3);
    const py = t.y + Math.sin(angle) * (pavilion * 1.0 + 0.3);
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);
    props.quad([px - tx * pavilion * 0.55, py - ty * pavilion * 0.55, 6 * u], [px + tx * pavilion * 0.55, py + ty * pavilion * 0.55, 6 * u], [px + tx * pavilion * 0.55, py + ty * pavilion * 0.55, 0.062 * t.h], [px - tx * pavilion * 0.55, py - ty * pavilion * 0.55, 0.062 * t.h], TOWER_GLASS_DEEP);
  }
  // The crown: four fins rising from the corners, a mast between them with a light on top.
  for (let k = 0; k < 4; k += 1) {
    const base = corner(k, top);
    const tip = [t.x + (base[0] - t.x) * 1.18, t.y + (base[1] - t.y) * 1.18, -2 + t.h * 1.0];
    props.tube([base, [(base[0] + tip[0]) / 2 + (base[0] - t.x) * 0.04, (base[1] + tip[1]) / 2 + (base[1] - t.y) * 0.04, (base[2] + tip[2]) / 2], tip], [2.6 * u, 1.8 * u, 0.5 * u], TOWER_WHITE, { sides: 6 });
  }
  props.tube([[t.x, t.y, -2 + t.h * 0.9], [t.x, t.y, t.h + 70 * u]], [3 * u, 1.2 * u], TOWER_WHITE, { sides: 6 });
  props.sphere({ x: t.x, y: t.y, z: t.h + 72 * u, r: 2.6 * u, color: SIGN_ROSE, sides: 8, rings: 5 });
}

/** The big billboard on the dark purple corner building: a lit blue screen with a pink panel. */
function billboard(props, b, u) {
  if (b.role !== 'screen') return;
  const z0 = (b.floors - 3) * 50 * u + 56 * u;
  const x = b.face === 'right' ? b.x1 + 1.2 * u : b.x0 - 1.2 * u;
  const dir = b.face === 'right' ? 1 : -1;
  const y0 = b.y0 + (b.y1 - b.y0) * 0.14;
  const y1 = b.y1 - (b.y1 - b.y0) * 0.14;
  const a = dir > 0 ? [y0, y1] : [y1, y0];
  props.quad([x, a[0], z0], [x, a[1], z0], [x, a[1], z0 + 62 * u], [x, a[0], z0 + 62 * u], SIGN_BLUE);
  props.quad([x + dir * 0.2, a[0] + (a[1] - a[0]) * 0.15, z0 + 8 * u], [x + dir * 0.2, a[0] + (a[1] - a[0]) * 0.55, z0 + 8 * u], [x + dir * 0.2, a[0] + (a[1] - a[0]) * 0.55, z0 + 48 * u], [x + dir * 0.2, a[0] + (a[1] - a[0]) * 0.15, z0 + 48 * u], SIGN_ROSE);
}

/** Everything solid, as one prop geometry. */
export function lumioseProps(spots) {
  const { buildings, trees, lamps, benches, cafes, tower, u } = spots;
  const props = createPropBuilder();
  for (const b of buildings) {
    building(props, b, u);
    billboard(props, b, u);
  }
  for (const t of trees) tree(props, t, u);
  for (const l of lamps) lamp(props, l, u);
  for (const b of benches) bench(props, b, u);
  for (const c of cafes) cafe(props, c, u);
  prismTower(props, tower, u);
  return props;
}

/** The props in the bright day: sun and a blue sky, stone warm in the sun and blue in its shade, glass reflecting the sky, foliage in lobes. */
const PROP_LIGHT = /* glsl */ `
${VORONOI}
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, sun), 0.0);
  vec3 sky = vec3(0.5, 0.6, 0.86) * (0.6 + 0.4 * n.z);
  vec3 col = albedo * (sky + vec3(1.05, 0.98, 0.88) * lit * 0.85);
  if (metal > 0.6) {
    vec3 r = reflect(-view, n);
    vec3 refl = mix(vec3(0.4, 0.58, 0.85), vec3(0.88, 0.95, 1.02), clamp(r.z + 0.2, 0.0, 1.0));
    float fres = pow(1.0 - abs(dot(n, view)), 2.0);
    col = mix(albedo * (0.6 + 0.8 * lit), refl * 0.9, 0.22 + 0.5 * fres);
    col += vec3(1.0) * pow(max(dot(reflect(-sun, n), view), 0.0), 50.0) * 0.5;
  } else if (metal > 0.04 && metal < 0.06) {
    vec2 q = world.xy / 12.0 + world.z / 10.0;
    q += 0.35 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 9.1)) - 0.5);
    vec4 lobe = voronoiCell(q);
    float inLobe = 1.0 - smoothstep(0.34, 0.62, length(lobe.zw));
    float bulge = dot(normalize(n + vec3(-lobe.zw, 0.0) * 0.6 * inLobe), sun);
    float crown = smoothstep(-0.3, 0.7, n.z);
    col = albedo * (0.45 + 0.95 * smoothstep(-0.1, 0.8, bulge)) * mix(0.82, 1.0, smoothstep(0.0, 0.2, lobe.x)) * (sky * 0.5 + 0.55) * mix(0.6, 1.08, crown);
    col *= 0.86 + 0.28 * gnoise(world.xy / 2.4 + world.z / 2.0);
  } else if (metal > 0.065 && metal < 0.075) {
    // Roof slates: courses running across the slope, each slate a shade of its own.
    float s = length(n.xy) > 0.25 ? dot(world.xy, normalize(n.xy)) / max(length(n.xy), 0.3) : world.y;
    float course = fract(s / 7.0);
    float slate = hash12(vec2(floor(s / 7.0), floor((world.x + world.y * 0.3) / 9.0)));
    col = albedo * (0.8 + 0.4 * slate) * (sky * 0.45 + 0.3 + lit * 1.15) * (0.84 + 0.16 * smoothstep(0.0, 0.2, course) * (1.0 - smoothstep(0.85, 1.0, course)));
  } else if (metal > 0.075 && metal < 0.085) {
    // Zinc: standing seams running down the slope, a soft sheen where the sun catches it.
    vec2 down = length(n.xy) > 0.05 ? normalize(n.xy) : vec2(1.0, 0.0);
    float seam = abs(fract(dot(world.xy, vec2(-down.y, down.x)) / 11.0) - 0.5) * 2.0;
    col = albedo * (sky * 0.5 + 0.3 + lit * 1.0) * (0.86 + 0.14 * smoothstep(0.0, 0.14, 1.0 - seam)) * (0.94 + 0.12 * gnoise(world.xy / 9.0));
    col += vec3(0.6, 0.66, 0.72) * pow(max(dot(reflect(-sun, n), view), 0.0), 18.0) * 0.18;
  } else if (metal > 0.01 && metal < 0.03) {
    // Stone and cloth: faint stains running down, a little grain.
    col *= 0.94 + 0.1 * gnoise(vec2((world.x + world.y) * 0.4, world.z * 0.09));
    col *= 0.96 + 0.08 * gnoise(world.xy / 3.0 + world.z / 4.0);
  }
  col *= mix(0.82, 1.0, smoothstep(0.0, 16.0, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(0.9, 1.0, 1.1)' });

/** Lumiose City's board (stadium-environment-mesh.js BOARDS). */
export function lumioseCityBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...LUMIOSE_SUN).normalize() },
    uSquare: { value: new three.Vector4() },
    uBeds: { value: Array.from({ length: MAX_BEDS }, () => new three.Vector4()) },
    uPits: { value: Array.from({ length: MAX_TREES }, () => new three.Vector4()) },
    uTower: { value: new three.Vector4() },
    uMedal: { value: new three.Vector3() },
    uUnit: { value: 1 },
    uBlocks: { value: Array.from({ length: MAX_BUILDINGS }, () => new three.Vector4()) },
    uBlockHeights: { value: Array.from({ length: MAX_BUILDINGS }, () => 0) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, BAKE_LIGHT_FRAGMENT, bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  return {
    objects: [terrain, props],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => lumioseSpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uUnit.value = u;
      const square = spots?.square;
      own.uSquare.value.set(square?.x0 ?? 0, square?.y0 ?? 0, square?.x1 ?? 0, square?.y1 ?? 0);
      own.uBeds.value.forEach((slot, i) => {
        const bed = spots?.beds[i];
        return bed ? slot.set(bed.x0, bed.y0, bed.x1, bed.y1) : slot.set(0, 0, 0, 0);
      });
      own.uPits.value.forEach((slot, i) => {
        const pit = spots?.pits[i];
        return pit ? slot.set(pit.x, pit.y, pit.half, 0) : slot.set(0, 0, 0, 0);
      });
      own.uTower.value.set(spots?.tower.x ?? 0, spots?.tower.y ?? 0, spots?.tower.h ?? 0, spots?.tower.r ?? 0);
      own.uMedal.value.set(spots?.medal.x ?? 0, spots?.medal.y ?? 0, spots?.medal.r ?? 0);
      own.uBlocks.value.forEach((slot, i) => {
        const b = spots?.buildings[i];
        // The roof's mass counts too: the shadow's block reaches a little above the cornice.
        own.uBlockHeights.value[i] = b ? b.height + 26 * u : 0;
        return b ? slot.set(b.x0, b.y0, b.x1, b.y1) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, lumioseProps(spots).build(three));
    },
  };
}
