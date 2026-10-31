// Design 077 (prototype): Community Center (customhb-361) after its card art (TWM 146, Marina
// Chikazawa): a white two-storey hall with a red-brown roof band and rail, a tall green banner down
// its face and a green flag on a pole, a red-awninged door, a white pop-up tent with a green and a
// red kiosk beside it, round green trees, a pale paved square in front of it all and a rock cliff
// with a waterfall behind. The art looks across the square at the hall; the board looks down on the
// square, so the square holds every card, the hall stands along its left side (the band both camera
// presets show whole; its face to the cards, the flag on its roof), the cliff rises behind it with
// the waterfall pouring into a pool past the hall's far end, and the tent, kiosks and trees stand in
// the right band.
// World scale: a card's footprint is a paving slab of the square; the hall is two cards a floor.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the square's edge (negative
// on it), B a rock's tone 0..1, A the kind (0 grass, 1 square, 2 cliff, 3 pool); the shared light
// bake adds normals, occlusion and the sun's shadow. Per frame: TERRAIN paints the grass, the
// square, the cliff and its waterfall, and the shadows of the hall, tent, kiosks and trees; POOL one
// sheet of water; PROPS the hall, tent, kiosks, flag, benches, trees and boulders
// (stadium-env-props); MIST drifts off the pool.
import {
  FILTERING,
  FLOW_STREAKS,
  FOOTPRINTS,
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  STONES,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { wallBand, windowRun } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, BOX_SHADOW, EDGE_HAZE, PAVING, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const COMMUNITY_KEY = 'community-center';
/** The day's sun (toward it, table frame): high, from the far left, so the hall's blue shade falls across the square, as the art's. */
export const COMMUNITY_SUN = Object.freeze([-0.5, 0.35, 0.8]);
/** The square runs this far past the cards' box; its kerb rises this high. */
export const PLAZA_MARGIN_PX = 64;
export const PLAZA_RISE_PX = 5;
/** The hall's height; the cliff's foot (past the cards' box), run to its top and height; the pool's radius. */
export const HALL_HEIGHT_PX = 146;
export const CLIFF = Object.freeze({ foot: 124, run: 250, top: 156 });
export const POOL_RADIUS_PX = 68;
export const POOL_LEVEL = -9;
export const MAX_TREES = 10;
const MIST_COUNT = 36;

/**
 * Community Center's layout: the square, the hall across its far end with its entrance canopy,
 * banner and flag, the tent and the two kiosks, the cliff down the left band and the pool at its
 * foot, the trees. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function communitySpots(layout) {
  const ctx = boardContext(layout, COMMUNITY_KEY);
  if (!ctx) return null;
  const { scene, core, u, hand } = ctx;
  const front = (hand ? hand.y + hand.h : core.y + core.h) + 54 * u;
  const plaza = { x0: core.x - PLAZA_MARGIN_PX * u, y0: core.y - PLAZA_MARGIN_PX * u, x1: core.x + core.w + PLAZA_MARGIN_PX * u, y1: front };
  // The hall stands on the square's left edge, its face on it, long down the table.
  const hall = { x0: plaza.x0 - 190 * u, x1: plaza.x0, y0: core.y + 70 * u, y1: core.y + core.h * 0.8, height: HALL_HEIGHT_PX * u };
  const hallLength = hall.y1 - hall.y0;
  const canopy = { x0: hall.x1, x1: hall.x1 + 36 * u, y0: hall.y0 + hallLength * 0.5 - 76 * u, y1: hall.y0 + hallLength * 0.5 + 76 * u, z0: 56 * u, z1: 64 * u };
  const banner = { y: hall.y0 + hallLength * 0.2, w: 28 * u, z0: 22 * u, z1: 128 * u };
  const flag = { x: hall.x1 - 30 * u, y: hall.y1 - 34 * u, base: hall.height, h: 130 * u };
  const tent = { x: plaza.x1 + 130 * u, y: core.y + core.h * 0.56, half: 66 * u, post: 58 * u, apex: 90 * u };
  const kiosks = [
    { x: tent.x + 112 * u, y: tent.y - 62 * u, w: 52 * u, d: 40 * u, h: 56 * u, green: true },
    { x: tent.x + 112 * u, y: tent.y + 40 * u, w: 52 * u, d: 40 * u, h: 52 * u, green: false },
  ];
  const cliffFoot = hall.x0 - 22 * u;
  const cliffStart = hall.y0 - 50 * u;
  const fall = { y: hall.y1 + 92 * u, half: 30 * u };
  const pool = { x: cliffFoot + 6 * u, y: fall.y, r: POOL_RADIUS_PX * u };
  const trees = [];
  const spots = [];
  for (let gy = scene.y + 70 * u; gy < front - 20 * u; gy += 150 * u) {
    for (let gx = scene.x + 60 * u; gx < scene.x + scene.w - 40 * u; gx += 130 * u) {
      spots.push([gx + (hash(gx, gy, 1) - 0.5) * 70 * u, gy + (hash(gx, gy, 2) - 0.5) * 70 * u]);
    }
  }
  for (const [x, y] of spots) {
    const roll = (salt) => hash(x, y, salt);
    const r = (34 + 18 * roll(3)) * u;
    const onRight = x > plaza.x1 + 60 * u + r;
    const onFar = y > plaza.y1 + 30 * u + r && x > cliffFoot + 120 * u;
    if (!(onRight || onFar) || roll(4) > 0.74 || trees.length >= MAX_TREES) continue;
    if (!ctx.inScene(x, y, r * 0.5) || y < core.y - 30 * u) continue;
    if (Math.hypot(x - tent.x, y - tent.y) < tent.half + r + 30 * u) continue;
    if (kiosks.some((k) => Math.hypot(x - k.x, y - k.y) < r + 50 * u)) continue;
    if (trees.some((t) => Math.hypot(x - t.x, y - t.y) < r + t.r + 12 * u)) continue;
    trees.push({ x, y, r, z: (58 + 18 * roll(5)) * u, seed: roll(6) });
  }
  const benches = [0.18, 0.82].map((share) => ({ x: hall.x1 + 22 * u, y: hall.y0 + hallLength * share, w: 18 * u, d: 62 * u, h: 12 * u }));
  const boulders = [0, 1, 2, 3, 4].map((k) => {
    const angle = -0.9 + k * 0.52 + hash(k, 8, 1) * 0.2;
    return { x: pool.x + Math.cos(angle) * pool.r * 1.06, y: pool.y + Math.sin(angle) * pool.r * 1.06, r: (11 + 9 * hash(k, 8, 2)) * u };
  });
  // Scree spilled off the cliff's foot along its length, clear of the hall.
  for (let k = 0; k < 18; k += 1) {
    const y = cliffStart + 60 * u + (k / 17) * (scene.y + scene.h - cliffStart - 120 * u);
    const x = cliffFoot - 4 * u + (hash(k, 9, 1) - 0.4) * 60 * u;
    if (Math.hypot(x - pool.x, y - pool.y) < pool.r * 1.3 || x > hall.x0 - 4 * u && y > hall.y0 - 20 * u && y < hall.y1 + 20 * u) continue;
    boulders.push({ x, y, r: (9 + 16 * hash(k, 9, 2) ** 1.5) * u });
  }
  return { ...ctx, plaza, front, hall, canopy, banner, flag, tent, kiosks, cliffFoot, cliffStart, fall, pool, trees, benches, boulders };
}

const COMMUNITY = /* glsl */ `
// The square (x0, y0, x1, y1), its corner radius and its kerb's rise; the cliff (its foot's x, the
// run to its top, its height, the y it starts at); the waterfall (its y, half width, the pool's x
// and y); the pool (radius, water level). The scale of a card (u). The hall, the tent, both kiosks
// (x0, y0, x1, y1) and their heights; the trees (x, y, crown radius, crown height).
uniform vec4 uPlaza;
uniform vec2 uShape;
uniform vec4 uCliff;
uniform vec4 uFall;
uniform vec2 uPool;
uniform float uUnit;
uniform vec4 uBoxes[4];
uniform vec4 uHeights;
uniform vec4 uTrees[${MAX_TREES}];
float plazaDistance(vec2 p) {
  vec2 centre = (uPlaza.xy + uPlaza.zw) * 0.5;
  vec2 q = abs(p - centre) - ((uPlaza.zw - uPlaza.xy) * 0.5 - uShape.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uShape.x;
}
`;

/**
 * Bake: grass lying almost flat; the square a step proud with a rounded kerb; the cliff climbing out
 * of the left band as heaps of sculpted rock with a smooth chute for the waterfall; the pool a basin.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${STONES}
${COMMUNITY}
void main() {
  vec2 p = uMin + vUv * uSize;
  float sd = plazaDistance(p);
  float h = 0.5 * (fbm3(p / 90.0) - 0.5);
  float kind = 0.0;
  float tone = 0.3;
  if (sd < 0.0) {
    h = uShape.y * smoothstep(0.0, -4.0, sd);
    kind = 1.0;
  }
  float yMask = smoothstep(uCliff.w, uCliff.w + 150.0, p.y + 70.0 * (fbm3(vec2(p.x / 230.0, 8.0)) - 0.5));
  float foot = uCliff.x + 120.0 * (fbm3(vec2(p.y / 260.0, 3.0)) - 0.5) + 24.0 * (gnoise(p / 36.0) - 0.5);
  float t = clamp((foot - p.x) / uCliff.y, 0.0, 1.0);
  if (t > 0.0 && yMask > 0.0) {
    vec3 big = stones(p, 120.0, 4.0);
    vec3 mid = stones(p + 37.0, 58.0, 3.0);
    float rock = max(big.x, mid.x * 0.55);
    float slope = uCliff.z * t * t * (3.0 - 2.0 * t);
    float wallH = (slope * (0.5 + 0.5 * rock) + 38.0 * rock * smoothstep(0.0, 0.25, t)) * yMask;
    float chute = 1.0 - smoothstep(uFall.y * 0.6, uFall.y * 1.15, abs(p.y - uFall.x));
    wallH = mix(wallH, slope * 0.82 * yMask, chute);
    if (wallH > h) {
      h = wallH;
      kind = 2.0;
      tone = big.x > mid.x * 0.55 ? big.y : mid.y;
    }
  }
  float pd = distance(p, uFall.zw);
  if (pd < uPool.x + 14.0) {
    h = mix(h, -24.0, smoothstep(uPool.x + 14.0, uPool.x * 0.72, pd));
    if (pd < uPool.x) kind = 3.0;
  }
  gl_FragColor = vec4(h, sd, tone, kind);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 GRASS = vec3(0.075, 0.25, 0.095);
const vec3 GRASS_DARK = vec3(0.04, 0.14, 0.07);
const vec3 GRASS_LIT = vec3(0.15, 0.38, 0.12);
// Design 080: a step under the art's pale square, so white card borders keep their edge.
const vec3 PLAZA = vec3(0.462, 0.482, 0.534);
const vec3 PLAZA_SHADE = vec3(0.345, 0.411, 0.531);
const vec3 ROCK_LIT = vec3(0.644, 0.474, 0.432);
const vec3 ROCK_MID = vec3(0.345, 0.294, 0.392);
const vec3 ROCK_SHADE = vec3(0.167, 0.196, 0.345);
const vec3 ROCK_MOSS = vec3(0.147, 0.228, 0.142);
const vec3 FALL = vec3(0.625, 0.722, 0.858);
const vec3 POOL = vec3(0.101, 0.442, 0.555);
const vec3 POOL_DEEP = vec3(0.046, 0.16, 0.295);
const vec3 SHADE_TINT = vec3(0.6, 0.7, 0.98);
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
${BOX_SHADOW}
${FLOW_STREAKS}
${PALETTE}
${COMMUNITY}
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
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float lit = clamp(dot(n, sun) / sun.z, 0.0, 1.4) * mix(0.62, 1.0, light.a);

  // The grass: soft green in broad drifts under tufts of blades, clover paler among them.
  vec3 col = mix(GRASS_DARK * 1.2, GRASS, 0.3 + 0.7 * smoothstep(0.3, 0.7, fbm3(p / 120.0 + 1.0)));
  col *= 0.88 + 0.24 * fbm3(p / 30.0 + 4.0);
  vec4 tuft = voronoiCell(p / 12.0 + 2.3);
  vec2 blades = bladeFan(-tuft.zw * 12.0, tuft.y, 9.0 * uUnit);
  col = mix(col, mix(GRASS_DARK, GRASS_LIT, blades.y), blades.x * step(fract(tuft.y * 23.1), 0.62) * 0.85);
  col = mix(col, GRASS_LIT * 1.1, 0.25 * smoothstep(0.62, 0.7, fbm3(p / 19.0 + 8.0)));

  // The square: big pale slabs a shade apart, joints darker and blue in the shade, a kerb of lighter stone.
  if (kind > 0.5 && kind < 1.5) {
    vec3 slab = paving(p, vec2(132.0, 100.0) * uUnit, 0.5);
    vec3 stone = mix(PLAZA * 0.9, PLAZA * 1.05, slab.y);
    stone *= 0.94 + 0.12 * fbm3(p / 26.0 + slab.y * 9.0);
    stone *= 0.97 + 0.06 * grain(p, 3.4);
    // Wide, faint joints; a darker, finer line down the middle of some, as a cut control joint.
    stone = mix(stone, stone * 0.8, 1.0 - smoothstep(0.4, 1.4, slab.x));
    stone *= 1.0 - 0.07 * step(0.6, slab.y) * (1.0 - smoothstep(0.0, 1.1, abs(slab.z - 0.5) * 132.0 * uUnit));
    // Each slab dished a little at its middle: its centre catches the sky.
    stone *= 1.0 + 0.05 * (1.0 - smoothstep(0.0, 0.5, length(vec2(slab.z - 0.5, fract(p.y / (100.0 * uUnit)) - 0.5))));
    stone *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 18.0, -sd));
    col = stone;
    float kerb = (1.0 - smoothstep(0.5, 1.5, abs(sd + 3.0))) * 0.5;
    col = mix(col, PLAZA * 1.18, kerb);
    // A gutter of darker stone round the square's edge, a few slabs wide.
    col *= 1.0 - 0.1 * (1.0 - smoothstep(10.0, 30.0 * uUnit, -sd));
  }

  // The cliff: sculpted rock, sunlit faces warm beige, the shaded ones blue-violet, moss in the low creases.
  vec3 base = col;
  if (kind > 1.5 && kind < 2.5) {
    float facing = clamp(dot(n, sun), 0.0, 1.0);
    vec3 rock = mix(ROCK_SHADE, ROCK_MID, smoothstep(0.1, 0.5, facing));
    rock = mix(rock, ROCK_LIT, smoothstep(0.5, 0.9, facing));
    rock *= 0.82 + 0.4 * field.b;
    rock *= 0.9 + 0.2 * fbm3(p / 17.0);
    float strata = smoothstep(0.45, 0.62, gnoise(vec2(p.y / 9.0 + 3.0 * gnoise(p / 44.0), p.x / 80.0)));
    rock *= 1.0 - 0.07 * strata;
    float low = 1.0 - smoothstep(0.0, 36.0, field.r);
    rock = mix(rock, ROCK_MOSS * (0.8 + 0.4 * gnoise(p / 7.0)), 0.55 * low * smoothstep(0.3, 0.7, fbm3(p / 40.0 + 3.0)));
    col = mix(base, rock, smoothstep(2.0, 10.0, field.r));
    // The waterfall: pale blue-white water sliding down the chute, in streaks that run downhill.
    float across = abs(p.y - uFall.x);
    float inFall = (1.0 - smoothstep(uFall.y * 0.55, uFall.y * 0.95, across + 5.0 * (gnoise(p / 14.0) - 0.5))) * smoothstep(0.0, 24.0, field.r);
    float streak = flowStreaks(vec2(p.x, p.y * 1.7), 62.0, 3.0, vec2(60.0, 4.0));
    vec3 water = mix(FALL * 0.7, vec3(0.8, 0.88, 0.96), smoothstep(0.35, 0.7, streak));
    col = mix(col, water, inFall * 0.9);
  }
  // The pool's bed under the water: dark in the middle, pale sand at the rim.
  if (kind > 2.5) {
    float pd = distance(p, uFall.zw) / uPool.x;
    col = mix(vec3(0.34, 0.4, 0.34), POOL_DEEP * 0.75, smoothstep(0.35, 0.9, 1.0 - pd + 0.4 * (gnoise(p / 11.0) - 0.5)));
  }

  col *= 0.8 + 0.32 * min(lit, 1.2);
  col *= mix(0.6, 1.0, smoothstep(0.3, 0.9, light.b));
  // The hall's, the tent's, the kiosks' and the trees' shadows, blue where the sky fills them.
  float shadow = 0.0;
  if (kind < 2.5) {
    vec3 ground = vec3(p, max(field.r, 0.0));
    shadow = max(max(boxShadow(ground, sun, uBoxes[0], uHeights.x), boxShadow(ground, sun, uBoxes[1], uHeights.y)), max(boxShadow(ground, sun, uBoxes[2], uHeights.z), boxShadow(ground, sun, uBoxes[3], uHeights.w)));
    for (int i = 0; i < ${MAX_TREES}; i++) {
      vec4 tree = uTrees[i];
      if (tree.z <= 0.0) continue;
      vec2 shade = tree.xy - sun.xy / sun.z * tree.w;
      float spread = tree.z * 1.12;
      shadow = max(shadow, (1.0 - smoothstep(spread * 0.7, spread * 1.05, distance(p, shade))) * 0.9);
    }
    shadow *= vGrowth;
  }
  col = mix(col, col * SHADE_TINT, shadow * 0.78);
  // Clouds' shadows drifting over everything, slowly.
  float cloud = smoothstep(0.55, 0.72, fbm3((p - vec2(uTime * 7.0, uTime * 2.5)) / 420.0 + 6.0)) * step(kind, 2.5);
  // Design 080: the clouds' shadows cross the town, faintly over the square's cards.
  col = mix(col, col * vec3(0.78, 0.86, 1.0), cloud * 0.5 * (1.0 - 0.7 * fieldCalm(p, 120.0)));

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.85, 1.0, 1.05);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const POOL_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, ${POOL_LEVEL.toFixed(1)} * terrainGrowth(position.xy), 1.0);
}
`;

/** The pool: clear teal over its bed, rings spreading from the waterfall's foot, foam and spray there. */
export const POOL_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FILTERING}
${REVEAL}
${PALETTE}
${COMMUNITY}
varying vec2 vPos;
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  float fromCentre = distance(p, uFall.zw);
  if (fromCentre > uPool.x * 1.04 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  float t = uTime;
  float depth = smoothstep(uPool.x, uPool.x * 0.25, fromCentre);
  vec3 col = mix(POOL * 1.15, POOL_DEEP * 1.3, depth * 0.85);
  // Ripples widening from where the fall lands, on its side of the pool.
  vec2 landing = uFall.zw + vec2(-uPool.x * 0.82, 0.0);
  float ring = sin(distance(p, landing) * 0.22 - t * 3.0 + 3.0 * gnoise(p / 30.0));
  col += vec3(0.1, 0.15, 0.16) * smoothstep(0.6, 1.0, ring) * smoothstep(uPool.x * 1.5, uPool.x * 0.2, distance(p, landing));
  vec3 view = normalize(uEye - vec3(p, ${POOL_LEVEL.toFixed(1)}));
  vec3 sun = normalize(uSun);
  vec2 slope = vec2(gnoise(p / 9.0 + vec2(t * 0.5, 0.0)) - gnoise(p / 9.0 + vec2(t * 0.5 + 0.3, 0.0)), gnoise(p / 9.0 + vec2(0.0, t * 0.4)) - gnoise(p / 9.0 + vec2(0.0, t * 0.4 + 0.3)));
  vec3 n = normalize(vec3(slope * 2.6, 1.0));
  col += vec3(1.0, 0.98, 0.9) * pow(max(dot(reflect(-sun, n), view), 0.0), 70.0) * 0.3;
  // Foam where the fall lands, and a rim of it round the stones.
  float foam = exp(-pow(distance(p, landing) / (uPool.x * 0.34), 2.0)) * (0.5 + 0.5 * gnoise(p / 6.0 + t)) * 0.8;
  foam += (1.0 - smoothstep(uPool.x * 0.9, uPool.x * 1.03, fromCentre)) * smoothstep(uPool.x * 0.82, uPool.x * 0.9, fromCentre) * 0.5 * grain(p, 5.0);
  col = mix(col, vec3(0.78, 0.87, 0.93), clamp(foam, 0.0, 1.0) * 0.5);
  col += vec3(0.9, 1.0, 1.05) * revealGlow(p, 0.035) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how glossy, 0.05 foliage, 0.9 glass, 2 and up a light at w - 1).
