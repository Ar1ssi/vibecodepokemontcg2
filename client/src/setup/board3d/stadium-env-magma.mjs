// Design 077 (prototype): Magma Basin (customhb-289) after its card art (BRS 144, swsh9-144 in
// set.json; ORBITALLINK): a basin walled by dark crimson volcanic cliffs, lava pouring down their
// faces into a moat of molten gold that rings an island of dark brown rock, the Poké Ball set in the
// island's middle as a smooth brick-red disc, sparks in the air. The art looks across the island at the far wall; the board looks down into the
// basin, so the island holds every card, the moat rings it (widest along the table's sides, where the
// table is free of cards) and the walls rise round the moat, their falls on the sides and the far
// wall, in view of both camera presets.
//
// Bake, once per layout: BAKE_BASIN works out the smooth basin (R height px, G signed px from the
// island's shore, B signed px from the moat's outer shore, A signed px from the nearest lavafall's
// edge); BAKE_FIELD cuts the walls into faces and roughens the island (R height px, G the face's tone
// 0..1, B how much one of the island's long cracks glows, A the ground's kind: -1 island, 0 wall,
// 1 moat bed); the shared light bake adds normals, occlusion and the sun shadow.
// Per frame: TERRAIN paints the rock lit by the lava, the falls and the emblem; LAVA is the moat's
// sheet, flowing round the island; EMBERS rise off the moat and spray off the falls' splashes.
// Design 082 (Brilliant Diamond / Shining Pearl): the rock on a smooth ramp in BDSP's soft light, the
// walls laid in strata (stadium-env-ground.mjs).
// Design 084 (the visual audit): the falls, the card's identity, pour down the far wall's corners,
// where both cameras see them past the opponent's hand row: bright vertical streaks that bloom,
// feeding the moat; the moat narrower, a dark cracked crust along both shores and the bright slow
// channel only down its middle, its light on the island's rim; the Poké Ball a low-contrast embossed
// ring in two near values of the basalt with a faint heat in its grooves; the island dark basalt lumps,
// worn smooth under the cards.
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
import { craterEmblem, environmentFootprints } from './stadium-environment-layout.mjs';
import { STRATA } from './stadium-env-ground.mjs';
import { EMBER_FRAGMENT } from './stadium-env-volcanic.mjs';
import { tableBounds } from './table-uv.mjs';

/** The moat's surface, px off the cloth. */
export const LAVA_LEVEL = -8;
/** The moat's bed under the lava, px. */
const MOAT_BED = -24;
/** The island's height at its shore's top and how much higher its middle swells, px. */
const ISLAND_TOP = 4;
const ISLAND_SWELL = 7;
/** Free rock kept round every card footprint inside the island's shore. */
export const ISLAND_MARGIN_PX = 28;
/** Corner radius of the island's rounded outline. */
export const ISLAND_CORNER_PX = 120;
/** The emblem's button ring as a share of its radius: big, so its arcs show either side of the Actives. */
const EMBLEM_BUTTON = '0.36';
/**
 * How much further the island runs on toward the near end: the player's hand row lies over the
 * board's near edge, and its cards read poorly on bright lava, so the near moat lies past it.
 */
export const NEAR_REACH_PX = 140;
/**
 * Width of the moat along the table's sides (left, right) and its ends (near, far). Design 084:
 * narrower (it was the brightest thing on screen, wide and flat beside the Benches and piles).
 */
export const MOAT_PX = { side: 76, end: 56 };
/** About how far the shores wander out past their rounded outline (the shader's islandWobble). */
const SHORE_DRIFT_PX = 34;
/** Run of the wall from the moat's outer shore up to its crest. */
export const WALL_RUN_PX = 108;
/** Most lavafalls a basin has (the uniform array's length). */
export const MAX_FALLS = 4;
/**
 * The lavafalls: the art's four, down its back wall. Falls on the side walls (tried three times) run
 * across the screen in both presets, from the screen's edge to the moat, and read as rays; on the far
 * wall's straight run they hide behind the opponent's hand row. Design 084: so they pour down the far
 * wall's corners: which corner (-1 left, 1 right), how far round its arc from the far run (0) toward
 * the side run (1), and whether it forks into three strands near its foot (the art's second fall from
 * the right). Each pours straight down the wall's face (its outward normal): a fall laid along the
 * screen's up ran beside the side moat, parallel to it, and read as a second moat (I277). tcgl's frame
 * shows the far-left corner only from about 0.6 round (its right corner lies under the chat panel), so
 * three pour there, between 0.6 and 0.9, and one on the right for the top-down preset.
 */
const FALL_RECIPES = [
  { corner: -1, turn: 0.62, fork: false },
  { corner: -1, turn: 0.74, fork: false },
  { corner: -1, turn: 0.86, fork: false },
  { corner: 1, turn: 0.55, fork: true },
];
/** A distance past every fall that still fits the bake's half-float target. */
const FAR_PX = 9000;
const FALL_DIP_PX = 14;
const FALL_OVER_PX = 16;
const FORK_AT_PX = 58;
/** Width of the walls' flat faces, and how deep the seams between them are cut. */
const FACET_PX = 110;
const SEAM_PX = 7;
export const EMBER_COUNT = 160;

