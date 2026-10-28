// Design 077 (prototype): Pokemon Center (customhb-362): the inside of the games' Pokemon Center (the
// orange and cream lobbies of Let's Go, Brilliant Diamond and Omega Ruby), where the card shows its
// outside (NXD 90, 5ban Graphics). Cream and peach floor tiles in a checker, an orange border along the
// walls, a big Poke Ball laid in tiles between the Actives, orange walls with a red rail and crown over
// a panelled wainscot and bays of daylight, glass columns lit from within in the corners. The board looks
// down on the lobby, so the floor holds every card; the left band holds the long curved reception
// counter (its red top and pale work surface, a glowing ball lamp at each end, the healing machine with
// its six balls) under the wall's big screen, with the lounge near it (a blue sofa, a glass table, two
// cushion stools on a red rug) and a bookshelf; the right band the PCs on their desks, a bookshelf, a
// cushioned bench and plants.
// World scale: a card's footprint is two floor tiles across; the counter is a card and a half high.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the walls, the furniture and the round pieces,
// so the light bake darkens their feet and casts their ceiling-light shadows), G px from the floor's edge
// (negative on it); the light bake (BAKE_LIGHT) works every box's shadow out exactly. Per frame: TERRAIN
// paints the tiles, the border, the emblem, the rug, the lamps' pools, the ceiling panels' reflections
// and the round pieces' shadows; PROPS the walls, the counter and the furniture (stadium-env-props).
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
import { craterEmblem } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { disc, wallBand, windowRun } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BOX_SHADOW, EDGE_HAZE } from './stadium-env-surfaces.mjs';

export const CENTER_KEY = 'pokemon-center';
/** The ceiling lamps' light (toward it, table frame): high, a little from the far left, so a piece's shadow falls short toward the near right. */
export const CENTER_LIGHT = Object.freeze([-0.14, 0.2, 0.97]);
/** The walls stand this far past the cards' box; they rise this high and are this thick (card-scale px). */
export const WALL_GAP_PX = 330;
export const WALL_HEIGHT_PX = 250;
export const WALL_THICK_PX = 16;
export const MAX_BLOCKS = 24;
export const MAX_DISCS = 16;
/** A floor tile's side (card-scale px). */
const TILE_PX = 54;

/**
 * Pokemon Center's layout: the room, its walls, the counter with its machine and lamps, the lounge,
 * the shelves, the PCs, the bench, the plants and the glass columns, and the boxes and round pieces
 * the light is cast from. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function centerSpots(layout) {
  const ctx = boardContext(layout, CENTER_KEY);
  if (!ctx) return null;
  const { core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const gap = WALL_GAP_PX * u;
  const room = { x0: core.x - gap, x1: core.x + core.w + gap, y0: core.y - 90 * u, y1: handEnd + 70 * u };
  const thick = WALL_THICK_PX * u;
  const wallHeight = WALL_HEIGHT_PX * u;
  const walls = [
    { name: 'left', x0: room.x0 - thick, y0: room.y0 - thick, x1: room.x0, y1: room.y1 + thick, h: wallHeight },
    { name: 'right', x0: room.x1, y0: room.y0 - thick, x1: room.x1 + thick, y1: room.y1 + thick, h: wallHeight },
    { name: 'near', x0: room.x0, y0: room.y0 - thick, x1: room.x1, y1: room.y0, h: wallHeight },
    { name: 'far', x0: room.x0, y0: room.y1, x1: room.x1, y1: room.y1 + thick, h: wallHeight },
  ];
  const at = (share) => core.y + core.h * share;
  // The left band: the counter, the lounge, a bookshelf, plants.
  const counter = { x: room.x0, y: at(0.72), r: 118 * u, h: 48 * u, dir: 1 };
  const sofa = { x: room.x0, y0: at(0.12), y1: at(0.12) + 196 * u, depth: 46 * u, dir: 1 };
  const sofaMid = (sofa.y0 + sofa.y1) / 2;
  const table = { x: room.x0 + 100 * u, y: sofaMid, w: 54 * u, d: 86 * u, h: 22 * u };
  const stools = [
    { x: room.x0 + 172 * u, y: sofaMid - 34 * u, color: 0 },
    { x: room.x0 + 172 * u, y: sofaMid + 34 * u, color: 1 },
  ];
  const rug = { x0: room.x0 + 52 * u, x1: room.x0 + 196 * u, y0: sofaMid - 82 * u, y1: sofaMid + 82 * u };
  const shelves = [
    { x: room.x0, y0: at(0.42), y1: at(0.42) + 92 * u, depth: 34 * u, h: 84 * u, dir: 1 },
    { x: room.x1, y0: at(0.52), y1: at(0.52) + 92 * u, depth: 34 * u, h: 84 * u, dir: -1 },
  ];
  // The right band: the PCs on their desks with a stool each, a cushioned bench along the wall.
  const desks = [0.14, 0.27, 0.4].map((share) => ({ x: room.x1, y: at(share), w: 52 * u, d: 34 * u, h: 34 * u, dir: -1 }));
  const deskStools = desks.map((d) => ({ x: d.x - (d.d + 24 * u), y: d.y, color: 2 }));
  const bench = { x: room.x1, y0: at(0.68), y1: at(0.68) + 150 * u, depth: 34 * u, dir: -1 };
  const plants = [
    { x: room.x0 + 28 * u, y: at(0.35), r: 11 * u, seed: 1 },
    { x: room.x0 + 28 * u, y: at(0.93), r: 12 * u, seed: 2 },
    { x: room.x1 - 28 * u, y: at(0.47), r: 11 * u, seed: 3 },
    { x: room.x1 - 28 * u, y: at(0.62), r: 12 * u, seed: 4 },
    { x: room.x1 - 28 * u, y: at(0.93), r: 12 * u, seed: 5 },
  ];
  const columns = [-1, 1].map((side) => ({ x: side < 0 ? room.x0 + 36 * u : room.x1 - 36 * u, y: room.y0 + 48 * u, r: 24 * u, h: 190 * u }));
  const footprint = (s) => ({ x0: Math.min(s.x, s.x + s.dir * s.depth), x1: Math.max(s.x, s.x + s.dir * s.depth), y0: s.y0, y1: s.y1 });
  const deskBox = (d) => ({ x0: Math.min(d.x, d.x + d.dir * d.d), x1: Math.max(d.x, d.x + d.dir * d.d), y0: d.y - d.w / 2, y1: d.y + d.w / 2 });
  const blocks = [
    ...walls.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h: w.h })),
    { ...footprint(sofa), h: 58 * u },
    ...shelves.map((s) => ({ ...footprint(s), h: s.h })),
    { ...footprint(bench), h: 26 * u },
    ...desks.map((d) => ({ ...deskBox(d), h: d.h })),
    { x0: table.x - table.w / 2, y0: table.y - table.d / 2, x1: table.x + table.w / 2, y1: table.y + table.d / 2, h: table.h },
  ];
  const discs = [
    { x: counter.x, y: counter.y, r: counter.r + 4 * u, h: counter.h },
    ...columns.map((c) => ({ x: c.x, y: c.y, r: c.r, h: c.h })),
    ...plants.map((p) => ({ x: p.x, y: p.y, r: 18 * u, h: 60 * u })),
    ...[...stools, ...deskStools].map((s) => ({ x: s.x, y: s.y, r: 11 * u, h: 16 * u })),
  ];
  return {
    ...ctx,
    handEnd,
    room,
    walls,
    wallHeight,
    counter,
    sofa,
    table,
    stools,
    rug,
    shelves,
    desks,
    deskStools,
    bench,
    plants,
    columns,
    blocks,
    discs,
    emblem: craterEmblem(layout, centre),
  };
}

const ROOM = /* glsl */ `
// The floor's rectangle (x0, y0, x1, y1); the Poke Ball emblem (x, y, radius; 0: none); the rug (x0, y0,
// x1, y1; empty: none); the scale of a card (u).
uniform vec4 uRoom;
uniform vec3 uEmblem;
uniform vec4 uRug;
uniform float uUnit;
// Every box (x0, y0, x1, y1) and its height; every round piece (x, y, radius, height).
uniform vec4 uBlocks[${MAX_BLOCKS}];
uniform float uBlockHeights[${MAX_BLOCKS}];
uniform vec4 uDiscs[${MAX_DISCS}];
// px from p to the floor's edge, negative inside.
float roomDistance(vec2 p) {
  vec2 centre = (uRoom.xy + uRoom.zw) * 0.5;
  vec2 q = abs(p - centre) - (uRoom.zw - uRoom.xy) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
`;