const WALL = [0.94, 0.957, 0.957, 0];
const ROOF_TOP = [0.2, 0.23, 0.3, 0];
const UNIT = [0.5, 0.54, 0.6, 0.3];
const UNIT_TOP = [0.72, 0.76, 0.8, 0.3];
const ROOF_BAND = [0.592, 0.228, 0.215, 0.2];
const ROOF_BAND_DARK = [0.267, 0.081, 0.114, 0.2];
const GLASS = [0.101, 0.228, 0.345, 0.9];
const GLASS_FRAME = [0.8, 0.84, 0.88, 0.2];
const BANNER = [0.101, 0.592, 0.442, 0.2];
const GLYPH = [0.9, 1.1, 0.55, 2.2];
const FLAG_GREEN = [0.101, 0.496, 0.228, 0.1];
const FLAG_WHITE = [0.95, 0.98, 0.95, 0.1];
const POLE = [0.82, 0.86, 0.9, 0.5];
const TENT = [0.97, 0.98, 1.0, 0.1];
const TENT_EDGE = [0.5, 0.6, 0.78, 0.1];
const KIOSK_G = [0.0, 0.305, 0.089, 0.3];
const KIOSK_R = [0.934, 0.062, 0.093, 0.3];
const KIOSK_TOP = [0.88, 0.9, 0.92, 0.2];
const CONCRETE = [0.5, 0.55, 0.62, 0];
const TRUNK = [0.28, 0.2, 0.16, 0];
const FOLIAGE = [0.087, 0.274, 0.077, 0.05];
const FOLIAGE_LIGHT = [0.16, 0.44, 0.1, 0.05];
const BOULDER = [0.45, 0.4, 0.45, 0.07];

