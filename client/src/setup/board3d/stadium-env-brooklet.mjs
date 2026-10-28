// Design 077 (prototype): Brooklet Hill (customhb-212) after its card art (GRI 120, 5ban Graphics):
// a clear blue lake glittering in the sun, a waterfall pouring off terraces of olive-grey rock at the
// far left, a pale sandy beach curving along the far shore under a low dark rock bank, grassy rises
// with round trees above it, a wooden pier on the right, dark rocks under the water and big rounded
// boulders in the foreground with the water foaming round them. The art looks across the lake; the
// board looks up it from the near end, so the cards lie over the lake's sandy shallows (pale
// turquoise water, so every card keeps its edges), the beach runs along the far edge (the opponent's
// hand lies over it), the terraces and their fall stand in the far-left corner of the free table,
// the pier reaches out from the far shore on the right, the boulders stand in the near-left water.
// World scale: a card's footprint is about a rowing boat; the falls drop about three card lengths.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the shore (negative on
// land), B the shallows' depth tint 0..1, A the kind (0 lake bed, 1 beach, 2 grass, 3 rock); the
// shared light bake adds normals, occlusion and the sun's shadow. Per frame: TERRAIN paints the
// land and the lake bed; WATER one sheet at WATER_LEVEL painting the lake over its bed, the
// glitter, the foam round the boulders and under the falls; FALL the waterfall's ribbon; PROPS the
// pier (stadium-env-props); CROWNS the trees' round crowns; MIST the spray at the falls' foot.
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

