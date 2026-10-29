// Design 077 (prototype): Fairy Garden (customhb-428) after its card art (FCO 100, Ryo Ueda): a
// clearing in a night forest, the ground one carpet of small pale lavender flowers, a ring of pale
// light on it round a patch of green grass, great dark trees closing round, green orbs of light
// floating among them and white sparkles trailing through the air, big dark leaves framing the
// corners. The art looks across the flowers at the trees; the board looks down on the clearing, so
// the flowers carpet the whole floor, the fairy ring lies round the Actives with its grass inside,
// the trees stand in the side bands and off the far end (their crowns kept clear of every card),
// the orbs drift over the margins and the sparkles twinkle round them.
// World scale: a card's footprint is a patch of the flower carpet; a flower is a hand-span.
//
// Bake, once per layout: BAKE_FIELD is the flat floor (R height px); the shared light bake adds
// nothing but the leaves' contact. Per frame: TERRAIN paints the carpet, the ring and the grass in
// it, the orbs' light and the trees' shade; PROPS the trees, roots and leaves (stadium-env-props);
// ORBS the glowing orbs and their halos; SPARKLES the trails of four-pointed twinkles.
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
import { craterEmblem } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const FAIRY_KEY = 'fairy-garden';
/** The moon (toward it, table frame): high, a little from the far left; the forest keeps most of it out. */
export const FAIRY_MOON = Object.freeze([-0.3, 0.3, 0.9]);
export const MAX_TREES = 12;
export const MAX_ORBS = 6;
export const MAX_LEAVES = 8;
const SPARKLE_COUNT = 190;
const FLOWER_PX = 27;

/**
 * Fairy Garden's layout: the fairy ring round the Actives, the trees in the side bands and off the
 * far end, the orbs over the margins, the framing leaves. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function fairySpots(layout) {
  const ctx = boardContext(layout, FAIRY_KEY);
  if (!ctx) return null;
  const { scene, table, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const reach = Math.max(Math.abs(core.x), core.x + core.w);
  // Trees: a jittered grid over the scene, kept to the side bands and the far end, crowns clear of the cards.
  const trees = [];
  const step = 150 * u;
  for (let gy = scene.y + step * 0.6; gy < scene.y + scene.h && trees.length < MAX_TREES; gy += step) {
    for (let gx = scene.x + step * 0.5; gx < scene.x + scene.w && trees.length < MAX_TREES; gx += step) {
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * step * 0.7;
      const y = gy + (roll(2) - 0.5) * step * 0.7;
      const r = (62 + 34 * roll(3)) * u;
      const side = Math.abs(x - centre.x) > reach + 80 * u + r * 0.5;
      const far = y > handEnd + 60 * u + r * 0.4;
      if (!(side || far) || roll(4) > 0.78 || !ctx.inScene(x, y, r * 0.5) || y < core.y + 60 * u) continue;
      if (!ctx.clear(x, y, r * 0.8, 22 * u)) continue;
      if (trees.some((t) => Math.hypot(x - t.x, y - t.y) < (r + t.r) * 0.85)) continue;
      trees.push({ x, y, r, h: (130 + 50 * roll(5)) * u, seed: roll(6) });
    }
  }
  // Orbs of light over the margins, between the trees: on a grid over the scene, each far enough
  // off every card that even raised to its height it never leans over one in the tilted view
  // (a raised point shows further up the screen, so the clearance grows with its height).
  const orbs = [];
  const orbStep = 130 * u;
  for (let gy = scene.y + orbStep / 2; gy < scene.y + scene.h && orbs.length < MAX_ORBS; gy += orbStep) {
    for (let gx = scene.x + orbStep / 2; gx < scene.x + scene.w && orbs.length < MAX_ORBS; gx += orbStep) {
      const roll = (salt) => hash(gx, gy, salt + 30);
      if (roll(1) > 0.45) continue;
      const z = (62 + 46 * roll(2)) * u;
      const x = gx + (roll(3) - 0.5) * orbStep * 0.6;
      const y = gy + (roll(4) - 0.5) * orbStep * 0.6;
      if (!ctx.inScene(x, y, 30 * u) || !ctx.clear(x, y, 34 * u + z * 1.15, 14 * u)) continue;
      if (orbs.some((o) => Math.hypot(x - o.x, y - o.y) < 150 * u)) continue;
      orbs.push({ x, y, z, r: (13 + 5 * roll(5)) * u, phase: roll(6) * 6.28 });
    }
  }
  // Big leaves framing the margins, lying low, pointing in toward the clearing.
  const leaves = [];
  for (let k = 0; k < MAX_LEAVES; k += 1) {
    const side = k % 2 ? 1 : -1;
    const x = centre.x + side * (reach + (50 + 90 * hash(k, 3, 1)) * u);
    const y = core.y + ((k + 0.5) / MAX_LEAVES) * (handEnd - core.y) + (hash(k, 3, 2) - 0.5) * 80 * u;
    const yaw = (side > 0 ? Math.PI : 0) + (hash(k, 3, 3) - 0.5) * 1.1;
    const len = (96 + 34 * hash(k, 3, 4)) * u;
    if (!ctx.clear(x + Math.cos(yaw) * len * 0.5, y + Math.sin(yaw) * len * 0.5, len * 0.5, 10 * u) || !ctx.clear(x, y, 20 * u, 10 * u)) continue;
    leaves.push({ x, y, yaw, len, wid: len * 0.38, seed: hash(k, 3, 5) });
  }
  return { ...ctx, reach, handEnd, trees, orbs, leaves, ring: craterEmblem(layout, centre) };
}

const FAIRY = /* glsl */ `
// The ring (x, y, radius; 0: none), the scale of a card (u), every orb (x, y, height, radius) and
// every tree (x, y, crown radius, height).
uniform vec3 uRing;
uniform float uUnit;
uniform vec4 uOrbs[${MAX_ORBS}];
uniform vec4 uTrees[${MAX_TREES}];
// The light of every orb at p over a ground at height h, 0..~1.2, each pulsing slowly on its own beat.
float orbLight(vec3 p, float t) {
  float light = 0.0;
  for (int i = 0; i < ${MAX_ORBS}; i++) {
    vec4 orb = uOrbs[i];
    if (orb.w <= 0.0) continue;
    vec3 d = (p - vec3(orb.xy, orb.z * 0.5)) / (orb.w * 9.0);
    light += exp(-dot(d, d) * 1.2) * (0.85 + 0.15 * sin(t * 1.1 + orb.x * 0.013));
  }
  return light;
}
`;