/**
 * The hall: a white block with a ground floor of glazing, a ribbon of upper windows, the red-brown
 * roof band under a railed roof, a red-brown awning on posts over the door, a tall green banner and
 * a flag on the roof. Its face to the cards is the one at its right edge (+x): a to b runs +y so its
 * outer side is on the right.
 */
function communityHall(props, spots) {
  const { hall, canopy, banner, flag, benches, u } = spots;
  const H = hall.height;
  const mid = [(hall.x0 + hall.x1) / 2, (hall.y0 + hall.y1) / 2];
  props.box({ x: mid[0], y: mid[1], z0: -2, z1: H, hw: (hall.x1 - hall.x0) / 2, hh: (hall.y1 - hall.y0) / 2, color: WALL, topColor: ROOF_TOP });
  const faces = [
    { a: [hall.x1, hall.y0], b: [hall.x1, hall.y1], length: hall.y1 - hall.y0 },
    { a: [hall.x0, hall.y0], b: [hall.x1, hall.y0], length: hall.x1 - hall.x0 },
  ];
  for (const { a, b, length } of faces) {
    wallBand(props, { a, b, depth: 10 * u, z0: -2, z1: 8 * u, over: 2 * u, color: CONCRETE });
    // Ground floor: tall panes in white frames; upper floor: a ribbon of windows.
    windowRun(props, { a, b, z0: 10 * u, z1: 64 * u, panes: Math.max(2, Math.round(length / (46 * u))), rows: 1, glass: GLASS, frame: GLASS_FRAME, frameW: 5 * u });
    windowRun(props, { a, b, z0: 78 * u, z1: 112 * u, panes: Math.max(2, Math.round(length / (60 * u))), rows: 1, glass: GLASS, frame: GLASS_FRAME, frameW: 5 * u });
    wallBand(props, { a, b, depth: 10 * u, z0: 116 * u, z1: H - 6 * u, over: 5 * u, color: ROOF_BAND, topColor: ROOF_BAND_DARK });
    wallBand(props, { a, b, depth: 6 * u, z0: H - 6 * u, z1: H, over: 8 * u, color: ROOF_BAND_DARK, topColor: ROOF_BAND });
  }
  // The roof's rail: posts and two rails round it.
  const rail = [[hall.x0, hall.y0], [hall.x1, hall.y0], [hall.x1, hall.y1], [hall.x0, hall.y1], [hall.x0, hall.y0]];
  for (const z of [H + 10 * u, H + 20 * u]) props.tube(rail.map(([x, y]) => [x, y, z]), 1.4 * u, POLE, { sides: 6 });
  for (let k = 0; k < 4; k += 1) {
    const [x0, y0] = rail[k];
    const [x1, y1] = rail[k + 1];
    const count = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (34 * u)));
    for (let i = 0; i < count; i += 1) props.cylinder({ x: x0 + ((x1 - x0) * i) / count, y: y0 + ((y1 - y0) * i) / count, z0: H, z1: H + 21 * u, r: 1.4 * u, color: POLE, sides: 6 });
  }
  // The roof's units: a stair hut at the near end, three air handlers with fans, a row of skylights.
  const length = hall.y1 - hall.y0;
  props.box({ x: hall.x1 - 52 * u, y: hall.y0 + 44 * u, z0: H, z1: H + 30 * u, hw: 30 * u, hh: 24 * u, color: WALL, topColor: UNIT_TOP });
  props.box({ x: hall.x1 - 22 * u, y: hall.y0 + 44 * u, z0: H, z1: H + 22 * u, hw: 1, hh: 9 * u, color: GLASS });
  for (const [share, side] of [[0.3, 0.3], [0.62, 0.42], [0.86, 0.3]]) {
    const x = hall.x0 + (hall.x1 - hall.x0) * side;
    const y = hall.y0 + length * share;
    props.box({ x, y, z0: H, z1: H + 16 * u, hw: 24 * u, hh: 18 * u, color: UNIT, topColor: UNIT_TOP });
    props.cylinder({ x, y, z0: H + 16 * u, z1: H + 17.4 * u, r: 13 * u, color: [0.1, 0.11, 0.13, 0.3], sides: 14 });
  }
  for (let k = 0; k < 4; k += 1) {
    const x = (hall.x0 + hall.x1) / 2 + 24 * u;
    const y = hall.y0 + length * (0.18 + 0.19 * k) + 20 * u;
    props.box({ x, y, z0: H, z1: H + 6 * u, hw: 34 * u, hh: 20 * u, color: UNIT, topColor: GLASS });
  }
  // The banner down the face, pale glyphs on it.
  const face = hall.x1 + 1.6 * u;
  props.quad([face, banner.y + banner.w, banner.z0], [face, banner.y, banner.z0], [face, banner.y, banner.z1], [face, banner.y + banner.w, banner.z1], BANNER);
  for (let k = 0; k < 4; k += 1) {
    const z = banner.z0 + 12 * u + k * 22 * u;
    props.quad([face + 0.4 * u, banner.y + banner.w - 5 * u, z], [face + 0.4 * u, banner.y + 5 * u, z], [face + 0.4 * u, banner.y + 5 * u, z + 14 * u], [face + 0.4 * u, banner.y + banner.w - 5 * u, z + 14 * u], GLYPH);
  }
  // The awning over the door: a red-brown slab on two white posts.
  props.box({ x: (canopy.x0 + canopy.x1) / 2, y: (canopy.y0 + canopy.y1) / 2, z0: canopy.z0, z1: canopy.z1, hw: (canopy.x1 - canopy.x0) / 2, hh: (canopy.y1 - canopy.y0) / 2, color: ROOF_BAND, topColor: ROOF_BAND_DARK });
  for (const y of [canopy.y0 + 8 * u, canopy.y1 - 8 * u]) props.cylinder({ x: canopy.x1 - 6 * u, y, z0: -2, z1: canopy.z0, r: 2.6 * u, color: POLE, sides: 8 });
  // The flag: a green banner with a white diamond on a pole standing on the roof, flying toward the far end.
  const top = flag.base + flag.h;
  props.tube([[flag.x, flag.y, flag.base - 2], [flag.x, flag.y, top]], [3.2 * u, 1.6 * u], POLE, { sides: 8 });
  props.sphere({ x: flag.x, y: flag.y, z: top + 2 * u, r: 3.2 * u, color: POLE, sides: 8, rings: 6 });
  const fw = 78 * u;
  const fh = 48 * u;
  const fz = top - 8 * u;
  props.quad([flag.x, flag.y, fz - fh], [flag.x + 6 * u, flag.y + fw, fz - fh], [flag.x + 6 * u, flag.y + fw, fz], [flag.x, flag.y, fz], FLAG_GREEN);
  const cx = flag.x + 3 * u + 0.4 * u;
  const cy = flag.y + fw * 0.5;
  const cz = fz - fh / 2;
  props.quad([cx, cy, cz - 13 * u], [cx + 0.5 * u, cy + 13 * u, cz], [cx, cy, cz + 13 * u], [cx + 0.5 * u, cy - 13 * u, cz], FLAG_WHITE);
  // Two concrete benches along the face.
  for (const bench of benches) {
    props.box({ x: bench.x, y: bench.y, z0: -2, z1: bench.h, hw: bench.w / 2, hh: bench.d / 2, color: CONCRETE, topColor: [0.62, 0.66, 0.72, 0] });
  }
}

