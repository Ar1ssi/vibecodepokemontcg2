// Design 077 (prototype): Dimension Valley (customhb-199) after its card art (PHF 93, Ryo Ueda):
// grass-topped slabs of earth floating in a void that runs from a rainbow (red, orange, yellow,
// green) on the left to deep violet on the right, streams of white sparkle pouring through it,
// glowing coloured discs lying on the grass, the pink Psychic mark painted on the biggest slab, bare
// little trees on the smaller ones. The art looks across the slabs; the board looks down on them, so
// every card lies on one great floating island (its grass, its earth cliffs falling away and tapering
// into the void, lit from below in the void's colours), smaller islands bob in the margins round it
// (lower toward the near end, where a raised one would lean over the player's cards in the tilted
// view), and the void lies far below.
// World scale: a card's footprint is about a doormat on the grass; the small islands are cottage sized.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the island's edge (negative
// on it), B a tone 0..1, A unused; the shared light bake adds normals and occlusion. Per frame:
// TERRAIN paints the island's grass, the painted mark and the edge's lip (and nothing past the edge,
// where the void shows); ROCK draws the island's cliffs, every small island and the bare tree, bobbing;
// DISCS the glowing coloured discs; VOID the rainbow void far below; SPARKLES the white sparkle.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  POKE_BALL,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { craterEmblem, environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { createPropBuilder } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const VALLEY_KEY = 'dimension-valley';
/** The island runs this far past the cards' box, its corners this round, its edge wandering this much. */
export const ISLAND = Object.freeze({ margin: 64, corner: 110, wander: 30 });
/** How deep the void lies under the island, px. */
export const VOID_DEPTH = 380;
export const MAX_DISCS = 44;
export const MAX_ISLANDS = 10;
/** Least gap between any small island, seen from above, and a card or the opponent's hand. */
export const ISLAND_CARD_GAP_PX = 16;
/** The art's disc colours, sRGB. */
export const DISC_HUES = Object.freeze([
  [236, 52, 52],
  [246, 222, 70],
  [78, 206, 96],
  [238, 120, 196],
  [76, 118, 232],
]);
const SPARKLE_COUNT = 320;

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

/** The island edge's wander at (x, y), -1..1 (the shader's `wander`). */
export const edgeWander = (x, y) =>
  0.55 * Math.sin(x * 0.013 + 1.1) * Math.sin(y * 0.017 + 0.3) + 0.3 * Math.sin((x + y) * 0.029 + 2.0) + 0.15 * Math.sin(x * 0.051 - y * 0.043);

/** Signed px from the island's edge at (x, y), negative on it (the shader's `islandDistance`). */
export function islandDistance(island, x, y) {
  const qx = Math.abs(x - island.x) - (island.hw - island.corner);
  const qy = Math.abs(y - island.y) - (island.hh - island.corner);
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - island.corner;
  return box - island.wander * edgeWander(x, y);
}

/** The opponent's hand where the board fans it, past the far edge: the cards' width either side of the middle. */
const oppHandRect = (layout, core) => {
  const hand = layout.opp?.hand;
  const cardH = layout.opp?.cardBox?.hand?.h ?? 0;
  if (!hand || !(cardH > 0) || !Number.isFinite(hand.baselineY)) return null;
  const halfW = Math.max(Math.abs(core.x), Math.abs(core.x + core.w));
  return { x: -halfW, y: hand.baselineY - cardH, w: 2 * halfW, h: cardH };
};