/** Bake: the floor, flat. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = uMin + vUv * uSize;
  gl_FragColor = vec4(0.4 * (fbm3(p / 70.0) - 0.5), 0.0, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 FLOOR_DARK = vec3(0.024, 0.06, 0.047);
const vec3 GRASS = vec3(0.067, 0.183, 0.113);
const vec3 GRASS_LIT = vec3(0.14, 0.34, 0.2);
const vec3 PETAL = vec3(0.92, 0.84, 1.0);
const vec3 PETAL_SHADE = vec3(0.38, 0.33, 0.52);
const vec3 PETAL_HI = vec3(1.4, 1.34, 1.5);
const vec3 RING = vec3(1.06, 1.0, 1.22);
const vec3 ORB = vec3(0.55, 1.4, 0.95);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${BLADES}
${EDGE_HAZE}
${PALETTE}
${FAIRY}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
// One layer of blossoms: cells of size px, each a tulip seen from above, five broad overlapping
// petals round a dark heart, turned its own way, lit on the side toward the moon. Returns
// (coverage 0..1, how lit 0..1, the blossom's id).
vec3 blossoms(vec2 p, float size, float chance) {
  vec4 c = voronoiCell(p / size);
  vec2 rel = -c.zw;
  float id = c.y;
  float angle = atan(rel.y, rel.x) + id * 6.2831853;
  float petal = 0.5 + 0.5 * cos(5.0 * angle);
  float radius = (0.3 + 0.07 * fract(id * 7.3)) * (0.78 + 0.34 * petal);
  float shape = (1.0 - smoothstep(radius - 0.07, radius + 0.02, length(rel))) * step(fract(id * 17.9), chance);
  // Each petal shades from a lilac foot to a pale tip.
  float tip = smoothstep(0.08, radius, length(rel));
  float lit = 0.5 + 0.5 * dot(normalize(rel + 1e-4), normalize(vec2(-0.5, 0.6)));
  return vec3(shape, clamp(0.25 + 0.5 * tip + 0.35 * lit * petal, 0.0, 1.0), id);
}
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float t = uTime;
  vec3 moon = normalize(uSun);

  // The floor under the blossoms: dark moss, paler where the moon reaches it.
  vec3 col = mix(FLOOR_DARK, FLOOR_DARK * 2.2 + vec3(0.0, 0.016, 0.01), smoothstep(0.35, 0.7, fbm3(p / 90.0 + 4.0)));
  // Two layers of blossoms: small ones among the big, the carpet thinning in patches where the moss
  // shows, and heaping into drifts.
  float size = ${FLOWER_PX}.0 * uUnit;
  float drift = smoothstep(0.3, 0.7, fbm3(p / 210.0 + 11.0));
  vec3 small = blossoms(p + 7.0, size * 0.7, 0.7 + 0.28 * drift);
  vec3 big = blossoms(p, size, 0.78 + 0.22 * drift);
  vec3 smallCol = mix(PETAL_SHADE, PETAL * 0.9, small.y) * (0.82 + 0.28 * fract(small.z * 9.0));
  vec3 bigCol = mix(PETAL_SHADE * 1.3, mix(PETAL, PETAL_HI, small.y * 0.7), big.y) * (0.88 + 0.22 * fract(big.z * 11.0));
  col = mix(col, smallCol, small.x);
  // A blossom's shadow on those under it.
  col *= 1.0 - 0.3 * (1.0 - big.x) * smoothstep(0.0, 0.5, big.y) * (1.0 - small.x);
  col = mix(col, bigCol, big.x);
  // A dark heart in each big blossom, a yellow-green stamen in some.
  vec4 heart = voronoiCell(p / size);
  float heartD = length(heart.zw);
  col = mix(col, FLOOR_DARK * 1.5, (1.0 - smoothstep(0.05, 0.1, heartD)) * big.x * 0.9);
  col = mix(col, vec3(0.5, 0.55, 0.12), (1.0 - smoothstep(0.02, 0.045, heartD)) * big.x * step(0.7, fract(heart.y * 5.3)));

  // The fairy ring: the carpet gives way to short grass inside it, the ring a thread of pale light with a lilac bloom.
  float t0 = 0.0;
  if (uRing.z > 0.0) {
    float toRing = distance(p, uRing.xy);
    float inside = 1.0 - smoothstep(uRing.z - 8.0 * uUnit, uRing.z - 1.0 * uUnit, toRing);
    vec4 tuft = voronoiCell(p / (10.0 * uUnit) + 1.3);
    vec2 blades = bladeFan(-tuft.zw * 10.0 * uUnit, tuft.y, 9.0 * uUnit);
    vec3 grass = mix(GRASS * 0.7, GRASS, 0.5 + 0.5 * fbm3(p / 40.0 + 2.0));
    grass = mix(grass, mix(GRASS, GRASS_LIT, blades.y), blades.x * 0.9);
    grass += GRASS_LIT * 0.35 * (1.0 - smoothstep(0.0, uRing.z, toRing));
    col = mix(col, grass, inside);
    float line = 1.0 - smoothstep(0.0, 1.6 * uUnit, abs(toRing - uRing.z) - 1.6 * uUnit);
    float angle = atan(p.y - uRing.y, p.x - uRing.x);
    float glints = pow(0.5 + 0.5 * sin(angle * 38.0 - t * 0.7 + 4.0 * gnoise(vec2(angle * 3.0, t * 0.1))), 6.0);
    float bloom = exp(-pow((toRing - uRing.z) / (14.0 * uUnit), 2.0));
    col += RING * 0.32 * bloom * (0.85 + 0.15 * sin(t * 1.4));
    col = mix(col, RING * (0.85 + 0.35 * glints), line);
    t0 = bloom;
  }

  // Night: the moon where the canopy lets it through, the orbs' green-white light over the near ground,
  // the trees' shade under their crowns.
  float orb = orbLight(vec3(p, 2.0), t);
  float shade = 0.0;
  for (int i = 0; i < ${MAX_TREES}; i++) {
    vec4 tree = uTrees[i];
    if (tree.z <= 0.0) continue;
    shade = max(shade, 1.0 - smoothstep(tree.z * 0.55, tree.z * 1.45, distance(p, tree.xy)));
  }
  float moonPatch = smoothstep(0.3, 0.7, fbm3(p / 130.0 + vec2(t * 0.01, 2.0)));
  col *= (0.56 + 0.28 * moonPatch) * (1.0 - 0.55 * shade);
  col += ORB * 0.2 * orb * (0.4 + 0.6 * smoothstep(0.0, 0.8, small.x + big.x));
  col *= 1.0 + 0.4 * t0;
  col = edgeHaze(col, vUv, 0.45);
  col += vec3(0.7, 1.0, 0.9) * revealGlow(p, 0.035) * 0.6;
  col += vec3(0.7, 1.0, 0.9) * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.05 foliage, 0.1 big leaf, 0.12 root bark, 2 and up a light at w - 1).
const FOLIAGE = [0.02, 0.075, 0.05, 0.05];
const FOLIAGE_LIT = [0.032, 0.12, 0.075, 0.05];
const BARK = [0.1, 0.075, 0.06, 0.12];
const LEAF = [0.025, 0.1, 0.06, 0.1];
const RIB = [0.16, 0.3, 0.22, 0.1];
const ORB_CORE = [0.9, 1.5, 1.1, 2.9];

/** One broad leaf: a pointed outline arching over a midrib, lying low. */
function broadLeaf(props, leaf, u) {
  const segments = 8;
  const along = [Math.cos(leaf.yaw), Math.sin(leaf.yaw)];
  const side = [-along[1], along[0]];
  const at = (s, across, z) => [leaf.x + along[0] * s * leaf.len + side[0] * across, leaf.y + along[1] * s * leaf.len + side[1] * across, z];
  for (let k = 0; k < segments; k += 1) {
    const s0 = k / segments;
    const s1 = (k + 1) / segments;
    const w0 = leaf.wid * Math.sin(Math.PI * s0) ** 0.75;
    const w1 = leaf.wid * Math.sin(Math.PI * s1) ** 0.75;
    const z0 = (7 + 12 * Math.sin(Math.PI * s0 ** 0.9)) * u;
    const z1 = (7 + 12 * Math.sin(Math.PI * s1 ** 0.9)) * u;
    props.quad(at(s0, -w0 / 2, z0 - 3 * u), at(s1, -w1 / 2, z1 - 3 * u), at(s1, 0, z1), at(s0, 0, z0), LEAF);
    props.quad(at(s0, 0, z0), at(s1, 0, z1), at(s1, w1 / 2, z1 - 3 * u), at(s0, w0 / 2, z0 - 3 * u), LEAF);
    props.quad(at(s0, -1.1 * u, z0 + 0.5), at(s1, -1.1 * u, z1 + 0.5), at(s1, 1.1 * u, z1 + 0.5), at(s0, 1.1 * u, z0 + 0.5), RIB);
  }
}

