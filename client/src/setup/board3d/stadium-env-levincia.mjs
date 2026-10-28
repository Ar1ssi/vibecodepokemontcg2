// Design 077 (prototype): Levincia (customhb-278) after its card art (JTG 150, Marina Chikazawa): a
// bright city on the water at noon, a round stage of pale blue panels ringed by a band of yellow
// mosaic with a yellow swirl at its middle, its rim wall dropping to clear light-blue water; a curved
// walkway on piers circling it, white railings, bridges across to the stage, a row of bright yellow
// and red billboard screens along the walkway, glass towers with slanted crystal tops beyond. The art
// looks across the stage; the board looks down onto it, so the stage holds every card (its pale
// floor a shade darker than the art's, so white-bordered cards keep their edges), the water and the
// walkway ring it in the margins, the billboards stand on the walkway's far and side arcs leaning
// back (so the top-down preset sees their faces too), and the towers stand in the water past it,
// lower than the art's (tall, they lean off the top of the tilted view).
// World scale: a card's footprint is about a stage panel; a billboard is two cards wide.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G px from the stage's centre, B the
// bridges' mask, A the kind (0 stage, 1 rim wall, 2 water bed, 3 walkway, 4 bridge); the shared light
// bake adds normals, occlusion and the sun's shadow. Per frame: TERRAIN paints the stage (panels,
// the mosaic band, the swirl), the rim wall, the walkway and the bridges; WATER one sheet at
// WATER_LEVEL; PROPS the railings, the billboards and the towers (stadium-env-props).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const LEVINCIA_KEY = 'levincia';
/** The noon sun (toward it, table frame): high, from the far right, as the art's. */
export const NOON_SUN = Object.freeze([0.36, 0.5, 0.79]);
/** Free floor kept round every card inside the stage's rim. */
export const STAGE_MARGIN_PX = 26;
/** The ring of water round the stage, the walkway's width, its deck's height. */
export const MOAT_PX = 70;
export const WALKWAY = Object.freeze({ width: 74, height: 24 });
/** The water's surface and its bed, px off the cloth. */
export const WATER_LEVEL = -14;
const WATER_BED = -40;
export const MAX_BILLBOARDS = 14;
export const MAX_TOWERS = 8;
/** The bridges across the water, turned this far round from the table's width (rad). */
export const BRIDGE_TURNS = Object.freeze([Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]);
export const BRIDGE_WIDTH_PX = 52;

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Levincia's layout: the stage (a circle round every card footprint, STAGE_MARGIN_PX clear), the
 * walkway ring past the water round it, the billboards on its far and side arcs, the towers in the
 * water beyond. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function levinciaSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const scene = sceneBounds(layout, LEVINCIA_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const corners = cards.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]);
  const stage = Math.max(...corners.map(([x, y]) => Math.hypot(x - centre.x, y - centre.y))) + STAGE_MARGIN_PX * u;
  const walkIn = stage + MOAT_PX * u;
  const walkOut = walkIn + WALKWAY.width * u;
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;
  const at = (angle, radius) => ({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
  // Billboards along the walkway's outer edge, facing the stage, from the left arc round over the far
  // end to the right, between the bridges; none on the near arc (they would lean over the player's
  // cards in the tilted view).
  const billboards = [];
  const boardWidth = 150 * u;
  const step = (boardWidth + 26 * u) / walkOut;
  for (let angle = Math.PI * 1.1; angle > -0.1 && billboards.length < MAX_BILLBOARDS; angle -= step) {
    if (BRIDGE_TURNS.some((turn) => Math.abs(((angle - turn + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < step * 0.75)) continue;
    const spot = at(angle, walkOut - 10 * u);
    if (!inScene(spot.x, spot.y, boardWidth * 0.5)) continue;
    billboards.push({ ...spot, angle, width: boardWidth, height: 84 * u, seed: hash(angle, 1, 1), index: billboards.length });
  }
  // Towers: in the water past the walkway, on the far end and in the corners.
  const towers = [];
  for (let k = 0; k < 40 && towers.length < MAX_TOWERS; k += 1) {
    const angle = Math.PI * (0.08 + 0.84 * hash(k, 2, 1));
    const out = walkOut + (70 + 150 * hash(k, 2, 2)) * u;
    const spot = at(angle, out);
    const r = (46 + 26 * hash(k, 2, 3)) * u;
    if (!inScene(spot.x, spot.y, r)) continue;
    if (towers.some((tower) => Math.hypot(tower.x - spot.x, tower.y - spot.y) < tower.r + r + 30 * u)) continue;
    // Off the far end they may rise higher; out to the sides they stay lower.
    const far = Math.sin(angle);
    towers.push({ ...spot, r, h: (120 + 140 * far * hash(k, 2, 4)) * u, sides: 4 + Math.floor(hash(k, 2, 5) * 3), turn: hash(k, 2, 6) * Math.PI, cut: hash(k, 2, 7) * Math.PI * 2 });
  }
  return { table, scene, u, centre, stage, walkIn, walkOut, billboards, towers };
}

const CITY = /* glsl */ `
// The stage's centre (x, y), its rim's radius, the walkway's inner and outer radius (uRing).
uniform vec4 uStage;
uniform float uWalkOut;
const float BRIDGE_TURNS[4] = float[4](${BRIDGE_TURNS.map((turn) => turn.toFixed(5)).join(', ')});
// px from the nearest bridge's middle line, measured across it.
float bridgeAcross(vec2 rel) {
  float best = 100000.0;
  for (int i = 0; i < 4; i++) {
    vec2 dir = vec2(cos(BRIDGE_TURNS[i]), sin(BRIDGE_TURNS[i]));
    if (dot(rel, dir) <= 0.0) continue;
    best = min(best, abs(dot(rel, vec2(-dir.y, dir.x))));
  }
  return best;
}
`;

/**
 * Bake: the stage floor flat just under the cloth; its rim wall dropping to the water's bed; the
 * walkway's deck on its own wall; the bridges ramping from the stage's rim up to the walkway.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${CITY}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 rel = p - uStage.xy;
  float r = length(rel);
  float h = -1.0;
  float kind = 0.0;
  float across = bridgeAcross(rel);
  float bridge = 1.0 - smoothstep(${(BRIDGE_WIDTH_PX / 2 - 2).toFixed(1)}, ${(BRIDGE_WIDTH_PX / 2).toFixed(1)}, across);
  if (r > uStage.z) {
    float drop = smoothstep(uStage.z, uStage.z + 6.0, r);
    h = mix(-1.0, ${WATER_BED.toFixed(1)}, drop);
    kind = r < uStage.z + 6.0 ? 1.0 : 2.0;
    float onWalk = smoothstep(uStage.w - 4.0, uStage.w, r) * (1.0 - smoothstep(uWalkOut, uWalkOut + 4.0, r));
    if (onWalk > 0.0) {
      h = mix(h, ${WALKWAY.height.toFixed(1)}, onWalk);
      kind = 3.0;
    }
    // A bridge: a deck ramping from the stage's rim up to the walkway.
    if (bridge > 0.0 && r < uStage.w) {
      float ramp = smoothstep(uStage.z, uStage.w, r);
      h = mix(h, mix(-1.0, ${WALKWAY.height.toFixed(1)}, ramp), bridge);
      kind = 4.0;
    }
  }
  gl_FragColor = vec4(h, r, bridge, kind);
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
const vec3 FLOOR = vec3(0.47, 0.57, 0.7);
const vec3 FLOOR_PALE = vec3(0.555, 0.65, 0.756);
const vec3 YELLOW = vec3(1.0, 0.677, 0.077);
const vec3 YELLOW_PALE = vec3(1.1, 0.9, 0.24);
const vec3 BLUE_BAND = vec3(0.142, 0.302, 0.618);
const vec3 RIM = vec3(0.228, 0.392, 0.684);
const vec3 RIM_DARK = vec3(0.101, 0.167, 0.392);
const vec3 WATER = vec3(0.346, 0.621, 0.836);
const vec3 WATER_DEEP = vec3(0.167, 0.392, 0.72);
const vec3 WALK = vec3(0.654, 0.723, 0.836);
const vec3 WALK_SIDE = vec3(0.12, 0.228, 0.496);
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
${CITY}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float kind = field.a;
  vec2 rel = p - uStage.xy;
  float r = length(rel);
  float angle = atan(rel.y, rel.x);
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float lit = clamp(dot(n, sun) / sun.z, 0.0, 1.3) * mix(0.6, 1.0, light.a);
  float t = uTime;

  // The stage: pale blue panels in rings and spokes, hairline seams.
  float ringW = 90.0;
  float spokes = max(12.0, floor(6.2831853 * r / 120.0));
  float seamRing = abs(fract(r / ringW) - 0.5) * ringW;
  float seamSpoke = abs(fract(angle / 6.2831853 * spokes) - 0.5) * 6.2831853 * r / spokes;
  float seam = 1.0 - smoothstep(0.5, 1.5, min(ringW * 0.5 - seamRing, seamSpoke));
  vec3 col = mix(FLOOR, FLOOR_PALE, 0.35 + 0.2 * hash12(vec2(floor(r / ringW), floor(angle / 6.2831853 * spokes))));
  col = mix(col, FLOOR * 0.82, seam * 0.6);
  // The mosaic band round the rim: yellow tesserae, a few pale, pale grout between; a blue line in.
  float band = smoothstep(uStage.z - 48.0, uStage.z - 46.0, r) * (1.0 - smoothstep(uStage.z - 8.0, uStage.z - 6.0, r));
  vec4 tile = voronoiCell(p / 9.0);
  vec3 tessera = mix(YELLOW, YELLOW_PALE, step(0.7, tile.y)) * (0.9 + 0.2 * fract(tile.y * 9.0));
  tessera = mix(tessera, FLOOR_PALE * 1.1, (1.0 - smoothstep(0.05, 0.12, tile.x)) * 0.7);
  col = mix(col, tessera, band);
  float blueLine = smoothstep(uStage.z - 58.0, uStage.z - 56.0, r) * (1.0 - smoothstep(uStage.z - 50.0, uStage.z - 48.0, r));
  col = mix(col, BLUE_BAND, blueLine);
  // The swirl at the middle: a yellow spiral of mosaic, as the art's.
  // Two arms winding out from a round yellow eye, a turn and a half each.
  float spiral = fract((angle / 6.2831853) * 2.0 - log(max(r, 1.0) / 30.0) * 1.6);
  float arms = (1.0 - smoothstep(0.1, 0.17, abs(spiral - 0.5))) * smoothstep(34.0, 56.0, r) * (1.0 - smoothstep(uStage.z * 0.34, uStage.z * 0.42, r));
  float eye = 1.0 - smoothstep(26.0, 30.0, r);
  float swirl = max(arms, eye);
  col = mix(col, tessera, swirl * 0.9);

  // The rim wall: blue panels, dark joints.
  vec3 rim = mix(RIM_DARK, RIM, 0.5 + 0.5 * step(0.5, fract(angle * 40.0)));
  col = mix(col, rim, step(0.5, kind) * step(kind, 1.5));
  // The water's bed: deep blue (the water sheet paints over it).
  col = mix(col, WATER_DEEP * 0.7, step(1.5, kind) * step(kind, 2.5));
  // The walkway: pale deck planks across it, blue on its sides.
  float deckTop = smoothstep(0.85, 0.97, n.z);
  float plank = 1.0 - smoothstep(0.4, 1.0, abs(fract(angle * r / 14.0) - 0.5) * 14.0);
  vec3 walk = mix(WALK_SIDE, WALK * (0.95 - 0.1 * plank), deckTop);
  col = mix(col, walk, step(2.5, kind) * step(kind, 3.5));
  // A bridge: the deck's pale planks.
  vec3 bridgeDeck = mix(WALK_SIDE, WALK * 0.95, deckTop);
  col = mix(col, bridgeDeck, step(3.5, kind));

  col *= 0.7 + 0.35 * min(lit, 1.2);
  col *= mix(0.6, 1.0, smoothstep(0.3, 0.9, light.b));
  col = edgeHaze(col, vUv);
  vec3 spark = vec3(1.1, 0.95, 0.4);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const WATER_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = position.xy;
  vPos = p;
  vUv = (p - uMin) / uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, ${WATER_LEVEL.toFixed(1)} * terrainGrowth(p), 1.0);
}
`;

/** Clear light-blue water: deeper blue out past the walkway, ripples, sun glitter. */
export const WATER_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${CITY}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = vPos;
  vec4 field = texture2D(uField, vUv);
  if (field.r > ${WATER_LEVEL.toFixed(1)} + 0.5 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  float t = uTime;
  float r = field.g;
  vec3 col = mix(WATER, WATER_DEEP, smoothstep(uWalkOut, uWalkOut + 300.0, r));
  // Shade under the rim and the walkway's edges.
  col *= mix(0.75, 1.0, smoothstep(uStage.z, uStage.z + 24.0, r));
  // Ripples drifting, and short bright glints.
  float swell = fbm3((p - vec2(t * 6.0, t * 2.0)) / vec2(80.0, 36.0));
  col *= 0.9 + 0.2 * swell;
  vec4 cell = voronoiCell((p - vec2(t * 9.0, t * 4.0)) / vec2(20.0, 8.0));
  float glint = (1.0 - smoothstep(0.1, 0.26, length(cell.zw * vec2(0.6, 1.6)))) * step(0.62, fract(cell.y * 7.0));
  col = mix(col, vec3(0.95, 1.0, 1.05), glint * (0.5 + 0.5 * sin(t * 2.0 + cell.y * 30.0)) * 0.7);
  col = edgeHaze(col, vUv);
  vec3 spark = vec3(1.1, 0.95, 0.4);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how glossy, 2 and up a light at w - 1).
const RAIL = [0.85, 0.9, 0.96, 0.4];
const POST = [0.6, 0.66, 0.76, 0.4];
const FRAME = [0.16, 0.22, 0.36, 0.5];
const SCREEN_YELLOW = [1.0, 0.82, 0.25, 2.25];
const SCREEN_RED = [1.0, 0.36, 0.28, 2.25];
const SCREEN_BLUE = [0.36, 0.58, 1.0, 2.25];
const SCREEN_PALE = [1.0, 0.97, 0.75, 2.25];
const GLASS = [0.05, 0.09, 0.42, 0.9];
const GLASS_LIT = [0.18, 0.3, 0.78, 0.9];
const BASE = [0.55, 0.62, 0.74, 0.3];

/**
 * A billboard: a dark frame on two legs at the walkway's outer edge, leaning back away from the stage,
 * its screen a bright panel of the art's yellow, red and blue blocks (a big shape on a field).
 */
const billboard = (props, board, centre, deck, u) => {
  const out = [Math.cos(board.angle), Math.sin(board.angle)];
  const along = [-out[1], out[0]];
  const lean = 0.7;
  const foot = [board.x, board.y];
  const at = (s, h) => [foot[0] + along[0] * s + out[0] * Math.sin(lean) * h, foot[1] + along[1] * s + out[1] * Math.sin(lean) * h, deck + 10 * u + Math.cos(lean) * h];
  const halfW = board.width / 2;
  const frontAt = (s, h, push) => {
    const p = at(s, h);
    return [p[0] - out[0] * Math.cos(lean) * push, p[1] - out[1] * Math.cos(lean) * push, p[2] + Math.sin(lean) * push];
  };
  // Legs.
  for (const s of [-halfW * 0.6, halfW * 0.6]) props.tube([[foot[0] + along[0] * s, foot[1] + along[1] * s, deck - 1], at(s, board.height * 0.3)], 2.6 * u, FRAME, { sides: 6 });
  // The frame's back and face.
  props.quad(at(halfW, 0), at(-halfW, 0), at(-halfW, board.height), at(halfW, board.height), FRAME);
  const field = board.index % 3 === 0 ? SCREEN_BLUE : SCREEN_YELLOW;
  const inset = 5 * u;
  props.quad(frontAt(-halfW + inset, inset, 1.5), frontAt(halfW - inset, inset, 1.5), frontAt(halfW - inset, board.height - inset, 1.5), frontAt(-halfW + inset, board.height - inset, 1.5), field);
  // The art's bright Pokémon art on it, abstracted: a big red-orange figure, a pale highlight and a
  // small dark accent, each a slanted block placed by the board's seed.
  const blocks = [
    [0.12 + 0.3 * board.seed, 0.16, 0.36, 0.62, SCREEN_RED],
    [0.2 + 0.3 * board.seed, 0.5, 0.16, 0.3, SCREEN_PALE],
    [0.62 - 0.2 * board.seed, 0.2, 0.22, 0.4, field === SCREEN_BLUE ? SCREEN_YELLOW : SCREEN_RED],
  ];
  for (const [left, bottom, width, height, color] of blocks) {
    const s0 = -halfW + inset + (board.width - 2 * inset) * left;
    const s1 = Math.min(halfW - inset, s0 + (board.width - 2 * inset) * width);
    const h0 = inset + (board.height - 2 * inset) * bottom;
    const h1 = Math.min(board.height - inset, h0 + (board.height - 2 * inset) * height);
    const slant = (s1 - s0) * 0.15;
    props.quad(frontAt(s0, h0, 2), frontAt(s1, h0 + slant * 0.4, 2), frontAt(s1 - slant, h1, 2), frontAt(s0 + slant * 0.3, h1, 2), color);
  }
};

/**
 * A glass tower: a prism on a pale base in the water, its top cut at a slant (the art's crystal
 * tops), its faces dark blue glass, the cut face pale with the sky.
 */
const tower = (props, t, u) => {
  props.cylinder({ x: t.x, y: t.y, z0: WATER_BED, z1: WATER_LEVEL + 10 * u, r: t.r * 1.15, color: BASE, sides: t.sides });
  const ring = Array.from({ length: t.sides }, (_, k) => {
    const angle = t.turn + (k / t.sides) * 2 * Math.PI;
    return [t.x + Math.cos(angle) * t.r, t.y + Math.sin(angle) * t.r];
  });
  // The slanted cut: the top rises toward one side by 45% of the tower's height.
  const cutDir = [Math.cos(t.cut), Math.sin(t.cut)];
  const topAt = ([x, y]) => t.h * (0.78 + 0.22 * ((x - t.x) * cutDir[0] + (y - t.y) * cutDir[1]) / t.r);
  const z0 = WATER_LEVEL + 10 * u;
  for (let k = 0; k < t.sides; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % t.sides];
    const facing = Math.cos(t.turn + ((k + 0.5) / t.sides) * 2 * Math.PI - 0.6);
    props.quad([...a, z0], [...b, z0], [...b, topAt(b)], [...a, topAt(a)], facing > 0.3 ? GLASS_LIT : GLASS);
  }
  const middle = [t.x, t.y, ring.reduce((sum, p) => sum + topAt(p), 0) / t.sides];
  for (let k = 0; k < t.sides; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % t.sides];
    props.quad([...a, topAt(a)], [...b, topAt(b)], middle, middle, GLASS_LIT);
  }
};

/** Railings along the walkway's two edges and the bridges' sides, the billboards, the towers. */
export function levinciaProps({ centre, stage, walkIn, walkOut, billboards, towers, scene, u }) {
  const props = createPropBuilder();
  const deck = WALKWAY.height;
  const inside = (x, y) => x > scene.x + 6 && x < scene.x + scene.w - 6 && y > scene.y + 6 && y < scene.y + scene.h - 6;
  const bridgeGap = (angle, radius) =>
    BRIDGE_TURNS.some((turn) => {
      const d = Math.abs(((angle - turn + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return d * radius < BRIDGE_WIDTH_PX * u * 0.55;
    });
  // Railings: posts every ~30 px along each edge, a rail along their tops, broken where a bridge
  // joins the inner edge.
  for (const [radius, gaps] of [
    [walkIn + 4 * u, true],
    [walkOut - 4 * u, false],
  ]) {
    const count = Math.round((2 * Math.PI * radius) / (30 * u));
    let run = [];
    const flush = () => {
      if (run.length > 1) props.tube(run, 1.6 * u, RAIL, { sides: 6 });
      run = [];
    };
    for (let k = 0; k <= count; k += 1) {
      const angle = (k / count) * 2 * Math.PI;
      const x = centre.x + Math.cos(angle) * radius;
      const y = centre.y + Math.sin(angle) * radius;
      if (!inside(x, y) || (gaps && bridgeGap(angle, radius))) {
        flush();
        continue;
      }
      props.cylinder({ x, y, z0: deck - 1, z1: deck + 14 * u, r: 1.4 * u, color: POST, sides: 6 });
      run.push([x, y, deck + 14 * u]);
    }
    flush();
  }
  // The bridges' rails, from the stage's rim up to the walkway.
  for (const turn of BRIDGE_TURNS) {
    const dir = [Math.cos(turn), Math.sin(turn)];
    const side = [-dir[1], dir[0]];
    for (const s of [-1, 1]) {
      const points = [];
      for (let k = 0; k <= 8; k += 1) {
        const f = k / 8;
        const radius = stage + (walkIn - stage) * f;
        const offset = s * (BRIDGE_WIDTH_PX * u * 0.5 - 3 * u);
        const x = centre.x + dir[0] * radius + side[0] * offset;
        const y = centre.y + dir[1] * radius + side[1] * offset;
        const z = -1 + (deck + 1) * (f * f * (3 - 2 * f)) + 14 * u;
        if (!inside(x, y)) continue;
        points.push([x, y, z]);
        if (k % 2 === 0) props.cylinder({ x, y, z0: z - 14 * u, z1: z, r: 1.4 * u, color: POST, sides: 6 });
      }
      if (points.length > 1) props.tube(points, 1.6 * u, RAIL, { sides: 6 });
    }
  }
  for (const board of billboards) billboard(props, board, centre, deck, u);
  for (const t of towers) tower(props, t, u);
  return props;
}

/** The props in the noon sun: a sheen on the glass that shows the sky, the screens their own light. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 view = normalize(uEye - world);
  vec3 col = albedo * (vec3(0.55, 0.62, 0.75) * (0.7 + 0.3 * n.z) + vec3(1.05, 1.0, 0.92) * max(dot(n, sun), 0.0));
  // Glass shows the sky above it, paler toward the top, a hot glint of the sun.
  vec3 sky = mix(vec3(0.35, 0.55, 0.95), vec3(0.75, 0.85, 1.0), clamp(reflect(-view, n).z, 0.0, 1.0));
  col = mix(col, sky * 0.75, metal * 0.25 * (1.0 - abs(n.z)));
  col += vec3(1.0) * pow(max(dot(reflect(-sun, n), view), 0.0), 40.0) * metal * 0.6;
  // Mullion lines up the glass.
  col *= 1.0 - 0.3 * metal * step(0.82, fract((world.x + world.y) / 11.0)) * (1.0 - abs(n.z));
  col *= 1.0 - 0.15 * metal * step(0.88, fract(world.z / 14.0)) * (1.0 - abs(n.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(1.1, 0.95, 0.4)' });

/** Levincia's board (stadium-environment-mesh.js BOARDS). */
export function levinciaBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...NOON_SUN).normalize() },
    uStage: { value: new three.Vector4() },
    uWalkOut: { value: 0 },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Pushed back a hair so the walls right at the water's level win the depth test, not flicker.
    water: make(WATER_VERTEX, WATER_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const water = new three.Mesh(new three.BufferGeometry(), materials.water);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  return {
    objects: [terrain, water, props],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => levinciaSpots(layout),
    apply(spots, bounds) {
      own.uStage.value.set(spots?.centre.x ?? 0, spots?.centre.y ?? 0, spots?.stage ?? 1e5, spots?.walkIn ?? 1e5);
      own.uWalkOut.value = spots?.walkOut ?? 1e5;
      replaceGeometry(terrain, terrainGrid(bounds));
      replaceGeometry(water, new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, levinciaProps(spots).build(three));
    },
  };
}
