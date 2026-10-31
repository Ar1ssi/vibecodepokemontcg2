// Design 077 (prototype): Grand Tree (customhb-376) after its card art (SCR 136, Ayumi Odashima): a
// jungle clearing in bright daylight under one vast ancient tree, its trunk a knot of twisting
// strands veined with glowing gold, its great roots crawling over the ground, a broad green crown
// shot with yellow light, ferns and big-leaved plants all round, a small tree beyond. The art looks
// up at the trunk; the board looks down on the clearing, so the cards lie on a mossy floor, the
// Grand Tree stands in the left band toward the far end (its crown spreading over the top-left
// corner, never over a card, its long shadow dappling the floor toward the right), its roots lie
// along the ground clear of every card, a smaller tree stands off the far right, ferns and broad
// leaves fill the margins, and golden motes rise off the roots.
// World scale: a card's footprint is a mossy flagstone of the clearing; the trunk is a card and a
// half through at its foot.
//
// Bake, once per layout: BAKE_FIELD is the flat floor (R height px; the roots' ridges are props);
// the shared light bake adds nothing. Per frame: TERRAIN paints the moss, earth, clover, the crown's
// dappled shadow and the glow round the roots; PROPS the trunk, roots, crown, small tree, ferns
// (stadium-env-props); MOTES the golden specks rising.
import {
  FILTERING,
  FOOTPRINTS,
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
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const GRAND_KEY = 'grand-tree';
/** The sun (toward it, table frame): high and a little from the far left, so the crown's shadow falls toward the cards, short and soft. */
export const GRAND_SUN = Object.freeze([-0.42, 0.28, 0.86]);
export const MAX_BALLS = 16;
export const MAX_ROOTS = 8;
export const MAX_LEAVES = 22;
const MOTE_COUNT = 60;
/** The trunk's radius at its foot and at its fork, the fork's height, the crown's height (card-scale px). */
export const TRUNK = Object.freeze({ foot: 70, top: 46, fork: 210, crown: 290 });

/**
 * Grand Tree's layout: the tree (trunk, roots, crown balls, limbs), the small tree, the ferns and
 * broad leaves. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function grandSpots(layout) {
  const ctx = boardContext(layout, GRAND_KEY);
  if (!ctx) return null;
  const { scene, table, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const gap = 18 * u;
  // The trunk stands left of the cards toward the far end, as far out as the scene allows.
  const x = Math.max(scene.x + 120 * u, Math.min(core.x - TRUNK.foot * u - 150 * u, centre.x - table.w * 0.42));
  const y = Math.min(core.y + core.h * 0.78, handEnd - 40 * u);
  const tree = { x, y, foot: TRUNK.foot * u, top: TRUNK.top * u, fork: TRUNK.fork * u, crownZ: TRUNK.crown * u };
  // Roots: long ones lie out over the ground along the compass, each cut short where a card would be.
  const roots = [];
  for (let k = 0; k < MAX_ROOTS; k += 1) {
    const angle = (k / MAX_ROOTS) * 2 * Math.PI + hash(x, k, 1) * 0.5;
    let length = (90 + 110 * hash(k, 3, 2)) * u;
    const endAt = (len) => [x + Math.cos(angle) * (tree.foot + len), y + Math.sin(angle) * (tree.foot + len)];
    while (length > 40 * u && !ctx.clear(...endAt(length), 14 * u, gap)) length -= 12 * u;
    roots.push({ angle, length, radius: (27 + 11 * hash(k, 3, 3)) * u, seed: hash(k, 3, 4) });
  }
  // The crown: balls on a dome over the top-left, kept clear of the cards (and the hand) seen from above.
  const balls = [];
  const spread = 220 * u;
  for (let k = 0; k < 40 && balls.length < MAX_BALLS; k += 1) {
    const roll = (salt) => hash(k, 6, salt);
    const bx = x + (roll(1) - 0.5) * 2 * spread;
    const by = y + (roll(2) - 0.4) * 1.5 * spread;
    const out = Math.hypot((bx - x) / spread, (by - y) / (spread * 0.9));
    if (out > 1) continue;
    const r = (62 + 40 * roll(3)) * (1.1 - 0.35 * out) * u;
    if (!ctx.inScene(bx, by, -r * 0.5) || !ctx.clear(bx, by, r + 30 * u, gap)) continue;
    balls.push({ x: bx, y: by, z: tree.crownZ + (roll(4) - 0.5) * 50 * u - 70 * u * out * out, r, seed: roll(5) });
  }
  // A smaller tree off the far right, ferns and broad leaves clear of everything.
  const small = { x: Math.min(scene.x + scene.w - 90 * u, centre.x + table.w * 0.44), y: Math.min(handEnd + 10 * u, scene.y + scene.h - 120 * u), r: 62 * u, h: 150 * u };
  // Design 080: the broad leaves grow in clumps, four or five fanning out from one root, as ferns do;
  // single leaves strewn at random read as litter thrown on the lawn.
  const leaves = [];
  for (let k = 0; k < 90 && leaves.length < MAX_LEAVES; k += 1) {
    const roll = (salt) => hash(k, 8, salt);
    const cx = scene.x + 40 * u + roll(1) * (scene.w - 80 * u);
    const cy = scene.y + 40 * u + roll(2) * (scene.h - 80 * u);
    const len = (66 + 36 * roll(3)) * u;
    if (!ctx.clear(cx, cy, len * 1.15, 12 * u)) continue;
    if (Math.hypot(cx - x, cy - y) < tree.foot + 40 * u + len) continue;
    if (leaves.some((leaf) => Math.hypot(cx - leaf.x, cy - leaf.y) < len * 2.4)) continue;
    const fronds = 4 + Math.floor(roll(6) * 2);
    const turn = roll(4) * 6.28;
    for (let f = 0; f < fronds && leaves.length < MAX_LEAVES; f += 1) {
      const flen = len * (0.75 + 0.35 * hash(k, f, 10));
      const yaw = turn + (f / fronds) * 6.28 + (hash(k, f, 9) - 0.5) * 0.5;
      leaves.push({ x: cx, y: cy, yaw, len: flen, wid: flen * 0.42, seed: hash(k, f, 11) });
    }
  }
  return { ...ctx, handEnd, tree, roots, balls, small, leaves };
}

const GRAND = /* glsl */ `
// The trunk's foot (x, y, radius, height of the crown); every crown ball (x, y, height, radius); the
// scale of a card (u); every root's end (x, y; 0 radius: none), for the glow they give the ground.
uniform vec4 uTree;
uniform vec4 uBalls[${MAX_BALLS}];
uniform float uUnit;
uniform vec4 uRootEnds[${MAX_ROOTS}];
// How much of the crown the sun leaves in shadow at p, 0..1: each ball's shadow is its disc thrown
// along the sun, broken into dapples where the crown is thin.
float crownShade(vec2 p, vec3 sun) {
  vec2 drift = sun.xy / sun.z;
  float shade = 0.0;
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    vec4 ball = uBalls[i];
    if (ball.w <= 0.0) continue;
    vec2 at = ball.xy - drift * ball.z;
    shade = max(shade, 1.0 - smoothstep(ball.w * 0.68, ball.w * 1.08, distance(p, at)));
  }
  vec2 base = uTree.xy;
  vec2 top = base - drift * uTree.w * 0.7;
  vec2 ab = top - base;
  float s = clamp(dot(p - base, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
  shade = max(shade, 1.0 - smoothstep(uTree.z * 0.7, uTree.z * 1.1, distance(p, base + ab * s)));
  return shade;
}
`;

/** Bake: the floor, flat. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = uMin + vUv * uSize;
  gl_FragColor = vec4(0.5 * (fbm3(p / 70.0) - 0.5), 0.0, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 MOSS = vec3(0.12, 0.263, 0.071);
const vec3 MOSS_DARK = vec3(0.046, 0.113, 0.054);
const vec3 GRASS = vec3(0.142, 0.345, 0.085);
const vec3 EARTH = vec3(0.16, 0.094, 0.046);
const vec3 EARTH_DARK = vec3(0.077, 0.055, 0.043);
const vec3 GLOW = vec3(1.0, 0.68, 0.08);
const vec3 SHADE_TINT = vec3(0.5, 0.66, 0.82);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${FILTERING}
${VORONOI}
${REVEAL}
${BLADES}
${EDGE_HAZE}
${PALETTE}
${GRAND}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float t = uTime;
  vec3 sun = normalize(uSun);
  float u = uUnit;

  // The floor: moss in broad cushions, earth showing between, clover and short grass in tufts.
  float cushion = smoothstep(0.3, 0.62, fbm3(p / 130.0 + 3.0));
  vec3 col = mix(MOSS_DARK * 1.1, MOSS, 0.4 + 0.6 * cushion);
  col = mix(col, EARTH_DARK * 1.4, (1.0 - cushion) * smoothstep(0.62, 0.78, fbm3(p / 70.0 + 8.0)) * 0.55);
  col *= 0.88 + 0.24 * fbm3(p / 24.0 + 5.0);
  // Leaf litter: small brown flakes lying flat among it, each a shade of its own. Design 080: litter,
  // tufts and clover thin out round the cards (moss cushions stay), and none draws finer than the
  // screen can show.
  float calm = fieldCalm(p, 110.0);
  vec4 litter = voronoiCell(p / (6.0 * u) + 9.1);
  col = mix(col, EARTH * (0.7 + 0.7 * fract(litter.y * 11.0)), (1.0 - smoothstep(0.1, 0.2, length(litter.zw * vec2(1.0, 1.7))))
    * step(fract(litter.y * 7.7), 0.1) * (1.0 - calm) * patternFade(filterPixel, 6.0 * u));
  vec4 tuft = voronoiCell(p / (11.0 * u) + 1.1);
  vec2 blades = bladeFan(-tuft.zw * 11.0 * u, tuft.y, 10.0 * u);
  col = mix(col, mix(MOSS_DARK, GRASS, blades.y), blades.x * step(fract(tuft.y * 23.1), 0.5 + 0.3 * cushion) * 0.9
    * (1.0 - 0.6 * calm) * patternFade(filterPixel, 11.0 * u));
  // Clover: small round leaf triples, paler.
  vec4 clover = voronoiCell(p / (7.5 * u) + 4.4);
  col = mix(col, GRASS * 1.15, (1.0 - smoothstep(0.1, 0.22, length(clover.zw))) * step(fract(clover.y * 13.7), 0.14) * 0.8
    * (1.0 - 0.7 * calm) * patternFade(filterPixel, 7.5 * u));

  // The light: the sun's patches through the crown, dappled where it thins; the shade is cool and deep.
  float shade = crownShade(p, sun);
  // The dapple drifts slowly in broad flecks; over the cards it is faint.
  float dapple = smoothstep(0.35, 0.65, fbm3((p - vec2(t * 1.2, 0.0)) / 34.0 + 2.0));
  shade *= mix(1.0, 0.55 + 0.45 * dapple, 0.85 * (1.0 - 0.6 * calm)) * vGrowth;
  col = mix(col * 1.12, col * SHADE_TINT * 0.82, shade * 0.85);

  // The glow of the roots and the trunk's foot, golden on the ground near them.
  float glow = 0.0;
  for (int i = 0; i < ${MAX_ROOTS}; i++) {
    vec4 end = uRootEnds[i];
    if (end.z <= 0.0) continue;
    vec2 a = uTree.xy;
    vec2 ab = end.xy - a;
    float s = clamp(dot(p - a, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
    float d = distance(p, a + ab * s);
    glow = max(glow, exp(-pow(d / (18.0 * u + 12.0 * u * (1.0 - s)), 2.0)) * (1.0 - 0.6 * s));
  }
  glow = max(glow, exp(-pow(distance(p, uTree.xy) / (uTree.z * 2.0), 2.0)) * 0.9);
  col += GLOW * 0.2 * glow * (0.95 + 0.05 * sin(t * 0.6 + p.x * 0.02));

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.9, 1.0, 0.6);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.05 foliage, 0.12 bark, 0.1 leaf, 2 and up a light at w - 1).
const BARK = [0.16, 0.094, 0.046, 0.12];
const BARK_DARK = [0.077, 0.055, 0.043, 0.12];
const ROOT = [0.263, 0.142, 0.071, 0.12];
const VEIN = [1.0, 0.68, 0.08, 2.6];
const FOLIAGE = [0.068, 0.226, 0.063, 0.05];
const FOLIAGE_LIT = [0.14, 0.34, 0.07, 0.05];
const LEAF = [0.085, 0.345, 0.101, 0.1];
const LEAF_RIB = [0.35, 0.55, 0.2, 0.1];
const SMALL_FOLIAGE = [0.057, 0.2, 0.06, 0.05];

/** The trunk at height s (0 foot, 1 fork): its radius, tapering and flaring at the foot. */
const trunkRadius = (tree, s) => tree.top + (tree.foot - tree.top) * (1 - s) ** 1.6 + tree.foot * 0.22 * Math.exp(-s * 9);

/** The trunk: strands twisting round each other up from the foot, gold veins creeping along some. */
function trunk(props, tree, u) {
  const strands = 6;
  const levels = 16;
  for (let k = 0; k < strands; k += 1) {
    const phase = (k / strands) * 2 * Math.PI + 0.3;
    const twist = 1.7 + 0.25 * hash(k, 2, 1);
    const points = [];
    const radii = [];
    for (let i = 0; i <= levels; i += 1) {
      const s = i / levels;
      const R = trunkRadius(tree, s);
      const angle = phase + twist * s * 2 * Math.PI * 0.5;
      const around = R * (0.52 - 0.12 * s);
      points.push([tree.x + Math.cos(angle) * around, tree.y + Math.sin(angle) * around, -4 + s * tree.fork]);
      radii.push(R * (0.58 - 0.1 * s));
    }
    props.tube(points, radii, k % 2 ? BARK : BARK_DARK, { sides: 12 });
    // A gold vein lying along every other strand's flank.
    if (k % 2 === 0) {
      const vein = points.map((p, i) => {
        const s = i / levels;
        const R = radii[i];
        const angle = phase + twist * s * Math.PI + 0.9;
        return [p[0] + Math.cos(angle) * R * 0.92, p[1] + Math.sin(angle) * R * 0.92, p[2]];
      });
      props.tube(vein.slice(2), 4.2 * u, VEIN, { sides: 6 });
    }
  }
  props.cylinder({ x: tree.x, y: tree.y, z0: tree.fork - 6 * u, z1: tree.fork + 4 * u, r: tree.top * 1.05, color: BARK, capColor: BARK_DARK, sides: 16 });
}

/** Roots: thick tubes arching out of the trunk's foot over the ground and diving into it, a vein along some. */
function roots(props, spots, u) {
  const { tree } = spots;
  for (const root of spots.roots) {
    const dir = [Math.cos(root.angle), Math.sin(root.angle)];
    const steps = 9;
    const points = [];
    const radii = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = i / steps;
      const out = tree.foot * 0.5 + (tree.foot * 0.5 + root.length) * s;
      const wander = Math.sin(s * 5 + root.seed * 9) * 10 * u * s;
      points.push([
        tree.x + dir[0] * out - dir[1] * wander,
        tree.y + dir[1] * out + dir[0] * wander,
        (1 - s) ** 1.2 * 52 * u * (1 - root.seed * 0.3) + root.radius * 0.5 * (1 - s) - 6 * s * u,
      ]);
      radii.push(root.radius * (1 - 0.78 * s ** 0.8));
    }
    props.tube(points, radii, ROOT, { sides: 9 });
    if (root.seed > 0.3) props.tube(points.slice(1, 7).map((p, i) => [p[0], p[1], p[2] + radii[i + 1] * 0.9]), 3.6 * u, VEIN, { sides: 6 });
  }
}

