// Design 077 (prototype): Old Cemetery (customhb-198) after its card art (CRE 147, Oswaldo Kato): a
// graveyard at night under a crescent moon low beyond it, dark teal grass with tufts lit pale
// yellow-green, a worn earth path winding through, pale teal headstones with rounded tops (their rims
// bright, their faces dark against the moon), a broken wooden grave post, a great mossy boulder,
// dark pines and one bare pale tree behind, bands of mist drifting low. The art looks along the path
// toward the moon; the board looks down on the graveyard, so the cards lie on the grass in its
// middle, the path comes in at the near left, runs up past the cards and leaves at the far right, the
// graves stand in rows either side of it and off the far end, and the moon stands beyond the far
// end, so every stone casts its shadow toward the player.
// World scale: a card's footprint is about a grave's length; a headstone stands knee to hip high.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the path's edge (negative
// on it), B the shadow the stones, the pines and the tree cast across the ground 0..1, A the kind
// (0 grass, 1 path, 2 grave mound, 3 boulder); the shared light bake adds normals, occlusion and the
// ground's own shadow. Per frame: TERRAIN paints the grass, the path, the mounds and the boulder in
// moonlight; PROPS are the headstones, crosses, the post, the pines and the bare tree
// (stadium-env-props); MIST is a sheet of drifting fog low over the ground.
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

export const CEMETERY_KEY = 'old-cemetery';
/** The moon (toward it, table frame): low beyond the far end, a little to the right. */
export const MOON = Object.freeze([0.24, 0.8, 0.55]);
/** The path's half width, and the least gap between its edge and a card. */
export const PATH_HALF_PX = 30;
export const PATH_CARD_GAP_PX = 22;
export const MAX_PATH_POINTS = 48;
export const MAX_GRAVES = 64;
export const MAX_PINES = 16;
/** Least gap between any prop, seen from above, and a card or the opponent's hand. */
export const PROP_CARD_GAP_PX = 14;
/** Grave kinds. */
export const GRAVE = Object.freeze({ headstone: 0, cross: 1 });

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

/** Catmull-Rom through `points` ([x, y]), `per` steps a span. */
const smoothPath = (points, per) => {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < per; k += 1) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))
      );
    }
  }
  out.push(points[points.length - 1]);
  return out;
};

/** px from (x, y) to the polyline. */
const distanceToPath = (path, x, y) => {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
};

