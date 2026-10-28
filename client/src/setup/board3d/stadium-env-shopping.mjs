// Design 077 (prototype): Shopping Center (customhb-360) after its card art (EVS 157, Oswaldo Kato):
// the hall of a mall in pink and white, a polished checkered floor with a thick gold ring set in it,
// tables of folded clothes and racks of shirts down both sides, mannequins in yellow and pink,
// bunches of balloons floating up under the ceiling, pale-blue glass escalators climbing to a
// balcony. The art looks across the floor at the shops; the board looks down on it, so the floor
// holds every card with the gold ring round the Actives, the display tables and mannequins stand in
// the side bands, balloons float over them (never over a card), and a glass-railed mezzanine across
// the far end is climbed by an escalator at each side.
// World scale: a card's footprint is a tile and a half of the floor; a mannequin stands about a card
// and a half high.
//
// Bake, once per layout: BAKE_FIELD is the flat floor (R height px); the shared light bake adds
// nothing but the mezzanine's contact. Per frame: TERRAIN paints the checkered floor, the ring, the
// polish and every prop's soft shadow on it; PROPS the walls, mezzanine, escalators, tables, mannequins
// and balloons (stadium-env-props).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_UNIFORMS,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { craterEmblem } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const SHOPPING_KEY = 'shopping-center';
/** The hall's light (toward it): nearly straight above, a little from the far left, so props throw short soft shadows. */
export const SHOPPING_LIGHT = Object.freeze([-0.08, 0.14, 0.99]);
export const TILE_PX = 52;
export const RING_WIDTH_PX = 15;
const RING_HALF = RING_WIDTH_PX / 2;
export const MEZZANINE_HEIGHT_PX = 100;
export const MAX_TABLES = 6;
export const MAX_RACKS = 4;
export const MAX_FIXTURES = 16;
export const MAX_BALLOONS = 22;
const SHIRTS = [
  [1.0, 0.62, 0.08],
  [0.95, 0.35, 0.5],
  [0.25, 0.5, 0.95],
  [0.55, 0.4, 0.8],
  [0.95, 0.4, 0.25],
  [0.2, 0.75, 0.55],
  [0.98, 0.82, 0.2],
  [0.4, 0.75, 0.95],
];
const BALLOON_HUES = [
  [1.2, 0.9, 0.04],
  [0.38, 0.8, 0.2],
  [0.12, 0.5, 0.95],
  [0.5, 0.28, 0.78],
  [1.0, 0.18, 0.2],
  [1.1, 0.46, 0.08],
  [0.1, 0.75, 0.68],
];