/**
 * Magma Basin's landmarks: the island (a rounded rect round every card footprint, each corner of the
 * footprints ISLAND_MARGIN_PX inside its shore), the moat's width beside the cards and off their
 * ends (MOAT_PX), the lavafalls on its outer shore (FALL_RECIPES) and the Poké Ball set in the
 * island (craterEmblem, about the table's middle). Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ island: { x: number, y: number, hw: number, hh: number, r: number },
 *   moat: { side: number, end: number },
 *   falls: { x: number, y: number, angle: number, fork: boolean }[],
 *   emblem: { x: number, y: number, r: number }|null }|null}
 */
export function basinSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const rects = [...slabs, ...flats];
  const block = rects.length
    ? {
        x0: Math.min(...rects.map((r) => r.x)),
        x1: Math.max(...rects.map((r) => r.x + r.w)),
        y0: Math.min(...rects.map((r) => r.y)),
        y1: Math.max(...rects.map((r) => r.y + r.h)),
      }
    : { x0: table.x + table.w * 0.3, x1: table.x + table.w * 0.7, y0: table.y, y1: table.y + table.h };
  // Grown until the block's corners, the worst case for a rounded outline, lie the margin inside it.
  const r = ISLAND_CORNER_PX;
  const grow = r - (r - ISLAND_MARGIN_PX) / Math.SQRT2;
  const island = {
    x: (block.x0 + block.x1) / 2,
    y: (block.y0 + block.y1 - NEAR_REACH_PX) / 2,
    hw: (block.x1 - block.x0) / 2 + grow,
    hh: (block.y1 - block.y0 + NEAR_REACH_PX) / 2 + grow,
    r,
  };
  const moat = { side: MOAT_PX.side, end: MOAT_PX.end };
  // Each fall meets the moat about where its outer shore runs round the far corner's arc (the
  // shader's shores wander a little further out; it finds the wall band itself), pouring straight down
  // the wall's face: its line runs along the corner's outward normal (angle a, up the wall).
  const falls = FALL_RECIPES.map(({ corner, turn, fork }) => {
    const a = Math.PI / 2 - corner * turn * (Math.PI / 2);
    const reach = r + MOAT_PX.end + (MOAT_PX.side - MOAT_PX.end) * turn + SHORE_DRIFT_PX;
    const x = island.x + corner * (island.hw - r) + Math.cos(a) * reach;
    const y = island.y + (island.hh - r) + Math.sin(a) * reach;
    return { x, y, angle: a, fork };
  });
  const emblem = craterEmblem(layout, { x: table.x + table.w / 2, y: layout.depth });
  return { island, moat, falls, emblem };
}

const BASIN_LAVA = /* glsl */ `
// The basin's lava in linear HDR, yellower than Scorched Earth's (the card art's moat is molten
// gold). Each stop is the art's colour sampled from the print, inverted through Neutral tone
// mapping (whose toe would otherwise strip the blue from every dark): a red-brown crust (96,39,29),
// red-orange at the edges (194,72,43), orange (240,128,58), gold (236,176,74), a pale gold core
// (245,197,102).
vec3 basinLava(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.149, 0.052, 0.044), vec3(0.577, 0.103, 0.062), smoothstep(0.08, 0.22, t));
  c = mix(c, vec3(1.008, 0.269, 0.073), smoothstep(0.32, 0.48, t));
  c = mix(c, vec3(0.917, 0.492, 0.107), smoothstep(0.55, 0.7, t));
  return mix(c, vec3(1.25, 0.76, 0.17), smoothstep(0.78, 0.94, t));
}
`;

const BASIN = /* glsl */ `
// The island's centre x, y and half size; the moat's width along the table's sides and its ends,
// and the island's corner radius (basinSpots).
uniform vec4 uIsland;
uniform vec4 uMoat;
float roundedRect(vec2 rel, vec2 halfSize, float corner) {
  vec2 q = abs(rel) - (halfSize - corner);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
}
// 1 beside the island's long sides (left and right of the cards), 0 off its ends (near and far).
float sideness(vec2 p) {
  vec2 rel = abs(p - uIsland.xy) / max(uIsland.zw, vec2(1.0));
  return smoothstep(-0.12, 0.12, rel.x - rel.y);
}
// How far the island's shore wanders out past its outline, px: outward only, so it never moves
// nearer a card; broad bulges beside the cards, where the moat is wide, smaller ones at its ends.
float islandWobble(vec2 p) {
  float broad = clamp(fbm3(p / 210.0 + 3.1) * 1.7 - 0.5, 0.0, 1.0);
  float knobs = clamp(gnoise(p / 120.0 + 9.3) * 1.6 - 0.55, 0.0, 1.0);
  return mix(40.0, 84.0, sideness(p)) * broad + 34.0 * knobs + 11.0 * gnoise(p / 55.0 + 1.7);
}
// Signed px from the island's shore, negative on the island.
float islandDistance(vec2 p) {
  return roundedRect(p - uIsland.xy, uIsland.zw, uMoat.w) - islandWobble(p);
}
// The moat's width at p: wide beside the cards, narrower at the ends, swelling and pinching.
float moatWidth(vec2 p) {
  return mix(uMoat.y, uMoat.x, sideness(p)) + 40.0 * (fbm3(p / 160.0 + 7.7) - 0.5);
}
// Signed px from the moat's outer shore, positive on the wall.
float outerDistance(vec2 p, float islandSD) {
  return islandSD - moatWidth(p);
}
`;