export const BROOKLET_KEY = 'brooklet-hill';
/** The lake's surface, px off the cloth. */
export const WATER_LEVEL = -3;
/** The far shore lies this far past the table's far edge (the opponent's hand lies over the beach). */
export const FAR_SHORE_PX = 4;
/** Least gap between land, a rock, the pier or the falls and any card. */
export const LAND_CARD_GAP_PX = 22;
export const MAX_ROCKS = 6;
export const MAX_TREES = 14;
/** The terraces: each step's rise (px), and how far each steps back. */
export const TERRACES = Object.freeze({ rises: [26, 84], step: 60 });
const MIST_COUNT = 120;

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Brooklet Hill's layout: the far shore, the terraces (a rounded box in the far-left corner of the
 * table, clear of every card, its lip facing the lake), the falls off its edge, the pier from the
 * far shore on the right, the boulders and sunken rocks in open water, the trees on the land. Null
 * without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function brookletSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const scene = sceneBounds(layout, BROOKLET_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const gap = LAND_CARD_GAP_PX * u;
  const clear = (x, y, r) => cards.every((card) => distanceToRect(x, y, card) >= r + gap);
  const farShore = table.y + table.h + FAR_SHORE_PX * u;
  // The terraces: from the scene's left edge in to the leftmost card left of the table's middle,
  // from the far shore down to the lowest card on that side, less the gap.
  const leftCards = cards.filter((card) => card.x + card.w / 2 < table.x + table.w / 2 && card.y + card.h > table.y + table.h * 0.45);
  const innerX = Math.min(table.x + table.w * 0.3, ...leftCards.map((card) => card.x)) - gap;
  const lowY = Math.max(table.y + table.h * 0.45, ...cards.filter((card) => card.x < innerX + gap + 4).map((card) => card.y + card.h)) + gap;
  const terrace = innerX - scene.x > 120 * u ? { x0: scene.x - 40, x1: innerX, y0: lowY, y1: scene.y + scene.h + 40 } : null;
  // The falls: off the terraces' lake-facing edge, two thirds of the way down it, into the lake.
  const fall = terrace
    ? {
        x: terrace.x1 - TERRACES.step * u,
        y: terrace.y0 + (Math.min(farShore, terrace.y1) - terrace.y0) * 0.55,
        width: 48 * u,
        top: TERRACES.rises.reduce((a, b) => a + b, 0) * u * 0.95,
        // Out over the ledge to the water.
        reach: (TERRACES.step + 4) * u,
      }
    : null;
  // The pier: from the far shore on the right, toward the near end, in the widest free column.
  const pierWidth = 62 * u;
  const pierLength = 230 * u;
  let pier = null;
  for (let x = table.x + table.w * 0.92; x > table.x + table.w * 0.55 && !pier; x -= 10 * u) {
    let end = farShore - 20 * u;
    while (end > table.y + table.h * 0.45 && clear(x, end - 10 * u, pierWidth / 2 + 4)) end -= 10 * u;
    if (farShore - end >= 150 * u) pier = { x, y0: Math.max(end, farShore - pierLength), y1: farShore + 30 * u, width: pierWidth };
  }
  // Boulders in the near-left water, sunken rocks in open water: each clear of every card.
  const rocks = [];
  const tryRock = (x, y, r, h, sunk) => {
    if (rocks.length >= MAX_ROCKS || !clear(x, y, r)) return;
    if (x - r < scene.x || x + r > scene.x + scene.w || y - r < scene.y || y + r > farShore - 40 * u) return;
    if (terrace && x > terrace.x0 && x < terrace.x1 + r && y > terrace.y0 - r) return;
    if (pier && Math.abs(x - pier.x) < pier.width / 2 + r + 10 && y > pier.y0 - r) return;
    if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < rock.r + r + 30 * u)) return;
    rocks.push({ x, y, r, h, sunk });
  };
  for (let k = 0; k < 60 && rocks.filter((rock) => !rock.sunk).length < 2; k += 1) {
    tryRock(table.x + table.w * (0.03 + 0.2 * hash(k, 1, 1)), table.y + table.h * (-0.12 + 0.3 * hash(k, 1, 2)), (36 + 18 * hash(k, 1, 3)) * u, (22 + 14 * hash(k, 1, 4)) * u, false);
  }
  for (let k = 0; k < 120 && rocks.length < MAX_ROCKS; k += 1) {
    tryRock(scene.x + scene.w * hash(k, 2, 1), scene.y + scene.h * hash(k, 2, 2), (20 + 16 * hash(k, 2, 3)) * u, -8 * u, true);
  }
  // Trees: on the grass past the beach, and on the terraces' top.
  const trees = [];
  const treeStep = 120 * u;
  for (let gy = farShore + 90 * u; gy < scene.y + scene.h; gy += treeStep) {
    for (let gx = scene.x + treeStep / 2; gx < scene.x + scene.w; gx += treeStep) {
      if (trees.length >= MAX_TREES) break;
      const roll = (salt) => hash(gx, gy, salt + 30);
      const x = gx + (roll(1) - 0.5) * treeStep * 0.7;
      const y = gy + (roll(2) - 0.5) * treeStep * 0.5;
      if (roll(3) > 0.55 || y > scene.y + scene.h - 40 * u) continue;
      if (pier && Math.abs(x - pier.x) < 80 * u) continue;
      trees.push({ x, y, z: 14 * u, r: (30 + 14 * roll(4)) * u, trunk: (24 + 10 * roll(5)) * u, seed: roll(6) });
    }
  }
  if (terrace) {
    for (let k = 0; k < 4 && trees.length < MAX_TREES; k += 1) {
      const x = terrace.x0 + 60 * u + (terrace.x1 - terrace.x0 - 140 * u) * hash(k, 5, 1);
      const y = terrace.y0 + TERRACES.step * 2.6 * u + (terrace.y1 - terrace.y0 - TERRACES.step * 3 * u) * hash(k, 5, 2);
      if (y > scene.y + scene.h - 40 * u || x < scene.x + 30 * u) continue;
      trees.push({ x, y, z: fall.top, r: (30 + 12 * hash(k, 5, 3)) * u, trunk: (22 + 8 * hash(k, 5, 4)) * u, seed: hash(k, 5, 5) });
    }
  }
  return { table, scene, u, cards, farShore, terrace, fall, pier, rocks, trees };
}