/** The pop-up tent on four posts under a four-sided white roof with a blue-grey valance, and the two kiosks. */
function communityTent(props, spots) {
  const { tent, kiosks, u } = spots;
  const half = tent.half;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    props.tube([[tent.x + sx * (half - 4 * u), tent.y + sy * (half - 4 * u), -2], [tent.x + sx * (half - 4 * u), tent.y + sy * (half - 4 * u), tent.post]], 2.2 * u, POLE, { sides: 8 });
  }
  props.cone({ x: tent.x, y: tent.y, z0: tent.post, z1: tent.apex, r: half * 1.414, color: TENT, sides: 4, turn: Math.PI / 4 });
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [tent.x + sx * half, tent.y + sy * half]);
  for (let k = 0; k < 4; k += 1) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 4];
    props.quad([x0, y0, tent.post - 9 * u], [x1, y1, tent.post - 9 * u], [x1, y1, tent.post], [x0, y0, tent.post], TENT_EDGE);
  }
  // A counter under it.
  props.box({ x: tent.x, y: tent.y + half * 0.45, z0: -2, z1: 24 * u, hw: half * 0.7, hh: 9 * u, color: KIOSK_TOP });
  for (const kiosk of kiosks) {
    const body = kiosk.green ? KIOSK_G : KIOSK_R;
    props.box({ x: kiosk.x, y: kiosk.y, z0: -2, z1: kiosk.h, hw: kiosk.w / 2, hh: kiosk.d / 2, color: body, topColor: KIOSK_TOP });
    props.box({ x: kiosk.x - kiosk.w / 2 + 1 * u, y: kiosk.y, z0: kiosk.h * 0.38, z1: kiosk.h * 0.7, hw: 1.5 * u, hh: kiosk.d * 0.36, color: GLASS });
    props.box({ x: kiosk.x - kiosk.w / 2 - 4 * u, y: kiosk.y, z0: kiosk.h * 0.72, z1: kiosk.h * 0.76, hw: 7 * u, hh: kiosk.d * 0.44, color: kiosk.green ? [0.9, 0.95, 0.9, 0.2] : [0.95, 0.95, 0.95, 0.2] });
  }
}