/** A great tree: a flared trunk on spreading roots, a crown of overlapping dark balls. */
function fairyTree(props, tree, u) {
  const trunkR = tree.r * 0.2;
  props.tube([[tree.x, tree.y, -3], [tree.x, tree.y, tree.h * 0.55]], [trunkR * 1.7, trunkR], BARK, { sides: 12 });
  for (let k = 0; k < 5; k += 1) {
    const angle = tree.seed * 6.28 + (k / 5) * 6.28;
    const reach = trunkR * (2.4 + 1.6 * hash(tree.seed, k, 2));
    props.tube(
      [
        [tree.x + Math.cos(angle) * trunkR * 0.5, tree.y + Math.sin(angle) * trunkR * 0.5, tree.h * 0.12],
        [tree.x + Math.cos(angle) * reach * 0.6, tree.y + Math.sin(angle) * reach * 0.6, 4 * u],
        [tree.x + Math.cos(angle) * reach, tree.y + Math.sin(angle) * reach, -2],
      ],
      [trunkR * 0.55, trunkR * 0.4, trunkR * 0.2],
      BARK,
      { sides: 8 }
    );
  }
  const balls = [[0, 0, 0.1, 1], [-0.62, 0.22, -0.15, 0.74], [0.58, -0.32, -0.1, 0.78], [0.12, 0.62, 0.0, 0.68], [-0.2, -0.62, 0.05, 0.7], [0.0, 0.0, 0.5, 0.62], [0.7, 0.4, 0.1, 0.56], [-0.7, -0.4, 0.0, 0.58]];
  balls.forEach(([dx, dy, dz, scale], k) => {
    props.sphere({ x: tree.x + dx * tree.r, y: tree.y + dy * tree.r, z: tree.h + dz * tree.r, r: tree.r * scale, color: k % 2 ? FOLIAGE_LIT : FOLIAGE, sides: 14, rings: 9, squash: 0.85 });
  });
}