/**
 * Old Cemetery's layout: the path (in at the near left, up past the cards, out at the far right),
 * the graves in rows either side of it and off the far end, the pines and the bare tree behind, the
 * boulder in the right band, the broken post by the path. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function cemeterySpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const core = union(cards);
  const scene = sceneBounds(layout, CEMETERY_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const hand = oppHandRect(layout, core);
  const obstacles = [...cards, ...(hand ? [hand] : [])];
  const clear = (x, y, r) => obstacles.every((rect) => distanceToRect(x, y, rect) >= r + PROP_CARD_GAP_PX);
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;
  const halfPath = PATH_HALF_PX * u;
  const side = Math.max(halfPath + PATH_CARD_GAP_PX * u + 60 * u, Math.min(150 * u, (core.x - scene.x) * 0.45));
  const far = core.y + core.h;
  // The path meanders: each bend pushed a little off the line, its own way.
  const sway = (k) => (hash(core.x, k, 21) - 0.5) * 46 * u;
  const path = smoothPath(
    [
      [core.x - side * 0.8 + sway(1), scene.y - 20],
      [core.x - side + sway(2) * 0.5, core.y + core.h * 0.18],
      [core.x - side * 1.05 + sway(3) * 0.5, core.y + core.h * 0.5],
      [core.x - side * 0.95 + sway(4) * 0.3, core.y + core.h * 0.8],
      // Round the cards' far corner well outside it.
      [core.x - side * 0.8, far + side * 0.55],
      [core.x + core.w * 0.1, far + 130 * u + sway(5) * 0.5],
      [core.x + core.w * 0.5, far + 100 * u + sway(6)],
      [core.x + core.w * 0.85, far + 120 * u + sway(7)],
      [scene.x + scene.w + 20, far + 160 * u],
    ],
    5
  ).slice(0, MAX_PATH_POINTS);
  const pathClear = (x, y, r) => distanceToPath(path, x, y) >= halfPath + r;

  // The boulder in the right band, and the bare tree off the far end on the left.
  const boulder = { x: core.x + core.w + 135 * u, y: core.y + core.h * 0.42, r: 86 * u, h: 34 * u };
  const tree = { x: core.x + core.w * 0.22, y: far + 230 * u, h: 170 * u };
  const keepOff = [
    { ...boulder, keep: boulder.r + 20 * u },
    { ...tree, keep: 50 * u },
  ];
  const off = (x, y, r) => keepOff.every((k) => Math.hypot(x - k.x, y - k.y) >= k.keep + r);

  // Graves in rows facing the player, either side of the path and off the far end.
  const graves = [];
  const across = 82 * u;
  const along = 104 * u;
  for (let gy = scene.y + along / 2, row = 0; gy < scene.y + scene.h; gy += along, row += 1) {
    for (let gx = scene.x + across / 2 + (row % 2) * across * 0.4; gx < scene.x + scene.w; gx += across) {
      if (graves.length >= MAX_GRAVES) break;
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * across * 0.5;
      const y = gy + (roll(2) - 0.5) * along * 0.3;
      const kindRoll = roll(3);
      const kind = kindRoll < 0.82 ? GRAVE.headstone : GRAVE.cross;
      const width = (kind === GRAVE.cross ? 30 : 30 + 22 * roll(4)) * u;
      const height = (40 + 42 * roll(5) ** 1.4) * (y > far ? 1.2 : 1) * u;
      const reach = Math.max(width, 46 * u) * 0.75;
      // Toward the near end a tall stone leans up over the player's cards in the tilted view.
      if (y < core.y) continue;
      if (roll(6) > 0.7 || !inScene(x, y, 30 * u) || !clear(x, y, reach + height * 0.35) || !pathClear(x, y, reach) || !off(x, y, reach)) {
        continue;
      }
      // Old stones lean back, away from the path's walkers, each its own way: from above the face shows.
      const lean = kind === GRAVE.cross ? 0 : 0.2 + 0.3 * roll(8);
      graves.push({ x, y, yaw: (roll(7) - 0.5) * 0.7, lean, width, height, thick: (8 + 5 * roll(10)) * u, kind, seed: roll(9) });
    }
  }
  // Pines round the scene's outer edge, off the far end most.
  const pines = [];
  const pineStep = 150 * u;
  for (let gy = scene.y + pineStep / 2; gy < scene.y + scene.h; gy += pineStep) {
    for (let gx = scene.x + pineStep / 2; gx < scene.x + scene.w; gx += pineStep) {
      if (pines.length >= MAX_PINES) break;
      const roll = (salt) => hash(gx, gy, salt + 50);
      const x = gx + (roll(1) - 0.5) * pineStep * 0.6;
      const y = gy + (roll(2) - 0.5) * pineStep * 0.6;
      const r = (44 + 26 * roll(3)) * u;
      const outside = distanceToRect(x, y, core);
      if (outside < 200 * u || roll(4) > 0.82 || !inScene(x, y, r * 0.3)) continue;
      // Tall only off the far end; elsewhere they lean over the cards in the tilted view.
      const h = (y > far ? 240 + 90 * roll(5) : 150 + 50 * roll(5)) * u;
      if (!clear(x, y, r + h * 0.25) || !pathClear(x, y, r) || !off(x, y, r)) continue;
      if (graves.some((g) => Math.hypot(x - g.x, y - g.y) < r + 30 * u)) continue;
      pines.push({ x, y, r, h, seed: roll(6) });
    }
  }
  // The broken grave post by the path on the left, two thirds of the way up.
  const at = path[Math.floor(path.length * 0.3)];
  const post = { x: at[0] + halfPath + 26 * u, y: at[1], h: 70 * u };
  return { table, scene, core, u, hand, path, halfPath, boulder, tree, graves, pines, post };
}

const CEMETERY = /* glsl */ `
// The path's points (x, y; unused ones repeat the last), its half width; every grave (x, y, yaw,
// width; 0 width: none) and its height, thickness, kind and lean back (per px up); every pine (x, y, base radius, height;
// 0: none); the boulder (x, y, radius, height); the bare tree (x, y, height).
uniform vec2 uPath[${MAX_PATH_POINTS}];
uniform float uPathHalf;
uniform vec4 uGraves[${MAX_GRAVES}];
uniform vec4 uGraveSize[${MAX_GRAVES}];
uniform vec4 uPines[${MAX_PINES}];
uniform vec4 uBoulder;
uniform vec3 uTree;
float pathDistance(vec2 p) {
  float best = 100000.0;
  for (int i = 0; i < ${MAX_PATH_POINTS - 1}; i++) {
    vec2 a = uPath[i];
    vec2 b = uPath[i + 1];
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
    best = min(best, distance(p, a + ab * t));
  }
  // The edge wanders, worn wider in places.
  return best - uPathHalf * (0.7 + 0.6 * gnoise(p / 90.0) + 0.15 * gnoise(p / 23.0));
}
// p in a grave's own frame: x along its width, y toward its back.
vec2 graveFrame(vec2 p, vec4 grave) {
  vec2 d = p - grave.xy;
  float c = cos(grave.z);
  float s = sin(grave.z);
  return vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
}
`;