/**
 * Shopping Center's layout: the floor, the mezzanine across the far end with its two escalators and
 * columns, the display tables and mannequins in the side bands, the balloons over them, the walls.
 * Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function shoppingSpots(layout) {
  const ctx = boardContext(layout, SHOPPING_KEY);
  if (!ctx) return null;
  const { scene, table, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  // The walls stand at the table's edges (the camera presets show little past them), never nearer
  // the cards than the side bands' furniture needs.
  const reach = Math.max(Math.abs(core.x), core.x + core.w);
  const wallAt = Math.max(table.w / 2 - 4 * u, reach + 150 * u);
  const wall = { left: centre.x - wallAt, right: centre.x + wallAt, far: handEnd + 40 * u };
  const mezzanine = { x0: scene.x - 20 * u, x1: scene.x + scene.w + 20 * u, y0: wall.far, y1: scene.y + scene.h + 80 * u, height: MEZZANINE_HEIGHT_PX * u };
  const escalators = [-1, 1].map((side) => ({
    x: side * (reach + 190 * u),
    side,
    y0: core.y + core.h * 0.76,
    y1: wall.far,
    width: 62 * u,
    height: mezzanine.height,
  }));
  const columns = [-0.62, -0.2, 0.2, 0.62].map((share) => ({ x: centre.x + share * core.w, y: wall.far + 14 * u, r: 13 * u, h: 230 * u }));
  // Tables of folded clothes down both bands, in the aisles between the cards' box and the walls.
  const tables = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const y = core.y + (0.12 + 0.27 * k) * core.h + 34 * u;
      const table = { x: side * (reach + 96 * u), y, w: 62 * u, d: 150 * u, h: 22 * u, seed: hash(side, k, 1) };
      if (ctx.clear(table.x, table.y, table.d / 2 + 4 * u, 6 * u)) tables.push(table);
    }
  }
  const mannequins = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const y = core.y + (0.12 + 0.27 * k) * core.h + 34 * u + 124 * u;
      const m = { x: side * (reach + 150 * u + hash(side, k, 3) * 14 * u), y, h: (100 + 12 * hash(side, k, 4)) * u, top: (k + (side > 0 ? 1 : 0)) % 2, seed: hash(side, k, 5) };
      if (ctx.clear(m.x, m.y, 22 * u, 8 * u)) mannequins.push(m);
    }
  }
  // Bunches of balloons tied to the tables, floating over the side bands.
  const balloons = [];
  const bunches = tables.filter((_, i) => i % 2 === 0);
  bunches.forEach((table, b) => {
    const count = 4 + (b % 2);
    for (let k = 0; k < count; k += 1) {
      const roll = (salt) => hash(b, k, salt + 20);
      const out = Math.sign(table.x) * (30 + 70 * roll(1)) * u;
      balloons.push({
        x: table.x + out,
        y: table.y + (roll(2) - 0.5) * 120 * u,
        z: (110 + 90 * roll(3)) * u,
        r: (19 + 7 * roll(4)) * u,
        hue: Math.floor(roll(5) * BALLOON_HUES.length),
        anchor: { x: table.x, y: table.y },
        phase: roll(6) * 6.28,
      });
    }
  });
  // Racks of shirts along each wall, between the walls' skirting and the mannequins.
  const racks = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k += 1) {
      const rack = { x: side * (wallAt - 52 * u), y: core.y + (0.2 + 0.32 * k) * core.h + 60 * u, len: 200 * u, seed: hash(side, k, 11) };
      if (Math.abs(rack.x) > reach + 190 * u && ctx.clear(rack.x, rack.y, rack.len / 2 + 6 * u, 8 * u)) racks.push(rack);
    }
  }
  return { ...ctx, wall, mezzanine, escalators, columns, tables, mannequins, racks, balloons: balloons.slice(0, MAX_BALLOONS), emblem: craterEmblem(layout, centre) };
}

const SHOPPING = /* glsl */ `
// The gold ring (x, y, radius; 0: none), the scale of a card (u); every fixture's soft shadow on the
// floor (x, y, half width, half depth: tables, columns, escalators) and every balloon's (x, y, radius, hue).
uniform vec3 uEmblem;
uniform float uUnit;
// The side walls' x (left, right).
uniform vec2 uWalls;
uniform vec4 uFixtures[${MAX_FIXTURES}];
uniform vec4 uBalloons[${MAX_BALLOONS}];
uniform vec3 uHues[${BALLOON_HUES.length}];
`;

