// Design 077 (prototype): Crystal Cave (customhb-052) after its card art (EVS 144, Toyste Beach): a
// warm brown cave floor under a shaft of pale skylight, the Poké Ball drawn on it in a thin gold line
// with a glowing pale-blue heart, clusters of tall hexagonal crystals (the art's pink, sky blue,
// lavender and teal) splaying out of the floor round it, coloured sparkle dust in the air among
// them, rough dark rock closing the cave behind. The art looks across the floor at the crystals; the
// board looks down into the cave, so the floor holds every card, the clusters stand where no card
// lies (the tall ones off the far end and in the far corners, low ones toward the near end, where a
// tall crystal would lean over the player's cards in the tilted view) and the walls rise past them.
// World scale: a card's footprint is about a floor tile a pace across; the tallest crystal is a
// little taller than a card is long.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the floor's edge (negative
// on it), B a stone's tone 0..1 on the walls, A the kind (-1 floor, 1 wall); the shared light bake
// adds normals, occlusion and the skylight's shadow. Per frame: TERRAIN paints the floor, the walls,
// the emblem, the skylight's pool and the crystals' coloured light; CRYSTALS draws every crystal, a
// faceted prism with a pointed tip; SPARKLES the dust drifting and twinkling in the air.
import {
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
import { craterEmblem, environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const CRYSTAL_KEY = 'crystal-cave';
/** The skylight (toward it, table frame): from high above, a little toward the far left. */
export const CAVE_LIGHT = Object.freeze([-0.24, 0.32, 0.917]);
/** The floor runs this far past the cards' box before the walls begin, and the walls' run and height. */
export const FLOOR_PX = 165;
export const WALL_RUN_PX = 230;
export const WALL_HEIGHT_PX = 170;
/** Least gap between any crystal, seen from above, and a card or the opponent's hand. */
export const CRYSTAL_CARD_GAP_PX = 14;
export const MAX_CLUSTERS = 36;
/**
 * The art's crystal colours (sRGB, linearised in the shader), one per cluster in turn. Design 080:
 * its four main ones (pink, sky blue, lavender, teal); seven read as a rainbow assortment.
 */
export const CRYSTAL_HUES = Object.freeze([
  [236, 158, 192],
  [120, 178, 228],
  [186, 168, 232],
  [88, 204, 166],
]);
/**
 * How tall a cluster's crystals grow, by where it stands: off the far end, in the side bands, toward
 * the near end (a tall crystal there leans up over the player's cards in the tilted view).
 */
const CLUSTER_HEIGHT = { far: [120, 210], side: [70, 125], near: [30, 55] };
const SPARKLE_COUNT = 70;

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

/** The opponent's hand where the board fans it, past the far edge: the cards' width either side of the middle. */
const oppHandRect = (layout, core) => {
  const hand = layout.opp?.hand;
  const cardH = layout.opp?.cardBox?.hand?.h ?? 0;
  if (!hand || !(cardH > 0) || !Number.isFinite(hand.baselineY)) return null;
  const halfW = Math.max(Math.abs(core.x), Math.abs(core.x + core.w));
  return { x: -halfW, y: hand.baselineY - cardH, w: 2 * halfW, h: cardH };
};

/**
 * One cluster's crystals: `count` prisms out of a common foot, each leaning out from the cluster's
 * middle (and away from the cards) by its own angle, the tallest near the middle.
 */
function growCluster(cluster, u) {
  const crystals = [];
  const roll = (salt) => hash(cluster.x, cluster.y, salt);
  for (let i = 0; i < cluster.count; i += 1) {
    const turn = cluster.outward + (roll(10 + i) - 0.5) * 2.4;
    const spread = (roll(20 + i) * 0.7 + 0.15) * cluster.r;
    const lean = (0.14 + 0.46 * roll(30 + i)) * (i === 0 ? 0.35 : 1);
    // Up on the walls the foot sinks into the rock: the crystal grows by as much, so as much shows.
    const height = cluster.height * (i === 0 ? 1 : 0.45 + 0.5 * roll(40 + i)) + Math.max(0, cluster.z + 6) * 1.3;
    const radius = (5 + 0.075 * height * (0.7 + 0.5 * roll(50 + i))) * Math.min(u, 1.4);
    crystals.push({
      x: cluster.x + Math.cos(turn) * (i === 0 ? 0 : spread),
      y: cluster.y + Math.sin(turn) * (i === 0 ? 0 : spread),
      // The axis: tipped `lean` rad from upright toward `turn`.
      axis: [Math.sin(lean) * Math.cos(turn), Math.sin(lean) * Math.sin(turn), Math.cos(lean)],
      height,
      radius,
      spin: roll(60 + i) * Math.PI,
      hue: cluster.hue,
      z: cluster.z,
      seed: roll(70 + i),
    });
  }
  // Shards broken off the cluster, small and tipped over, standing about its foot.
  for (let i = 0; i < 4; i += 1) {
    const place = roll(80 + i) * 2 * Math.PI;
    const spread = (0.4 + 0.5 * roll(90 + i)) * cluster.r;
    const turn = roll(100 + i) * 2 * Math.PI;
    const lean = 0.45 + 0.15 * roll(110 + i);
    crystals.push({
      x: cluster.x + Math.cos(place) * spread,
      y: cluster.y + Math.sin(place) * spread,
      axis: [Math.sin(lean) * Math.cos(turn), Math.sin(lean) * Math.sin(turn), Math.cos(lean)],
      height: (9 + 12 * roll(120 + i)) * Math.min(u, 1.4),
      radius: (2.4 + 1.6 * roll(130 + i)) * Math.min(u, 1.4),
      spin: roll(140 + i) * Math.PI,
      hue: cluster.hue,
      z: cluster.z,
      seed: roll(150 + i),
      shard: true,
    });
  }
  return crystals;
}

/**
 * The lowest the wall's rock lies `fromCards` px from the cards' box (its slope under the stones,
 * the edge's wander taken off): a crystal's foot sits a little below it, so it grows out of the rock.
 */
export function wallFloorAt(fromCards, u) {
  const d = fromCards - FLOOR_PX * u - 13;
  const climb = Math.min(1, Math.max(0, d / (WALL_RUN_PX * u)));
  return Math.max(-6, WALL_HEIGHT_PX * u * climb * climb * (3 - 2 * climb) * 0.55 - 8);
}

/** Every point a crystal reaches, seen from above, for the clearance checks: its foot and its tip. */
const crystalReach = (crystal) => {
  const tip = crystal.height + crystal.radius * 1.7;
  return [
    [crystal.x, crystal.y, crystal.z],
    [crystal.x + crystal.axis[0] * tip, crystal.y + crystal.axis[1] * tip, crystal.z + crystal.axis[2] * tip],
  ];
};

/**
 * Crystal Cave's layout: the floor (the cards' box, FLOOR_PX round it), the walls past it, the emblem
 * between the Actives, and the crystal clusters where no card lies. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function crystalSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const core = union(cards);
  const scene = sceneBounds(layout, CRYSTAL_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const hand = oppHandRect(layout, core);
  const obstacles = [core, ...(hand ? [hand] : [])];
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const emblem = craterEmblem(layout, centre);
  // A shard lying low can hide behind a card's edge in the tilted view: it keeps a wider berth.
  const clear = (crystal) =>
    crystalReach(crystal).every(([x, y]) =>
      obstacles.every((rect) => distanceToRect(x, y, rect) >= crystal.radius + (crystal.shard ? 44 * u : CRYSTAL_CARD_GAP_PX))
    );
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;

  // Clusters on a jittered grid over the ring between the cards and the walls' middle.
  const clusters = [];
  const step = 150 * u;
  let hueTurn = 0;
  for (let gy = scene.y + step / 2; gy < scene.y + scene.h; gy += step) {
    for (let gx = scene.x + step / 2; gx < scene.x + scene.w; gx += step) {
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * step * 0.6;
      const y = gy + (roll(2) - 0.5) * step * 0.6;
      const fromCards = distanceToRect(x, y, core);
      if (fromCards < 40 * u || fromCards > (FLOOR_PX + WALL_RUN_PX * 0.9) * u || !inScene(x, y, 40 * u)) continue;
      if (roll(3) > 0.8) continue;
      const zone = y > core.y + core.h ? 'far' : y < core.y ? 'near' : 'side';
      const [low, high] = CLUSTER_HEIGHT[zone];
      // Leaning out, away from the cards' box.
      const outward = Math.atan2(y - Math.min(Math.max(y, core.y), core.y + core.h), x - Math.min(Math.max(x, core.x), core.x + core.w));
      const cluster = {
        x,
        y,
        r: (34 + 30 * roll(4)) * u,
        count: zone === 'near' ? 3 + Math.floor(roll(5) * 3) : 6 + Math.floor(roll(5) * 5),
        height: (low + (high - low) * roll(6)) * u,
        hue: hueTurn % CRYSTAL_HUES.length,
        outward,
      };
      // Crystals that would reach a card are left out; a cluster left with fewer than two goes.
      const crystals = growCluster({ ...cluster, z: wallFloorAt(fromCards, u) }, u).filter(clear);
      if (crystals.length < 2) continue;
      hueTurn += 3;
      clusters.push({ ...cluster, crystals });
      if (clusters.length >= MAX_CLUSTERS) break;
    }
    if (clusters.length >= MAX_CLUSTERS) break;
  }
  return { table, scene, core, u, hand, centre, emblem, clusters };
}

const CAVE = /* glsl */ `
// The cards' box (x0, y0, x1, y1), the emblem (the table's middle x, y, outline radius; 0: none), every cluster (x, y,
// glow radius, hue index; 0 radius: none).
uniform vec4 uCore;
uniform vec3 uEmblem;
uniform vec4 uClusters[${MAX_CLUSTERS}];
uniform vec3 uHues[${CRYSTAL_HUES.length}];
// The floor's reach past the cards' box, the walls' run and their height (px, scaled to the cards).
uniform vec3 uCave;
// Signed px from the floor's edge, negative on the floor; the edge wanders a little.
float floorDistance(vec2 p) {
  float box = length(max(max(uCore.xy - p, p - uCore.zw), 0.0));
  return box - uCave.x - 26.0 * (fbm3(p / 160.0 + 3.0) - 0.5);
}
`;

/**
 * Bake: the floor, worn and gently uneven; past its edge the walls climb as heaps of big sculpted
 * rock (the shared STONES), bigger and higher the further out.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${STONES}
${CAVE}
void main() {
  vec2 p = uMin + vUv * uSize;
  float d = floorDistance(p);
  float h = 1.2 * (fbm3(p / 70.0) - 0.5);
  float tone = 0.3;
  float kind = -1.0;
  if (d > -20.0) {
    float climb = smoothstep(0.0, uCave.y, d);
    vec3 big = stones(p, 120.0, 4.0);
    vec3 mid = stones(p + 37.0, 58.0, 3.0);
    float rock = max(big.x, mid.x * 0.55);
    float slope = uCave.z * climb * climb * (3.0 - 2.0 * climb);
    float wallH = slope * (0.55 + 0.45 * rock) + 46.0 * rock * smoothstep(-20.0, 30.0, d);
    if (wallH > h) {
      h = wallH;
      tone = big.x > mid.x * 0.55 ? big.y : mid.y;
      kind = 1.0;
    }
  }
  gl_FragColor = vec4(h, d, tone, kind);
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

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 FLOOR_LIT = vec3(0.221, 0.138, 0.078);
const vec3 FLOOR_DARK = vec3(0.096, 0.069, 0.051);
const vec3 GOLD = vec3(0.77, 0.442, 0.101);
const vec3 HEART = vec3(0.77, 1.04, 1.22);
const vec3 SKYLIGHT = vec3(0.62, 0.74, 0.86);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.45, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${VORONOI}
${REVEAL}
${PALETTE}
${CAVE}
// A pebble pressed into the earth on a voronoi grid of cellPx: (shape 0..1, shade, its dark seat, tone).
vec4 pebbles(vec2 p, float cellPx, float chance, vec3 sun) {
  vec4 c = voronoiCell(p / cellPx);
  float has = step(fract(c.y * 17.3), chance);
  float rad = 0.2 + 0.2 * fract(c.y * 5.7);
  vec2 off = -c.zw / rad;
  off.x /= 0.75 + 0.5 * fract(c.y * 3.1);
  float r = length(off);
  float dome = sqrt(max(1.0 - r * r, 0.0));
  vec3 n = normalize(vec3(off, 0.35 + dome));
  float shade = clamp(dot(n, sun) * 1.1 + 0.15, 0.0, 1.3);
  float seat = smoothstep(0.95, 1.12, r) * (1.0 - smoothstep(1.12, 1.55, r));
  return vec4((1.0 - smoothstep(0.86, 1.0, r)) * has, shade, seat * has, fract(c.y * 29.0));
}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float d = field.g;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sunDir = normalize(uSun);
  float lit = clamp(dot(n, sunDir), 0.0, 1.0) * mix(0.5, 1.0, light.a);
  float wall = step(0.5, field.a);

  // The floor: packed earth, warm brown, darker in broad stains and smaller mottles; small and
  // larger pebbles pressed into it, each a little dome with a dark seat, gathered at the walls' feet
  // (design 080: the open floor where the cards lie is worn smooth).
  float calm = max(fieldCalm(p, 110.0), 1.0 - smoothstep(-150.0, -60.0, d));
  float stain = smoothstep(0.3, 0.75, fbm3(p / 150.0 + 6.0));
  vec3 col = mix(FLOOR_LIT, FLOOR_DARK, 0.25 + 0.55 * stain);
  col *= 0.9 + 0.14 * fbm3(p / 34.0 + 2.0);
  vec4 small = pebbles(p, 15.0, 0.62 * (1.0 - calm), sunDir);
  vec4 large = pebbles(p + 13.0, 44.0, 0.4 * (1.0 - calm), sunDir);
  vec3 pebbleBase = mix(vec3(0.06, 0.042, 0.032), vec3(0.15, 0.1, 0.07), small.w);
  vec3 stoneBase = mix(vec3(0.085, 0.06, 0.045), vec3(0.2, 0.14, 0.095), large.w);
  col *= 1.0 - 0.3 * max(small.z, large.z);
  col = mix(col, pebbleBase * (0.5 + 0.8 * small.y), small.x * 0.75);
  col = mix(col, stoneBase * (0.5 + 0.8 * large.y), large.x * 0.85);
  // The walls: rough brown rock, each stone its own tone, its top faces catching the skylight,
  // sinking into the dark the further it climbs from the floor.
  vec3 rock = mix(FLOOR_DARK * 0.8, FLOOR_LIT * 0.9, 0.25 + 0.5 * field.b) * (0.45 + 0.8 * lit);
  float strata = smoothstep(0.35, 0.65, gnoise(vec2(p.x / 140.0 + gnoise(p / 50.0) * 2.0, p.y / 9.0)));
  rock *= 0.82 + 0.3 * strata;
  rock += FLOOR_LIT * 1.5 * smoothstep(0.88, 0.5, n.z) * (0.3 + 0.7 * lit);
  col = mix(col, rock, wall);
  col *= mix(1.0, 0.3, smoothstep(40.0, uCave.y + 60.0, d));
  col *= (0.55 + 0.5 * lit) * mix(0.5, 1.0, smoothstep(0.3, 0.9, light.b));

  // The shaft of skylight falls on the floor round the emblem in a soft pool; out toward the walls
  // the cave is dim.
  vec2 fromHeart = p - uEmblem.xy;
  float pool = exp(-dot(fromHeart / vec2(430.0, 330.0), fromHeart / vec2(430.0, 330.0)));
  col *= 0.62 + 0.55 * pool;
  col += SKYLIGHT * 0.05 * pool;

  // Each cluster lights the floor and the rock round it in its own colour, breathing slowly.
  vec3 glow = vec3(0.0);
  float seat = 0.0;
  for (int i = 0; i < ${MAX_CLUSTERS}; i++) {
    vec4 cluster = uClusters[i];
    if (cluster.z <= 0.0) continue;
    vec2 q = (p - cluster.xy) / cluster.z;
    float breath = 0.93 + 0.07 * sin(uTime * 0.5 + cluster.x * 0.02 + cluster.y * 0.013);
    float q2 = dot(q, q);
    glow += uHues[int(cluster.w)] * exp(-q2 * 4.2) * breath;
    // The crystals' feet shut the light out of the rock they grow from.
    seat = max(seat, exp(-q2 * 16.0));
  }
  col *= 1.0 - 0.45 * seat;
  col += glow * 0.22 * (0.6 + 0.4 * n.z);

  // The emblem: a thin gold line round its outline, across its middle and round its button, and a
  // pale-blue glow at its heart, as the art's.
  if (uEmblem.z > 0.0) {
    float r = length(fromHeart);
    float button = uEmblem.z * 0.3;
    float line = min(abs(r - uEmblem.z), abs(r - button));
    if (r > button && r < uEmblem.z) line = min(line, abs(fromHeart.y));
    float stroke = 1.0 - smoothstep(1.6, 3.2, line);
    col = mix(col, GOLD * (0.9 + 0.12 * fbm3(p / 18.0)), stroke * 0.9);
    // A soft heart, steady: a bright pool between the Actives pulls the eye off them.
    float heart = exp(-pow(r / (button * 1.25), 2.0));
    col += HEART * heart * 0.12;
  }

  col = edgeHaze(col, vUv);
  vec3 shimmer = vec3(0.75, 0.82, 1.0);
  col += shimmer * revealGlow(p, 0.035) * 0.7;
  col += shimmer * exitGlow(p) * 0.7;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Every crystal as flat-faced triangles: a hexagonal prism up its axis, capped by a six-sided point.
 * Per vertex: position, normal (each face its own), aColor (the hue's sRGB / 255, then how far up the
 * crystal 0..1), aFacet (across the face 0..1, the face's own tone 0..1).
 */
export function crystalGeometry(three, clusters) {
  const positions = [];
  const normals = [];
  const colors = [];
  const facets = [];
  const index = [];
  const push = (p, n, color, along, across, tone) => {
    positions.push(...p);
    normals.push(...n);
    colors.push(color[0] / 255, color[1] / 255, color[2] / 255, along);
    facets.push(across, tone);
  };
  const face = (corners, color, alongs, acrosses, tone) => {
    const [a, b, c] = corners;
    const e1 = b.map((v, k) => v - a[k]);
    const e2 = c.map((v, k) => v - a[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const length = Math.hypot(...n) || 1;
    const first = positions.length / 3;
    corners.forEach((corner, k) => push(corner, n.map((v) => v / length), color, alongs[k], acrosses[k], tone));
    if (corners.length === 4) index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    else index.push(first, first + 1, first + 2);
  };
  for (const cluster of clusters) {
    for (const crystal of cluster.crystals) {
      const color = CRYSTAL_HUES[crystal.hue];
      const axis = crystal.axis;
      // A frame square to the axis.
      const helper = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      let side = [axis[1] * helper[2] - axis[2] * helper[1], axis[2] * helper[0] - axis[0] * helper[2], axis[0] * helper[1] - axis[1] * helper[0]];
      const sl = Math.hypot(...side);
      side = side.map((v) => v / sl);
      const lift = [axis[1] * side[2] - axis[2] * side[1], axis[2] * side[0] - axis[0] * side[2], axis[0] * side[1] - axis[1] * side[0]];
      const foot = [crystal.x, crystal.y, crystal.z];
      const at = (height, k, radius) => {
        const angle = crystal.spin + (k / 6) * 2 * Math.PI;
        return [0, 1, 2].map((v) => foot[v] + axis[v] * height + (side[v] * Math.cos(angle) + lift[v] * Math.sin(angle)) * radius);
      };
      const shoulder = crystal.height;
      const tip = [0, 1, 2].map((v) => foot[v] + axis[v] * (shoulder + crystal.radius * 1.7));
      const shoulderAlong = shoulder / (shoulder + crystal.radius * 1.7);
      for (let k = 0; k < 6; k += 1) {
        const tone = hash(crystal.seed * 100, k, 3);
        face([at(0, k, crystal.radius), at(0, k + 1, crystal.radius), at(shoulder, k + 1, crystal.radius), at(shoulder, k, crystal.radius)], color, [0, 0, shoulderAlong, shoulderAlong], [0, 1, 1, 0], tone);
        face([at(shoulder, k, crystal.radius), at(shoulder, k + 1, crystal.radius), tip], color, [shoulderAlong, shoulderAlong, 1], [0, 1, 0.5], tone * 0.8 + 0.2);
      }
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aColor', new three.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('aFacet', new three.Float32BufferAttribute(facets, 2));
  geometry.setIndex(index);
  return geometry;
}

export const CRYSTAL_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aColor;
attribute vec2 aFacet;
varying vec4 vColor;
varying vec2 vFacet;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float growth = terrainGrowth(position.xy);
  vColor = aColor;
  vFacet = aFacet;
  vNormal = normal;
  vWorld = vec3(position.xy, position.z * growth);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorld, 1.0);
}
`;

/**
 * A crystal, painted as the art's: frosted, translucent-looking faces, each its own tone, deeper and
 * more saturated at the foot, paler toward the point where the light passes through; a pale streak
 * down each face's middle, bright edges between faces, a rim of light where a face turns edge-on, and
 * a soft glow of its own.
 */
export const CRYSTAL_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec4 vColor;
varying vec2 vFacet;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 toEye = normalize(uEye - vWorld);
  vec3 sun = normalize(uSun);
  vec3 hue = pow(vColor.rgb, vec3(2.2));
  float along = vColor.w;
  float facing = dot(n, sun);
  // Each face its own tone; deep and saturated at the foot, lighter where the light carried up the
  // crystal comes out toward the point.
  vec3 body = mix(pow(hue, vec3(1.35)) * 0.8, hue * 1.1, smoothstep(0.0, 0.75, along));
  // A second, low light from the far left gives the faces round the prism their own tones.
  float side = dot(n, normalize(vec3(-0.6, 0.5, 0.35)));
  float faceLight = 0.2 + 0.45 * max(side, 0.0) + 0.35 * max(facing, 0.0);
  vec3 col = body * faceLight * (0.5 + 0.9 * vFacet.y);
  col += hue * (0.06 + 0.24 * smoothstep(0.2, 1.0, along));
  // A pale streak down each face, as frost, flawed by veins that run along the crystal.
  float streak = 1.0 - smoothstep(0.06, 0.34, abs(vFacet.x - 0.5));
  float vein = smoothstep(0.58, 0.82, gnoise(vec2(vFacet.x * 4.0 + vFacet.y * 23.0, along * 8.0)));
  col = mix(col, mix(hue, vec3(1.0), 0.4), streak * 0.18 + vein * 0.1);
  // Bright edges between the faces, and a sharp glint where a face catches the skylight.
  float edge = 1.0 - smoothstep(0.0, 0.05, min(vFacet.x, 1.0 - vFacet.x));
  col = mix(col, vec3(1.0, 0.97, 1.0), edge * 0.35);
  vec3 half_ = normalize(sun + toEye);
  col += vec3(1.0, 0.98, 0.94) * pow(max(dot(n, half_), 0.0), 56.0) * 1.1;
  float rim = pow(1.0 - abs(dot(n, toEye)), 3.0);
  col += (hue * 0.35 + 0.06) * rim;
  // Its own steady glow; darker where it meets the floor.
  col += hue * 0.1;
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.14, along));
  col += vec3(0.75, 0.82, 1.0) * revealGlow(vWorld.xy, 0.035);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Coloured sparkle dust: drifting slowly up among the crystals, each mote twinkling gently. */
export const SPARKLE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
uniform vec3 uHues[${CRYSTAL_HUES.length}];
${NOISE}
${FOOTPRINTS}
${REVEAL}
attribute vec4 aSeed;
varying vec3 vHue;
varying float vTwinkle;
void main() {
  float period = 9.0 + aSeed.w * 8.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  // Dust drifts out among the crystals; design 080: none over the cards.
  vec2 start = uMin + hash22(aSeed.xy * 53.0 + cycle) * uSize;
  vec3 pos = vec3(start, 6.0 + 70.0 * aSeed.y * aSeed.y);
  pos.xy += vec2(sin(life * 3.0 + aSeed.x * 20.0), cos(life * 2.0 + aSeed.y * 20.0)) * 14.0;
  pos.z += life * 26.0;
  float shown = revealBurned(start) * exitKeep(start) * step(fieldCalm(start, 90.0), 0.001);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.75, 1.0, life));
  vTwinkle = fade * (0.55 + 0.45 * pow(0.5 + 0.5 * sin(uTime * (1.0 + 1.5 * aSeed.z) + aSeed.x * 40.0), 2.0));
  vHue = aSeed.w < 0.45 ? vec3(1.0, 0.9, 0.45) : uHues[int(floor(fract(aSeed.x * 7.0) * ${CRYSTAL_HUES.length}.0))];
  gl_PointSize = max((0.9 + 1.2 * aSeed.z) * uFocal / -mv.z, 1.4) * 1.9 * shown;
}
`;

export const SPARKLE_FRAGMENT = /* glsl */ `
varying vec3 vHue;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.2, 0.45, d);
  float halo = exp(-d * d * 4.0) * 0.5;
  gl_FragColor = vec4((vHue * 0.8 + 0.25) * (core + halo) * vTwinkle, 1.0);
${OUTPUT}
}
`;

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Crystal Cave's board (stadium-environment-mesh.js BOARDS). */
export function crystalCaveBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...CAVE_LIGHT).normalize() },
    uCore: { value: new three.Vector4() },
    uCave: { value: new three.Vector3() },
    uEmblem: { value: new three.Vector3() },
    uClusters: { value: Array.from({ length: MAX_CLUSTERS }, () => new three.Vector4()) },
    uHues: { value: CRYSTAL_HUES.map((rgb) => new three.Vector3(...rgb.map(toLinear))) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    crystals: make(CRYSTAL_VERTEX, CRYSTAL_FRAGMENT, { side: three.DoubleSide }),
    sparkles: make(SPARKLE_VERTEX, SPARKLE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment({ aoFollowsSlope: true }), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const crystals = new three.Mesh(new three.BufferGeometry(), materials.crystals);
  const sparkles = new three.Points(seeded(SPARKLE_COUNT), materials.sparkles);
  sparkles.renderOrder = 2;
  return {
    objects: [terrain, crystals, sparkles],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => crystalSpots(layout),
    apply(spots, bounds) {
      const core = spots?.core;
      own.uCore.value.set(core?.x ?? 0, core?.y ?? 0, (core?.x ?? 0) + (core?.w ?? 0), (core?.y ?? 0) + (core?.h ?? 0));
      const u = spots?.u ?? 1;
      own.uCave.value.set(FLOOR_PX * u, WALL_RUN_PX * u, WALL_HEIGHT_PX * u);
      // The skylight's pool centres on the table even where no emblem fits between the Actives.
      own.uEmblem.value.set(spots?.centre?.x ?? 0, spots?.centre?.y ?? 0, spots?.emblem?.r ?? 0);
      const clusters = spots?.clusters ?? [];
      own.uClusters.value.forEach((slot, i) => {
        const cluster = clusters[i];
        return cluster ? slot.set(cluster.x, cluster.y, cluster.r * 1.3 + cluster.height * 0.2, cluster.hue) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      crystals.visible = clusters.length > 0;
      if (clusters.length) replaceGeometry(crystals, crystalGeometry(three, clusters));
    },
  };
}