/**
 * Bake: the grass rolls gently; the path is worn a little into it, rutted; before each grave a
 * low mound; the boulder a great rounded dome. Then the moon's shadow of every stone, pine and the
 * bare tree, cast toward the player.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform vec3 uSun;
varying vec2 vUv;
${NOISE}
${CEMETERY}
void main() {
  vec2 p = uMin + vUv * uSize;
  float h = 3.0 * (fbm3(p / 120.0) - 0.5);
  float kind = 0.0;
  float d = pathDistance(p);
  if (d < 0.0) {
    h -= 0.7 * smoothstep(0.0, -18.0, d);
    kind = 1.0;
  }
  for (int i = 0; i < ${MAX_GRAVES}; i++) {
    vec4 grave = uGraves[i];
    if (grave.w <= 0.0) continue;
    vec4 size = uGraveSize[i];
    // The mound lies before the stone (toward the player); a ledger slab lies on its own.
    vec2 q = graveFrame(p, grave);
    vec2 mound = (q - vec2(0.0, -grave.w * 0.95)) / vec2(grave.w * 0.6, grave.w * 0.95);
    float m = 1.0 - dot(mound, mound) - 0.25 * (gnoise(p / 12.0) - 0.5);
    if (m > 0.0) {
      h = max(h, 3.0 * sqrt(m));
      kind = 2.0;
    }
  }
  vec2 rel = (p - uBoulder.xy) / uBoulder.z;
  float dome = 1.0 - dot(rel * vec2(1.0, 1.25), rel * vec2(1.0, 1.25)) - 0.35 * (fbm3(p / 55.0) - 0.5) - 0.1 * (gnoise(p / 14.0) - 0.5);
  if (dome > 0.0) {
    float bh = uBoulder.w * pow(dome, 0.55);
    if (bh > h) {
      h = bh;
      kind = 3.0;
    }
  }

  // The shadows: a ray from p toward the moon, tested at heights up each caster.
  vec3 moon = normalize(uSun);
  vec2 drift = moon.xy / moon.z;
  float shadow = 0.0;
  for (int i = 0; i < ${MAX_GRAVES}; i++) {
    vec4 grave = uGraves[i];
    if (grave.w <= 0.0) continue;
    vec4 size = uGraveSize[i];
    vec2 near = graveFrame(p, grave);
    if (dot(near, near) > pow(size.x * 2.2 + grave.w, 2.0)) continue;
    for (int k = 0; k <= 18; k++) {
      float z = size.x * float(k) / 18.0;
      vec2 q = graveFrame(p + drift * (z - h), grave) - vec2(0.0, size.w * z);
      float halfW = grave.w * 0.5 * (size.z > 0.5 ? (z > size.x * 0.62 && z < size.x * 0.82 ? 1.0 : 0.22) : 1.0);
      // A headstone's top is rounded: narrower near its crown.
      if (size.z < 0.5) halfW *= sqrt(clamp((size.x - z) / (grave.w * 0.5), 0.0, 1.0));
      if (abs(q.x) < halfW && abs(q.y) < size.y * 0.5) shadow = 1.0;
      if (shadow >= 1.0) break;
    }
  }
  for (int i = 0; i < ${MAX_PINES}; i++) {
    vec4 pine = uPines[i];
    if (pine.z <= 0.0) continue;
    for (int k = 1; k <= 9; k++) {
      float z = pine.w * float(k) / 10.0;
      vec2 q = p + drift * (z - h) - pine.xy;
      // Never zero: smoothstep is undefined when its edges meet.
      float r = max(pine.z * (1.0 - z / pine.w) * (0.75 + 0.25 * sin(z * 0.12)), 1.0);
      shadow = max(shadow, 1.0 - smoothstep(r * 0.85, r * 1.05, length(q)));
    }
  }
  if (uTree.z > 0.0) {
    for (int k = 0; k <= 28; k++) {
      float z = uTree.z * 0.45 * float(k) / 28.0;
      vec2 q = p + drift * (z - h) - uTree.xy;
      float r = mix(8.0, 4.0, z / (uTree.z * 0.45));
      shadow = max(shadow, 1.0 - smoothstep(r, r + 2.0, length(q)));
    }
  }
  gl_FragColor = vec4(h, d, shadow, kind);
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
const vec3 GROUND = vec3(0.046, 0.117, 0.113);
const vec3 GROUND_LIT = vec3(0.078, 0.228, 0.181);
const vec3 TUFT = vec3(0.469, 0.65, 0.142);
const vec3 EARTH = vec3(0.228, 0.142, 0.101);
const vec3 EARTH_DARK = vec3(0.12, 0.101, 0.085);
const vec3 STONE = vec3(0.181, 0.302, 0.302);
const vec3 STONE_LIT = vec3(0.392, 0.618, 0.586);
const vec3 MOSS = vec3(0.058, 0.139, 0.128);
const vec3 MIST = vec3(0.345, 0.618, 0.586);
const vec3 MOONLIGHT = vec3(0.677, 1.0, 0.962);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.45, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
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
  vec3 moon = normalize(uSun);
  float moonlit = clamp(dot(n, moon) / moon.z, 0.0, 1.6) * mix(0.55, 1.0, light.a) * (1.0 - 0.55 * field.b * vGrowth);

  // The grass: dark teal, paler in patches, tufts of blades fanning toward the moon, their tips lit
  // the art's pale yellow-green.
  vec3 col = mix(GROUND, GROUND_LIT, smoothstep(0.3, 0.8, fbm3(p / 140.0 + 1.0)));
  vec4 tuft = voronoiCell(p / 16.0 + 4.0);
  vec2 fromTuft = -tuft.zw * 16.0;
  float bladeAngle = atan(fromTuft.x, fromTuft.y + 0.001);
  float bladeRun = length(fromTuft) / 9.0;
  float blades = smoothstep(0.45 + 0.4 * bladeRun, 0.6 + 0.35 * bladeRun, cos(bladeAngle * 8.0 + tuft.y * 30.0))
    * (1.0 - smoothstep(0.8, 1.15, abs(bladeAngle))) * (1.0 - smoothstep(0.75, 1.05, bladeRun));
  float hasTuft = step(fract(tuft.y * 31.7), 0.62) * smoothstep(0.3, 0.6, fbm3(p / 90.0 + 7.0));
  col = mix(col, mix(GROUND_LIT * 1.4, TUFT * 1.1, smoothstep(0.3, 1.0, bladeRun)), blades * hasTuft);
  // The path: worn earth, paler down its middle, ruts along it, its edge fraying into the grass.
  float pathEdge = smoothstep(2.0, -6.0, field.g + 6.0 * (gnoise(p / 11.0) - 0.5));
  vec3 earth = mix(EARTH_DARK, EARTH, smoothstep(-4.0, -20.0, field.g) * (0.7 + 0.3 * fbm3(p / 30.0)));
  // Grass creeps back over it in patches where few walk.
  float regrown = smoothstep(0.62, 0.75, fbm3(p / 45.0 + 9.0)) * 0.8;
  col = mix(col, earth, pathEdge * (1.0 - regrown));
  // A grave's mound: the grass on it a shade darker and finer.
  col = mix(col, GROUND_LIT * 0.9, step(1.5, kind) * step(kind, 2.5) * 0.35);
  // The boulder: mossy dark stone, its crown catching the moon.
  vec3 rock = mix(MOSS * 0.8, STONE * 0.9, smoothstep(0.4, 0.9, n.z) * fbm3(p / 25.0));
  col = mix(col, rock, step(2.5, kind));

  col *= (0.35 + 0.5 * moonlit) * mix(0.55, 1.0, smoothstep(0.3, 0.9, light.b));
  col += MOONLIGHT * 0.1 * pow(clamp(dot(n, moon), 0.0, 1.0), 6.0) * step(2.5, kind);
  // Low mist pooled in the hollows, thicker out past the graves.
  float mist = smoothstep(0.45, 0.75, fbm3(p / 260.0 + vec2(uTime * 0.012, uTime * 0.004)));
  col = mix(col, MIST * 0.32, mist * 0.35);
  col = edgeHaze(col, vUv);
  vec3 ghost = vec3(0.6, 0.95, 0.9);
  col += ghost * revealGlow(p, 0.035) * 0.6;
  col += ghost * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how much a surface takes a sheen).
const STONE_COLOR = [0.5, 0.68, 0.68, 0.1];
const STONE_PALE = [0.64, 0.82, 0.8, 0.1];
const MOSS_COLOR = [0.12, 0.26, 0.2, 0];
const PINE_COLOR = [0.045, 0.12, 0.13, 0];
const DEAD_WOOD = [0.62, 0.78, 0.76, 0];
const WOOD = [0.2, 0.17, 0.16, 0];

/** A headstone: a slab with a rounded top, leaning a little, moss on its crown. */
const headstone = (props, g) => {
  const c = Math.cos(g.yaw);
  const s = Math.sin(g.yaw);
  // Leaning back: higher up, further from the player.
  const tip = (z) => g.lean * z;
  const at = (x, y, z) => [g.x + x * c - (y + tip(z)) * s, g.y + x * s + (y + tip(z)) * c, z];
  const halfW = g.width / 2;
  const shoulder = g.height - halfW;
  const half = g.thick / 2;
  // The body: front, back and sides up to the shoulder.
  props.quad(at(-halfW, -half, 0), at(halfW, -half, 0), at(halfW, -half, shoulder), at(-halfW, -half, shoulder), STONE_COLOR);
  props.quad(at(halfW, half, 0), at(-halfW, half, 0), at(-halfW, half, shoulder), at(halfW, half, shoulder), STONE_COLOR);
  props.quad(at(halfW, -half, 0), at(halfW, half, 0), at(halfW, half, shoulder), at(halfW, -half, shoulder), STONE_PALE);
  props.quad(at(-halfW, half, 0), at(-halfW, -half, 0), at(-halfW, -half, shoulder), at(-halfW, half, shoulder), STONE_PALE);
  // The rounded top: a half disc, front and back, joined by its curved rim.
  const steps = 10;
  for (let k = 0; k < steps; k += 1) {
    const a0 = (Math.PI * k) / steps;
    const a1 = (Math.PI * (k + 1)) / steps;
    const p0 = [Math.cos(a0) * halfW, shoulder + Math.sin(a0) * halfW];
    const p1 = [Math.cos(a1) * halfW, shoulder + Math.sin(a1) * halfW];
    // Each a triangle (the quad's last corner repeats its third, so its normal stays defined).
    props.quad(at(p0[0], -half, p0[1]), at(p1[0], -half, p1[1]), at(0, -half, shoulder), at(0, -half, shoulder), STONE_COLOR);
    props.quad(at(p1[0], half, p1[1]), at(p0[0], half, p0[1]), at(0, half, shoulder), at(0, half, shoulder), STONE_COLOR);
    const mossy = Math.sin((a0 + a1) / 2) > 0.75 && g.seed > 0.4;
    props.quad(at(p0[0], -half, p0[1]), at(p0[0], half, p0[1]), at(p1[0], half, p1[1]), at(p1[0], -half, p1[1]), mossy ? MOSS_COLOR : STONE_PALE);
  }
};