const FALLS = /* glsl */ `
// Each lavafall: where it meets the moat (x, y), the way up the wall (angle), its kind (0 none,
// 1 one stream, 2 forked).
uniform vec4 uFalls[${MAX_FALLS}];
// One fall: x signed px from its edge (negative in it), y px along its line from its foot, z px
// across from its line. up: px up the wall from the moat's outer shore (outerSD), so the fall widens
// at its foot wherever the shore actually runs (design 084: its foot is only near the shore, on a
// corner's arc).
vec3 fallAt(vec2 p, vec4 fall, float up) {
  vec2 dir = vec2(cos(fall.z), sin(fall.z));
  vec2 rel = p - fall.xy;
  float along = dot(rel, dir);
  float across = dot(rel, vec2(-dir.y, dir.x));
  if (along < -60.0 || along > ${WALL_RUN_PX + 80}.0) return vec3(100000.0, along, across);
  float t = clamp(up / ${WALL_RUN_PX}.0, 0.0, 1.0);
  float line = across - (gnoise(vec2(along / 46.0, fall.x * 0.013 + fall.z * 3.0)) - 0.5) * 9.0 * t;
  // Wider where it spills out over the moat at its foot.
  float width = mix(6.0, 3.6, t) + max(12.0 - up, 0.0) * 0.4;
  float d = abs(line) - width;
  if (fall.w > 1.5) {
    // Below the fork the stream splits into three strands fanning apart toward the moat.
    float spread = clamp(1.0 - up / ${FORK_AT_PX}.0, 0.0, 1.0);
    float strandWidth = mix(width, 2.6, spread);
    d = 100000.0;
    for (int k = -1; k <= 1; k++) {
      float offset = float(k) * 22.0 * spread * (0.8 + 0.4 * hash12(vec2(float(k), fall.x)));
      d = min(d, abs(line - offset) - strandWidth);
    }
  }
  return vec3(d, along, line);
}
// Signed px from the nearest fall's edge: only on the wall, from a little way into the moat to just
// past the crest, rounded off where it spills over.
float fallsDistance(vec2 p, float outerSD) {
  if (outerSD < -${FALL_DIP_PX}.0 || outerSD > ${WALL_RUN_PX + FALL_OVER_PX}.0) return 100000.0;
  float d = 100000.0;
  for (int i = 0; i < ${MAX_FALLS}; i++) {
    if (uFalls[i].w < 0.5) continue;
    d = min(d, fallAt(p, uFalls[i], outerSD).x);
  }
  return max(d, outerSD - ${WALL_RUN_PX + FALL_OVER_PX - 4}.0);
}
`;

/**
 * Bake 1, first pass (into uPre): the smooth basin. The island is a low dome whose shoulder rounds
 * down under the lava at its shore; the moat's bed lies flat; the wall climbs steeply off the outer
 * shore to a crest broken into crags and falls away a little beyond it.
 */