/** The crown: limbs from the fork out to each ball, the balls of foliage themselves. */
function crown(props, spots, u) {
  const { tree, balls } = spots;
  const fork = [tree.x, tree.y, tree.fork];
  for (const ball of balls) {
    const mid = [(fork[0] + ball.x) / 2, (fork[1] + ball.y) / 2, (fork[2] + ball.z) / 2 + 20 * u];
    props.tube([fork, mid, [ball.x, ball.y, ball.z - ball.r * 0.4]], [tree.top * 0.4, tree.top * 0.28, tree.top * 0.14], BARK, { sides: 9 });
  }
  balls.forEach((ball, k) => {
    props.sphere({ x: ball.x, y: ball.y, z: ball.z, r: ball.r, color: k % 3 ? FOLIAGE : FOLIAGE_LIT, sides: 16, rings: 10, squash: 0.82 });
    props.sphere({ x: ball.x + ball.r * 0.2, y: ball.y - ball.r * 0.15, z: ball.z + ball.r * 0.42, r: ball.r * 0.68, color: FOLIAGE_LIT, sides: 14, rings: 9, squash: 0.8 });
  });
}

/** A fern or broad leaf lying low, its pale midrib raised. */
function broadLeaf(props, leaf, u) {
  const along = [Math.cos(leaf.yaw), Math.sin(leaf.yaw)];
  const side = [-along[1], along[0]];
  const at = (s, across, z) => [leaf.x + along[0] * s * leaf.len + side[0] * across, leaf.y + along[1] * s * leaf.len + side[1] * across, z];
  for (let k = 0; k < 8; k += 1) {
    const s0 = k / 8;
    const s1 = (k + 1) / 8;
    const w0 = leaf.wid * Math.sin(Math.PI * s0) ** 0.75;
    const w1 = leaf.wid * Math.sin(Math.PI * s1) ** 0.75;
    const z0 = (8 + 16 * Math.sin(Math.PI * s0 ** 0.85)) * u;
    const z1 = (8 + 16 * Math.sin(Math.PI * s1 ** 0.85)) * u;
    props.quad(at(s0, -w0 / 2, z0 - 4 * u), at(s1, -w1 / 2, z1 - 4 * u), at(s1, 0, z1), at(s0, 0, z0), LEAF);
    props.quad(at(s0, 0, z0), at(s1, 0, z1), at(s1, w1 / 2, z1 - 4 * u), at(s0, w0 / 2, z0 - 4 * u), LEAF);
    props.quad(at(s0, -0.9 * u, z0 + 0.4), at(s1, -0.9 * u, z1 + 0.4), at(s1, 0.9 * u, z1 + 0.4), at(s0, 0.9 * u, z0 + 0.4), LEAF_RIB);
  }
}