/**
 * Dimension Valley's layout: the great island round every card, its edge's outline, the painted mark
 * between the Actives, the glowing discs on it, and the small islands round it (one with the bare
 * tree). Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function valleySpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const core = union(cards);
  const scene = sceneBounds(layout, VALLEY_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const hand = oppHandRect(layout, core);
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const margin = ISLAND.margin * u;
  const island = {
    x: core.x + core.w / 2,
    y: core.y + core.h / 2,
    hw: core.w / 2 + margin,
    hh: core.h / 2 + margin,
    corner: ISLAND.corner * u,
    wander: ISLAND.wander * u,
  };
  // The edge's outline: out from the island's middle to its edge, every turn of the circle.
  const outline = [];
  for (let k = 0; k < 240; k += 1) {
    const angle = (k / 240) * 2 * Math.PI;
    let low = 0;
    let high = Math.hypot(island.hw, island.hh) + island.wander * 2;
    for (let step = 0; step < 30; step += 1) {
      const mid = (low + high) / 2;
      if (islandDistance(island, island.x + Math.cos(angle) * mid, island.y + Math.sin(angle) * mid) < 0) low = mid;
      else high = mid;
    }
    outline.push([island.x + Math.cos(angle) * low, island.y + Math.sin(angle) * low]);
  }
  const emblem = craterEmblem(layout, centre);
  const obstacles = [...cards, ...(hand ? [hand] : [])];
  const clear = (x, y, r) => obstacles.every((rect) => distanceToRect(x, y, rect) >= r + ISLAND_CARD_GAP_PX);

  // Discs on the island's grass between the cards and its edge.
  const discs = [];
  const discStep = 46 * u;
  for (let gy = island.y - island.hh; gy < island.y + island.hh; gy += discStep) {
    for (let gx = island.x - island.hw; gx < island.x + island.hw; gx += discStep) {
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * discStep * 0.8;
      const y = gy + (roll(2) - 0.5) * discStep * 0.8;
      const r = (10 + 9 * roll(3)) * u;
      const sd = islandDistance(island, x, y);
      if (sd > -14 * u || roll(4) > 0.5) continue;
      if (cards.some((card) => distanceToRect(x, y, card) < r + 8 * u)) continue;
      // The ground round the Actives stays calm: no disc inside the painted mark.
      if (emblem && Math.hypot(x - emblem.x, y - emblem.y) < emblem.r + 24 * u) continue;
      if (discs.length < MAX_DISCS) discs.push({ x, y, z: 1, r, hue: Math.floor(roll(5) * DISC_HUES.length), bob: 0, phase: 0 });
    }
  }
  // Small islands round it, out in the margins.
  const islands = [];
  const step = 200 * u;
  for (let gy = scene.y + step / 2; gy < scene.y + scene.h; gy += step) {
    for (let gx = scene.x + step / 2; gx < scene.x + scene.w; gx += step) {
      if (islands.length >= MAX_ISLANDS) break;
      const roll = (salt) => hash(gx, gy, salt + 40);
      const x = gx + (roll(1) - 0.5) * step * 0.6;
      const y = gy + (roll(2) - 0.5) * step * 0.6;
      const r = (46 + 60 * roll(3)) * u;
      if (roll(4) > 0.72 || islandDistance(island, x, y) < r + 60 * u) continue;
      if (x - r < scene.x || x + r > scene.x + scene.w || y - r < scene.y || y + r > scene.y + scene.h) continue;
      if (islands.some((other) => Math.hypot(x - other.x, y - other.y) < r + other.r + 30 * u)) continue;
      const zone = y > core.y + core.h ? 'far' : y < core.y ? 'near' : 'side';
      const z = (zone === 'far' ? 20 + 50 * roll(5) : zone === 'side' ? -45 + 55 * roll(5) : -130 + 50 * roll(5)) * u;
      if (!clear(x, y, r + Math.max(z, 0) * 0.4)) continue;
      // Each slab tipped a little its own way, as the art's: its cliffs show from above.
      islands.push({ x, y, z, r, depth: r * (1.5 + 0.8 * roll(6)), phase: roll(7) * 6.28, bob: (4 + 4 * roll(8)) * u, seed: roll(9), zone, tilt: 0.08 + 0.14 * roll(10) });
    }
  }
  // The bare tree on the island furthest off the far end; discs on the others' grass.
  const treeIsland = islands.filter((each) => each.zone === 'far').sort((a, b) => b.y - a.y)[0] ?? null;
  const tree = treeIsland ? { x: treeIsland.x + treeIsland.r * 0.25, y: treeIsland.y, z: treeIsland.z, h: 95 * u, phase: treeIsland.phase, bob: treeIsland.bob } : null;
  for (const each of islands) {
    const count = 1 + Math.floor(each.seed * 3);
    for (let k = 0; k < count && discs.length < MAX_DISCS; k += 1) {
      const angle = hash(each.x, k, 3) * 6.28;
      const out = each.r * 0.5 * hash(each.y, k, 4);
      discs.push({ x: each.x + Math.cos(angle) * out, y: each.y + Math.sin(angle) * out, z: each.z + 1, r: (8 + 6 * hash(each.x, k, 5)) * u, hue: Math.floor(hash(each.y, k, 6) * DISC_HUES.length), bob: each.bob, phase: each.phase });
    }
  }
  return { table, scene, core, u, hand, centre, island, outline, emblem, discs, islands, tree };
}

const VALLEY = /* glsl */ `
// The island (middle x, y, half width, half height) and its corners' radius, its edge's wander.
uniform vec4 uIsland;
uniform vec2 uIslandShape;
uniform vec3 uEmblem;
uniform vec4 uScene;
float wander(vec2 p) {
  return 0.55 * sin(p.x * 0.013 + 1.1) * sin(p.y * 0.017 + 0.3) + 0.3 * sin((p.x + p.y) * 0.029 + 2.0) + 0.15 * sin(p.x * 0.051 - p.y * 0.043);
}
float islandDistance(vec2 p) {
  vec2 q = abs(p - uIsland.xy) - (uIsland.zw - uIslandShape.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uIslandShape.x - uIslandShape.y * wander(p);
}
// The void's colour across the scene: a rainbow on the left (red, orange, yellow, green), deep
// violet on the right, its bands swirling slowly.
vec3 voidColour(vec2 p, float t) {
  float across = clamp((p.x - uScene.x) / uScene.z, -0.2, 1.2);
  across += 0.08 * sin(p.y * 0.006 + t * 0.15) + 0.06 * (gnoise(p / 260.0 + t * 0.03) - 0.5);
  vec3 red = vec3(0.83, 0.06, 0.06);
  vec3 orange = vec3(1.0, 0.32, 0.02);
  vec3 yellow = vec3(1.0, 0.86, 0.05);
  vec3 green = vec3(0.1, 0.62, 0.14);
  vec3 pink = vec3(0.9, 0.23, 0.57);
  vec3 blue = vec3(0.09, 0.14, 0.62);
  vec3 violet = vec3(0.14, 0.06, 0.34);
  vec3 deep = vec3(0.05, 0.03, 0.11);
  vec3 col = mix(red, orange, smoothstep(0.0, 0.12, across));
  col = mix(col, yellow, smoothstep(0.12, 0.24, across));
  col = mix(col, green, smoothstep(0.24, 0.38, across));
  col = mix(col, pink, smoothstep(0.36, 0.48, across));
  col = mix(col, blue, smoothstep(0.5, 0.62, across));
  col = mix(col, violet, smoothstep(0.62, 0.78, across));
  return mix(col, deep, smoothstep(0.75, 1.05, across));
}
`;