export const BAKE_BASIN_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${BASIN}
${FALLS}
float ridged(vec2 q) {
  return 1.0 - abs(2.0 * gnoise(q) - 1.0);
}
// The crest's height round the basin: broad swells broken into crags.
float crestHeight(vec2 p) {
  return 104.0 + 52.0 * fbm3(p / 300.0 + 2.0) + 30.0 * pow(ridged(p / 85.0 + 4.0), 3.0);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  float islandSD = islandDistance(p);
  float outerSD = outerDistance(p, islandSD);
  float h = ${MOAT_BED}.0;
  if (islandSD < 0.0) {
    float inland = clamp(-islandSD / 240.0, 0.0, 1.0);
    float top = ${ISLAND_TOP}.0 + ${ISLAND_SWELL}.0 * sqrt(inland);
    h = mix(${MOAT_BED}.0, top, sqrt(clamp(-islandSD / 30.0, 0.0, 1.0)));
  } else if (outerSD > 0.0) {
    float rise = 1.0 - pow(1.0 - clamp(outerSD / ${WALL_RUN_PX}.0, 0.0, 1.0), 1.8);
    float beyond = max(outerSD - ${WALL_RUN_PX}.0, 0.0);
    h = mix(${MOAT_BED}.0, crestHeight(p), rise) - 0.25 * beyond
      + 22.0 * (fbm3(p / 110.0) - 0.5) * smoothstep(0.0, 50.0, beyond);
  }
  // The bake's target is half float (largest 65504): fallsDistance's "no fall" 100000 would store as
  // Inf, which filters to NaN, and the falls' glow then lit every wall (design 084: the walls read as
  // a pale orange wash, not the card's crimson cliffs). Clamped to a far distance that fits.
  gl_FragColor = vec4(h, islandSD, outerSD, min(fallsDistance(p, outerSD), ${FAR_PX}.0));
}
`;

/**
 * Bake 1, second pass: the ground. The walls are heaped with rounded rocks over broad faces, the
 * falls running in smooth channels; the island's rock is lumpy, a few long cracks wander across it
 * (some glow), and the Poké Ball is a smooth disc set in it.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uPre;
uniform vec3 uEmblem;
varying vec2 vUv;
${NOISE}
${FOOTPRINTS}
${VORONOI}
${STONES}
float basinAt(vec2 p) {
  return texture2D(uPre, (p - uMin) / uSize).r;
}
// The rock cut into flat faces: each Voronoi cell takes the basin's plane at its point, leaned a
// little at random, never far off the basin. x: height, y: the face's id, z: px to its border.
vec3 faceted(vec2 p, float h, float amount) {
  vec4 cell = voronoiCell(p / ${FACET_PX}.0 + 17.0);
  vec2 c = p + cell.zw * ${FACET_PX}.0;
  float hc = basinAt(c);
  vec2 g = vec2(basinAt(c + vec2(3.0, 0.0)) - hc, basinAt(c + vec2(0.0, 3.0)) - hc) / 3.0;
  vec2 lean = (hash22(vec2(cell.y * 71.0, 3.0)) - 0.5) * 0.4 * min(length(g), 1.5);
  float plane = clamp(hc + dot(g + lean, p - c), h - 14.0, h + 14.0);
  float inner = smoothstep(0.0, 7.0, cell.x * ${FACET_PX}.0);
  return vec3(mix(h, plane, amount * inner), cell.y, cell.x * ${FACET_PX}.0);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec4 pre = texture2D(uPre, vUv);
  float h = pre.r;
  float islandSD = pre.g;
  float outerSD = pre.b;
  float fallSD = pre.a;
  float kind = 1.0;
  float tone = 0.5;
  float joint = 0.0;
  if (islandSD < 0.0) {
    kind = -1.0;
    float inland = smoothstep(0.0, -24.0, islandSD);
    // Cooled basalt, as the art's: broad swells under a pebbly grain of small faceted lumps packed
    // together.
    // Design 080: round the cards the grain is worn low (the lumps flatter, the fine roughness gone).
    // Design 084: dark basalt lumps, bigger, their creases deeper, worn smooth under the cards.
    float calm = fieldCalm(p, 90.0);
    vec3 lump = stones(p + 5.0, mix(30.0, 56.0, fbm3(p / 150.0)), 1.2);
    h += (4.0 * (fbm3(p / 46.0) - 0.5) + 3.2 * lump.x * (1.0 - 0.9 * calm) + 0.6 * (gnoise(p / 4.0) - 0.5) * (1.0 - calm)) * inland;
    // A few long cracks wander across it in broken runs, some still glowing.
    vec2 warped = p + (vec2(fbm3(p / 80.0), fbm3(p / 80.0 + 5.3)) - 0.5) * 70.0;
    vec4 plate = voronoiCell(warped / 170.0 + 3.0);
    float seam = (1.0 - smoothstep(0.0, 0.016, plate.x)) * smoothstep(0.6, 0.7, gnoise(warped / 90.0 + 4.0));
    h -= 0.6 * seam * inland;
    tone = fract(lump.y * 5.3 + fbm3(p / 70.0) * 0.5);
    joint = 0.0;
    // The Poke Ball, as the art's relief: its two halves domed cushions of stone standing proud of
    // the rock, the band and the button's ring cut deep between them, a deep crevice round it.
    if (uEmblem.z > 0.0) {
      vec2 rel = p - uEmblem.xy;
      float r = length(rel);
      float buttonR = uEmblem.z * ${EMBLEM_BUTTON};
      float bandHalf = uEmblem.z * 0.075;
      float disc = 1.0 - smoothstep(uEmblem.z - 3.0, uEmblem.z, r);
      // Each half rises to a rounded crown between its edges: the rim, the band, the button's ring.
      float edge = min(min(uEmblem.z - r, abs(rel.y) - bandHalf), r - buttonR - 4.0);
      float cushion = sqrt(clamp(edge / 60.0, 0.0, 1.0));
      float band = (1.0 - smoothstep(bandHalf, bandHalf + 1.5, abs(rel.y))) * step(buttonR, r);
      float ring = smoothstep(buttonR - 7.0, buttonR - 5.0, r) * (1.0 - smoothstep(buttonR + 2.0, buttonR + 4.0, r));
      // Design 084: embossed, low: the light bake shades its relief, no deep crevice round it.
      h = mix(h, pre.r + 1.0 + 3.5 * cushion - 2.0 * max(band, ring), disc);
      h -= 2.0 * (1.0 - smoothstep(2.0, 6.0, abs(r - uEmblem.z - 2.5)));
    }
  } else if (outerSD > 0.0) {
    kind = 0.0;
    // The art's cliffs: chunky angular rock in big flat faces, cut apart by dark seams, a gentle
    // grain over them; the falls run down smooth channels.
    float onWall = smoothstep(4.0, 26.0, outerSD);
    vec3 rock = faceted(p, h, onWall);
    vec3 cobble = stones(p + 11.0, mix(42.0, 64.0, fbm3(p / 180.0)), 2.4);
    float channel = smoothstep(0.0, 12.0, fallSD);
    float seam = 1.0 - smoothstep(1.5, 4.5, rock.z);
    h = rock.x + (cobble.x * 5.0 + 1.2 * (gnoise(p / 3.5) - 0.5) - ${SEAM_PX}.0 * seam) * onWall * channel
      - 4.0 * (1.0 - smoothstep(-2.0, 4.0, fallSD));
    tone = fract(rock.y * 7.3);
  }
  gl_FragColor = vec4(h, tone, joint, kind);
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

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform sampler2D uPre;
uniform vec3 uEmblem;
${NOISE}
${FOOTPRINTS}
${REVEAL}
${BASIN_LAVA}
${FLOW_STREAKS}
${FALLS}
${FILTERING}
${STRATA}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;

// Glowing specks scattered over the rock (the art's sparks lying on the island): one in a share of
// the cells of this size, 0..1.
float speck(vec2 p, float cell, float share, float seed) {
  vec2 c = floor(p / cell);
  if (hash12(c + seed) > share) return 0.0;
  vec2 centre = (c + 0.2 + 0.6 * hash22(c + seed * 3.0)) * cell;
  float radius = mix(1.1, 2.6, hash12(c + seed * 7.0));
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + 2.0 * hash12(c + seed * 5.0)) + hash12(c) * 40.0);
  return (1.0 - smoothstep(radius * 0.35, radius, distance(p, centre))) * twinkle;
}

void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 pre = texture2D(uPre, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float tone = field.g;
  float onIsland = step(field.a, -0.5);
  float onWall = step(-0.5, field.a) * step(field.a, 0.5);
  float islandSD = pre.g;
  float outerSD = pre.b;
  float fallSD = pre.a;

  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float facing = dot(n, sun) * mix(0.5, 1.0, light.a);

  // The island: charcoal basalt, warmer where lumps catch the light. The walls: dark crimson rock,
  // the tops of its rounded rocks a brighter red to the light. Colours sampled from the art and
  // inverted through Neutral tone mapping, as basinLava's: island (37,26,23), (59,43,37), (85,66,55);
  // walls (52,22,16) in shade, (90,36,24) on their faces, (138,58,36) on tops turned to the light.
  // Design 082 (Brilliant Diamond / Shining Pearl, Stark Mountain): the same colours on a smooth ramp
  // (BDSP's soft light, no hard steps), the walls laid in strata.
  vec3 islandRock = mix(vec3(0.045, 0.036, 0.034), vec3(0.09, 0.068, 0.06), smoothstep(0.15, 0.65, facing));
  islandRock = mix(islandRock, vec3(0.15, 0.108, 0.09), smoothstep(0.65, 1.0, facing));
  // Design 084: each lump's own tone fades out under the cards.
  float cardCalm = fieldCalm(p, 90.0);
  islandRock *= 0.86 + 0.28 * mix(tone, 0.5, 0.85 * cardCalm);
  vec3 wallRock = mix(vec3(0.065, 0.035, 0.032), vec3(0.15, 0.055, 0.042), smoothstep(0.2, 0.62, facing));
  wallRock = mix(wallRock, vec3(0.31, 0.088, 0.058), smoothstep(0.62, 1.0, facing));
  vec2 course = strata(ground, p, 20.0);
  wallRock *= (0.85 + 0.3 * tone) * mix(0.62, 1.0, course.x) * (0.92 + 0.16 * course.y);
  // Design 083: the walls in broad warmer and darker stretches, not one crimson.
  wallRock *= 1.0 + 0.26 * (fbm3(p / 260.0 + 4.0) - 0.5);
  vec3 col = mix(wallRock, islandRock, onIsland);
  // Painted rims: convex edges (lump tops, crags) catch a warm stroke of light.
  vec2 t2 = uTexel * 2.5;
  float laplace = texture2D(uField, vUv + vec2(t2.x, 0.0)).r + texture2D(uField, vUv - vec2(t2.x, 0.0)).r
    + texture2D(uField, vUv + vec2(0.0, t2.y)).r + texture2D(uField, vUv - vec2(0.0, t2.y)).r - 4.0 * ground;
  float convex = smoothstep(0.4, 2.2, -laplace) * vGrowth;
  col = mix(col, col * 1.7 + vec3(0.028, 0.016, 0.01), convex * mix(0.55, 0.25 * (1.0 - 0.7 * cardCalm), onIsland));
  col = mix(vec3(0.026, 0.018, 0.02), col, smoothstep(0.25, 0.9, light.b));

  // The lava lights the rock: the moat the island's shore and the wall's foot, faces turned to it
  // most, fading with distance and height; each fall the rock either side of it.
  vec2 e = uTexel * 3.0;
  vec4 preR = texture2D(uPre, vUv + vec2(e.x, 0.0));
  vec4 preL = texture2D(uPre, vUv - vec2(e.x, 0.0));
  vec4 preU = texture2D(uPre, vUv + vec2(0.0, e.y));
  vec4 preD = texture2D(uPre, vUv - vec2(0.0, e.y));
  vec2 outward = vec2(preR.g - preL.g, preU.g - preD.g);
  vec2 inward = -vec2(preR.b - preL.b, preU.b - preD.b);
  vec2 toMoat = normalize(mix(inward, outward, onIsland) + vec2(0.00001));
  float turned = clamp(dot(n, normalize(vec3(toMoat, 0.3))), 0.0, 1.0);
  float fromMoat = onIsland > 0.5 ? max(-islandSD, 0.0) : max(outerSD, 0.0);
  float above = max(ground - ${LAVA_LEVEL}.0, 0.0);
  float flicker = 0.95 + 0.05 * gnoise(vec2(uTime * 0.4, p.x / 160.0 + p.y / 230.0));
  // The walls take less of it than the island: their faces lean away from the moat's middle.
  float moatGlow = exp(-fromMoat / mix(34.0, 38.0, onIsland)) * exp(-above / 70.0) * (0.25 + 0.75 * turned);
  col += mix(vec3(1.0, 0.24, 0.08), vec3(1.0, 0.35, 0.1), onIsland) * moatGlow * flicker * mix(0.55, 0.55, onIsland);
  // The island's lip catches a bright orange rim of the lava's light (design 084: a softer, broader
  // contact glow, the moat's own edges now dark crust).
  col += vec3(1.0, 0.36, 0.06) * exp(-fromMoat / 14.0) * onIsland * 0.32 * flicker;
  // Each fall lights the rock either side of it (design 084: further, so it reads from afar).
  col += vec3(1.0, 0.3, 0.12) * exp(-max(fallSD, 0.0) / 12.0) * onWall * 0.7 * flicker;
  // Design 083: thin veins of lava threading the walls, each breathing slowly on its own beat.
  float vein = (1.0 - smoothstep(0.0, 0.035, abs(fbm3(p / 95.0 + 7.0) - 0.5))) * step(0.58, gnoise(p / 150.0 + 3.0));
  col += vec3(1.0, 0.32, 0.08) * vein * onWall * smoothstep(20.0, 60.0, ground) * (0.22 + 0.14 * sin(uTime * 0.7 + p.x * 0.013 + p.y * 0.007));

  // Some of the island's cracks still glow; sparks lie on the rock out toward the moat (design 080:
  // none round the cards, where glowing dots read as speckle on the field).
  col = mix(col, basinLava(0.26 + 0.1 * flicker), field.b * 0.85);
  float specks = speck(p, 12.0, 0.1, 1.0) + speck(p, 27.0, 0.16, 2.0) * 1.5;
  col += vec3(1.7, 0.42, 0.05) * specks * mix(0.35, 0.7, onIsland) * (1.0 - cardCalm);

  // The Poke Ball set in the island. Design 084: a low-contrast embossed ring (it read as a washer
  // under the Actives): its halves the basalt a step lighter and warmer, the band, the button's ring
  // and the groove round it a step darker, a faint heat breathing in the grooves; the light bake shades
  // its low relief.
  if (uEmblem.z > 0.0 && onIsland > 0.5) {
    vec2 rel = p - uEmblem.xy;
    float r = length(rel);
    float bandHalf = uEmblem.z * 0.075;
    float buttonR = uEmblem.z * ${EMBLEM_BUTTON};
    float breathe = 0.97 + 0.03 * sin(uTime * 0.6);
    float inside = 1.0 - smoothstep(uEmblem.z - 1.5, uEmblem.z, r);
    float halves = inside * smoothstep(bandHalf, bandHalf + 1.5, abs(rel.y)) * smoothstep(buttonR + 3.0, buttonR + 5.0, r);
    float crown = clamp(min(min(uEmblem.z - r, abs(rel.y) - bandHalf), r - buttonR - 4.0) / 60.0, 0.0, 1.0);
    float buttonRing = smoothstep(buttonR - 7.0, buttonR - 4.0, r) * (1.0 - smoothstep(buttonR + 3.0, buttonR + 5.0, r));
    float groove = max(max(inside * (1.0 - halves) * step(buttonR - 4.0, r), buttonRing),
      1.0 - smoothstep(4.0, 6.5, abs(r - uEmblem.z - 3.0)));
    vec3 raised = col * vec3(1.2, 1.14, 1.1) + vec3(0.008, 0.003, 0.001) * sqrt(crown);
    col = mix(col, raised, halves);
    col = mix(col, col * 0.74, groove * 0.85);
    col += vec3(0.5, 0.07, 0.01) * 0.06 * breathe * groove;
  }

  // The falls: lava streaming down the wall, a gold core, faster streaks racing down it. Design 084:
  // the core past the bloom's threshold, so each fall blooms.
  if (fallSD < 1.5 && onWall > 0.5) {
    vec3 nearest = vec3(100000.0, 0.0, 0.0);
    for (int i = 0; i < ${MAX_FALLS}; i++) {
      if (uFalls[i].w < 0.5) continue;
      vec3 f = fallAt(p, uFalls[i], outerSD);
      if (f.x < nearest.x) nearest = f;
    }
    float streak = flowStreaks(vec2(-nearest.y, nearest.z), 70.0, 1.6, vec2(30.0, 3.0));
    float core = smoothstep(0.0, -2.5, fallSD);
    float heat = 0.6 + 0.4 * core + (streak - 0.5) * 0.3 + 0.1 * smoothstep(40.0, 0.0, outerSD);
    col = mix(col, basinLava(heat) * (1.0 + 0.6 * core), 1.0 - smoothstep(-0.6, 0.8, fallSD));
  }

  // Past the crest the rock sinks into the basin's smoky haze.
  float haze = smoothstep(${WALL_RUN_PX}.0, ${WALL_RUN_PX + 130}.0, outerSD);
  col = mix(col, vec3(0.06, 0.035, 0.045), haze * 0.6);
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.35, 1.0, smoothstep(0.0, 0.06, min(edgeUv.x, edgeUv.y)));

  col += basinLava(0.7) * revealGlow(p, 0.035);
  col += basinLava(0.7) * exitGlow(p);

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
 * The moat: molten gold flowing slowly round the island, banded with brighter flow lines, cooling to
 * orange and red toward the shores with a bright line where it laps the rock, darker skins drifting
 * in it, bubbles swelling and popping; each fall churns a hot pool where it lands, rings spreading.
 */
export const LAVA_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform sampler2D uField;
uniform sampler2D uPre;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uSun;
${NOISE}
${BASIN_LAVA}
${REVEAL}
uniform vec4 uFalls[${MAX_FALLS}];
varying vec2 vPos;

// One flow phase: x heat noise 0..1, y flow-line strength 0..1.
vec2 flowPhase(vec2 q) {
  float swirl = fbm3(q / 120.0);
  float ripple = gnoise(q / 30.0 + 4.0);
  float wave = sin((dot(q, vec2(0.7, 0.71)) + (swirl - 0.5) * 80.0 + (ripple - 0.5) * 20.0) / 8.0);
  float line = smoothstep(0.8, 0.97, wave) * smoothstep(0.35, 0.65, gnoise(q / 90.0 + 2.0));
  return vec2(swirl * 0.7 + ripple * 0.3, line);
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec2 uv = (p - uMin) / uSize;
  if (texture2D(uField, uv).r > ${LAVA_LEVEL}.0 + 1.0) discard;
  vec4 pre = texture2D(uPre, uv);
  float islandSD = pre.g;
  float outerSD = pre.b;
  float across = clamp(islandSD / max(islandSD - outerSD, 1.0), 0.0, 1.0);
  float shore = max(min(islandSD, -outerSD), 0.0);

  // The flow runs round the island along its shores.
  vec2 e = uTexel * 6.0;
  vec2 grad = vec2(texture2D(uPre, uv + vec2(e.x, 0.0)).g - texture2D(uPre, uv - vec2(e.x, 0.0)).g,
    texture2D(uPre, uv + vec2(0.0, e.y)).g - texture2D(uPre, uv - vec2(0.0, e.y)).g);
  vec2 outward = length(grad) > 0.0001 ? normalize(grad) : vec2(0.0, 1.0);
  // Design 084: slow, fastest down the middle channel.
  vec2 velocity = vec2(-outward.y, outward.x) * (3.0 + 5.0 * sin(across * 3.14159));

  float period = 5.0;
  float jitter = fbm3(p / 260.0) * 2.0;
  float phaseA = fract(uTime / period + jitter);
  float phaseB = fract(uTime / period + jitter + 0.5);
  float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
  vec2 flow = mix(flowPhase(p - velocity * phaseB * period + vec2(53.0, 29.0)), flowPhase(p - velocity * phaseA * period), weightA);

  float middle = sin(across * 3.14159);
  // Design 084: the bright slow channel only down the middle, gold flow lines in it; out from it the
  // lava cools to orange, then to a dark crust along both shores, cracked with dim red, so the moat no
  // longer glares beside the Benches and piles. (Design 080: a step cooler than the art's pale gold.)
  float channel = smoothstep(0.35, 0.95, middle);
  float heat = 0.3 + 0.5 * channel + (flow.x - 0.5) * 0.1 + flow.y * 0.16 * channel;
  float crust = 1.0 - smoothstep(8.0, 24.0, shore);
  float crack = (1.0 - smoothstep(0.0, 0.05, abs(gnoise((p - velocity * uTime * 0.3) / 22.0) - 0.5)))
    * smoothstep(2.0, 6.0, shore);
  heat = mix(heat, 0.08 + 0.22 * crack, crust);
  // Dark crust plates drifting where the flow runs cool.
  float skin = smoothstep(0.66, 0.74, fbm3((p - velocity * uTime * 0.6) / 70.0 + 9.0)) * smoothstep(20.0, 36.0, shore);
  heat -= skin * 0.2;

  // Each fall's splash where its line meets the outer shore: a hot churning pool, rings running out
  // from it.
  for (int i = 0; i < ${MAX_FALLS}; i++) {
    vec4 fall = uFalls[i];
    if (fall.w < 0.5) continue;
    vec2 dir = vec2(cos(fall.z), sin(fall.z));
    vec2 rel = p - fall.xy;
    float across = dot(rel, vec2(-dir.y, dir.x));
    if (abs(dot(rel, dir)) > 160.0) continue;
    float d = length(vec2(across, outerSD + 10.0));
    float pool = exp(-d / 24.0);
    float rings = smoothstep(0.6, 1.0, sin(d / 5.0 - uTime * 2.2)) * exp(-d / 40.0) * smoothstep(6.0, 14.0, d);
    heat += pool * 0.38 + rings * 0.2;
  }

  // Bubbles swell for most of their life, then pop as a widening ring: slowly, and few.
  vec2 cell = floor(p / 46.0);
  float bubblePeriod = 4.5 + 3.5 * hash12(cell + 3.0);
  float life = fract(uTime / bubblePeriod + hash12(cell));
  float hasBubble = step(0.8, hash12(cell + 11.0)) * smoothstep(10.0, 24.0, shore);
  vec2 centre = (cell + 0.2 + 0.6 * hash22(cell + 7.0)) * 46.0;
  float r = distance(p, centre);
  float swell = smoothstep(0.0, 0.8, life) * 6.0;
  float dome = (1.0 - smoothstep(swell - 1.2, swell, r)) * step(life, 0.82);
  float pop = smoothstep(0.82, 1.0, life);
  float ring = (1.0 - smoothstep(0.6, 1.6, abs(r - (6.0 + pop * 8.0)))) * step(0.82, life) * (1.0 - pop);
  heat += (dome * 0.25 + ring * 0.2) * hasBubble;

  vec3 col = basinLava(heat);
  col += basinLava(0.7) * revealGlow(p, 0.035);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Sparks: most rise off the moat, a share sprays up off the falls' splashes, a few drift over the
 * island. Size in table px, perspective-scaled; HDR so they read as glowing.
 */
export const EMBER_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${FOOTPRINTS}
${REVEAL}
uniform vec4 uIsland;
uniform vec4 uMoat;
uniform vec4 uFalls[${MAX_FALLS}];
attribute vec4 aSeed;
varying float vLife;
varying float vKind;
// A point on a superellipse of half size halfSize at turn (0..1) round it: near enough the moat's
// rounded outline for a spark's start.
vec2 ringPoint(float turn, vec2 halfSize) {
  float a = turn * 6.2831853;
  vec2 cs = vec2(cos(a), sin(a));
  return sign(cs) * pow(abs(cs), vec2(0.34)) * halfSize;
}
void main() {
  float period = 2.8 + aSeed.z * 3.6;
  float clock = uTime + aSeed.w * 97.0;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 jitter = hash22(aSeed.xy * 97.0 + cycle);
  vec2 band = uIsland.zw + 20.0 + uMoat.xy * (0.25 + 0.5 * jitter.y);
  vec3 start = vec3(uIsland.xy + ringPoint(fract(aSeed.x + jitter.x * 0.37), band), ${LAVA_LEVEL + 2}.0);
  vec3 drift = vec3((jitter - 0.5) * 50.0, 90.0 + 130.0 * aSeed.y);
  float kind = 0.0;
  if (aSeed.w < 0.3) {
    vec4 fall = uFalls[int(min(floor(aSeed.y * ${MAX_FALLS}.0), ${MAX_FALLS - 1}.0))];
    if (fall.w > 0.5) {
      vec2 dir = vec2(cos(fall.z), sin(fall.z));
      vec2 side = vec2(-dir.y, dir.x);
      start = vec3(fall.xy - dir * 14.0 + side * (jitter.x - 0.5) * 30.0, ${LAVA_LEVEL + 2}.0);
      drift = vec3(-dir * 40.0 * jitter.y + side * (jitter.x - 0.5) * 60.0, 70.0 + 110.0 * jitter.y);
      kind = 1.0;
    }
  }
  vec3 pos = start + drift * life;
  pos.xy += vec2(sin(life * 5.0 + aSeed.z * 20.0), cos(life * 4.0 + aSeed.x * 20.0)) * 8.0 * life;
  // Design 080: sparks keep to the moat and the falls; none drift over or beside a card.
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * (1.0 - fieldCalm(pos.xy, 50.0));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.4 + aSeed.z * 2.2) * (1.0 - life * 0.5);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.4 * shown;
  vLife = life;
  vKind = kind;
}
`;