const BROOKLET = /* glsl */ `
// The far shore (y), the terraces (x0, y0, x1, y1; x1 <= x0: none), the falls' foot (x, y, width,
// top height; 0 width: none), every rock (x, y, radius, height; negative height: sunk).
uniform float uFarShore;
uniform vec4 uTerrace;
uniform vec4 uFall;
uniform vec4 uRocks[${MAX_ROCKS}];
// Signed px into the terraces' footprint (positive inside), its corners rounded and edges wandering.
float terraceInside(vec2 p) {
  if (uTerrace.z <= uTerrace.x) return -100000.0;
  vec2 c = (uTerrace.xy + uTerrace.zw) * 0.5;
  vec2 halfSize = (uTerrace.zw - uTerrace.xy) * 0.5;
  vec2 q = abs(p - c) - (halfSize - 60.0);
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 60.0;
  return -box + 10.0 * (fbm3(p / 70.0) - 0.5);
}
// Signed px from the far shore (positive on land), the shore wandering.
float farLand(vec2 p) {
  return p.y - uFarShore + 12.0 * (fbm3(vec2(p.x / 200.0, 3.1)) - 0.5) - 10.0;
}
`;

/**
 * Bake: the lake bed, sandy and shallow under the cards, falling deeper toward the open water; the
 * far beach rising from the water to a low dark rock bank and the grass above; the terraces, three
 * rock steps each set back from the lake, their faces in strata; the boulders standing out of the
 * water, the sunken rocks under it.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
uniform vec4 uCardBox;
${BROOKLET}
void main() {
  vec2 p = uMin + vUv * uSize;
  // The bed: shallow over the cards' box and round it, deeper out past it.
  float fromCards = length(max(max(uCardBox.xy - p, p - uCardBox.zw), 0.0));
  float h = ${WATER_LEVEL.toFixed(1)} - 3.0 - 22.0 * smoothstep(0.0, 260.0, fromCards) - 2.0 * fbm3(p / 50.0);
  float kind = 0.0;
  float shoreDist = -farLand(p);
  // The far beach and the bank: sand from the water up a little, then the dark bank, grass above.
  float land = farLand(p);
  if (land > -30.0) {
    float beach = ${WATER_LEVEL.toFixed(1)} + 0.12 * (land + 30.0);
    float bank = smoothstep(40.0, 58.0, land + 8.0 * (gnoise(vec2(p.x / 40.0, 1.0)) - 0.5));
    float landH = beach + bank * (20.0 + 6.0 * fbm3(p / 120.0)) + smoothstep(60.0, 260.0, land) * 18.0 * fbm3(p / 260.0);
    if (landH > h) {
      h = landH;
      kind = bank > 0.5 ? (smoothstep(40.0, 70.0, land + 8.0 * gnoise(vec2(p.x / 40.0, 1.0))) > 0.98 ? 2.0 : 3.0) : 1.0;
    }
  }
  // The terraces: three steps of rock, each set back from the lake.
  float inside = terraceInside(p);
  shoreDist = min(shoreDist, -inside);
  if (inside > -20.0) {
    float steps = 0.0;
    float rises[2];
    rises[0] = ${(TERRACES.rises[0]).toFixed(1)};
    rises[1] = ${(TERRACES.rises[1]).toFixed(1)};
    float terraceH = ${WATER_LEVEL.toFixed(1)} - 2.0;
    for (int k = 0; k < 2; k++) {
      float back = float(k) * ${TERRACES.step.toFixed(1)};
      // Each face slopes over ~26 px, so it shows from above; its edge wanders, broken into blocks.
      float edgeWander = 16.0 * (fbm3(p / 55.0 + float(k) * 3.0) - 0.5) + 5.0 * (gnoise(p / 14.0) - 0.5);
      float wall = smoothstep(back - 16.0, back + 16.0, inside - edgeWander);
      terraceH += rises[k] * wall;
    }
    // Strata on the faces, chunks on the tops.
    // Strata on the faces, gentle swells on the tops.
    terraceH += 3.0 * (fbm3(p / 40.0) - 0.5) * smoothstep(0.0, 20.0, inside);
    if (terraceH > h) {
      h = terraceH;
      kind = 3.0;
      // Grass in patches on the flat tops, as on the art's terraces; the faces bare rock.
      // Grass over the top, rock showing through in patches; the faces and the ledge bare rock.
      if (inside > ${TERRACES.step.toFixed(1)} + 22.0 && fbm3(p / 80.0 + 9.0) < 0.62) kind = 2.0;
    }
  }
  // Boulders out of the water, sunken rocks under it.
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    vec2 q = (p - rock.xy) / rock.z;
    float dome = 1.0 - dot(q * vec2(1.0, 1.25), q * vec2(1.0, 1.25)) - 0.45 * (fbm3(p / 24.0 + float(i) * 5.0) - 0.5);
    if (dome <= 0.0) continue;
    float top = (rock.w > 0.0 ? ${WATER_LEVEL.toFixed(1)} - 4.0 + (rock.w + 4.0) * smoothstep(0.0, 0.6, dome) * (0.85 + 0.15 * dome) : h + 10.0 * pow(dome, 0.6));
    if (top > h) {
      h = top;
      kind = 4.0;
    }
  }
  gl_FragColor = vec4(h, shoreDist, smoothstep(0.0, 260.0, fromCards), kind);
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
const vec3 WATER = vec3(0.033, 0.289, 0.604);
const vec3 WATER_DEEP = vec3(0.022, 0.146, 0.421);
const vec3 WATER_LIGHT = vec3(0.085, 0.496, 0.756);
const vec3 SHALLOW = vec3(0.2, 0.66, 0.72);
const vec3 SAND = vec3(0.65, 0.442, 0.196);
const vec3 GRASS = vec3(0.101, 0.263, 0.101);
const vec3 GRASS_LIT = vec3(0.228, 0.442, 0.12);
const vec3 ROCK = vec3(0.196, 0.211, 0.142);
const vec3 ROCK_DARK = vec3(0.085, 0.093, 0.078);
const vec3 ROCK_LIT = vec3(0.392, 0.392, 0.228);
const vec3 BOULDER = vec3(0.181, 0.154, 0.142);
const vec3 BOULDER_LIT = vec3(0.345, 0.302, 0.263);
const vec3 FOAM = vec3(1.0, 1.04, 1.06);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.5, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float kind = field.a;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float lit = clamp(dot(n, sun) / sun.z, 0.0, 1.4) * mix(0.55, 1.0, light.a);
  // The lake bed: pale sand under the shallows.
  vec3 col = SAND * (0.8 + 0.25 * fbm3(p / 40.0));
  // The beach: pale sand, a wet band at the water.
  vec3 beach = SAND * (1.05 + 0.15 * fbm3(p / 60.0)) * mix(0.7, 1.0, smoothstep(${WATER_LEVEL.toFixed(1)}, ${(WATER_LEVEL + 3).toFixed(1)}, field.r));
  col = mix(col, beach, step(0.5, kind) * step(kind, 1.5));
  // Grass: mown-looking, two greens in broad patches.
  vec3 grass = mix(GRASS, GRASS_LIT, smoothstep(0.35, 0.75, fbm3(p / 90.0 + 2.0))) * (0.92 + 0.12 * gnoise(p / 6.0));
  col = mix(col, grass, step(1.5, kind) * step(kind, 2.5));
  // Rock: the art's olive-grey, faces in strata, edges catching the light.
  float strata = 0.85 + 0.25 * gnoise(vec2(p.x / 80.0, field.r / 5.0));
  vec3 rock = mix(ROCK_DARK * 1.6, ROCK, smoothstep(0.1, 0.7, lit)) * strata;
  rock = mix(rock, ROCK_LIT, smoothstep(0.95, 1.25, lit) * 0.7);
  col = mix(col, rock, step(2.5, kind) * step(kind, 3.5));
  // Boulders: grey-brown, rounded, lit on top.
  vec3 boulder = mix(BOULDER * 0.6, BOULDER_LIT, smoothstep(0.3, 1.1, lit)) * (0.85 + 0.25 * fbm3(p / 9.0));
  boulder = mix(boulder, boulder * 0.6, smoothstep(0.55, 0.75, gnoise(p / 5.0 + 3.0)) * 0.5);
  col = mix(col, boulder, step(3.5, kind));
  col *= (kind > 2.5 ? 1.0 : 0.65 + 0.35 * min(lit, 1.2));
  col *= mix(0.55, 1.0, smoothstep(0.3, 0.9, light.b));
  col = edgeHaze(col, vUv);
  vec3 sparkle = vec3(0.8, 0.95, 1.1);
  col += sparkle * revealGlow(p, 0.035) * 0.6;
  col += sparkle * exitGlow(p) * 0.6;
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

/**
 * The lake over its bed: pale turquoise over the sandy shallows under the cards, the art's clear blue
 * out past them, deeper blue far out; the art's glitter, short bright wavelets and star glints
 * moving with the breeze; a white ring of foam round each boulder, the falls' foam spreading at its
 * foot; the dark shapes of the sunken rocks.
 */