/** Everything solid, as one prop geometry. */
export function grandProps(spots) {
  const { tree, small, leaves, u } = spots;
  const props = createPropBuilder();
  trunk(props, tree, u);
  roots(props, spots, u);
  crown(props, spots, u);
  props.tube([[small.x, small.y, -3], [small.x, small.y, small.h * 0.55]], [9 * u, 6 * u], BARK, { sides: 10 });
  for (const [dx, dy, dz, s] of [[0, 0, 0.1, 1], [-0.6, 0.2, -0.1, 0.72], [0.55, -0.3, -0.05, 0.76], [0.1, 0.6, 0, 0.64]]) {
    props.sphere({ x: small.x + dx * small.r, y: small.y + dy * small.r, z: small.h + dz * small.r, r: small.r * s, color: SMALL_FOLIAGE, sides: 14, rings: 9, squash: 0.85 });
  }
  for (const leaf of leaves) broadLeaf(props, leaf, u);
  return props;
}

/** The props in the sun: warm light, blue sky fill, foliage in lit lobes, bark furrowed and mossy, the veins aglow. */
const PROP_LIGHT = /* glsl */ `
${VORONOI}
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  float lit = max(dot(n, sun), 0.0);
  vec3 sky = vec3(0.5, 0.62, 0.85) * (0.6 + 0.4 * n.z);
  vec3 col = albedo * (sky + vec3(1.1, 1.0, 0.86) * lit * 0.85);
  if (metal > 0.04 && metal < 0.06) {
    vec2 q = world.xy / 14.0 + world.z / 11.0;
    q += 0.35 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 9.1)) - 0.5);
    vec4 lobe = voronoiCell(q);
    float inLobe = 1.0 - smoothstep(0.34, 0.62, length(lobe.zw));
    float bulge = dot(normalize(n + vec3(-lobe.zw, 0.0) * 0.6 * inLobe), sun);
    float crown = smoothstep(-0.3, 0.7, n.z);
    col = albedo * (0.42 + 1.1 * smoothstep(-0.1, 0.8, bulge)) * mix(0.62, 1.0, smoothstep(0.0, 0.2, lobe.x)) * (sky * 0.5 + 0.55) * mix(0.5, 1.1, crown);
    col += vec3(0.16, 0.14, 0.01) * smoothstep(0.55, 0.95, bulge) * crown;
  } else if (metal > 0.11 && metal < 0.13) {
    // Bark: furrows running along it, moss on whatever faces up.
    float furrow = gnoise(vec2(atan(world.y, world.x) * 9.0 + world.z * 0.02, world.z / 26.0));
    col *= 0.62 + 0.7 * smoothstep(0.25, 0.7, furrow);
    float moss = smoothstep(0.55, 0.85, n.z) * smoothstep(0.38, 0.62, gnoise(world.xy / 8.0 + 3.0));
    col = mix(col, vec3(0.12, 0.26, 0.07) * (sky + 0.5), moss * 0.7);
    // The gold's light on the bark near a vein.
    col += vec3(0.9, 0.55, 0.05) * 0.1 * pow(1.0 - n.z * n.z, 1.0) * smoothstep(60.0, 0.0, world.z);
  } else if (metal > 0.09 && metal < 0.11) {
    col = albedo * (0.7 + 0.5 * lit) * (0.9 + 0.2 * gnoise(world.xy / 6.0));
  }
  col *= mix(0.84, 1.0, smoothstep(0.0, 18.0, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(0.9, 1.0, 0.6)' });

/** Golden motes rising off the roots, drifting a little as they climb, fading at either end of their life. */
export const MOTE_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${REVEAL}
${GRAND}
uniform float uFocal;
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 6.0 + aSeed.w * 5.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 jitter = hash22(aSeed.xy * 83.0 + cycle) - 0.5;
  float reach = uTree.z * 3.2;
  vec3 pos = vec3(uTree.xy + jitter * reach * 2.0, 4.0 + life * (70.0 + 80.0 * aSeed.y));
  pos.xy += vec2(sin(life * 4.0 + aSeed.x * 30.0), cos(life * 3.0 + aSeed.y * 30.0)) * 9.0 * life;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vLife = life;
  // Design 080: the motes rise round the roots, none beside a card.
  float shown = revealBurned(pos.xy) * exitKeep(pos.xy) * (1.0 - fieldCalm(pos.xy, 60.0));
  gl_PointSize = max((1.4 + 1.5 * aSeed.z) * uFocal / -mv.z, 2.0) * 2.4 * shown;
}
`;