/** A stone cross on a low plinth. */
const cross = (props, g) => {
  const box = (dx, z0, z1, hw) => {
    const x = g.x + dx * Math.cos(g.yaw);
    const y = g.y + dx * Math.sin(g.yaw);
    props.box({ x, y, z0, z1, hw, hh: g.thick / 2, yaw: g.yaw, color: STONE_COLOR, topColor: STONE_PALE });
  };
  props.box({ x: g.x, y: g.y, z0: 0, z1: 8, hw: g.width * 0.45, hh: g.thick, yaw: g.yaw, color: STONE_COLOR, topColor: STONE_PALE });
  box(0, 8, g.height, g.width * 0.13);
  box(0, g.height * 0.62, g.height * 0.82, g.width * 0.5);
};

/** A pine: three cones of dark boughs stacked up a trunk, each tier's skirt ragged. */
const pine = (props, p) => {
  props.tube(
    [
      [p.x, p.y, -4],
      [p.x, p.y, p.h * 0.35],
    ],
    p.r * 0.12,
    WOOD,
    { sides: 8 }
  );
  const tiers = [
    [0.18, 0.62, 1],
    [0.45, 0.84, 0.74],
    [0.68, 1, 0.48],
  ];
  for (const [from, to, girth] of tiers) {
    const sides = 14;
    const base = p.h * from;
    const top = p.h * to;
    const ring = Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * 2 * Math.PI + p.seed * 6;
      const ragged = 0.82 + 0.3 * hash(p.x + k, p.y + from, 7);
      return [p.x + Math.cos(angle) * p.r * girth * ragged, p.y + Math.sin(angle) * p.r * girth * ragged, base - p.r * 0.12 * ragged];
    });
    const apex = [p.x, p.y, top];
    for (let k = 0; k < sides; k += 1) props.quad(ring[k], ring[(k + 1) % sides], apex, apex, PINE_COLOR);
  }
};