export const WATER_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${BROOKLET}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = vPos;
  vec4 field = texture2D(uField, vUv);
  float depth = ${WATER_LEVEL.toFixed(1)} - field.r;
  if (depth < -0.2 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  float t = uTime;
  float open = field.b;
  vec3 col = mix(SHALLOW, WATER_LIGHT, smoothstep(0.0, 0.35, open));
  col = mix(col, WATER, smoothstep(0.3, 0.7, open));
  col = mix(col, WATER_DEEP, smoothstep(0.75, 1.0, open) * 0.6);
  // The bed shows through the shallowest water at the shore.
  vec3 bed = SAND * (0.85 + 0.2 * fbm3(p / 40.0));
  col = mix(bed, col, smoothstep(0.0, 3.5, depth));
  // A sunken rock: a dark shape under the water.
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0 || rock.w > 0.0) continue;
    float d = distance(p, rock.xy) / rock.z;
    col = mix(col, WATER_DEEP * 0.55, (1.0 - smoothstep(0.6, 1.05, d + 0.15 * (fbm3(p / 16.0) - 0.5))) * 0.75);
  }
  // Ripples: soft bands of light and shade drifting with the breeze.
  vec2 breeze = vec2(t * 7.0, t * 3.0);
  float swell = fbm3((p - breeze) / vec2(90.0, 40.0));
  col *= 0.9 + 0.2 * swell;
  // Glitter: short bright wavelets, crescents lying across the breeze, coming and going.
  float turn = 0.35 * (fbm3(p / 400.0) - 0.5);
  vec2 qp = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * (p - breeze * 1.4);
  vec2 q = qp / vec2(22.0, 9.0);
  vec4 cell = voronoiCell(q);
  float life = 0.5 + 0.5 * sin(t * (1.5 + 2.0 * cell.y) + cell.y * 40.0);
  float wavelet = (1.0 - smoothstep(0.12, 0.3, length(cell.zw * vec2(0.6, 1.6)))) * step(0.55, fract(cell.y * 7.0));
  col = mix(col, vec3(0.9, 1.0, 1.05), wavelet * life * mix(0.45, 0.8, open));
  // Star glints: a few points flaring.
  vec4 star = voronoiCell((p - breeze) / 38.0 + 7.0);
  float flare = pow(max(0.0, sin(t * 2.2 + star.y * 50.0)), 12.0) * step(0.8, fract(star.y * 13.0));
  float cross = max(exp(-pow(star.z * 38.0, 2.0) / 2.0) * exp(-pow(star.w * 38.0 / 9.0, 2.0)), exp(-pow(star.w * 38.0, 2.0) / 2.0) * exp(-pow(star.z * 38.0 / 9.0, 2.0)));
  col += vec3(1.0) * cross * flare * 0.9;
  // Foam round the boulders, and spreading at the falls' foot.
  float foam = 0.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0 || rock.w < 0.0) continue;
    float d = distance(p, rock.xy) / rock.z;
    float ring = (1.0 - smoothstep(1.0, 1.35 + 0.1 * sin(t * 1.3 + float(i)), d)) * smoothstep(0.8, 1.0, d);
    foam = max(foam, ring * smoothstep(0.35, 0.6, fbm3(p / 9.0 + t * 0.3)));
  }
  if (uFall.z > 0.0) {
    vec2 fromFoot = (p - uFall.xy + vec2(uFall.z * 0.2, 0.0)) / vec2(uFall.z * 1.1, uFall.z * 1.5);
    float pool = exp(-dot(fromFoot, fromFoot) * 1.4);
    foam = max(foam, pool * smoothstep(0.3, 0.6, fbm3((p - vec2(t * 10.0, 0.0)) / 11.0) + 0.3 * pool));
  }
  col = mix(col, FOAM, clamp(foam, 0.0, 1.0));
  col = edgeHaze(col, vUv);
  vec3 sparkle = vec3(0.8, 0.95, 1.1);
  col += sparkle * revealGlow(p, 0.035) * 0.6;
  col += sparkle * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The falls: a ribbon from the terraces' lip, arcing out and down into the lake. */