/** Everything solid, as one prop geometry. */
export function fairyProps(spots) {
  const props = createPropBuilder();
  for (const tree of spots.trees) fairyTree(props, tree, spots.u);
  for (const leaf of spots.leaves) broadLeaf(props, leaf, spots.u);
  for (const orb of spots.orbs) props.sphere({ x: orb.x, y: orb.y, z: orb.z, r: orb.r * 0.5, color: ORB_CORE, sides: 12, rings: 8 });
  return props;
}

/** The props by night: teal-blue ambient, the orbs' green light on what faces them, foliage in dark lobes, leaves with a pale midrib. */
const PROP_LIGHT = /* glsl */ `
${VORONOI}
${FAIRY}
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 moon = normalize(uSun);
  float lit = max(dot(n, moon), 0.0);
  vec3 col = albedo * (vec3(0.5, 0.78, 0.78) * (0.55 + 0.45 * n.z) + vec3(0.7, 0.8, 1.0) * lit * 0.55);
  if (metal > 0.04 && metal < 0.06) {
    vec2 q = world.xy / 13.0 + world.z / 11.0;
    q += 0.35 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 9.1)) - 0.5);
    vec4 lobe = voronoiCell(q);
    float inLobe = 1.0 - smoothstep(0.34, 0.62, length(lobe.zw));
    float bulge = dot(normalize(n + vec3(-lobe.zw, 0.0) * 0.6 * inLobe), moon);
    col = albedo * (0.45 + 1.3 * smoothstep(-0.1, 0.8, bulge)) * mix(0.45, 1.0, smoothstep(0.0, 0.2, lobe.x)) * mix(0.45, 1.15, smoothstep(-0.3, 0.7, n.z));
    col += vec3(0.01, 0.035, 0.03) * smoothstep(0.6, 0.95, bulge);
  } else if (metal > 0.09 && metal < 0.11) {
    col = albedo * (0.6 + 0.8 * smoothstep(0.0, 1.0, lit + 0.3 * n.z));
    col += vec3(0.04, 0.1, 0.07) * pow(1.0 - n.z, 2.0);
  } else if (metal > 0.11 && metal < 0.13) {
    col = albedo * (0.6 + 0.8 * lit) * (0.8 + 0.4 * gnoise(vec2(atan(world.y, world.x) * 6.0, world.z / 30.0)));
  }
  // The orbs' green light on whatever faces them.
  col += ORB_GLOW * orbLight(world, uTime) * albedo * 2.2 * (0.5 + 0.5 * n.z);
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({
  light: `const vec3 ORB_GLOW = vec3(0.45, 1.0, 0.8);\n${PROP_LIGHT}`,
  reveal: 'vec3(0.7, 1.0, 0.9)',
});

/** The orbs: a soft round glow of green-white light, each breathing, drifting a little. */
export const ORB_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${FAIRY}
uniform float uFocal;
varying float vPulse;
void main() {
  vec4 orb = uOrbs[gl_VertexID];
  vec3 pos = vec3(orb.xy + vec2(sin(uTime * 0.4 + orb.x * 0.02), cos(uTime * 0.33 + orb.y * 0.02)) * 6.0, orb.z + sin(uTime * 0.6 + orb.x) * 5.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vPulse = 0.85 + 0.15 * sin(uTime * 1.3 + orb.y * 0.02);
  gl_PointSize = orb.w * 5.2 * uFocal / -mv.z * step(0.5, orb.w) * revealBurned(orb.xy) * exitKeep(orb.xy);
}
`;