/** Bake: the floor, flat. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = uMin + vUv * uSize;
  gl_FragColor = vec4(0.2 * (fbm3(p / 120.0) - 0.5), 0.0, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples), kept a shade under the art's lightest so white card borders keep their edge.
const PALETTE = /* glsl */ `
const vec3 TILE_PINK = vec3(0.93, 0.34, 0.42);
const vec3 TILE_PALE = vec3(1.22, 0.95, 1.04);
const vec3 GROUT = vec3(1.3, 1.12, 1.18);
const vec3 RING_GOLD = vec3(1.75, 0.92, 0.08);
const vec3 RING_DARK = vec3(0.84, 0.35, 0.07);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${EDGE_HAZE}
${PALETTE}
${SHOPPING}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
// Soft contact shadow of a box (x, y, half width, half depth) at p, 0..1.
float contact(vec2 p, vec4 box) {
  if (box.z <= 0.0) return 0.0;
  vec2 q = abs(p - box.xy) - box.zw;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(0.0, 16.0 * uUnit, d);
}
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  vec3 sun = normalize(uSun);
  float tile = ${TILE_PX.toFixed(1)} * uUnit;
  vec2 cell = floor(p / tile);
  float checker = mod(cell.x + cell.y, 2.0);
  // The checkered floor: coral pink and pale pink, each tile a shade of its own, a bright grout line.
  vec3 col = mix(TILE_PINK, TILE_PALE, checker);
  col *= 0.95 + 0.1 * hash12(cell + 3.0);
  vec2 inTile = abs(fract(p / tile) - 0.5) * tile;
  float grout = 1.0 - smoothstep(0.3, 1.3, tile * 0.5 - max(inTile.x, inTile.y));
  col = mix(col, GROUT, grout * 0.55);
  // Polish: broad soft lamp reflections drifting across it, a wash of sheen toward the middle.
  vec3 view = normalize(uEye - vec3(p, 0.0));
  float sheen = pow(max(dot(reflect(-sun, vec3(0.0, 0.0, 1.0)), view), 0.0), 6.0);
  col += vec3(0.28, 0.24, 0.26) * sheen * (0.55 + 0.45 * fbm3(p / 220.0 + 3.0));
  col *= 0.94 + 0.1 * fbm3(p / 36.0 + 6.0);
  // The gold ring round the Actives: thick, a lighter edge inside, its outer edge a shade darker.
  if (uEmblem.z > 0.0) {
    float signedRing = distance(p, uEmblem.xy) - uEmblem.z;
    float inRing = 1.0 - smoothstep(${(RING_HALF - 1).toFixed(2)} * uUnit, ${(RING_HALF + 1).toFixed(2)} * uUnit, abs(signedRing));
    vec3 gold = mix(RING_DARK, RING_GOLD, smoothstep(-${RING_HALF.toFixed(2)} * uUnit, ${RING_HALF.toFixed(2)} * uUnit, -signedRing));
    gold += vec3(0.5, 0.4, 0.15) * (1.0 - smoothstep(0.0, 3.0 * uUnit, abs(signedRing + ${(RING_HALF - 2).toFixed(2)} * uUnit)));
    col = mix(col, gold, inRing);
  }
  // Each fixture's contact shadow and each balloon's soft coloured one, under a light from overhead.
  float shade = 0.0;
  for (int i = 0; i < ${MAX_FIXTURES}; i++) shade = max(shade, contact(p, uFixtures[i]));
  col *= 1.0 - 0.34 * shade;
  for (int i = 0; i < ${MAX_BALLOONS}; i++) {
    vec4 balloon = uBalloons[i];
    if (balloon.z <= 0.0) continue;
    vec2 at = balloon.xy + vec2(14.0, -10.0) * uUnit;
    float soft = exp(-pow(distance(p, at) / (balloon.z * 1.5), 2.0));
    col *= 1.0 - 0.22 * soft;
    col += uHues[int(mod(balloon.w, ${BALLOON_HUES.length}.0))] * 0.04 * soft;
  }
  // Past the walls it is outside the mall: dark.
  col = mix(col, vec3(0.12, 0.06, 0.08), max(step(p.x, uWalls.x), step(uWalls.y, p.x)));
  // The hall dims a little toward its walls.
  col *= mix(0.86, 1.0, smoothstep(0.0, 0.2, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y))));
  col = edgeHaze(col, vUv, 0.6);
  col += vec3(1.0, 0.9, 0.9) * revealGlow(p, 0.035) * 0.5;
  col += vec3(1.0, 0.9, 0.9) * exitGlow(p) * 0.5;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.1 steps, 0.15 balloon, 0.2 folded cloth, 0.9 glass, 2 and up a light at w - 1).
const WALL = [1.0, 0.42, 0.38, 0];
const WALL_LIGHT = [1.5, 0.75, 0.7, 0];
const SKIRT = [1.4, 1.3, 1.32, 0.1];
const FLOOR_TOP = [1.1, 0.5, 0.52, 0];
const GLASS = [0.45, 0.75, 1.0, 0.9];
const RAIL = [1.3, 1.35, 1.4, 0.4];
const STEPS = [0.6, 0.8, 1.0, 0.12];
const RAMP_SIDE = [0.5, 0.68, 0.92, 0.3];
const WOOD = [0.45, 0.24, 0.13, 0];
const PILLAR = [1.1, 1.05, 1.1, 0.1];
const SKIN = [1.1, 0.95, 0.82, 0];
const MAN_LEG = [0.9, 0.85, 0.85, 0];
const MAN_TOPS = [[0.92, 0.55, 0.08, 0], [1.0, 0.36, 0.5, 0]];
const LIGHT_GLOBE = [1.8, 1.7, 1.5, 2.6];

/** A table of folded clothes: a wood top on four legs, rows of colourful piles on it. */
function displayTable(props, table, u) {
  props.box({ x: table.x, y: table.y, z0: table.h - 4 * u, z1: table.h, hw: table.w / 2, hh: table.d / 2, color: WOOD, topColor: [0.62, 0.36, 0.2, 0] });
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) props.box({ x: table.x + sx * (table.w / 2 - 4 * u), y: table.y + sy * (table.d / 2 - 4 * u), z0: -1, z1: table.h - 4 * u, hw: 2.2 * u, hh: 2.2 * u, color: WOOD });
  const rows = 3;
  const cols = 5;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const colour = SHIRTS[Math.floor(hash(table.x + r, table.y + c, 7) * SHIRTS.length)];
      const height = (4 + 5 * hash(r, c, table.seed * 10)) * u;
      props.box({
        x: table.x + (r - 1) * (table.w / 3.2),
        y: table.y + (c - 2) * (table.d / 5.4),
        z0: table.h,
        z1: table.h + height,
        hw: table.w / 7.4,
        hh: table.d / 12.5,
        color: [colour[0], colour[1], colour[2], 0.2],
        topColor: [colour[0] * 1.08, colour[1] * 1.08, colour[2] * 1.08, 0.2],
      });
    }
  }
}

/** A mannequin on a round base: legs, a clothed torso with broad shoulders, a neck and a smooth head. */
function mannequin(props, m, u) {
  const top = MAN_TOPS[m.top];
  props.cylinder({ x: m.x, y: m.y, z0: -1, z1: 3 * u, r: 18 * u, color: SKIRT, sides: 16 });
  props.tube([[m.x, m.y, 3 * u], [m.x, m.y, m.h * 0.5]], [5 * u, 7 * u], MAN_LEG, { sides: 10 });
  props.tube([[m.x, m.y, m.h * 0.46], [m.x, m.y, m.h * 0.62], [m.x, m.y, m.h * 0.8]], [11 * u, 14 * u, 12 * u], top, { sides: 16 });
  // Shoulders: a broad flat bar across the chest.
  props.box({ x: m.x, y: m.y, z0: m.h * 0.74, z1: m.h * 0.82, hw: 7 * u, hh: 19 * u, color: top, topColor: top });
  props.tube([[m.x, m.y, m.h * 0.82], [m.x, m.y, m.h * 0.9]], 4.2 * u, SKIN, { sides: 8 });
  props.sphere({ x: m.x, y: m.y, z: m.h * 0.97, r: 9.5 * u, color: SKIN, sides: 14, rings: 9, squash: 1.15 });
  for (const s of [-1, 1]) props.tube([[m.x, m.y + s * 18 * u, m.h * 0.78], [m.x, m.y + s * 21 * u, m.h * 0.5]], [4 * u, 3.2 * u], top, { sides: 8 });
}

/** A rack along a wall: a rail on two posts, shirts hung close along it in the aisle's colours. */
function shirtRack(props, rack, u) {
  const step = 9 * u;
  const count = Math.floor(rack.len / step);
  props.cylinder({ x: rack.x, y: rack.y - rack.len / 2, z0: -1, z1: 60 * u, r: 2 * u, color: RAIL, sides: 8 });
  props.cylinder({ x: rack.x, y: rack.y + rack.len / 2, z0: -1, z1: 60 * u, r: 2 * u, color: RAIL, sides: 8 });
  props.tube([[rack.x, rack.y - rack.len / 2, 60 * u], [rack.x, rack.y + rack.len / 2, 60 * u]], 1.6 * u, RAIL, { sides: 8 });
  for (let k = 0; k < count; k += 1) {
    const colour = SHIRTS[Math.floor(hash(rack.seed * 10, k, 5) * SHIRTS.length)];
    const y = rack.y - rack.len / 2 + (k + 0.5) * step;
    props.box({ x: rack.x, y, z0: 28 * u, z1: 58 * u, hw: 14 * u, hh: 2.6 * u, color: [colour[0], colour[1], colour[2], 0.2], topColor: [colour[0] * 1.1, colour[1] * 1.1, colour[2] * 1.1, 0.2] });
  }
}

/** A balloon on its string tied to a table, a little knot at its foot. */
function balloon(props, b, u) {
  const hue = BALLOON_HUES[b.hue];
  props.sphere({ x: b.x, y: b.y, z: b.z, r: b.r, color: [hue[0], hue[1], hue[2], 0.15], sides: 16, rings: 11, squash: 1.12 });
  props.cone({ x: b.x, y: b.y, z0: b.z - b.r * 1.2, z1: b.z - b.r * 1.0, r: 2.2 * u, color: [hue[0] * 0.8, hue[1] * 0.8, hue[2] * 0.8, 0], sides: 8 });
  props.tube([[b.x, b.y, b.z - b.r * 1.2], [(b.x + b.anchor.x) / 2 + 3 * u, (b.y + b.anchor.y) / 2, b.z * 0.5], [b.anchor.x, b.anchor.y, 22 * u]], 0.55 * u, [0.95, 0.95, 0.95, 0], { sides: 4 });
}

/** The far mezzanine: a pink-fronted floor with a glass balustrade, white columns, an escalator at each side. */
function mezzanine(props, spots) {
  const { mezzanine: m, escalators, columns, u } = spots;
  const mid = [(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2];
  props.box({ x: mid[0], y: mid[1], z0: -2, z1: m.height, hw: (m.x1 - m.x0) / 2, hh: (m.y1 - m.y0) / 2, color: WALL, topColor: FLOOR_TOP, frontColor: WALL_LIGHT });
  props.box({ x: mid[0], y: m.y0 + 1.5 * u, z0: m.height - 8 * u, z1: m.height - 2 * u, hw: (m.x1 - m.x0) / 2, hh: 3 * u, color: SKIRT });
  // The balustrade: glass panels between posts along the front edge, a rail on top; gaps where the escalators land.
  const posts = Math.round((m.x1 - m.x0) / (70 * u));
  for (let k = 0; k <= posts; k += 1) {
    const x = m.x0 + ((m.x1 - m.x0) * k) / posts;
    props.cylinder({ x, y: m.y0 + 2 * u, z0: m.height, z1: m.height + 40 * u, r: 1.8 * u, color: RAIL, sides: 8 });
    if (k < posts) {
      const x1 = m.x0 + ((m.x1 - m.x0) * (k + 1)) / posts;
      const landing = escalators.some((e) => Math.abs((x + x1) / 2 - e.x) < e.width * 0.8);
      if (!landing) props.quad([x, m.y0 + 2 * u, m.height + 4 * u], [x1, m.y0 + 2 * u, m.height + 4 * u], [x1, m.y0 + 2 * u, m.height + 38 * u], [x, m.y0 + 2 * u, m.height + 38 * u], GLASS);
    }
  }
  props.tube([[m.x0, m.y0 + 2 * u, m.height + 40 * u], [m.x1, m.y0 + 2 * u, m.height + 40 * u]], 1.9 * u, RAIL, { sides: 8 });
  for (const column of columns) props.cylinder({ x: column.x, y: column.y, z0: m.height, z1: column.h, r: column.r, color: PILLAR, sides: 18 });
  // Escalators: a ramp of steps up from the floor to the mezzanine's edge, glass sides, handrails.
  for (const e of escalators) {
    const x0 = e.x - e.width / 2;
    const x1 = e.x + e.width / 2;
    props.quad([x0, e.y0, 2 * u], [x1, e.y0, 2 * u], [x1, e.y1, e.height], [x0, e.y1, e.height], STEPS);
    for (const x of [x0, x1]) {
      props.quad([x, e.y0, 2 * u], [x, e.y1, e.height], [x, e.y1, e.height + 34 * u], [x, e.y0, 38 * u], GLASS);
      props.quad([x, e.y0, -2], [x, e.y1, -2], [x, e.y1, e.height], [x, e.y0, 2 * u], RAMP_SIDE);
      props.tube([[x, e.y0, 38 * u], [x, e.y1, e.height + 36 * u]], 1.7 * u, RAIL, { sides: 8 });
      props.cylinder({ x, y: e.y0, z0: 0, z1: 38 * u, r: 2 * u, color: RAIL, sides: 8 });
    }
  }
}

/** The side walls: pink boards with a white skirting and a pale band under the ceiling. */
function walls(props, spots) {
  const { wall, scene, u } = spots;
  const length = scene.y + scene.h + 80 * u - (scene.y - 80 * u);
  for (const [x, side] of [[wall.left, -1], [wall.right, 1]]) {
    const cx = x + side * 30 * u;
    const cy = scene.y - 80 * u + length / 2;
    props.box({ x: cx, y: cy, z0: -2, z1: 150 * u, hw: 30 * u, hh: length / 2, color: WALL, topColor: WALL_LIGHT });
    props.box({ x: x + side * 1.5 * u, y: cy, z0: -2, z1: 10 * u, hw: 3 * u, hh: length / 2, color: SKIRT });
    props.box({ x: x + side * 1.5 * u, y: cy, z0: 108 * u, z1: 118 * u, hw: 3 * u, hh: length / 2, color: WALL_LIGHT });
    for (let y = scene.y; y < scene.y + scene.h; y += 120 * u) {
      props.sphere({ x: x - side * 2 * u, y, z: 128 * u, r: 7 * u, color: LIGHT_GLOBE, sides: 10, rings: 7, squash: 0.45 });
    }
  }
}

/** Everything solid, as one prop geometry. */
export function shoppingProps(spots) {
  const { tables, mannequins, balloons, racks, u } = spots;
  const props = createPropBuilder();
  walls(props, spots);
  mezzanine(props, spots);
  for (const rack of racks) shirtRack(props, rack, u);
  for (const table of tables) displayTable(props, table, u);
  for (const m of mannequins) mannequin(props, m, u);
  for (const b of balloons) balloon(props, b, u);
  return props;
}

/** The props under the hall's light: bright and soft, glass pale and bright-edged, balloons glossy with a window's highlight. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, sun), 0.0);
  vec3 col = albedo * (0.66 + 0.2 * n.z + 0.3 * lit);
  if (metal > 0.6) {
    float fres = pow(1.0 - abs(dot(n, view)), 2.0);
    col = mix(albedo * 0.9, vec3(1.7, 1.9, 2.1), 0.1 + 0.55 * fres);
  } else if (metal > 0.14 && metal < 0.18) {
    // A balloon: translucent colour, a bright rim, a soft window's highlight.
    float rim = pow(1.0 - abs(dot(n, view)), 2.2);
    col = albedo * (0.7 + 0.5 * lit) + albedo * rim * 0.5;
    col += vec3(1.0) * pow(max(dot(reflect(-normalize(vec3(-0.4, 0.5, 0.8)), n), view), 0.0), 26.0) * 0.8;
  } else if (metal > 0.1 && metal < 0.14) {
    // Escalator steps: ridged treads sliding up.
    float tread = abs(fract((world.y - uTime * 22.0) / (9.0)) - 0.5);
    col = albedo * (0.8 + 0.4 * smoothstep(0.1, 0.4, tread)) * (0.7 + 0.3 * lit);
  } else if (metal > 0.19 && metal < 0.24) {
    // Folded cloth: soft stripes across the pile.
    col *= 0.9 + 0.12 * sin(world.y * 1.1 + world.x * 0.3);
  }
  col *= mix(0.82, 1.0, smoothstep(0.0, 14.0, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(1.0, 0.9, 0.9)' });

/** Shopping Center's board (stadium-environment-mesh.js BOARDS). */
export function shoppingCenterBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...SHOPPING_LIGHT).normalize() },
    uEmblem: { value: new three.Vector3() },
    uUnit: { value: 1 },
    uWalls: { value: new three.Vector2(-1e5, 1e5) },
    uFixtures: { value: Array.from({ length: MAX_FIXTURES }, () => new three.Vector4()) },
    uBalloons: { value: Array.from({ length: MAX_BALLOONS }, () => new three.Vector4()) },
    uHues: { value: BALLOON_HUES.map((hue) => new three.Vector3(...hue)) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  return {
    objects: [terrain, props],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => shoppingSpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uUnit.value = u;
      own.uEmblem.value.set(spots?.emblem?.x ?? 0, spots?.emblem?.y ?? 0, spots?.emblem?.r ?? 0);
      own.uWalls.value.set(spots?.wall.left ?? -1e5, spots?.wall.right ?? 1e5);
      const fixtures = spots
        ? [
            ...spots.tables.map((t) => [t.x, t.y, t.w / 2, t.d / 2]),
            ...spots.columns.map((c) => [c.x, c.y, c.r, c.r]),
            ...spots.mannequins.map((m) => [m.x, m.y, 14 * u, 14 * u]),
          ].slice(0, MAX_FIXTURES)
        : [];
      own.uFixtures.value.forEach((slot, i) => (fixtures[i] ? slot.set(...fixtures[i]) : slot.set(0, 0, 0, 0)));
      own.uBalloons.value.forEach((slot, i) => {
        const b = spots?.balloons[i];
        return b ? slot.set(b.x, b.y, b.r, b.hue) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, shoppingProps(spots).build(three));
    },
  };
}
