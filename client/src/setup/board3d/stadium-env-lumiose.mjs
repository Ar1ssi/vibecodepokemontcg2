// Design 077 (prototype): Lumiose City (customhb-351) after its card art (POR 77, Marina Chikazawa):
// a Parisian avenue square on a bright day, cream paving in big slabs with two red-curbed beds of
// grass and a green street tree, tall cream and ochre stone buildings with long windows, balconies
// and mansard roofs down both sides (a dark purple one with a billboard), black iron lampposts hung
// with green banners, and the white lattice Prism Tower standing over the far end. The art looks down
// the avenue at the tower; the board looks down on the square, so the square holds every card, the
// beds, trees, lamps and benches stand in the strips either side of it, the buildings rise in rows
// beyond them and across the far end (their faces to the cards), and the tower stands past the far
// right corner.
// World scale: a card's footprint is a paving slab; a floor of the buildings is about half a card
// high.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the buildings' blocks, so the shared light bake
// casts their sun shadows and darkens their feet), G px from the square's edge (negative on it), B
// the bed mask, A the kind (0 street, 1 square, 2 bed). The ground stays flat: this board's terrain
// vertex shader ignores the height. Per frame: TERRAIN paints the paving, the beds, the street and
// the baked shadows; PROPS the buildings, trees, lamps, benches and the tower (stadium-env-props).
import {
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
import { wallBand, windowRun } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, BOX_SHADOW, EDGE_HAZE, PAVING } from './stadium-env-surfaces.mjs';

export const LUMIOSE_KEY = 'lumiose-city';
/** The bright day's sun (toward it, table frame): high from the far left, so the buildings' shadows fall across the square. */
export const LUMIOSE_SUN = Object.freeze([-0.55, 0.32, 0.77]);
/** The strips of square either side of the cards, and the least gap kept between a prop's foot and a card. */
export const STRIP_PX = 190;
export const MAX_BUILDINGS = 20;
export const MAX_TREES = 6;
export const MAX_LAMPS = 8;
export const MAX_BEDS = 2;
const BUILDING_GAP_PX = 14;

/** The wall palettes (aColor, linear): cream, ochre, cream, ochre, purple-grey brick, rose, dark purple (rare, billboards). */
const WALLS = [
  [0.712, 0.555, 0.442],
  [0.65, 0.496, 0.256],
  [0.76, 0.62, 0.5],
  [0.68, 0.53, 0.3],
  [0.302, 0.249, 0.345],
  [0.592, 0.345, 0.302],
  [0.142, 0.105, 0.221],
];
const DARK_PURPLE = 6;
const ROOFS = [
  [0.2, 0.17, 0.26],
  [0.228, 0.392, 0.263],
  [0.469, 0.453, 0.525],
  [0.2, 0.17, 0.26],
  [0.24, 0.2, 0.3],
  [0.228, 0.392, 0.263],
  [0.12, 0.1, 0.16],
];
/** A roof's aColor: its palette, flagged (w 0.07) for the slate courses the light pass paints on it. */
const roofColor = (palette) => [...ROOFS[palette], 0.07];