/** Round trees: a trunk and a crown of a few overlapping balls, the boulders by the pool. */
function communityTrees(props, spots) {
  const { trees, boulders, u } = spots;
  for (const tree of trees) {
    props.tube([[tree.x, tree.y, -2], [tree.x, tree.y, tree.z * 0.7]], [4.6 * u, 3 * u], TRUNK, { sides: 8 });
    const balls = [[0, 0, 0, 1], [-0.52, 0.2, -0.16, 0.74], [0.5, -0.24, -0.1, 0.76], [0.08, 0.46, 0.2, 0.62], [-0.1, -0.5, 0.14, 0.66]];
    balls.forEach(([dx, dy, dz, scale], k) => {
      props.sphere({ x: tree.x + dx * tree.r, y: tree.y + dy * tree.r, z: tree.z + dz * tree.r, r: tree.r * scale, color: k % 2 ? FOLIAGE_LIGHT : FOLIAGE, sides: 14, rings: 9, squash: 0.88 });
    });
  }
  for (const rock of boulders) props.sphere({ x: rock.x, y: rock.y, z: -3, r: rock.r, color: BOULDER, sides: 12, rings: 8, squash: 0.72 });
}

/** Everything solid, as one prop geometry. */
export function communityProps(spots) {
  const props = createPropBuilder();
  communityHall(props, spots);
  communityTent(props, spots);
  communityTrees(props, spots);
  return props;
}