export function fallGeometry(three, fall, u) {
  const positions = [];
  const along = [];
  const index = [];
  const rows = 16;
  const columns = 6;
  for (let i = 0; i <= rows; i += 1) {
    const s = i / rows;
    // Out from the lip in an arc, falling.
    const out = fall.reach * (0.55 * Math.sin(s * Math.PI * 0.5) + 0.45 * s);
    const z = fall.top - (fall.top - WATER_LEVEL) * s * s * 0.15 - (fall.top - WATER_LEVEL) * 0.85 * Math.pow(s, 1.4);
    for (let k = 0; k <= columns; k += 1) {
      const across = (k / columns - 0.5) * fall.width * (1 + 0.3 * s);
      positions.push(fall.x - 4 * u + out, fall.y + across, z);
      along.push(s, k / columns);
    }
  }
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < columns; k += 1) {
      const a = i * (columns + 1) + k;
      index.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new three.Float32BufferAttribute(along, 2));
  geometry.setIndex(index);
  return geometry;
}

export const FALL_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec2 aAlong;
varying vec2 vAlong;
varying vec3 vWorld;
void main() {
  vAlong = aAlong;
  vWorld = position;
  float growth = terrainGrowth(position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, position.z * growth, 1.0);
}
`;

/** White water streaming down: streaks moving with the fall, paler toward its foot, cyan between. */
export const FALL_FRAGMENT = /* glsl */ `
uniform float uTime;
${TABLE_UNIFORMS}
${NOISE}
${REVEAL}
varying vec2 vAlong;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  float s = vAlong.x;
  float across = vAlong.y;
  float edge = smoothstep(0.0, 0.12, across) * smoothstep(1.0, 0.88, across);
  float streak = gnoise(vec2(across * 9.0, s * 3.0 - uTime * 2.2));
  vec3 col = mix(vec3(0.3, 0.75, 0.85), vec3(1.0, 1.04, 1.06), smoothstep(0.4, 0.7, streak) * 0.8 + 0.2 + 0.5 * s);
  if (edge < 0.3 + 0.4 * gnoise(vec2(across * 20.0, s * 8.0 - uTime))) discard;
  gl_FragColor = vec4(min(col, vec3(1.1)), 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how glossy).