/** The bare tree: a pale trunk forking into crooked branches, as the art's. */
const bareTree = (props, t, u) => {
  const branch = (from, angle, tilt, length, radius, depth) => {
    const to = [from[0] + Math.cos(angle) * Math.sin(tilt) * length, from[1] + Math.sin(angle) * Math.sin(tilt) * length, from[2] + Math.cos(tilt) * length];
    props.tube([from, [(from[0] + to[0]) / 2 + 3, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], to], [radius, radius * 0.75, radius * 0.5], DEAD_WOOD, { sides: 6 });
    if (depth <= 0) return;
    for (let k = 0; k < 3; k += 1) {
      const roll = hash(to[0] + k, to[1] + depth, 3);
      branch(to, angle + (k - 1) * 0.9 + (roll - 0.5) * 0.5, Math.min(1.3, tilt + 0.25 + 0.3 * roll), length * 0.62, radius * 0.5, depth - 1);
    }
  };
  branch([t.x, t.y, -4], 0, 0.05, t.h * 0.42, 8 * u, 3);
};

/** A broken wooden grave post: a leaning upright, its crossbar snapped short. */
const brokenPost = (props, p, u) => {
  props.box({ x: p.x, y: p.y, z0: -2, z1: p.h, hw: 5 * u, hh: 5 * u, yaw: 0.3, color: WOOD });
  props.box({ x: p.x + 9 * u, y: p.y + 3 * u, z0: p.h * 0.66, z1: p.h * 0.66 + 9 * u, hw: 13 * u, hh: 4 * u, yaw: 0.3, color: WOOD });
};