/** The props in the day: sun and blue sky, white walls shading blue, glass that shows the sky, foliage in leafy lumps. */
const PROP_LIGHT = /* glsl */ `
// The hall's roof height (uHeights.x): the membrane laid in sheets, stained by rain.
uniform vec4 uHeights;
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, sun), 0.0);
  vec3 sky = vec3(0.5, 0.6, 0.86) * (0.62 + 0.38 * n.z);
  if (n.z > 0.97 && metal < 0.02 && abs(world.z - uHeights.x) < 1.5) {
    float sheet = world.y / 44.0;
    float toSeam = min(fract(sheet), 1.0 - fract(sheet)) * 44.0;
    albedo *= (0.92 + 0.16 * hash12(vec2(floor(sheet), 6.0))) * (0.9 + 0.2 * fbm3(world.xy / 50.0)) * (1.0 - 0.3 * (1.0 - smoothstep(0.4, 1.5, toSeam)));
  }
  vec3 col = albedo * (sky + vec3(1.0, 0.97, 0.9) * lit * 0.78);
  if (metal > 0.6) {
    vec3 r = reflect(-view, n);
    vec3 refl = mix(vec3(0.45, 0.62, 0.85), vec3(0.88, 0.95, 1.02), clamp(r.z + 0.2, 0.0, 1.0));
    float fres = pow(1.0 - abs(dot(n, view)), 2.0);
    col = mix(albedo * (0.7 + 0.5 * lit), refl * 0.85, 0.2 + 0.5 * fres);
    col += vec3(1.0) * pow(max(dot(reflect(-sun, n), view), 0.0), 50.0) * 0.6;
  } else if (metal > 0.04 && metal < 0.06) {
    // Foliage: leaf clumps, each lit on its own sunward side, dark hollows between.
    vec2 q = world.xy / 13.0 + world.z / 11.0;
    q += 0.35 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 9.1)) - 0.5);
    vec4 lobe = voronoiCell(q);
    float inLobe = 1.0 - smoothstep(0.34, 0.62, length(lobe.zw));
    float bulge = dot(normalize(n + vec3(-lobe.zw, 0.0) * 0.6 * inLobe), sun);
    float crown = smoothstep(-0.3, 0.7, n.z);
    col = albedo * (0.4 + 0.9 * smoothstep(-0.1, 0.8, bulge)) * mix(0.64, 1.0, smoothstep(0.0, 0.2, lobe.x)) * (sky * 0.5 + 0.55) * mix(0.55, 1.05, crown);
    col += vec3(0.07, 0.12, 0.02) * smoothstep(0.65, 0.95, bulge) * crown;
  } else if (metal > 0.06 && metal < 0.08) {
    // A boulder: rough, mossy where it faces up.
    float rough = fbm3(world.xy / 6.0 + world.z / 5.0);
    col = albedo * (0.7 + 0.5 * rough) * (sky * 0.6 + lit * 0.8);
    col = mix(col, vec3(0.1, 0.22, 0.1) * (sky * 0.5 + 0.5), smoothstep(0.55, 0.9, n.z) * smoothstep(0.4, 0.6, rough) * 0.7);
  }
  // Grime at a wall's foot.
  col *= mix(0.84, 1.0, smoothstep(0.0, 12.0, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: `${VORONOI}