const WOOD = [0.42, 0.39, 0.36, 0.05];
const WOOD_DARK = [0.2, 0.19, 0.18, 0.05];
const TRUNK = [0.28, 0.2, 0.13, 0];

/** The pier: grey planks across two stringers on posts standing in the lake; the trees' trunks. */
export function brookletProps({ pier, trees, u }) {
  const props = createPropBuilder();
  if (pier) {
    const deck = 4 * u;
    const length = pier.y1 - pier.y0;
    const planks = Math.round(length / (13 * u));
    for (let k = 0; k < planks; k += 1) {
      const y = pier.y0 + ((k + 0.5) * length) / planks;
      const tone = 0.9 + 0.2 * hash(k, pier.x, 1);
      props.box({ x: pier.x + (hash(k, 2, 3) - 0.5) * 2 * u, y, z0: deck - 2.2 * u, z1: deck, hw: pier.width / 2, hh: 5.6 * u, color: WOOD.map((c, i) => (i < 3 ? c * tone : c)) });
    }
    for (const side of [-1, 1]) {
      props.box({ x: pier.x + side * pier.width * 0.32, y: (pier.y0 + pier.y1) / 2, z0: deck - 6 * u, z1: deck - 2.2 * u, hw: 2.4 * u, hh: length / 2, color: WOOD_DARK });
      for (let k = 0; k <= Math.floor(length / (60 * u)); k += 1) {
        const y = pier.y0 + 6 * u + k * 60 * u;
        props.cylinder({ x: pier.x + side * pier.width * 0.42, y, z0: WATER_LEVEL - 12, z1: deck + 3 * u, r: 3.4 * u, color: WOOD_DARK, sides: 8 });
      }
    }
  }
  for (const tree of trees) props.cylinder({ x: tree.x, y: tree.y, z0: tree.z - 4, z1: tree.z + tree.trunk + tree.r * 0.4, r: tree.r * 0.16, color: TRUNK, sides: 10 });
  return props;
}