/** Every grave, the pines, the bare tree and the post: one prop geometry. */
export function cemeteryProps({ graves, pines, tree, post, u }) {
  const props = createPropBuilder();
  for (const g of graves) {
    if (g.kind === GRAVE.headstone) headstone(props, g);
    else cross(props, g);
  }
  for (const p of pines) pine(props, p);
  bareTree(props, tree, u);
  brokenPost(props, post, u);
  return props;
}

/** The props in moonlight: faces toward the moon pale, rims catching it bright, the rest in teal night. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 moon = normalize(uSun);
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, moon), 0.0);
  vec3 col = albedo * (vec3(0.22, 0.32, 0.34) + vec3(0.62, 0.9, 0.86) * lit);
  // The rim: an edge between the eye and the moon glows, as the art's stones do.
  float rim = pow(1.0 - abs(dot(n, view)), 3.0) * smoothstep(0.0, 0.5, dot(n, moon) + 0.3);
  col += vec3(0.5, 0.85, 0.8) * rim * 0.6;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(0.6, 0.95, 0.9)' });

/** A sheet of mist: low over the ground, thick in drifting bands, thin over the cards' middle. */
export const MIST_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const MIST_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${PALETTE}
uniform vec4 uCore;
uniform float uLayer;
varying vec2 vPos;
void main() {
  vec2 p = vPos;
  float shown = revealBurned(p) * exitKeep(p) * uReveal;
  vec2 drift = vec2(uTime * (6.0 + 4.0 * uLayer), uTime * 1.5);
  float band = fbm3((p - drift) / vec2(420.0, 160.0) + uLayer * 7.0);
  float wisps = fbm3((p - drift * 1.6) / 90.0 + uLayer * 3.0);
  float outside = length(max(max(uCore.xy - p, p - uCore.zw), 0.0));
  float density = smoothstep(0.45, 0.8, band) * (0.55 + 0.45 * wisps) * mix(0.25, 1.0, smoothstep(20.0, 220.0, outside));
  vec2 uv = (p - uMin) / uSize;
  vec2 edgeUv = min(uv, 1.0 - uv);
  density *= smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y));
  gl_FragColor = vec4(MIST * 0.6, density * 0.4 * shown);