/** Bake: the island's grass in soft clumps, rising a little to a lip round its edge. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VALLEY}
void main() {
  vec2 p = uMin + vUv * uSize;
  float sd = islandDistance(p);
  float h = 1.6 * fbm3(p / 50.0) + 2.0 * smoothstep(-26.0, -4.0, sd) * smoothstep(2.0, -4.0, sd);
  gl_FragColor = vec4(h, sd, fbm3(p / 120.0 + 3.0), 0.0);
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * growth, 1.0);
}
`;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 GRASS = vec3(0.154, 0.416, 0.078);
const vec3 GRASS_LIT = vec3(0.345, 0.65, 0.12);
const vec3 GRASS_DARK = vec3(0.063, 0.193, 0.058);
const vec3 EARTH = vec3(0.245, 0.142, 0.085);
const vec3 EARTH_DARK = vec3(0.096, 0.067, 0.052);
const vec3 MARK = vec3(0.9, 0.232, 0.572);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${POKE_BALL}
${PALETTE}
${VALLEY}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  vec4 field = texture2D(uField, vUv);
  // Past the island's edge there is only the void below.
  if (field.g > 0.0 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 light = texture2D(uLight, vUv);
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  float lit = clamp(dot(n, normalize(uSun)), 0.0, 1.0);

  // The grass: soft clumps, lighter where they catch the sun, short blades brushed in streaks.
  vec3 col = mix(GRASS_DARK, GRASS, 0.5 + 0.5 * field.b);
  float blades = gnoise(vec2(p.x * 0.35 + 3.0 * fbm3(p / 40.0), p.y * 0.08));
  col = mix(col, GRASS_LIT, smoothstep(0.55, 0.85, blades) * 0.45);
  col *= 0.65 + 0.45 * lit;
  col *= mix(0.6, 1.0, smoothstep(0.3, 0.9, light.b));
  // Toward the edge the grass thins over the earth, then its lip catches the light where it turns
  // over the cliff.
  col = mix(col, col * 0.7, smoothstep(-34.0, -10.0, field.g));
  col = mix(col, GRASS_LIT * 1.05, smoothstep(-6.0, -1.0, field.g) * 0.6);
  // The art's mark: a faded pink Poke Ball painted on the grass round the Actives.
  float mark = 1.0 - smoothstep(4.0, 7.0, emblemDistance(p, uEmblem));
  col = mix(col, MARK * (0.9 + 0.25 * fbm3(p / 18.0)), mark * 0.85 * (0.8 + 0.2 * gnoise(p / 30.0)));

  vec3 shimmer = vec3(1.0, 0.75, 1.0);
  col += shimmer * revealGlow(p, 0.035) * 0.6;
  col += shimmer * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * The island's cliffs and every small island: earth faces in rings down from the grass's lip,
 * tapering in and breaking up as they go, as the art's floating slabs; per vertex position, normal,
 * aColor (rgb, w how much grass it is) and aBob (phase, height of its bob).
 */