export const ORB_FRAGMENT = /* glsl */ `
varying float vPulse;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.1, 0.3, d);
  float halo = exp(-d * d * 7.0) * 0.4 + exp(-d * d * 30.0) * 0.6;
  gl_FragColor = vec4((vec3(0.45, 1.1, 0.85) * halo + vec3(0.85, 1.0, 0.9) * core * 0.55) * vPulse * (1.0 - smoothstep(0.8, 1.0, d)), 1.0);
${OUTPUT}
}
`;

/** Sparkles: four-pointed twinkles drifting round the orbs and along the trees' edges, white and pale green. */
export const SPARKLE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
uniform vec4 uOrbs[${MAX_ORBS}];
attribute vec4 aSeed;
varying float vTwinkle;
varying float vTint;
void main() {
  float period = 8.0 + aSeed.w * 8.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  int pick = int(floor(aSeed.x * ${MAX_ORBS}.0));
  vec4 orb = uOrbs[pick];
  vec2 jitter = (hash22(aSeed.xy * 61.0 + cycle) - 0.5) * 340.0;
  vec3 pos = vec3(orb.xy + jitter, 18.0 + 150.0 * aSeed.y);
  // Each drifts along a slow curve, as the art's trails do.
  pos.xy += vec2(cos(life * 6.28 + aSeed.x * 9.0), sin(life * 5.0 + aSeed.y * 9.0)) * 46.0;
  pos.z += life * 30.0;
  float shown = step(0.5, orb.w) * revealBurned(pos.xy) * exitKeep(pos.xy);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vTwinkle = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.7, 1.0, life)) * (0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (2.0 + 4.0 * aSeed.z) + aSeed.x * 50.0), 3.0));
  vTint = step(0.78, aSeed.w);
  gl_PointSize = max((1.6 + 2.4 * aSeed.z) * uFocal / -mv.z, 2.0) * 3.2 * shown;
}
`;

export const SPARKLE_FRAGMENT = /* glsl */ `
varying float vTwinkle;
varying float vTint;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float cross = exp(-q.x * 16.0) * exp(-q.y * 2.2) + exp(-q.y * 16.0) * exp(-q.x * 2.2);
  float core = exp(-dot(q, q) * 16.0);
  vec3 tint = mix(vec3(1.0, 1.0, 1.05), vec3(0.8, 1.2, 0.7), vTint);
  gl_FragColor = vec4(tint * (cross * 0.8 + core) * vTwinkle * (1.0 - smoothstep(0.85, 1.0, max(q.x, q.y))), 1.0);