${OUTPUT}
}
`;

/** Old Cemetery's board (stadium-environment-mesh.js BOARDS). */
export function oldCemeteryBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...MOON).normalize() },
    uPath: { value: Array.from({ length: MAX_PATH_POINTS }, () => new three.Vector2()) },
    uPathHalf: { value: 0 },
    uGraves: { value: Array.from({ length: MAX_GRAVES }, () => new three.Vector4()) },
    uGraveSize: { value: Array.from({ length: MAX_GRAVES }, () => new three.Vector4()) },
    uPines: { value: Array.from({ length: MAX_PINES }, () => new three.Vector4()) },
    uBoulder: { value: new three.Vector4() },
    uTree: { value: new three.Vector3() },
    uCore: { value: new three.Vector4() },
  };
  const make = (vertex, fragment, extra, uniforms = own) => material(vertex, fragment, extra, uniforms);
  const mistLayer = (layer) =>
    make(MIST_VERTEX, MIST_FRAGMENT, { transparent: true, depthWrite: false }, { ...own, uLayer: { value: layer } });
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    mistLow: mistLayer(0),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const mists = [[materials.mistLow, 10]].map(([mist, z]) => {
    const mesh = new three.Mesh(new three.BufferGeometry(), mist);
    mesh.renderOrder = 1;
    mesh.userData.z = z;
    return mesh;
  });
  return {
    objects: [terrain, props, ...mists],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => cemeterySpots(layout),
    apply(spots, bounds) {
      const path = spots?.path ?? [];
      own.uPath.value.forEach((slot, i) => {
        const point = path[Math.min(i, path.length - 1)];
        return point ? slot.set(point[0], point[1]) : slot.set(-1e5, -1e5);
      });
      own.uPathHalf.value = spots?.halfPath ?? 0;
      own.uGraves.value.forEach((slot, i) => {
        const g = spots?.graves[i];
        return g ? slot.set(g.x, g.y, g.yaw, g.width) : slot.set(0, 0, 0, 0);
      });
      own.uGraveSize.value.forEach((slot, i) => {
        const g = spots?.graves[i];
        return g ? slot.set(g.height, g.thick, g.kind, g.lean) : slot.set(0, 0, 0, 0);
      });
      own.uPines.value.forEach((slot, i) => {
        const p = spots?.pines[i];
        return p ? slot.set(p.x, p.y, p.r, p.h) : slot.set(0, 0, 0, 0);
      });
      const boulder = spots?.boulder;
      own.uBoulder.value.set(boulder?.x ?? 0, boulder?.y ?? 0, boulder?.r ?? 1, boulder?.h ?? 0);
      own.uTree.value.set(spots?.tree.x ?? 0, spots?.tree.y ?? 0, spots?.tree.h ?? 0);
      const core = spots?.core;
      own.uCore.value.set(core?.x ?? 0, core?.y ?? 0, (core?.x ?? 0) + (core?.w ?? 0), (core?.y ?? 0) + (core?.h ?? 0));
      replaceGeometry(terrain, terrainGrid(bounds));
      for (const mesh of mists) {
        replaceGeometry(mesh, new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, mesh.userData.z * (spots?.u ?? 1)));
      }
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, cemeteryProps(spots).build(three));
    },
  };
}