/** Every tree's crown as clumps of an instanced sphere. */
export function crownGeometry(three, trees) {
  const rings = 9;
  const around = 14;
  const positions = [];
  const index = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = -Math.PI / 2 + (Math.PI * ring) / rings;
    for (let k = 0; k < around; k += 1) {
      const longitude = (k / around) * 2 * Math.PI;
      positions.push(Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let k = 0; k < around; k += 1) {
      const a0 = ring * around + k;
      const a1 = ring * around + ((k + 1) % around);
      index.push(a0, a1, a0 + around, a1, a1 + around, a0 + around);
    }
  }
  const clumps = [];
  for (const tree of trees) {
    const top = tree.z + tree.trunk + tree.r * 0.75;
    clumps.push([tree.x, tree.y, top, tree.r, tree.seed]);
    for (let k = 0; k < 4; k += 1) {
      const angle = (k / 4) * 2 * Math.PI + tree.seed * 6;
      clumps.push([tree.x + Math.cos(angle) * tree.r * 0.55, tree.y + Math.sin(angle) * tree.r * 0.55, top - tree.r * 0.3, tree.r * 0.62, tree.seed + k * 0.17]);
    }
  }
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aClump', new three.InstancedBufferAttribute(Float32Array.from(clumps.flatMap((c) => c.slice(0, 4))), 4));
  geometry.setAttribute('aSeed', new three.InstancedBufferAttribute(Float32Array.from(clumps.map((c) => c[4] % 1)), 1));
  geometry.instanceCount = clumps.length;
  return geometry;
}