export const MOTE_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.25, 0.5, d);
  float halo = exp(-d * d * 3.5) * 0.5;
  float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
  gl_FragColor = vec4(vec3(1.1, 0.85, 0.25) * (core + halo) * fade, 1.0);
${OUTPUT}
}
`;

/** Grand Tree's board (stadium-environment-mesh.js BOARDS). */
export function grandTreeBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...GRAND_SUN).normalize() },
    uTree: { value: new three.Vector4() },
    uBalls: { value: Array.from({ length: MAX_BALLS }, () => new three.Vector4()) },
    uRootEnds: { value: Array.from({ length: MAX_ROOTS }, () => new three.Vector4()) },
    uUnit: { value: 1 },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    motes: make(MOTE_VERTEX, MOTE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const motes = new three.Points(seeded(MOTE_COUNT), materials.motes);
  motes.renderOrder = 2;
  return {
    objects: [terrain, props, motes],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => grandSpots(layout),
    apply(spots, bounds) {
      own.uUnit.value = spots?.u ?? 1;
      const tree = spots?.tree;
      own.uTree.value.set(tree?.x ?? 0, tree?.y ?? 0, tree?.foot ?? 0, tree?.crownZ ?? 0);
      own.uBalls.value.forEach((slot, i) => {
        const ball = spots?.balls[i];
        return ball ? slot.set(ball.x, ball.y, ball.z, ball.r) : slot.set(0, 0, 0, 0);
      });
      own.uRootEnds.value.forEach((slot, i) => {
        const root = spots?.roots[i];
        if (!root || !tree) return slot.set(0, 0, 0, 0);
        const out = tree.foot + root.length;
        return slot.set(tree.x + Math.cos(root.angle) * out, tree.y + Math.sin(root.angle) * out, 1, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, grandProps(spots).build(three));
    },
  };
}