/** Bake: the boxes' and round pieces' heights (for the light bake's shadows and occlusion), the floor's distance. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${ROOM}
void main() {
  vec2 p = uMin + vUv * uSize;
  float h = 0.0;
  for (int i = 0; i < ${MAX_BLOCKS}; i++) {
    vec4 block = uBlocks[i];
    if (block.z <= block.x) continue;
    if (p.x > block.x && p.x < block.z && p.y > block.y && p.y < block.w) h = max(h, uBlockHeights[i]);
  }
  for (int i = 0; i < ${MAX_DISCS}; i++) {
    vec4 piece = uDiscs[i];
    if (piece.z <= 0.0) continue;
    if (distance(p, piece.xy) < piece.z) h = max(h, piece.w);
  }
  float sd = roomDistance(p);
  gl_FragColor = vec4(h, sd, 0.0, sd < 0.0 ? 1.0 : 0.0);
}
`;

/**
 * Bake 2: every box's shadow from the ceiling lamps worked out exactly (a ray from the floor toward
 * the light against each box, a dozen taps over the lamp's disc), and occlusion at the feet of every
 * tall piece. R, G: a flat floor's normal; B: occlusion; A: light.
 */
export const BAKE_LIGHT_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform vec2 uTexel;
uniform vec3 uSun;
varying vec2 vUv;
${ROOM}
${BOX_SHADOW}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec3 sun = normalize(uSun);
  float shade = 0.0;
  for (int i = 0; i < ${MAX_BLOCKS}; i++) {
    vec4 block = uBlocks[i];
    if (block.z <= block.x) continue;
    float reach = uBlockHeights[i] * length(sun.xy) / sun.z + 40.0;
    vec2 nearest = clamp(p, block.xy, block.zw);
    if (distance(p, nearest) > reach) continue;
    shade = max(shade, boxShadow(vec3(p, 0.0), sun, block, uBlockHeights[i]));
  }
  float occlusion = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float radius = ring == 0 ? 5.0 : (ring == 1 ? 12.0 : 26.0);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.7853982 + float(ring) * 0.39;
      vec2 q = vUv + vec2(cos(angle), sin(angle)) * radius / uSize;
      occlusion += clamp(texture2D(uField, q).r / 40.0, 0.0, 1.0);
    }
  }
  gl_FragColor = vec4(0.5, 0.5, 1.0 - clamp(occlusion / 24.0, 0.0, 1.0) * 0.85, 1.0 - shade);
}
`;

/** The terrain grid: the floor stays flat (the field's heights are the furniture's, which the props draw). */
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

// The games' lobby colours (pixel samples of Let's Go's and Brilliant Diamond's, inverted through Neutral
// tone mapping), the tiles a shade under the games' so a card's white border keeps its edge.
const PALETTE = /* glsl */ `
const vec3 FLOOR_A = vec3(0.957, 0.855, 0.657);
const vec3 FLOOR_B = vec3(0.871, 0.697, 0.482);
const vec3 JOINT = vec3(0.644, 0.474, 0.302);
const vec3 BORDER_ORANGE = vec3(0.858, 0.348, 0.142);
const vec3 BORDER_LINE = vec3(1.164, 1.08, 0.922);
const vec3 EMBLEM_ORANGE = vec3(1.008, 0.321, 0.107);
const vec3 EMBLEM_WHITE = vec3(1.295, 1.27, 1.199);
const vec3 EMBLEM_BAND = vec3(0.3, 0.1, 0.07);
const vec3 RUG_RED = vec3(0.473, 0.076, 0.066);
const vec3 RUG_DARK = vec3(0.223, 0.053, 0.053);
const vec3 RUG_CREAM = vec3(0.801, 0.644, 0.411);
const vec3 ASPHALT = vec3(0.105, 0.112, 0.129);
const vec3 WALK = vec3(0.618, 0.579, 0.474);
const vec3 KERB = vec3(0.442, 0.345, 0.228);
const vec3 SHADE_TINT = vec3(0.7, 0.62, 0.66);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${EDGE_HAZE}
${PALETTE}
${ROOM}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
// The floor Poke Ball at rel (px from its centre) with outline radius R: (rgb, coverage).
vec4 floorBall(vec2 rel, float R) {
  float r = length(rel);
  float inside = 1.0 - smoothstep(R - 0.8, R + 0.4, r);
  vec3 ball = mix(EMBLEM_WHITE, EMBLEM_ORANGE, smoothstep(-1.0, 1.0, rel.y));
  float band = 1.0 - smoothstep(R * 0.055, R * 0.068, abs(rel.y));
  ball = mix(ball, EMBLEM_BAND, band);
  float ringLine = 1.0 - smoothstep(R * 0.008, R * 0.02, abs(r - R * 0.97));
  ball = mix(ball, EMBLEM_BAND, ringLine * 0.8);
  float button = 1.0 - smoothstep(R * 0.255, R * 0.262, r);
  ball = mix(ball, EMBLEM_WHITE, button);
  ball = mix(ball, EMBLEM_BAND, 1.0 - smoothstep(R * 0.008, R * 0.018, abs(r - R * 0.255)));
  float centre = 1.0 - smoothstep(R * 0.1, R * 0.108, r);
  ball = mix(ball, EMBLEM_ORANGE * 0.9, centre);
  // A pale ring just outside, as the games lay it, and a thin one further out.
  float outer = max(1.0 - smoothstep(R * 0.025, R * 0.04, abs(r - R * 1.08)), 0.7 * (1.0 - smoothstep(R * 0.008, R * 0.02, abs(r - R * 1.16))));
  vec3 colour = mix(ball, EMBLEM_WHITE, outer * (1.0 - inside));
  return vec4(colour, max(inside, outer));
}
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float sd = field.g;
  float u = uUnit;
  vec3 sun = normalize(uSun);
  // Outside the walls: a cream sidewalk edged in a tan kerb, then dark asphalt.
  float past = sd - 16.0 * u;
  vec3 col = ASPHALT * (0.9 + 0.2 * fbm3(p / 90.0)) * (0.95 + 0.1 * gnoise(p / 3.0));
  if (past > 0.0 && past < 44.0 * u) {
    vec2 slab = floor(p / (36.0 * u));
    vec3 walk = WALK * (0.92 + 0.14 * hash12(slab)) * (0.96 + 0.08 * gnoise(p / 3.0));
    col = mix(walk, KERB, 1.0 - smoothstep(0.5, 1.5, abs(past - 42.0 * u) - 2.0 * u));
  }

  if (sd < 0.0) {
    // Floor tiles: a checker of cream and peach, each its own tone, a joint round every one.
    float tile = TILE_SIZE_PLACEHOLDER * u;
    vec2 cell = floor(p / tile);
    float checker = mod(cell.x + cell.y, 2.0);
    vec3 floorCol = mix(FLOOR_A, FLOOR_B, checker * 0.72) * (0.96 + 0.07 * hash12(cell + 3.0));
    vec2 inCell = abs(fract(p / tile) - 0.5);
    float jointD = (0.5 - max(inCell.x, inCell.y)) * tile;
    // An orange border along the walls, a pale line inside it.
    float inward = -sd;
    float border = smoothstep(7.0 * u, 8.0 * u, inward) * (1.0 - smoothstep(33.0 * u, 34.0 * u, inward));
    floorCol = mix(floorCol, BORDER_ORANGE * (0.95 + 0.1 * hash12(floor(p / (27.0 * u)))), border);
    floorCol = mix(floorCol, BORDER_LINE, 1.0 - smoothstep(0.4, 1.4, abs(inward - 36.0 * u) - 1.2 * u));
    // The Poke Ball laid in tiles between the Actives.
    if (uEmblem.z > 0.0) {
      vec4 ball = floorBall(p - uEmblem.xy, uEmblem.z);
      floorCol = mix(floorCol, ball.rgb * (0.95 + 0.08 * hash12(cell + 9.0)), ball.a);
    }
    // The rug: red with a diamond weave, a cream stripe near the edge.
    if (uRug.z > uRug.x) {
      vec2 mid = (uRug.xy + uRug.zw) * 0.5;
      vec2 q = (p - mid) / ((uRug.zw - uRug.xy) * 0.5);
      float m = max(abs(q.x), abs(q.y));
      if (m < 1.0) {
        float diamond = abs(fract((abs(q.x) + abs(q.y)) * 3.0) - 0.5) * 2.0;
        vec3 rug = mix(RUG_RED, RUG_DARK, smoothstep(0.35, 0.65, diamond));
        rug = mix(rug, RUG_CREAM, step(0.86, m) * step(m, 0.915));
        rug = mix(rug, RUG_DARK, step(0.94, m));
        floorCol = rug * (0.94 + 0.12 * gnoise(p / 2.0));
        jointD = 99.0;
      }
    }
    floorCol = mix(floorCol, JOINT, (1.0 - smoothstep(0.4, 1.3, jointD)) * 0.75);
    floorCol *= 0.97 + 0.06 * gnoise(p / 5.0);
    col = floorCol;

    // The ceiling lamps' soft pools and the lamps' panels mirrored in the polished tiles.
    col *= 0.94 + 0.09 * (0.5 + 0.5 * cos(p.x / 230.0) * cos(p.y / 190.0));
    vec3 view = normalize(uEye - vec3(p, 0.0));
    vec2 mirrored = p + (-view.xy) * (260.0 * u / max(view.z, 0.2));
    vec2 panel = abs(fract(mirrored / (vec2(330.0, 250.0) * u)) - 0.5);
    float lamp = (1.0 - smoothstep(0.1, 0.16, panel.x)) * (1.0 - smoothstep(0.08, 0.14, panel.y));
    col += vec3(1.0, 0.96, 0.88) * lamp * 0.05 * (0.4 + 0.6 * checker);

    // The baked lamp light: the boxes' shadows (alpha), their feet's occlusion (blue); the round pieces' shadows.
    col *= mix(0.78, 1.0, light.b);
    float shade = (1.0 - light.a) * step(field.r, 1.0);
    vec2 away = -sun.xy / sun.z;
    for (int i = 0; i < ${MAX_DISCS}; i++) {
      vec4 piece = uDiscs[i];
      if (piece.z <= 0.0) continue;
      float d = distance(p, piece.xy + away * piece.w * 0.5) - piece.z;
      shade = max(shade, (1.0 - smoothstep(-1.0, 4.0 + piece.w * 0.12, d)) * 0.7);
    }
    col = mix(col, col * SHADE_TINT, shade * 0.8);
  }

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(1.0, 0.95, 0.85);
  col += spark * revealGlow(p, 0.035) * 0.55;
  col += spark * exitGlow(p) * 0.55;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`.replace('TILE_SIZE_PLACEHOLDER', TILE_PX.toFixed(1));

// Prop colours (aColor; w: 0 matte, 0.05 foliage, 0.2 satin, 0.3 metal, 0.9 glass, 2 and up a light at w - 1).
const WALL_ORANGE = [1.05, 0.45, 0.13, 0];
const WAINSCOT = [0.95, 0.56, 0.3, 0];
const PANEL = [0.82, 0.44, 0.2, 0];
const RAIL_RED = [0.6, 0.085, 0.06, 0.2];
const CREAM = [1.2, 1.06, 0.84, 0];
const BASEBOARD = [0.9, 0.66, 0.42, 0];
const SKY_GLASS = [0.3, 0.55, 0.85, 0.9];
const COUNTER_BODY = [1.0, 0.96, 0.9, 0.2];
const COUNTER_TOP = [0.62, 0.075, 0.055, 0.2];
const COUNTER_SURFACE = [1.15, 1.1, 1.0, 0.25];
const COUNTER_INNER = [0.62, 0.58, 0.52, 0];
const SILVER = [0.66, 0.7, 0.78, 0.3];
const SILVER_DARK = [0.2, 0.22, 0.27, 0.3];
const LAMP_BALL = [1.7, 0.6, 0.12, 2.3];
const BALL_RED = [0.8, 0.1, 0.08, 0.3];
const BALL_WHITE = [1.2, 1.18, 1.1, 0.3];
const GLOW_PAD = [0.5, 0.95, 1.1, 2.0];
const SOFA = [0.08, 0.3, 0.64, 0.2];
const SOFA_CUSHION = [0.15, 0.46, 0.82, 0.2];
const STOOLS = [[1.1, 0.36, 0.45, 0.2], [1.2, 0.9, 0.3, 0.2], [0.3, 0.6, 0.95, 0.2]];
const CHROME = [0.7, 0.74, 0.8, 0.3];
const TABLE_GLASS = [0.55, 0.78, 0.86, 0.9];
const POT_WHITE = [1.05, 1.05, 1.0, 0.1];
const POT_TERRA = [0.7, 0.24, 0.14, 0];
const FOLIAGE = [0.1, 0.3, 0.12, 0.05];
const FOLIAGE_LIT = [0.22, 0.5, 0.2, 0.05];
const SOIL = [0.13, 0.08, 0.06, 0];
const SHELF_WHITE = [1.1, 1.08, 1.0, 0.1];
const BOOKS = [[0.8, 0.12, 0.1, 0], [0.12, 0.34, 0.7, 0], [0.96, 0.72, 0.15, 0], [0.15, 0.5, 0.25, 0], [0.9, 0.9, 0.85, 0], [0.55, 0.2, 0.55, 0], [0.9, 0.4, 0.1, 0]];
const MONITOR = [0.12, 0.13, 0.16, 0.3];
const SCREEN = [0.16, 0.54, 1.0, 2.2];
const COLUMN_GLASS = [0.45, 0.8, 0.95, 0.9];
const COLUMN_GLOW = [0.5, 0.95, 1.2, 2.4];
const WALL_SCREEN = [1.5, 0.75, 0.22, 2.0];
const SCREEN_BALL_WHITE = [1.5, 1.4, 1.2, 2.2];
const SCREEN_BALL_ORANGE = [1.5, 0.5, 0.12, 2.2];
const POSTER_MAP = [0.2, 0.5, 0.75, 0];
const POSTER_LAND = [0.3, 0.6, 0.3, 0];
const BENCH_BASE = [0.7, 0.72, 0.78, 0.2];
const BENCH_CUSHION = [0.2, 0.5, 0.85, 0.2];

/** The point `s` px along a wall's inner face (a to b) at height z, `push` px into the room. */
const faceAt = (face, s, z, push = 0) => {
  const length = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
  const along = [(face.b[0] - face.a[0]) / length, (face.b[1] - face.a[1]) / length];
  return [face.a[0] + along[0] * s + along[1] * push, face.a[1] + along[1] * s - along[0] * push, z];
};

/** The four walls' inner faces, each running so the room is on its right. */
const innerFaces = (room) => ({
  left: { a: [room.x0, room.y0], b: [room.x0, room.y1] },
  right: { a: [room.x1, room.y1], b: [room.x1, room.y0] },
  near: { a: [room.x1, room.y0], b: [room.x0, room.y0] },
  far: { a: [room.x0, room.y1], b: [room.x1, room.y1] },
});

/**
 * The room's walls: an orange block with a red top, a baseboard, a wainscot of tan panels under a red
 * chair rail, bays of daylight in cream frames, a red crown.
 */
function roomWalls(props, spots) {
  const { walls, room, wallHeight, counter, u } = spots;
  const faces = innerFaces(room);
  const H = wallHeight;
  for (const wall of walls) {
    props.box({ x: (wall.x0 + wall.x1) / 2, y: (wall.y0 + wall.y1) / 2, z0: -2, z1: H, hw: (wall.x1 - wall.x0) / 2, hh: (wall.y1 - wall.y0) / 2, color: WALL_ORANGE, topColor: RAIL_RED });
    const face = faces[wall.name];
    const length = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
    const depth = 8 * u;
    wallBand(props, { a: face.a, b: face.b, depth, z0: -2, z1: 10 * u, over: 2 * u, color: BASEBOARD });
    wallBand(props, { a: face.a, b: face.b, depth, z0: 10 * u, z1: 68 * u, over: 1 * u, color: WAINSCOT });
    wallBand(props, { a: face.a, b: face.b, depth, z0: 68 * u, z1: 77 * u, over: 4 * u, color: RAIL_RED });
    wallBand(props, { a: face.a, b: face.b, depth, z0: H - 16 * u, z1: H, over: 5 * u, color: RAIL_RED });
    // Wainscot panels: darker insets every few cards' width.
    const pitch = 66 * u;
    const count = Math.floor(length / pitch);
    for (let k = 0; k < count; k += 1) {
      const s0 = (length * k) / count + 6 * u;
      const s1 = (length * (k + 1)) / count - 6 * u;
      props.quad(faceAt(face, s0, 16 * u, 1.6 * u), faceAt(face, s1, 16 * u, 1.6 * u), faceAt(face, s1, 62 * u, 1.6 * u), faceAt(face, s0, 62 * u, 1.6 * u), PANEL);
    }
    // Bays of daylight above the rail, skipping the counter's screen on the left wall.
    const gaps = wall.name === 'left' ? [[34 * u, counter.y - room.y0 - 104 * u], [counter.y - room.y0 + 104 * u, length - 34 * u]] : [[34 * u, length - 34 * u]];
    for (const [s0, s1] of gaps) {
      if (s1 - s0 < 80 * u) continue;
      const a = faceAt(face, s0, 0);
      const b = faceAt(face, s1, 0);
      windowRun(props, { a: [a[0], a[1]], b: [b[0], b[1]], z0: 110 * u, z1: 214 * u, panes: Math.max(2, Math.round((s1 - s0) / (86 * u))), rows: 1, glass: SKY_GLASS, frame: CREAM, frameW: 10 * u });
      wallBand(props, { a: [a[0], a[1]], b: [b[0], b[1]], depth, z0: 104 * u, z1: 110 * u, over: 3 * u, color: CREAM });
      wallBand(props, { a: [a[0], a[1]], b: [b[0], b[1]], depth, z0: 214 * u, z1: 220 * u, over: 3 * u, color: CREAM });
    }
  }
}

/** The big screen over the counter: a red frame, a warm glowing field, a Poke Ball and bars either side. */
function wallScreen(props, spots) {
  const { counter, room, u } = spots;
  const face = innerFaces(room).left;
  const s = counter.y - room.y0;
  const half = 100 * u;
  const z0 = 112 * u;
  const z1 = 208 * u;
  const out = [1, 0];
  wallBand(props, { a: faceAt(face, s - half - 5 * u, 0).slice(0, 2), b: faceAt(face, s + half + 5 * u, 0).slice(0, 2), depth: 8 * u, z0: z0 - 6 * u, z1: z1 + 6 * u, over: 3 * u, color: RAIL_RED });
  props.quad(faceAt(face, s - half, z0, 3.4 * u), faceAt(face, s + half, z0, 3.4 * u), faceAt(face, s + half, z1, 3.4 * u), faceAt(face, s - half, z1, 3.4 * u), WALL_SCREEN);
  const centre = [room.x0 + 4.2 * u, counter.y, (z0 + z1) / 2];
  const r = 40 * u;
  disc(props, { centre, out: [0, 1], r, color: SCREEN_BALL_ORANGE, from: 0, to: Math.PI });
  disc(props, { centre, out: [0, 1], r, color: SCREEN_BALL_WHITE, from: Math.PI, to: 2 * Math.PI });
  const band = 4.4 * u;
  props.quad([centre[0] + 0.2, centre[1] - r, centre[2] - band], [centre[0] + 0.2, centre[1] + r, centre[2] - band], [centre[0] + 0.2, centre[1] + r, centre[2] + band], [centre[0] + 0.2, centre[1] - r, centre[2] + band], COUNTER_INNER);
  disc(props, { centre: [centre[0] + 0.4, centre[1], centre[2]], out: [0, 1], r: r * 0.3, color: COUNTER_INNER });
  disc(props, { centre: [centre[0] + 0.6, centre[1], centre[2]], out: [0, 1], r: r * 0.2, color: SCREEN_BALL_WHITE });
  // Vertical bars either side of the ball, darker bands in the glow.
  for (const side of [-1, 1]) {
    for (const k of [0, 1, 2]) {
      const y = centre[1] + side * (r + 14 * u + k * 9 * u);
      props.quad([room.x0 + 3.9 * u, y - 2.2 * u, z0 + 10 * u], [room.x0 + 3.9 * u, y + 2.2 * u, z0 + 10 * u], [room.x0 + 3.9 * u, y + 2.2 * u, z1 - 10 * u], [room.x0 + 3.9 * u, y - 2.2 * u, z1 - 10 * u], SCREEN_BALL_ORANGE);
    }
  }
  return out;
}

/**
 * The reception counter: a half ring against the wall, a white body over a silver toe and a red stripe,
 * a red rim round a pale work surface; a glowing ball lamp at each end; the healing machine in the
 * middle with its six balls lying on a lit tray, a monitor behind it.
 */
function receptionCounter(props, counter, u) {
  const { x, y, r, dir } = counter;
  const steps = 26;
  const point = (theta, rad, z) => [x + dir * rad * Math.cos(theta), y + rad * Math.sin(theta), z];
  const theta = (k) => -Math.PI / 2 + (k / steps) * Math.PI;
  const zt = 44 * u;
  for (let k = 0; k < steps; k += 1) {
    const a = theta(k);
    const b = theta(k + 1);
    props.quad(point(a, r, 8 * u), point(b, r, 8 * u), point(b, r, zt), point(a, r, zt), COUNTER_BODY);
    props.quad(point(a, r + 2 * u, 0), point(b, r + 2 * u, 0), point(b, r + 2 * u, 8 * u), point(a, r + 2 * u, 8 * u), SILVER_DARK);
    props.quad(point(a, r + 0.8 * u, 20 * u), point(b, r + 0.8 * u, 20 * u), point(b, r + 0.8 * u, 27 * u), point(a, r + 0.8 * u, 27 * u), COUNTER_TOP);
    props.quad(point(a, r + 5 * u, zt - 4 * u), point(b, r + 5 * u, zt - 4 * u), point(b, r + 5 * u, zt), point(a, r + 5 * u, zt), COUNTER_TOP);
    props.quad(point(a, r + 5 * u, zt), point(b, r + 5 * u, zt), point(b, r - 12 * u, zt), point(a, r - 12 * u, zt), COUNTER_TOP);
    props.quad(point(a, r - 12 * u, zt + 0.5), point(b, r - 12 * u, zt + 0.5), point(b, r - 36 * u, zt + 0.5), point(a, r - 36 * u, zt + 0.5), COUNTER_SURFACE);
    props.quad(point(a, r - 36 * u, 0), point(b, r - 36 * u, 0), point(b, r - 36 * u, zt), point(a, r - 36 * u, zt), COUNTER_INNER);
  }
  // The Poke Ball on the counter's face.
  const badge = point(0, r + 1.4 * u, 31 * u);
  disc(props, { centre: badge, out: [0, 1], r: 11 * u, color: BALL_RED, from: 0, to: Math.PI });
  disc(props, { centre: badge, out: [0, 1], r: 11 * u, color: BALL_WHITE, from: Math.PI, to: 2 * Math.PI });
  disc(props, { centre: [badge[0] + dir * 0.3, badge[1], badge[2]], out: [0, 1], r: 3.6 * u, color: COUNTER_INNER });
  disc(props, { centre: [badge[0] + dir * 0.6, badge[1], badge[2]], out: [0, 1], r: 2.2 * u, color: BALL_WHITE });
  // A glowing ball lamp at each end of the counter.
  for (const end of [-1, 1]) {
    const [lx, ly] = point(end * 1.2, r - 18 * u, 0);
    props.cylinder({ x: lx, y: ly, z0: zt, z1: zt + 8 * u, r: 8 * u, color: SILVER, capColor: SILVER, sides: 14 });
    props.sphere({ x: lx, y: ly, z: zt + 20 * u, r: 11 * u, color: LAMP_BALL, sides: 16, rings: 10 });
  }
  // The healing machine: a white body, a silver tray with six balls on a lit pad, a monitor behind.
  const [mx, my] = point(0, r - 18 * u, 0);
  props.box({ x: mx, y: my, z0: zt, z1: zt + 14 * u, hw: 15 * u, hh: 34 * u, color: COUNTER_BODY, topColor: SILVER });
  props.quad([mx - 12 * u, my - 29 * u, zt + 14.4 * u], [mx + 12 * u, my - 29 * u, zt + 14.4 * u], [mx + 12 * u, my + 29 * u, zt + 14.4 * u], [mx - 12 * u, my + 29 * u, zt + 14.4 * u], GLOW_PAD);
  for (const dy of [-19, 0, 19]) {
    for (const dx of [-6.5, 6.5]) {
      props.sphere({ x: mx + dx * u, y: my + dy * u, z: zt + 19 * u, r: 5.2 * u, color: BALL_RED, sides: 12, rings: 8 });
      props.cylinder({ x: mx + dx * u, y: my + dy * u, z0: zt + 22.6 * u, z1: zt + 23.4 * u, r: 1.7 * u, color: BALL_WHITE, sides: 8 });
    }
  }
  props.box({ x: mx - dir * 12 * u, y: my, z0: zt + 14 * u, z1: zt + 52 * u, hw: 2.2 * u, hh: 30 * u, color: MONITOR });
  props.quad([mx - dir * 9.6 * u, my - 27 * u, zt + 20 * u], [mx - dir * 9.6 * u, my + 27 * u, zt + 20 * u], [mx - dir * 9.6 * u, my + 27 * u, zt + 48 * u], [mx - dir * 9.6 * u, my - 27 * u, zt + 48 * u], SCREEN);
}

/** A sofa against a wall: a seat, a back, two arms, three seat cushions and three back cushions. */
function sofa(props, s, u) {
  const at = (dx) => s.x + s.dir * dx;
  const length = s.y1 - s.y0;
  const part = (dx0, dx1, y0, y1, z0, z1, color) => props.box({ x: at((dx0 + dx1) / 2), y: (y0 + y1) / 2, z0, z1, hw: Math.abs(dx1 - dx0) / 2, hh: (y1 - y0) / 2, color });
  const D = s.depth;
  part(0, D, s.y0, s.y1, 3 * u, 20 * u, SOFA);
  part(0, 0.3 * D, s.y0, s.y1, 20 * u, 58 * u, SOFA);
  const arm = length * 0.075;
  part(0, D, s.y0, s.y0 + arm, 20 * u, 40 * u, SOFA);
  part(0, D, s.y1 - arm, s.y1, 20 * u, 40 * u, SOFA);
  const seat = (length - 2 * arm) / 3;
  for (let k = 0; k < 3; k += 1) {
    const y0 = s.y0 + arm + k * seat + 1.2 * u;
    const y1 = s.y0 + arm + (k + 1) * seat - 1.2 * u;
    part(0.3 * D, D - 1.5 * u, y0, y1, 20 * u, 29 * u, SOFA_CUSHION);
    part(0.3 * D, 0.5 * D, y0, y1, 29 * u, 54 * u, SOFA_CUSHION);
  }
}

/** A cushion stool: a square pad on four chrome legs. */
function stool(props, s, u) {
  props.box({ x: s.x, y: s.y, z0: 8 * u, z1: 16 * u, hw: 10 * u, hh: 10 * u, color: STOOLS[s.color % STOOLS.length] });
  for (const [dx, dy] of [[-7, -7], [7, -7], [7, 7], [-7, 7]]) props.box({ x: s.x + dx * u, y: s.y + dy * u, z0: -1, z1: 8 * u, hw: 0.9 * u, hh: 0.9 * u, color: CHROME });
}

/** A low glass table on a chrome frame. */
function coffeeTable(props, t, u) {
  props.box({ x: t.x, y: t.y, z0: 18 * u, z1: 20.5 * u, hw: t.w / 2, hh: t.d / 2, color: TABLE_GLASS });
  props.box({ x: t.x, y: t.y, z0: 14 * u, z1: 17 * u, hw: t.w / 2 - 2 * u, hh: t.d / 2 - 2 * u, color: CHROME });
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) props.box({ x: t.x + sx * (t.w / 2 - 3 * u), y: t.y + sy * (t.d / 2 - 3 * u), z0: -1, z1: 18 * u, hw: 1.1 * u, hh: 1.1 * u, color: CHROME });
}

/** A potted plant: a pot, dark soil, a clump of leafy lobes. */
function plant(props, p, u) {
  const terracotta = p.seed % 2 === 0;
  props.cylinder({ x: p.x, y: p.y, z0: -2, z1: 20 * u, r: p.r, color: terracotta ? POT_TERRA : POT_WHITE, sides: 16, capColor: SOIL });
  props.cylinder({ x: p.x, y: p.y, z0: 17 * u, z1: 22 * u, r: p.r * 1.12, color: terracotta ? POT_TERRA : POT_WHITE, sides: 16, capColor: SOIL });
  props.tube([[p.x, p.y, 20 * u], [p.x, p.y, 38 * u]], 1.8 * u, [0.2, 0.12, 0.08, 0], { sides: 6 });
  const lobes = [[0, 0, 44, 1], [-0.7, 0.3, 34, 0.75], [0.6, -0.4, 36, 0.75], [0.1, 0.7, 40, 0.65], [-0.2, -0.7, 38, 0.65], [0.3, 0.1, 56, 0.6]];
  lobes.forEach(([dx, dy, z, s], k) => {
    props.sphere({ x: p.x + dx * 15 * u, y: p.y + dy * 15 * u, z: z * u, r: 14 * u * s, color: k % 2 ? FOLIAGE_LIT : FOLIAGE, sides: 12, rings: 8, squash: 0.85 });
  });
}

/** A bookshelf against a wall: a white case with three shelves of books on its face. */
function bookshelf(props, s, u) {
  const at = (dx) => s.x + s.dir * dx;
  const mid = (s.y0 + s.y1) / 2;
  props.box({ x: at(s.depth / 2), y: mid, z0: -1, z1: s.h, hw: s.depth / 2, hh: (s.y1 - s.y0) / 2, color: SHELF_WHITE });
  const length = s.y1 - s.y0;
  for (let row = 0; row < 3; row += 1) {
    const z0 = (6 + row * 26) * u;
    props.quad([at(s.depth + 0.4), s.y0 + 3 * u, z0], [at(s.depth + 0.4), s.y1 - 3 * u, z0], [at(s.depth + 0.4), s.y1 - 3 * u, z0 + 22 * u], [at(s.depth + 0.4), s.y0 + 3 * u, z0 + 22 * u], COUNTER_INNER);
    let y = s.y0 + 4 * u;
    for (let k = 0; y < s.y1 - 7 * u; k += 1) {
      const roll = hash(row, k, s.dir + 3);
      const w = (3.4 + 3 * roll) * u;
      const h = (15 + 6 * hash(row, k, 9)) * u;
      props.quad([at(s.depth + 0.8), y, z0], [at(s.depth + 0.8), y + w, z0], [at(s.depth + 0.8), y + w, z0 + h], [at(s.depth + 0.8), y, z0 + h], BOOKS[Math.floor(roll * BOOKS.length) % BOOKS.length]);
      y += w + 0.6 * u;
    }
  }
  return length;
}

/** A PC on its desk: a white desk with a silver top, a monitor with a lit blue screen, a keyboard. */
function pcDesk(props, d, u) {
  const at = (dx) => d.x + d.dir * dx;
  props.box({ x: at(d.d / 2), y: d.y, z0: -1, z1: d.h, hw: d.d / 2, hh: d.w / 2, color: SHELF_WHITE, topColor: SILVER });
  props.box({ x: at(d.d * 0.7), y: d.y, z0: d.h, z1: d.h + 4 * u, hw: 6 * u, hh: 5 * u, color: MONITOR });
  props.box({ x: at(d.d * 0.7), y: d.y, z0: d.h + 4 * u, z1: d.h + 28 * u, hw: 2.4 * u, hh: 17 * u, color: MONITOR });
  props.quad([at(d.d * 0.7 + 2.6 * u), d.y - 15 * u, d.h + 7 * u], [at(d.d * 0.7 + 2.6 * u), d.y + 15 * u, d.h + 7 * u], [at(d.d * 0.7 + 2.6 * u), d.y + 15 * u, d.h + 26 * u], [at(d.d * 0.7 + 2.6 * u), d.y - 15 * u, d.h + 26 * u], SCREEN);
  props.box({ x: at(d.d * 0.28), y: d.y, z0: d.h, z1: d.h + 2 * u, hw: 6 * u, hh: 14 * u, color: COUNTER_BODY });
}

/** A long cushioned bench along a wall: a pale base, a blue cushion, a low back. */
function bench(props, b, u) {
  const at = (dx) => b.x + b.dir * dx;
  const mid = (b.y0 + b.y1) / 2;
  props.box({ x: at(b.depth / 2), y: mid, z0: 3 * u, z1: 14 * u, hw: b.depth / 2, hh: (b.y1 - b.y0) / 2, color: BENCH_BASE });
  props.box({ x: at(b.depth * 0.54), y: mid, z0: 14 * u, z1: 23 * u, hw: b.depth * 0.46, hh: (b.y1 - b.y0) / 2 - 1.5 * u, color: BENCH_CUSHION });
  props.box({ x: at(b.depth * 0.12), y: mid, z0: 14 * u, z1: 42 * u, hw: b.depth * 0.12, hh: (b.y1 - b.y0) / 2, color: BENCH_CUSHION });
}

/** A glass column lit from within: a pale glass drum between white rings, a glowing cap. */
function glassColumn(props, c, u) {
  props.cylinder({ x: c.x, y: c.y, z0: -2, z1: c.h, r: c.r, color: COLUMN_GLASS, capColor: COLUMN_GLOW, sides: 24 });
  props.cylinder({ x: c.x, y: c.y, z0: -2, z1: 10 * u, r: c.r * 1.22, color: CREAM, sides: 24 });
  props.cylinder({ x: c.x, y: c.y, z0: c.h - 8 * u, z1: c.h, r: c.r * 1.12, color: CREAM, capColor: COLUMN_GLOW, sides: 24 });
  for (let k = 0; k < 9; k += 1) {
    const angle = hash(k, c.x, 5) * 6.28;
    const rad = c.r * 0.6 * hash(k, c.y, 6);
    props.sphere({ x: c.x + Math.cos(angle) * rad, y: c.y + Math.sin(angle) * rad, z: c.h + 1.5 * u, r: 1.6 * u, color: SCREEN_BALL_WHITE, sides: 6, rings: 4 });
  }
}

/** A framed map on a wall (a blue sea, green land), and a Poke Ball poster. */
function posters(props, spots) {
  const { sofa: sofaSpot, shelves, room, u } = spots;
  const left = innerFaces(room).left;
  const right = innerFaces(room).right;
  const mapAt = (face, s, w, color) => {
    props.quad(faceAt(face, s - w - 3 * u, 108 * u, 1.2 * u), faceAt(face, s + w + 3 * u, 108 * u, 1.2 * u), faceAt(face, s + w + 3 * u, 188 * u, 1.2 * u), faceAt(face, s - w - 3 * u, 188 * u, 1.2 * u), CREAM);
    props.quad(faceAt(face, s - w, 112 * u, 1.8 * u), faceAt(face, s + w, 112 * u, 1.8 * u), faceAt(face, s + w, 184 * u, 1.8 * u), faceAt(face, s - w, 184 * u, 1.8 * u), color);
  };
  const sofaMid = (sofaSpot.y0 + sofaSpot.y1) / 2 - room.y0;
  mapAt(left, sofaMid, 62 * u, POSTER_MAP);
  props.quad(faceAt(left, sofaMid - 30 * u, 124 * u, 2.4 * u), faceAt(left, sofaMid + 8 * u, 124 * u, 2.4 * u), faceAt(left, sofaMid + 8 * u, 150 * u, 2.4 * u), faceAt(left, sofaMid - 30 * u, 150 * u, 2.4 * u), POSTER_LAND);
  props.quad(faceAt(left, sofaMid + 18 * u, 150 * u, 2.4 * u), faceAt(left, sofaMid + 46 * u, 150 * u, 2.4 * u), faceAt(left, sofaMid + 46 * u, 172 * u, 2.4 * u), faceAt(left, sofaMid + 18 * u, 172 * u, 2.4 * u), POSTER_LAND);
  const shelfMid = shelves[1].y0 + (shelves[1].y1 - shelves[1].y0) / 2;
  mapAt(right, room.y1 - shelfMid, 40 * u, POSTER_MAP);
}

/** Everything solid, as one prop geometry. */
export function centerProps(spots) {
  const { counter, sofa: sofaSpot, table, stools, shelves, desks, deskStools, bench: benchSpot, plants, columns, u } = spots;
  const props = createPropBuilder();
  roomWalls(props, spots);
  wallScreen(props, spots);
  receptionCounter(props, counter, u);
  sofa(props, sofaSpot, u);
  coffeeTable(props, table, u);
  for (const s of [...stools, ...deskStools]) stool(props, s, u);
  for (const s of shelves) bookshelf(props, s, u);
  for (const d of desks) pcDesk(props, d, u);
  bench(props, benchSpot, u);
  for (const p of plants) plant(props, p, u);
  for (const c of columns) glassColumn(props, c, u);
  posters(props, spots);
  return props;
}

/** The props by the lobby's lamps: warm bounce from the floor and ceiling, a little key from above, glass mirroring the daylight, polished metal. */
const PROP_LIGHT = /* glsl */ `
${VORONOI}
uniform float uUnit;
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 key = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, key), 0.0);
  vec3 bounce = vec3(0.82, 0.76, 0.7) * (0.85 + 0.15 * n.z);
  vec3 col = albedo * (bounce + vec3(1.0, 0.95, 0.86) * lit * 0.26);
  if (metal > 0.6) {
    // Glass: the room's warm light and the bays' daylight, mirrored at a slant, the lamps' glint.
    vec3 r = reflect(-view, n);
    vec3 refl = mix(vec3(0.9, 0.8, 0.68), vec3(0.62, 0.8, 1.0), clamp(abs(r.x) * 0.9 + 0.1, 0.0, 1.0));
    float fres = pow(1.0 - abs(dot(n, view)), 2.0);
    col = mix(albedo * (0.7 + 0.5 * lit), refl * 0.85, 0.2 + 0.5 * fres);
    col += vec3(1.0) * pow(max(dot(reflect(-key, n), view), 0.0), 60.0) * 0.5;
  } else if (metal > 0.04 && metal < 0.06) {
    vec2 q = world.xy / 12.0 + world.z / 10.0;
    q += 0.35 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 9.1)) - 0.5);
    vec4 lobe = voronoiCell(q);
    float inLobe = 1.0 - smoothstep(0.34, 0.62, length(lobe.zw));
    float bulge = dot(normalize(n + vec3(-lobe.zw, 0.0) * 0.6 * inLobe), key);
    col = albedo * (0.5 + 0.8 * smoothstep(-0.1, 0.8, bulge)) * mix(0.82, 1.0, smoothstep(0.0, 0.2, lobe.x)) * (0.7 + 0.5 * n.z);
    col *= 0.88 + 0.24 * gnoise(world.xy / 2.4 + world.z / 2.0);
  } else if (metal > 0.25 && metal < 0.35) {
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-key, n), view), 0.0), 26.0) * 0.4;
  } else if (metal > 0.15 && metal < 0.25) {
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-key, n), view), 0.0), 12.0) * 0.1;
  }
  col *= mix(0.76, 1.0, smoothstep(0.0, 14.0 * uUnit, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(1.0, 0.95, 0.85)' });

/** Pokemon Center's board (stadium-environment-mesh.js BOARDS). */
export function pokemonCenterBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...CENTER_LIGHT).normalize() },
    uRoom: { value: new three.Vector4() },
    uEmblem: { value: new three.Vector3() },
    uRug: { value: new three.Vector4() },
    uUnit: { value: 1 },
    uBlocks: { value: Array.from({ length: MAX_BLOCKS }, () => new three.Vector4()) },
    uBlockHeights: { value: Array.from({ length: MAX_BLOCKS }, () => 0) },
    uDiscs: { value: Array.from({ length: MAX_DISCS }, () => new three.Vector4()) },
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
    spots: (layout) => centerSpots(layout),
    apply(spots, bounds) {
      own.uUnit.value = spots?.u ?? 1;
      const room = spots?.room;
      own.uRoom.value.set(room?.x0 ?? 0, room?.y0 ?? 0, room?.x1 ?? 0, room?.y1 ?? 0);
      own.uEmblem.value.set(spots?.emblem?.x ?? 0, spots?.emblem?.y ?? 0, spots?.emblem?.r ?? 0);
      own.uRug.value.set(spots?.rug.x0 ?? 0, spots?.rug.y0 ?? 0, spots?.rug.x1 ?? 0, spots?.rug.y1 ?? 0);
      own.uBlocks.value.forEach((slot, i) => {
        const block = spots?.blocks[i];
        own.uBlockHeights.value[i] = block ? block.h : 0;
        return block ? slot.set(block.x0, block.y0, block.x1, block.y1) : slot.set(0, 0, 0, 0);
      });
      own.uDiscs.value.forEach((slot, i) => {
        const round = spots?.discs[i];
        return round ? slot.set(round.x, round.y, round.r, round.h) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, centerProps(spots).build(three));
    },
  };
}