${OUTPUT}
}
`;

/** Fairy Garden's board (stadium-environment-mesh.js BOARDS). */
export function fairyGardenBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...FAIRY_MOON).normalize() },
    uRing: { value: new three.Vector3() },
    uUnit: { value: 1 },
    uOrbs: { value: Array.from({ length: MAX_ORBS }, () => new three.Vector4()) },
    uTrees: { value: Array.from({ length: MAX_TREES }, () => new three.Vector4()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    orbs: make(ORB_VERTEX, ORB_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    sparkles: make(SPARKLE_VERTEX, SPARKLE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const orbGeometry = new three.BufferGeometry();
  orbGeometry.setAttribute('position', new three.BufferAttribute(new Float32Array(MAX_ORBS * 3), 3));
  const orbs = new three.Points(orbGeometry, materials.orbs);
  orbs.renderOrder = 2;
  const sparkles = new three.Points(seeded(SPARKLE_COUNT), materials.sparkles);
  sparkles.renderOrder = 3;
  return {
    objects: [terrain, props, orbs, sparkles],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => fairySpots(layout),
    apply(spots, bounds) {
      own.uUnit.value = spots?.u ?? 1;
      own.uRing.value.set(spots?.ring?.x ?? 0, spots?.ring?.y ?? 0, spots?.ring?.r ?? 0);
      own.uOrbs.value.forEach((slot, i) => {
        const orb = spots?.orbs[i];
        return orb ? slot.set(orb.x, orb.y, orb.z, orb.r) : slot.set(0, 0, 0, 0);
      });
      own.uTrees.value.forEach((slot, i) => {
        const tree = spots?.trees[i];
        return tree ? slot.set(tree.x, tree.y, tree.r, tree.h) : slot.set(0, 0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, fairyProps(spots).build(three));
    },
  };
}