${PROP_LIGHT}`, reveal: 'vec3(0.85, 1.0, 1.05)' });

/** Mist rising off the pool where the fall lands: pale soft puffs drifting up and out. */
export const MIST_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
${COMMUNITY}
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 4.0 + aSeed.w * 3.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 jitter = hash22(aSeed.xy * 71.0 + cycle) - 0.5;
  vec2 landing = uFall.zw + vec2(-uPool.x * 0.82, 0.0);
  vec3 pos = vec3(landing + jitter * uPool.x * 0.7 + vec2(life * 16.0, life * 8.0 * (aSeed.y - 0.5)), -6.0 + life * (30.0 + 40.0 * aSeed.x));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vLife = life;
  gl_PointSize = (14.0 + 26.0 * life) * uFocal / -mv.z * revealBurned(landing) * exitKeep(landing);
}
`;

export const MIST_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = exp(-d * d * 3.0) * (1.0 - smoothstep(0.7, 1.0, d));
  gl_FragColor = vec4(vec3(0.9, 0.96, 1.0) * soft * 0.1 * smoothstep(0.0, 0.2, vLife) * (1.0 - vLife), 1.0);
${OUTPUT}
}
`;

/** Community Center's board (stadium-environment-mesh.js BOARDS). */
export function communityCenterBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...COMMUNITY_SUN).normalize() },
    uPlaza: { value: new three.Vector4() },
    uShape: { value: new three.Vector2() },
    uCliff: { value: new three.Vector4() },
    uFall: { value: new three.Vector4() },
    uPool: { value: new three.Vector2() },
    uUnit: { value: 1 },
    uBoxes: { value: Array.from({ length: 4 }, () => new three.Vector4()) },
    uHeights: { value: new three.Vector4() },
    uTrees: { value: Array.from({ length: MAX_TREES }, () => new three.Vector4()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    pool: make(POOL_VERTEX, POOL_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    mist: make(MIST_VERTEX, MIST_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const pool = new three.Mesh(new three.BufferGeometry(), materials.pool);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const mist = new three.Points(seeded(MIST_COUNT), materials.mist);
  mist.renderOrder = 2;
  return {
    objects: [terrain, pool, props, mist],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => communitySpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uUnit.value = u;
      if (spots) {
        const { plaza, hall, tent, kiosks, cliffFoot, cliffStart, fall, pool: basin } = spots;
        own.uPlaza.value.set(plaza.x0, plaza.y0, plaza.x1, plaza.y1);
        own.uShape.value.set(80 * u, PLAZA_RISE_PX);
        own.uCliff.value.set(cliffFoot, CLIFF.run * u, CLIFF.top * u, cliffStart);
        own.uFall.value.set(fall.y, fall.half, basin.x, basin.y);
        own.uPool.value.set(basin.r, POOL_LEVEL);
        const boxes = [
          [hall.x0, hall.y0, hall.x1, hall.y1, hall.height],
          [tent.x - tent.half, tent.y - tent.half, tent.x + tent.half, tent.y + tent.half, tent.apex * 0.9],
          [kiosks[0].x - kiosks[0].w / 2, kiosks[0].y - kiosks[0].d / 2, kiosks[0].x + kiosks[0].w / 2, kiosks[0].y + kiosks[0].d / 2, kiosks[0].h],
          [kiosks[1].x - kiosks[1].w / 2, kiosks[1].y - kiosks[1].d / 2, kiosks[1].x + kiosks[1].w / 2, kiosks[1].y + kiosks[1].d / 2, kiosks[1].h],
        ];
        boxes.forEach((box, i) => own.uBoxes.value[i].set(box[0], box[1], box[2], box[3]));
        own.uHeights.value.set(...boxes.map((box) => box[4]));
        own.uTrees.value.forEach((slot, i) => {
          const tree = spots.trees[i];
          return tree ? slot.set(tree.x, tree.y, tree.r, tree.z) : slot.set(0, 0, 0, 0);
        });
      } else {
        own.uPlaza.value.set(0, 0, 0, 0);
        own.uShape.value.set(0, 0);
        own.uCliff.value.set(-1e5, 1, 0, 1e5);
        own.uFall.value.set(0, 0, 0, 0);
        own.uPool.value.set(0, POOL_LEVEL);
        own.uBoxes.value.forEach((box) => box.set(0, 0, 0, 0));
        own.uHeights.value.set(0, 0, 0, 0);
        own.uTrees.value.forEach((slot) => slot.set(0, 0, 0, 0));
      }
      replaceGeometry(terrain, terrainGrid(bounds));
      const basin = spots?.pool;
      pool.visible = Boolean(basin);
      if (basin) {
        replaceGeometry(pool, new three.PlaneGeometry(basin.r * 2.2, basin.r * 2.2).translate(basin.x, basin.y, 0));
      }
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, communityProps(spots).build(three));
    },
  };
}