export const CROWN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aClump;
attribute float aSeed;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying float vSeed;
void main() {
  vec3 dir = position;
  float lumps = sin(dir.x * 4.1 + aSeed * 20.0) * sin(dir.y * 3.7 + aSeed * 11.0) * sin(dir.z * 3.3 + 1.0);
  vec3 local = dir * aClump.w * (1.0 + 0.1 * lumps);
  local.z *= 0.85;
  float growth = terrainGrowth(aClump.xy);
  vec3 pos = vec3(aClump.xy + local.xy, (aClump.z + local.z) * growth);
  vNormal = normalize(dir * vec3(1.0, 1.0, 1.0 / 0.85));
  vPos = pos;
  vSphere = dir;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const CROWN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying float vSeed;
void main() {
  if (revealBurned(vPos.xy) * exitKeep(vPos.xy) < 0.5) discard;
  vec3 n = normalize(vNormal);
  vec4 cluster = voronoiCell(vSphere.xy / (1.3 + vSphere.z) * 2.6 + vSeed * 17.0);
  float inCluster = 1.0 - smoothstep(0.45, 0.62, length(cluster.zw));
  vec3 bulged = normalize(n - vec3(cluster.zw, 0.0) * 0.55 * inCluster);
  float lit = max(dot(bulged, normalize(uSun)), 0.0);
  vec3 col = mix(vec3(0.03, 0.12, 0.05), vec3(0.071, 0.302, 0.101), smoothstep(0.05, 0.4, lit));
  col = mix(col, vec3(0.196, 0.496, 0.142), smoothstep(0.6, 0.85, lit));
  col *= mix(0.7, 1.0, inCluster);
  vec3 toEye = normalize(uEye - vPos);
  col = mix(col, col * 0.55, smoothstep(0.72, 0.92, 1.0 - abs(dot(n, toEye))));
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  return albedo * (vec3(0.45, 0.5, 0.58) * (0.7 + 0.3 * n.z) + vec3(1.0, 0.96, 0.88) * max(dot(n, sun), 0.0));
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(0.8, 0.95, 1.1)' });

/** Spray drifting up off the falls' foot. */
export const MIST_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
uniform vec4 uFall;
${NOISE}
${REVEAL}
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 2.2 + aSeed.w * 2.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  vec2 start = uFall.xy + vec2(uFall.z * (0.4 * aSeed.x - 0.3), uFall.z * (aSeed.y - 0.5) * 1.4);
  vec3 pos = vec3(start + vec2(-life * 10.0 * aSeed.x, (aSeed.y - 0.5) * life * 20.0), ${WATER_LEVEL.toFixed(1)} + life * (26.0 + 30.0 * aSeed.w));
  float shown = step(0.001, uFall.z) * revealBurned(start) * exitKeep(start);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max((2.0 + 3.0 * aSeed.z) * uFocal / -mv.z, 1.5) * 2.0 * shown;
  vLife = life;
}
`;

export const MIST_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float puff = exp(-d * d * 3.0) * (1.0 - smoothstep(0.6, 1.0, vLife)) * smoothstep(0.0, 0.15, vLife);
  gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * puff * 0.5, 1.0);
${OUTPUT}
}
`;

/** Brooklet Hill's board (stadium-environment-mesh.js BOARDS). */
export function brookletHillBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uFarShore: { value: 0 },
    uTerrace: { value: new three.Vector4() },
    uFall: { value: new three.Vector4() },
    uRocks: { value: Array.from({ length: MAX_ROCKS }, () => new three.Vector4()) },
    uCardBox: { value: new three.Vector4() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Pushed back a hair so the shore right at the water's level wins the depth test, not flickers.
    water: make(WATER_VERTEX, WATER_FRAGMENT, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    fall: make(FALL_VERTEX, FALL_FRAGMENT, { side: three.DoubleSide }),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    crowns: make(CROWN_VERTEX, CROWN_FRAGMENT),
    mist: make(MIST_VERTEX, MIST_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment({ aoFollowsSlope: true }), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const water = new three.Mesh(new three.BufferGeometry(), materials.water);
  const fall = new three.Mesh(new three.BufferGeometry(), materials.fall);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const crowns = new three.Mesh(new three.BufferGeometry(), materials.crowns);
  const mist = new three.Points(seeded(MIST_COUNT), materials.mist);
  mist.renderOrder = 2;
  return {
    objects: [terrain, water, fall, props, crowns, mist],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => brookletSpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uFarShore.value = spots?.farShore ?? 1e5;
      const terrace = spots?.terrace;
      own.uTerrace.value.set(terrace?.x0 ?? 0, terrace?.y0 ?? 0, terrace?.x1 ?? 0, terrace?.y1 ?? 0);
      const f = spots?.fall;
      own.uFall.value.set((f?.x ?? 0) + (f?.reach ?? 0), f?.y ?? 0, f?.width ?? 0, f?.top ?? 0);
      own.uRocks.value.forEach((slot, i) => {
        const rock = spots?.rocks[i];
        return rock ? slot.set(rock.x, rock.y, rock.r, rock.h) : slot.set(0, 0, 0, 0);
      });
      const cards = spots?.cards ?? [];
      const x0 = Math.min(...cards.map((c) => c.x), 0);
      const y0 = Math.min(...cards.map((c) => c.y), 0);
      own.uCardBox.value.set(x0, y0, Math.max(...cards.map((c) => c.x + c.w), 0), Math.max(...cards.map((c) => c.y + c.h), 0));
      replaceGeometry(terrain, terrainGrid(bounds));
      replaceGeometry(water, new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0));
      fall.visible = Boolean(f);
      if (f) replaceGeometry(fall, fallGeometry(three, f, u));
      props.visible = Boolean(spots);
      crowns.visible = Boolean(spots?.trees.length);
      if (!spots) return;
      replaceGeometry(props, brookletProps(spots).build(three));
      if (spots.trees.length) replaceGeometry(crowns, crownGeometry(three, spots.trees));
    },
  };
}