export function rockGeometry(three, { outline, island, islands, tree, u }) {
  const positions = [];
  const normals = [];
  const colors = [];
  const bobs = [];
  const index = [];
  const earth = [0.5, 0.36, 0.24];
  const dark = [0.26, 0.19, 0.14];
  const grass = [0.36, 0.62, 0.2];
  /**
   * Rings of points down from a top loop, each inset toward `middle` and jagged: by a share of the
   * way to it, or (`reachPx`) by px, so a great island's cliffs fall sheer before they taper.
   */
  const skirt = (loop, middle, top, depth, bob, seed, reachPx = 0) => {
    const levels = [0, 0.05, 0.16, 0.32, 0.52, 0.74, 1];
    const insets = reachPx ? [0, 0.004, 0.015, 0.05, 0.2, 0.5, 1] : [0, 0.02, 0.1, 0.26, 0.46, 0.68, 0.86];
    const first = positions.length / 3;
    levels.forEach((level, i) => {
      loop.forEach(([x, y], k) => {
        const jag = i === 0 ? 0 : (hash(Math.floor(k / 4) * 1.3 + seed, i, 7) - 0.5) * 0.12;
        const toMiddle = Math.hypot(middle[0] - x, middle[1] - y) || 1;
        const inset = reachPx ? Math.min(0.95, ((insets[i] + jag * 0.3) * reachPx) / toMiddle) : Math.min(0.95, insets[i] + jag);
        const px = x + (middle[0] - x) * inset;
        const py = y + (middle[1] - y) * inset;
        const pz = top - depth * level * (0.9 + 0.2 * hash(k + seed, i, 8));
        positions.push(px, py, pz);
        const shade = i === 0 ? grass : i === 1 ? grass.map((c, axis) => (c + earth[axis]) / 2) : earth.map((c, axis) => c + (dark[axis] - c) * level);
        const strata = i > 1 && (k + i) % 3 === 0 ? 0.88 : 1;
        colors.push(shade[0] * strata, shade[1] * strata, shade[2] * strata, i === 0 ? 1 : 0);
        bobs.push(...bob);
        normals.push(0, 0, 1);
      });
    });
    const around = loop.length;
    for (let i = 0; i < levels.length - 1; i += 1) {
      for (let k = 0; k < around; k += 1) {
        const a = first + i * around + k;
        const b = first + i * around + ((k + 1) % around);
        index.push(a, a + around, b, b, a + around, b + around);
      }
    }
    // Normals from the faces round each vertex.
    const count = levels.length * around;
    const n = new Float32Array(count * 3);
    for (let i = 0; i < levels.length - 1; i += 1) {
      for (let k = 0; k < around; k += 1) {
        const ids = [i * around + k, (i + 1) * around + k, i * around + ((k + 1) % around)];
        const [a, b, c] = ids.map((id) => [0, 1, 2].map((axis) => positions[(first + id) * 3 + axis]));
        const e1 = b.map((v, axis) => v - a[axis]);
        const e2 = c.map((v, axis) => v - a[axis]);
        const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        for (const id of [...ids, (i + 1) * around + ((k + 1) % around)]) for (let axis = 0; axis < 3; axis += 1) n[id * 3 + axis] += face[axis];
      }
    }
    for (let id = 0; id < count; id += 1) {
      const length = Math.hypot(n[id * 3], n[id * 3 + 1], n[id * 3 + 2]) || 1;
      for (let axis = 0; axis < 3; axis += 1) normals[(first + id) * 3 + axis] = n[id * 3 + axis] / length;
    }
  };
  /** A small island's grass top: a fan over its loop. */
  const cap = (loop, middle, top, bob) => {
    const first = positions.length / 3;
    positions.push(middle[0], middle[1], top + 3);
    normals.push(0, 0, 1);
    colors.push(...grass, 1);
    bobs.push(...bob);
    for (const [x, y] of loop) {
      positions.push(x, y, top);
      normals.push(0, 0, 1);
      colors.push(...grass.map((c) => c * 0.72), 1);
      bobs.push(...bob);
    }
    for (let k = 0; k < loop.length; k += 1) index.push(first, first + 1 + k, first + 1 + ((k + 1) % loop.length));
  };
  // From the grass's lip (the bake raises it ~2.5 px) down into the void.
  /** Tips vertices from..to about a level axis at `turn` through `pivot` by `angle` rad, normals too. */
  const tilt = (from, to, pivot, angle, turn) => {
    const axis = [Math.cos(turn), Math.sin(turn), 0];
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const rotate = (v) => {
      const dot = axis[0] * v[0] + axis[1] * v[1];
      const cross = [axis[1] * v[2], -axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
      return [0, 1, 2].map((k) => v[k] * c + cross[k] * sn + axis[k] * dot * (1 - c));
    };
    for (let id = from; id < to; id += 1) {
      const p = [0, 1, 2].map((k) => positions[id * 3 + k] - pivot[k]);
      const q = rotate(p);
      for (let k = 0; k < 3; k += 1) positions[id * 3 + k] = q[k] + pivot[k];
      const n = rotate([0, 1, 2].map((k) => normals[id * 3 + k]));
      for (let k = 0; k < 3; k += 1) normals[id * 3 + k] = n[k];
    }
  };
  skirt(outline, [island.x, island.y], 2.5, 260 * u, [0, 0], 0, 320 * u);
  for (const each of islands) {
    // An angular slab, as the art's: a few straight edges, its corners at uneven turns and reaches.
    const corners = 5 + Math.floor(each.seed * 4);
    const turn = each.seed * 6.28;
    const loop = [];
    for (let c = 0; c < corners; c += 1) {
      const a0 = turn + ((c + 0.3 * (hash(each.x, c, 2) - 0.5)) / corners) * 2 * Math.PI;
      const a1 = turn + ((c + 1 + 0.3 * (hash(each.x, c + 1, 2) - 0.5)) / corners) * 2 * Math.PI;
      const r0 = each.r * (0.8 + 0.3 * hash(each.y, c, 3));
      const r1 = each.r * (0.8 + 0.3 * hash(each.y, (c + 1) % corners, 3));
      // Each edge in a few straight steps, so the skirt's rings follow it.
      for (let k = 0; k < 4; k += 1) {
        const f = k / 4;
        const x0 = each.x + Math.cos(a0) * r0;
        const y0 = each.y + Math.sin(a0) * r0;
        const x1 = each.x + Math.cos(a1) * r1;
        const y1 = each.y + Math.sin(a1) * r1;
        loop.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
      }
    }
    const bob = [each.phase, each.bob];
    const from = positions.length / 3;
    cap(loop, [each.x, each.y], each.z, bob);
    skirt(loop, [each.x, each.y], each.z, each.depth, bob, each.seed * 100);
    tilt(from, positions.length / 3, [each.x, each.y, each.z], each.tilt, each.seed * 6.28);
  }
  if (tree) {
    const props = createPropBuilder();
    const bark = [0.42, 0.33, 0.25, 0];
    const branch = (from, angle, tilt, length, radius, depth) => {
      const to = [from[0] + Math.cos(angle) * Math.sin(tilt) * length, from[1] + Math.sin(angle) * Math.sin(tilt) * length, from[2] + Math.cos(tilt) * length];
      props.tube([from, to], [radius, radius * 0.6], bark, { sides: 6 });
      if (depth <= 0) return;
      for (let k = 0; k < 2; k += 1) branch(to, angle + (k ? 0.8 : -0.8) + hash(to[0], k, 2) - 0.5, Math.min(1.25, tilt + 0.35), length * 0.65, radius * 0.55, depth - 1);
    };
    branch([tree.x, tree.y, tree.z - 4], 0.3, 0.2, tree.h * 0.45, 5 * u, 3);
    const built = props.build(three);
    const first = positions.length / 3;
    positions.push(...built.getAttribute('position').array);
    normals.push(...built.getAttribute('normal').array);
    const treeColors = built.getAttribute('aColor').array;
    for (let i = 0; i < treeColors.length; i += 4) colors.push(treeColors[i], treeColors[i + 1], treeColors[i + 2], 0);
    for (let i = 0; i < built.getAttribute('position').count; i += 1) bobs.push(tree.phase, tree.bob);
    for (const id of built.getIndex().array) index.push(first + id);
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aColor', new three.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('aBob', new three.Float32BufferAttribute(bobs, 2));
  geometry.setIndex(index);
  return geometry;
}

export const ROCK_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aColor;
attribute vec2 aBob;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float growth = terrainGrowth(position.xy);
  vec3 pos = position;
  pos.z = (pos.z + sin(uTime * 0.6 + aBob.x) * aBob.y) * growth;
  vColor = aColor;
  vNormal = normal;
  vWorld = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/** Earth and grass in the sun from above, the cliffs lit from below in the void's colours. */
export const ROCK_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${VALLEY}
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  float lit = max(dot(n, normalize(uSun)), 0.0);
  vec3 albedo = vColor.rgb * (0.85 + 0.3 * gnoise(vWorld.xy / 9.0 + vWorld.z / 13.0));
  // A slab's grass: soft clumps and brushed blades, as on the great island.
  float blades = gnoise(vec2(vWorld.x * 0.35 + 3.0 * fbm3(vWorld.xy / 40.0), vWorld.y * 0.08));
  albedo = mix(albedo, albedo * (0.8 + 0.4 * fbm3(vWorld.xy / 50.0)) + vec3(0.06, 0.1, 0.02) * smoothstep(0.55, 0.85, blades), vColor.a);
  vec3 col = albedo * (0.42 + 0.75 * lit);
  // The void's light from below, in its own colour where the rock hangs over it.
  col += albedo * voidColour(vWorld.xy, uTime) * 0.9 * max(-n.z + 0.25, 0.0);
  col += vec3(1.0, 0.75, 1.0) * revealGlow(vWorld.xy, 0.035) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Every glowing disc: a flat instanced quad on the grass, bobbing with its island. */
export function discGeometry(three, discs) {
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aDisc', new three.InstancedBufferAttribute(Float32Array.from(discs.flatMap((d) => [d.x, d.y, d.z, d.r])), 4));
  geometry.setAttribute(
    'aHue',
    new three.InstancedBufferAttribute(Float32Array.from(discs.flatMap((d) => [...DISC_HUES[d.hue].map((c) => c / 255), d.phase])), 4)
  );
  geometry.setAttribute('aBob', new three.InstancedBufferAttribute(Float32Array.from(discs.map((d) => d.bob)), 1));
  geometry.instanceCount = discs.length;
  return geometry;
}

export const DISC_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aDisc;
attribute vec4 aHue;
attribute float aBob;
varying vec2 vLocal;
varying vec3 vHue;
varying float vShown;
void main() {
  // A little bigger than the disc, room for its glow.
  vec2 local = position.xy * 1.6;
  vec3 pos = vec3(aDisc.xy + local * aDisc.w, aDisc.z + 0.6);
  pos.z += sin(uTime * 0.6 + aHue.w) * aBob;
  float growth = terrainGrowth(aDisc.xy);
  pos.z *= growth;
  vLocal = local;
  vHue = pow(aHue.rgb, vec3(2.2));
  vShown = revealBurned(aDisc.xy) * exitKeep(aDisc.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const DISC_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vLocal;
varying vec3 vHue;
varying float vShown;
void main() {
  float r = length(vLocal);
  if (vShown < 0.5 || r > 1.6) discard;
  float body = 1.0 - smoothstep(0.92, 1.0, r);
  float core = 1.0 - smoothstep(0.0, 0.85, r);
  float glow = exp(-(r - 1.0) * (r - 1.0) * 6.0) * step(1.0, r);
  float breath = 0.85 + 0.15 * sin(uTime * 1.3 + vHue.r * 9.0 + vHue.b * 5.0);
  vec3 col = vHue * (0.9 + 0.6 * core) * breath + vec3(0.35) * core * core;
  float alpha = max(body, glow * 0.35 * breath);
  gl_FragColor = vec4(mix(vHue * 1.4, col, body), alpha);
${OUTPUT}
}
`;

export const VOID_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The void far below: the rainbow-to-violet glow, its bands swirling, streams of white sparkle. */
export const VOID_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${VALLEY}
varying vec2 vPos;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  float t = uTime;
  float nebula = fbm3(p / 300.0 + vec2(t * 0.02, -t * 0.01));
  vec3 col = voidColour(p, t) * (0.5 + 0.6 * nebula) * 0.85;
  col += voidColour(p + vec2(260.0, 0.0), t) * 0.25 * smoothstep(0.6, 0.85, fbm3(p / 120.0 - t * 0.03));
  // Streams of white sparkle running up across it, as the art's: specks along drifting bands.
  vec2 flow = vec2(dot(p, vec2(0.6, 0.8)), dot(p, vec2(-0.8, 0.6)));
  float band = smoothstep(0.5, 0.75, gnoise(vec2(flow.y / 140.0, flow.x / 900.0 - t * 0.05)));
  vec2 moving = (flow + vec2(t * 40.0, 0.0)) / 11.0;
  vec2 cell = floor(moving);
  vec2 inCell = fract(moving) - 0.5 - (hash22(cell) - 0.5) * 0.5;
  float speck = step(0.9, hash12(cell)) * (1.0 - smoothstep(0.06, 0.16, length(inCell))) * (0.5 + 0.5 * sin(t * 4.0 + hash12(cell + 7.0) * 30.0));
  vec3 speckHue = mix(vec3(1.0), 0.55 + 0.45 * cos(6.2831853 * (hash12(cell + 3.0) + vec3(0.0, 0.33, 0.67))), step(0.45, hash12(cell + 11.0)));
  col += speckHue * speck * band * 1.1;
  // The island's soft shadow on the mist far below it.
  col *= mix(0.3, 1.0, smoothstep(0.0, 260.0, islandDistance(p + vec2(30.0, 40.0))));
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** Specks of sparkle rising up through the void past the islands, white and rainbow. */
export const SPARKLE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
attribute vec4 aSeed;
varying vec3 vHue;
varying float vGlow;
void main() {
  float period = 7.0 + aSeed.w * 6.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 start = uMin + hash22(aSeed.xy * 61.0 + cycle) * uSize;
  vec3 pos = vec3(start + vec2(-40.0, 60.0) * life, -${VOID_DEPTH}.0 * (0.25 + 0.6 * aSeed.y) + 220.0 * life);
  float shown = revealBurned(start) * exitKeep(start);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vGlow = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.7, 1.0, life)) * (0.5 + 0.5 * sin(clock * 5.0 + aSeed.x * 40.0));
  vHue = aSeed.x < 0.7 ? vec3(1.0) : 0.6 + 0.4 * cos(6.2831853 * (aSeed.w + vec3(0.0, 0.33, 0.67)));
  gl_PointSize = max((1.2 + 1.6 * aSeed.z) * uFocal / -mv.z, 1.5) * 2.2 * shown;
}
`;

export const SPARKLE_FRAGMENT = /* glsl */ `
varying vec3 vHue;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.2, 0.45, d);
  float halo = exp(-d * d * 4.0) * 0.5;
  gl_FragColor = vec4(vHue * (core + halo) * vGlow, 1.0);
${OUTPUT}
}
`;

/** Dimension Valley's board (stadium-environment-mesh.js BOARDS). */
export function dimensionValleyBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uIsland: { value: new three.Vector4() },
    uIslandShape: { value: new three.Vector2() },
    uEmblem: { value: new three.Vector3() },
    uScene: { value: new three.Vector4(0, 0, 1, 1) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    rock: make(ROCK_VERTEX, ROCK_FRAGMENT, { side: three.DoubleSide }),
    discs: make(DISC_VERTEX, DISC_FRAGMENT, { transparent: true, depthWrite: false }),
    void: make(VOID_VERTEX, VOID_FRAGMENT),
    sparkles: make(SPARKLE_VERTEX, SPARKLE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const rock = new three.Mesh(new three.BufferGeometry(), materials.rock);
  const discs = new three.Mesh(new three.BufferGeometry(), materials.discs);
  discs.renderOrder = 1;
  const voidPlane = new three.Mesh(new three.BufferGeometry(), materials.void);
  const sparkles = new three.Points(seeded(SPARKLE_COUNT), materials.sparkles);
  sparkles.renderOrder = 2;
  return {
    objects: [voidPlane, terrain, rock, discs, sparkles],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => valleySpots(layout),
    apply(spots, bounds) {
      const island = spots?.island;
      own.uIsland.value.set(island?.x ?? 0, island?.y ?? 0, island?.hw ?? 0, island?.hh ?? 0);
      own.uIslandShape.value.set(island?.corner ?? 0, island?.wander ?? 0);
      own.uEmblem.value.set(spots?.emblem?.x ?? 0, spots?.emblem?.y ?? 0, spots?.emblem?.r ?? 0);
      own.uScene.value.set(bounds.x, bounds.y, bounds.w, bounds.h);
      replaceGeometry(terrain, terrainGrid(bounds));
      // The void reaches well past the scene: lying deep, it shows round the scene's edges on screen.
      const depth = VOID_DEPTH * (spots?.u ?? 1);
      replaceGeometry(voidPlane, new three.PlaneGeometry(bounds.w * 2.2, bounds.h * 2.2).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, -depth));
      for (const mesh of [rock, discs]) mesh.visible = Boolean(spots);
      if (!spots) return;
      replaceGeometry(rock, rockGeometry(three, spots));
      replaceGeometry(discs, discGeometry(three, spots.discs));
    },
  };
}