/**
 * Lumiose City's layout: the square, the beds, trees, lamps and benches in its strips, the rows of
 * buildings, the Prism Tower. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function lumioseSpots(layout) {
  const ctx = boardContext(layout, LUMIOSE_KEY);
  if (!ctx) return null;
  const { scene, table, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const strip = STRIP_PX * u;
  const square = { x0: core.x - strip, x1: core.x + core.w + strip, y0: core.y - 70 * u, y1: handEnd + 60 * u };
  // Buildings: rows down both sides, then across the far end; each block a few floors, its face to the square.
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
  for (const side of [-1, 1]) {
    const edge = side < 0 ? square.x0 : square.x1;
    along(scene.y + 20 * u, scene.y + scene.h - 10 * u, (y, len, roll) => {
      const floors = 4 + Math.floor(roll(2) * 4);
      const box = { x0: side < 0 ? edge - depth : edge, x1: side < 0 ? edge : edge + depth, y0: y, y1: y + len };
      buildings.push({ ...box, side, floors, height: (floors * 50 + 20) * u, palette: Math.floor(roll(3) * WALLS.length), seed: roll(4), face: side < 0 ? 'right' : 'left' });
    });
  }
  // Across the far end, lower, beyond the opponent's hand, between the two rows.
  const farY = square.y1 + 20 * u;
  along(square.x0 + 40 * u, square.x1 - 40 * u, (x, len, roll) => {
    if (buildings.length >= MAX_BUILDINGS) return;
    const floors = 3 + Math.floor(roll(2) * 3);
    buildings.push({ x0: x, x1: x + len, y0: farY, y1: farY + 200 * u, side: 0, floors, height: (floors * 50 + 20) * u, palette: Math.floor(roll(3) * WALLS.length), seed: roll(4), face: 'near' });
  });
  // The beds: grass in a red curb, a long rectangle down each strip's middle.
  const beds = [-1, 1].map((side) => {
    const x = side < 0 ? square.x0 + strip * 0.52 : square.x1 - strip * 0.52;
    return { x0: x - 18 * u, x1: x + 18 * u, y0: core.y + core.h * 0.18, y1: core.y + core.h * 0.78 };
  });
  // Trees in the strips' outer edge, lamps along their inner edge, benches between.
  const trees = [];
  const lamps = [];
  const benches = [];
  for (const side of [-1, 1]) {
    const outer = side < 0 ? square.x0 + 36 * u : square.x1 - 36 * u;
    const inner = side < 0 ? square.x0 + strip * 0.88 : square.x1 - strip * 0.88;
    for (let k = 0; k < 3; k += 1) {
      const y = core.y + core.h * (0.1 + 0.4 * k);
      trees.push({ x: outer, y, r: (42 + 10 * hash(side, k, 1)) * u, h: (78 + 20 * hash(side, k, 2)) * u, seed: hash(side, k, 3) });
    }
    for (let k = 0; k < 4; k += 1) {
      lamps.push({ x: inner, y: core.y + core.h * (0.05 + 0.3 * k), h: 118 * u, side });
    }
    for (let k = 0; k < 2; k += 1) {
      benches.push({ x: inner, y: core.y + core.h * (0.22 + 0.34 * k), side, w: 14 * u, d: 50 * u });
    }
  }
  const keep = (list, r) => list.filter((item) => ctx.clear(item.x, item.y, typeof r === 'function' ? r(item) : r, 10 * u));
  const tower = {
    x: table.x + table.w + 40 * u,
    y: Math.min(handEnd + 300 * u, scene.y + scene.h - 120 * u),
    h: 360 * u,
    r: 46 * u,
  };
  return {
    ...ctx,
    handEnd,
    square,
    buildings,
    beds,
    trees: keep(trees, (t) => t.r).slice(0, MAX_TREES),
    lamps: keep(lamps, 8 * u).slice(0, MAX_LAMPS),
    benches: keep(benches, 26 * u),
    tower,
    strip,
    centre,
  };
}

const LUMIOSE = /* glsl */ `
// The square (x0, y0, x1, y1); the beds (x0, y0, x1, y1), the scale of a card (u).
uniform vec4 uSquare;
uniform vec4 uBeds[${MAX_BEDS}];
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

/** Bake: the buildings' blocks (their heights, for the light bake's shadows); the square and beds as masks. */
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
const vec3 SLAB = vec3(0.555, 0.519, 0.453);
const vec3 SLAB_LO = vec3(0.345, 0.327, 0.294);
const vec3 SLAB_HI = vec3(0.72, 0.684, 0.618);
const vec3 CURB = vec3(0.345, 0.147, 0.12);
const vec3 BED_GRASS = vec3(0.196, 0.416, 0.101);
const vec3 BED_GRASS_DARK = vec3(0.09, 0.22, 0.07);
const vec3 ASPHALT = vec3(0.142, 0.147, 0.167);
const vec3 SHADE_TINT = vec3(0.58, 0.68, 0.98);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PAVING}
${BLADES}
${EDGE_HAZE}
${PALETTE}
${LUMIOSE}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float sd = field.g;
  float kind = field.a;
  vec3 sun = normalize(uSun);

  // The street past the square: dark asphalt with a worn crown, the square's kerb a pale stone line.
  vec3 col = mix(ASPHALT, ASPHALT * 1.25, smoothstep(0.3, 0.7, fbm3(p / 140.0 + 3.0)));
  col *= 0.93 + 0.14 * gnoise(p / 3.0);
  // The square: big cream slabs in staggered rows, each its own tone, hairline joints, wear and stain.
  if (kind > 0.5) {
    vec3 slab = paving(p, vec2(108.0, 72.0) * uUnit, 0.5);
    vec3 stone = mix(SLAB * 0.92, SLAB * 1.08, slab.y);
    stone *= 0.94 + 0.12 * fbm3(p / 28.0 + slab.y * 7.0);
    stone *= 0.97 + 0.06 * gnoise(p / 3.2);
    stone = mix(stone, stone * 0.7, 1.0 - smoothstep(0.4, 1.4, slab.x));
    // A paler diagonal polish across some slabs.
    stone *= 1.0 + 0.06 * step(0.6, slab.y) * smoothstep(0.35, 0.65, gnoise(vec2(dot(p, vec2(0.7, 0.7)) / 60.0, slab.y * 9.0)));
    stone = mix(stone, SLAB_LO, 0.35 * smoothstep(0.62, 0.78, fbm3(p / 52.0 + 8.0)));
    col = stone;
    // A line of darker stone at the square's edge, a kerb band of paler stone.
    col *= 1.0 - 0.12 * (1.0 - smoothstep(10.0, 28.0 * uUnit, -sd));
    col = mix(col, SLAB_HI, 0.5 * (1.0 - smoothstep(0.5, 1.8, abs(sd + 2.0))));
  }
  // The beds: grass in tufts under a red-brown curb of laid brick.
  if (kind > 1.5) {
    vec4 tuft = voronoiCell(p / (10.0 * uUnit) + 1.3);
    vec2 blades = bladeFan(-tuft.zw * 10.0 * uUnit, tuft.y, 9.0 * uUnit);
    vec3 grass = mix(BED_GRASS_DARK, BED_GRASS, 0.5 + 0.5 * fbm3(p / 30.0 + 2.0));
    grass = mix(grass, mix(BED_GRASS, BED_GRASS * 1.4, blades.y), blades.x * 0.85);
    col = grass;
  }
  float curbBand = (1.0 - smoothstep(0.5, 1.2, abs(field.b + 5.0 * uUnit) - 4.5 * uUnit)) * step(-12.0 * uUnit, field.b) * step(field.b, 2.0);
  vec2 brickCell = floor(p / vec2(11.0, 5.0));
  float brickTone = 0.85 + 0.3 * hash12(brickCell + 3.0);
  float jointX = 0.5 - abs(fract(p.x / 11.0 + 0.5 * mod(brickCell.y, 2.0)) - 0.5);
  float jointY = 0.5 - abs(fract(p.y / 5.0) - 0.5);
  float mortar = 1.0 - smoothstep(0.03, 0.09, min(jointX, jointY));
  col = mix(col, CURB * brickTone * (1.0 - 0.28 * mortar), curbBand);

  // The baked sun: the buildings' shadows (alpha), their feet's occlusion (blue).
  float lit = light.a;
  col *= mix(0.78, 1.0, light.b);
  col = mix(col, col * SHADE_TINT, (1.0 - lit) * 0.8 * step(field.r, 1.0));
  // Clouds' shadows drifting over it all, slowly.
  float cloud = smoothstep(0.58, 0.74, fbm3((p - vec2(uTime * 6.0, uTime * 2.0)) / 380.0 + 4.0));
  col = mix(col, col * vec3(0.8, 0.88, 1.0), cloud * 0.4);

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.9, 1.0, 1.1);
  col += spark * revealGlow(p, 0.035) * 0.55;
  col += spark * exitGlow(p) * 0.55;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.05 foliage, 0.3 iron, 0.9 glass, 2 and up a light at w - 1).
const GLASS = [0.142, 0.228, 0.442, 0.9];
const GLASS_DARK = [0.085, 0.12, 0.263, 0.9];
const TRIM = [0.793, 0.72, 0.618, 0.02];
const IRON = [0.07, 0.066, 0.09, 0.3];
const AWNINGS = [
  [0.592, 0.091, 0.105, 0.02],
  [0.101, 0.345, 0.167, 0.02],
  [0.101, 0.196, 0.442, 0.02],
];
const BANNER = [0.142, 0.555, 0.196, 0.02];
const FOLIAGE = [0.058, 0.193, 0.082, 0.05];
const FOLIAGE_LIT = [0.167, 0.469, 0.12, 0.05];
const TRUNK = [0.142, 0.1, 0.09, 0];
const BENCH_WOOD = [0.142, 0.101, 0.101, 0];
const TOWER_WHITE = [1.19, 1.33, 1.5, 0.4];
const TOWER_SHADE = [0.302, 0.442, 0.65, 0.4];
const LAMP_GLOBE = [1.5, 1.45, 1.2, 2.3];
const SIGN_ROSE = [0.9, 0.2, 0.3, 2.0];
const SIGN_BLUE = [0.2, 0.5, 1.1, 2.0];

/** A hipped mansard roof: four sloped faces rising from the rim to a flat top, a row of dormers on the face. */
function mansard(props, b, face, u) {
  const H = b.height;
  const rise = 38 * u;
  const inset = 30 * u;
  const roof = roofColor(b.palette);
  const rim = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const top = [[b.x0 + inset, b.y0 + inset], [b.x1 - inset, b.y0 + inset], [b.x1 - inset, b.y1 - inset], [b.x0 + inset, b.y1 - inset]];
  for (let k = 0; k < 4; k += 1) {
    const n = (k + 1) % 4;
    props.quad([...rim[k], H], [...rim[n], H], [...top[n], H + rise], [...top[k], H + rise], roof);
  }
  props.box({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z0: H + rise - 1, z1: H + rise + 1, hw: (b.x1 - b.x0) / 2 - inset, hh: (b.y1 - b.y0) / 2 - inset, color: roof, topColor: roof });
  // Dormers on the face to the square: small windows set into the slope.
  const count = Math.max(2, Math.round(face.length / (62 * u)));
  for (let k = 0; k < count; k += 1) {
    const s = (face.length * (k + 0.5)) / count;
    const x = face.a[0] + face.along[0] * s + face.out[0] * (inset * 0.42);
    const y = face.a[1] + face.along[1] * s + face.out[1] * (inset * 0.42);
    props.box({ x, y, z0: H + 3 * u, z1: H + 24 * u, hw: 8 * u, hh: 8 * u, yaw: Math.atan2(face.along[1], face.along[0]), color: TRIM, topColor: roof });
    props.quad(
      [x - face.along[0] * 5 * u + face.out[0] * 8.2 * u, y - face.along[1] * 5 * u + face.out[1] * 8.2 * u, H + 7 * u],
      [x + face.along[0] * 5 * u + face.out[0] * 8.2 * u, y + face.along[1] * 5 * u + face.out[1] * 8.2 * u, H + 7 * u],
      [x + face.along[0] * 5 * u + face.out[0] * 8.2 * u, y + face.along[1] * 5 * u + face.out[1] * 8.2 * u, H + 19 * u],
      [x - face.along[0] * 5 * u + face.out[0] * 8.2 * u, y - face.along[1] * 5 * u + face.out[1] * 8.2 * u, H + 19 * u],
      GLASS_DARK
    );
  }
  // Two chimneys on the ridge.
  for (const share of [0.28, 0.72]) {
    const cx = b.x0 + (b.x1 - b.x0) * (0.3 + 0.4 * hash(b.seed, share, 4));
    const cy = b.y0 + (b.y1 - b.y0) * share;
    props.box({ x: cx, y: cy, z0: H + rise - 2, z1: H + rise + 20 * u, hw: 6 * u, hh: 5 * u, color: [0.35, 0.18, 0.15, 0], topColor: [0.12, 0.1, 0.1, 0] });
  }
}

/** One building: a stone block, long windows in floors with a trim band between, a shopfront awning, a cornice, a mansard roof. */
function building(props, b, u) {
  const wall = WALLS[b.palette];
  const mid = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  props.box({ x: mid[0], y: mid[1], z0: -2, z1: b.height, hw: (b.x1 - b.x0) / 2, hh: (b.y1 - b.y0) / 2, color: [...wall, 0], topColor: roofColor(b.palette) });
  // The face to the square: a to b runs so its outer side is on the right.
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
  // Ground floor: a stone plinth, a shopfront of glass, a striped awning over it.
  wallBand(props, { a, b: c, depth: 10 * u, z0: -2, z1: 7 * u, over: 2 * u, color: trim });
  windowRun(props, { a, b: c, z0: 8 * u, z1: 34 * u, panes: Math.max(2, Math.round(length / (52 * u))), rows: 1, glass: GLASS_DARK, frame: IRON, frameW: 9 * u });
  const awning = AWNINGS[Math.floor(b.seed * AWNINGS.length) % AWNINGS.length];
  wallBand(props, { a, b: c, depth: 4 * u, z0: 36 * u, z1: 44 * u, over: 15 * u, color: awning, topColor: awning });
  wallBand(props, { a, b: c, depth: 8 * u, z0: 44 * u, z1: 50 * u, over: 4 * u, color: trim });
  // Upper floors: long windows with a lintel and a sill, a trim band every floor.
  for (let floor = 0; floor < b.floors - 1; floor += 1) {
    const z0 = (52 + floor * 50) * u;
    // Tall windows in stone piers: each its own bay, the glass narrower than the pier between.
    windowRun(props, { a, b: c, z0: z0 + 4 * u, z1: z0 + 42 * u, panes: Math.max(2, Math.round(length / (40 * u))), rows: 1, glass, frame: trim, frameW: 17 * u });
    wallBand(props, { a, b: c, depth: 8 * u, z0: z0 + 44 * u, z1: z0 + 50 * u, over: 3 * u, color: trim });
    // A balcony rail on every other floor.
    if ((floor + Math.floor(b.seed * 5)) % 2 === 0) {
      props.tube([[a[0] + out[0] * 5 * u, a[1] + out[1] * 5 * u, z0 + 14 * u], [c[0] + out[0] * 5 * u, c[1] + out[1] * 5 * u, z0 + 14 * u]], 1.1 * u, IRON, { sides: 6 });
    }
  }
  wallBand(props, { a, b: c, depth: 10 * u, z0: b.height - 7 * u, z1: b.height, over: 7 * u, color: trim });
  mansard(props, b, { a, along, out, length }, u);
}

/** A round street tree: a trunk and a crown of overlapping balls, pale on top. */
function tree(props, t, u) {
  props.tube([[t.x, t.y, -2], [t.x, t.y, t.h * 0.5]], [4.4 * u, 3 * u], TRUNK, { sides: 8 });
  const balls = [[0, 0, 0.2, 1], [-0.5, 0.25, -0.05, 0.72], [0.5, -0.2, 0, 0.74], [0.1, 0.5, 0.1, 0.62], [-0.15, -0.5, 0.08, 0.64], [0, 0, 0.55, 0.62]];
  balls.forEach(([dx, dy, dz, s], k) => {
    props.sphere({ x: t.x + dx * t.r, y: t.y + dy * t.r, z: t.h + dz * t.r, r: t.r * s, color: k % 2 ? FOLIAGE_LIT : FOLIAGE, sides: 14, rings: 9, squash: 0.9 });
  });
  props.cylinder({ x: t.x, y: t.y, z0: -2, z1: 1.2, r: t.r * 0.8, color: [0.3, 0.26, 0.24, 0], sides: 18 });
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
  props.quad([l.x + l.side * -0.6 * u, l.y - 5 * u, l.h * 0.46], [l.x + l.side * -0.6 * u, l.y + 5 * u, l.h * 0.46], [l.x + l.side * -0.6 * u, l.y + 5 * u, l.h * 0.78], [l.x + l.side * -0.6 * u, l.y - 5 * u, l.h * 0.78], BANNER);
}

/** A bench: two dark slats on iron legs, its back to the strip's edge. */
function bench(props, b, u) {
  props.box({ x: b.x, y: b.y, z0: 6 * u, z1: 9 * u, hw: b.w / 2, hh: b.d / 2, color: BENCH_WOOD });
  props.box({ x: b.x - b.side * 6 * u, y: b.y, z0: 9 * u, z1: 22 * u, hw: 1.5 * u, hh: b.d / 2, color: BENCH_WOOD });
  for (const y of [b.y - b.d / 2 + 4 * u, b.y + b.d / 2 - 4 * u]) props.box({ x: b.x, y, z0: -1, z1: 6 * u, hw: b.w / 2 - 1 * u, hh: 1.2 * u, color: IRON });
}

/**
 * The Prism Tower: a white lattice that tapers to a waist, swells to a crowned head, a mast on top; its
 * flared base in four legs. Four tubes up its corners, rings and braces between.
 */
function prismTower(props, t, u) {
  const profile = (s) => {
    // Radius over its height 0..1: legs flaring out, a waist, a swollen head.
    const waist = 0.34 + 0.24 * (1 - Math.sin(Math.min(s / 0.38, 1) * Math.PI / 2));
    const head = s > 0.62 ? 0.38 * Math.sin(((s - 0.62) / 0.38) * Math.PI * 0.85) : 0;
    return t.r * (s < 0.62 ? waist + 0.55 * Math.exp(-s * 6) : 0.34 + head);
  };
  const levels = 14;
  const ring = (s) => profile(s);
  for (let k = 0; k < 4; k += 1) {
    const angle = (k / 4) * 2 * Math.PI + Math.PI / 4;
    const points = Array.from({ length: levels + 1 }, (_, i) => {
      const s = i / levels;
      return [t.x + Math.cos(angle) * ring(s), t.y + Math.sin(angle) * ring(s), -2 + s * t.h];
    });
    props.tube(points, 2.4 * u, TOWER_WHITE, { sides: 6 });
  }
  for (let i = 1; i <= levels; i += 1) {
    const s = i / levels;
    const z = -2 + s * t.h;
    const r = ring(s);
    props.ring({ x: t.x, y: t.y, z0: z - 1.6 * u, z1: z + 1.6 * u, r, color: TOWER_WHITE, sides: 16 });
    // X-braces between this ring and the one below, on two faces.
    const r0 = ring((i - 1) / levels);
    const z0 = -2 + ((i - 1) / levels) * t.h;
    for (const sign of [1, -1]) {
      props.tube([[t.x + r0 * 0.7, t.y + sign * r0 * 0.7, z0], [t.x + r * 0.7, t.y - sign * r * 0.7, z]], 1.2 * u, TOWER_SHADE, { sides: 4 });
    }
  }
  props.tube([[t.x, t.y, t.h - 2], [t.x, t.y, t.h + 54 * u]], [2.6 * u, 0.7 * u], TOWER_WHITE, { sides: 6 });
}

/** The big billboard on the dark purple corner building: a lit screen with a pink and blue figure. */
function billboard(props, b, u) {
  if (b.palette !== DARK_PURPLE) return;
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
  const { buildings, trees, lamps, benches, tower, u } = spots;
  const props = createPropBuilder();
  for (const b of buildings) {
    building(props, b, u);
    billboard(props, b, u);
  }
  for (const t of trees) tree(props, t, u);
  for (const l of lamps) lamp(props, l, u);
  for (const b of benches) bench(props, b, u);
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
    col = albedo * (0.42 + 0.95 * smoothstep(-0.1, 0.8, bulge)) * mix(0.62, 1.0, smoothstep(0.0, 0.2, lobe.x)) * (sky * 0.5 + 0.55) * mix(0.55, 1.05, crown);
  } else if (metal > 0.065 && metal < 0.075) {
    // Roof slates: courses running across the slope, each slate a shade of its own.
    float s = length(n.xy) > 0.25 ? dot(world.xy, normalize(n.xy)) / max(length(n.xy), 0.3) : world.y;
    float course = fract(s / 7.0);
    float slate = hash12(vec2(floor(s / 7.0), floor((world.x + world.y * 0.3) / 9.0)));
    col = albedo * (0.8 + 0.4 * slate) * (sky * 0.55 + 0.45 + lit * 0.7) * (0.84 + 0.16 * smoothstep(0.0, 0.2, course) * (1.0 - smoothstep(0.85, 1.0, course)));
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
      own.uUnit.value = spots?.u ?? 1;
      const square = spots?.square;
      own.uSquare.value.set(square?.x0 ?? 0, square?.y0 ?? 0, square?.x1 ?? 0, square?.y1 ?? 0);
      own.uBeds.value.forEach((slot, i) => {
        const bed = spots?.beds[i];
        return bed ? slot.set(bed.x0, bed.y0, bed.x1, bed.y1) : slot.set(0, 0, 0, 0);
      });
      own.uBlocks.value.forEach((slot, i) => {
        const b = spots?.buildings[i];
        own.uBlockHeights.value[i] = b ? b.height : 0;
        return b ? slot.set(b.x0, b.y0, b.x1, b.y1) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, lumioseProps(spots).build(three));
    },
  };
}