const NO_SPOTS = { island: null, moat: null, falls: [], emblem: null };

/**
 * Magma Basin's board (stadium-environment-mesh.js BOARDS): the terrain, the moat's lava sheet and
 * the sparks; a two-pass bake (the smooth basin, then the faceted ground) and a light bake whose
 * occlusion follows the slope, so the steep walls stay lit.
 */
export function magmaBasinBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uIsland: { value: new three.Vector4() },
    uMoat: { value: new three.Vector4() },
    uFalls: { value: Array.from({ length: MAX_FALLS }, () => new three.Vector4()) },
    uEmblem: { value: new three.Vector3() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Pushed back a hair so the shores right at the lava's level win the depth test, not flicker.
    lava: make(LAVA_VERTEX, LAVA_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    embers: make(EMBER_VERTEX, EMBER_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
    bakePre: make(FULLSCREEN_VERTEX, BAKE_BASIN_FRAGMENT, bakeOptions),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment({ aoFollowsSlope: true }), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const lava = new three.Mesh(new three.BufferGeometry(), materials.lava);
  const embers = new three.Points(seeded(EMBER_COUNT), materials.embers);
  embers.renderOrder = 2;
  return {
    objects: [terrain, lava, embers],
    materials: Object.values(materials),
    bakePre: materials.bakePre,
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => basinSpots(layout) ?? NO_SPOTS,
    apply({ island, moat, falls, emblem }, bounds) {
      own.uIsland.value.set(island?.x ?? 0, island?.y ?? 0, island?.hw ?? 0, island?.hh ?? 0);
      own.uMoat.value.set(moat?.side ?? 0, moat?.end ?? 0, 0, island?.r ?? 0);
      own.uFalls.value.forEach((slot, i) => {
        const fall = falls[i];
        if (fall) slot.set(fall.x, fall.y, fall.angle, fall.fork ? 2 : 1);
        else slot.set(0, 0, 0, 0);
      });
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      replaceGeometry(
        lava,
        new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, LAVA_LEVEL)
      );
    },
  };
}
