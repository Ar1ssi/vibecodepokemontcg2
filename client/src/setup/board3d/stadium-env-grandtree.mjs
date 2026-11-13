// Design 077 (prototype): Grand Tree after its card art (SCR 136, Ayumi Odashima): a
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
// Design 081: every solid is the Stadium kit's (stadium-kit.mjs, stadium-kit-assets.mjs): the strands,
// roots and limbs plain bark, the crown's balls, the small tree, the fern clumps and a few toadstools.
// Design 082 (Brilliant Diamond / Shining Pearl): the crown is leafy lumps, dark in their creases;
// the floor is the ground kit's clover grass, a deep jungle green.
//
// Design 084 (the visual audit): a jungle clearing, not a lawn: big-leaf plants, ferns and bushes in
// two or three sizes crowd a band round the table's edge, the floor darker there, so the open middle
// reads as the clearing; the floor a warmer, more contrasty mossy soil and grass (set apart from Forest
// of Vitality's meadow); the gold veins glow (emissive, with contact glow on the floor beside each
// root and round the trunk's foot, the shared GLOW); the trunk a tighter knot of six twisting strands;
// the crown bigger, overhanging the table (kept off each card only); one warm low sun from the top
// left, so the roots throw long soft shadows.
// Bake, once per layout: BAKE_FIELD is the flat floor (R height px; the roots' ridges are props);
// the shared light bake adds nothing. Per frame: TERRAIN paints the moss, earth, the crown's
// shadow and the glow round the roots; the kit's meshes the trunk, roots, crown, small tree, ferns
// and toadstools; MOTES the golden specks rising.
import {
  FILTERING,
  FOOTPRINTS,
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_UNIFORMS,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { LOOK, createPropBuilder } from './stadium-env-props.mjs';
import { RISE_LEAN, boardContext, distanceToRect, frameWeight, hash, shuffled, visibleArea } from './stadium-env-spots.mjs';
import { clumpPieces, scaledKinds } from './stadium-env-clumps.mjs';
import { EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';
import { GLOW, GRASS, LIGHT_MOTION } from './stadium-env-ground.mjs';
import { KEY_GAIN, createKitProps, glslColour, paint } from './stadium-kit.mjs';
import { SHADOW_SLIDE, measureAsset, placeAsset } from './stadium-kit-assets.mjs';

export const GRAND_KEY = 'grand-tree';
/**
 * The sun (toward it, table frame): design 084, one warm low sun from the top left (~40° up), so the
 * roots and the crown throw long soft shadows across the floor toward the cards.
 */
export const GRAND_SUN = Object.freeze([-0.58, 0.46, 0.67]);
/** Design 084: the veins' gold, emissive (the art's, the audit's #ffcf5a), and its contact glow on the floor round the trunk. */
export const VEIN_GOLD = '#ffcf5a';
export const TRUNK_GLOW = Object.freeze({ reach: 2.6, strength: 0.7, breath: 0.12 });
/** Design 084: the jungle band round the table's edge starts this far past the cards' box (card-scale px). */
export const JUNGLE_FROM_PX = 120;
export const MAX_BALLS = 24;
export const MAX_ROOTS = 8;
/** Design 083: the most clump pieces (ferns, bushes, flowers, rocks, toadstools) over the floor; design 084: the jungle band's. */
export const GRAND_CLUMP_CAP = 36;
export const JUNGLE_CAP = 70;
/** Design 083: the highest the floor swells under a prop (3 + 11 px past the cards and roots, plus the ripple). */
export const GRAND_GROUND_CEILING_PX = 15;
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
  const spread = 285 * u;
  for (let k = 0; k < 80 && balls.length < MAX_BALLS; k += 1) {
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
  // Design 083: ferns, bushes, flowers, rocks and toadstools in clumps over the bare clover (a hero
  // piece and its satellites, gathered where patchy() runs thick), clear of the cards and the hand
  // with their lean on screen, of the trunk and its roots, and of the small tree.
  const pieces = clumpPieces(visibleArea(table, scene, 0.15) ?? scene, {
    step: 170 * u,
    mix: scaledKinds(CLUMP_MIX, u),
    satellites: scaledKinds(CLUMP_SATELLITES, u),
    thick: 0.95,
    cap: GRAND_CLUMP_CAP,
    salt: 61,
    fits: (cx, cy, reach, height) =>
      ctx.inScene(cx, cy, reach * 0.5) &&
      distanceToRect(cx, cy, core) >= reach + 24 * u &&
      ctx.clear(cx, cy, reach + RISE_LEAN * (height + GRAND_GROUND_CEILING_PX), 12 * u) &&
      Math.hypot(cx - x, cy - y) >= tree.foot + 230 * u + reach &&
      Math.hypot(cx - small.x, cy - small.y) >= small.r + reach,
  });
  // Design 084: the jungle closing round the clearing: a band of big-leaf plants (the kit's fern at its
  // biggest), smaller ferns and bushes in two or three sizes, out past the cards' box by JUNGLE_FROM_PX,
  // thickest where the frame shows it, clear of the trunk, the roots, the small tree and the clumps.
  const taken = pieces.map((piece) => ({ x: piece.x, y: piece.y, r: piece.reach }));
  const jungle = clumpPieces(visibleArea(table, scene, 0.15) ?? scene, {
    step: 118 * u,
    mix: scaledKinds(JUNGLE_MIX, u),
    satellites: scaledKinds(JUNGLE_SATELLITES, u),
    thick: 0.5,
    count: [2, 4],
    cap: JUNGLE_CAP,
    spacing: 0.7,
    salt: 131,
    taken,
    weight: (cx) => 0.65 + 0.35 * frameWeight(cx, table),
    fits: (cx, cy, reach, height) =>
      ctx.inScene(cx, cy, reach * 0.4) &&
      distanceToRect(cx, cy, core) >= JUNGLE_FROM_PX * u + reach &&
      ctx.clear(cx, cy, reach + RISE_LEAN * (height + GRAND_GROUND_CEILING_PX), 12 * u) &&
      Math.hypot(cx - x, cy - y) >= tree.foot + 200 * u + reach &&
      Math.hypot(cx - small.x, cy - small.y) >= small.r + reach,
  });
  // Design 084: the trunk's gold lights the floor round its foot (the shared contact glow).
  const glows = [{ x, y, r: tree.foot * TRUNK_GLOW.reach + 90 * u, colour: VEIN_GOLD, strength: TRUNK_GLOW.strength, breath: TRUNK_GLOW.breath }];
  const toadstools = [];
  for (let k = 0; k < 9 && toadstools.length < 4; k += 1) {
    const angle = hash(k, x, 81) * 2 * Math.PI;
    const out = tree.foot * (1.6 + 0.9 * hash(k, y, 82));
    const tx = x + Math.cos(angle) * out;
    const ty = y + Math.sin(angle) * out;
    const size = (8 + 4 * hash(k, 3, 83)) * u;
    if (!ctx.inScene(tx, ty, size) || !ctx.clear(tx, ty, size * 1.1, 12 * u)) continue;
    if (toadstools.some((t) => Math.hypot(t.x - tx, t.y - ty) < 30 * u)) continue;
    toadstools.push({ x: tx, y: ty, size, seed: hash(k, 4, 84) });
  }
  // Design 083: leaves fall from the crown's balls and the small tree.
  const driftEmitters = [...shuffled(balls, 3).slice(0, 9).map((ball) => ({ x: ball.x, y: ball.y, r: ball.r, z: ball.z })), { x: small.x, y: small.y, r: small.r, z: small.h }];
  return { ...ctx, handEnd, tree, roots, balls, small, pieces, jungle, toadstools, driftEmitters, glows };
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

/**
 * Bake: the floor, flat round the cards and the tree; design 083: past them it rises in low soft
 * swells (3 + 11 px of noise), so the clumps stand on hummocks of the forest floor.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform vec4 uTree;
uniform float uUnit;
varying vec2 vUv;
${NOISE}
${FOOTPRINTS}
void main() {
  vec2 p = uMin + vUv * uSize;
  float away = smoothstep(90.0, 240.0, footprintDistance(p)) * smoothstep(uTree.z + 200.0 * uUnit, uTree.z + 330.0 * uUnit, distance(p, uTree.xy));
  float h = 0.5 * (fbm3(p / 70.0) - 0.5) + away * (3.0 + 11.0 * fbm3(p / 210.0 + 3.0));
  gl_FragColor = vec4(h, 0.0, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The floor in BDSP's jungle greens (authored as shown), the glow the card art's gold.
const PALETTE = /* glsl */ `
// Design 084: warmer, more contrasty yellow-green moss over dark soil (set apart from Vitality's lawn).
const vec3 MOSS = ${glslColour('#6fae36')};
const vec3 MOSS_LIT = ${glslColour('#a3c840')};
const vec3 SOIL = ${glslColour('#5e4a2c')};
const vec3 UNDERGROWTH = ${glslColour('#2f5a2a')};
const vec3 GLOW = vec3(1.0, 0.68, 0.08);
const vec3 SHADE_TINT = vec3(0.5, 0.66, 0.82);
const vec3 FALLEN_LEAF = ${glslColour('#c99a3a')};
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FILTERING}
${FOOTPRINTS}
${REVEAL}
${EDGE_HAZE}
${GRASS}
${LIGHT_MOTION}
${GLOW}
${PALETTE}
${GRAND}
uniform float uJungle;
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

  // The floor (design 082): BDSP's clover grass; ferns and toadstools are the kit's solids. Design 084:
  // a mossy forest floor, warm yellow-green moss in broad patches with dark soil showing between them
  // out past the cards; darker toward the jungle round the clearing's edge.
  float calm = fieldCalm(p, 110.0);
  vec3 col = cloverGrass(p, mix(MOSS * 0.85, MOSS_LIT, smoothstep(0.35, 0.72, fbm3(p / 210.0 + 8.0))), calm);
  float soil = smoothstep(0.56, 0.72, fbm3(p / 95.0 + 4.0)) * (1.0 - calm);
  col = mix(col, SOIL * (0.85 + 0.3 * gnoise(p / 30.0)), soil * 0.7);
  float edge = smoothstep(uJungle * 0.6, uJungle * 1.5, length(max(max(uFootprintBox.xy - p, p - uFootprintBox.zw), 0.0)));
  col = mix(col, UNDERGROWTH * (0.9 + 0.2 * fbm3(p / 60.0)), edge * 0.55);

  // The light: the sun's patches through the crown, dappled where it thins; the shade is cool and deep.
  float shade = crownShade(p, sun);
  // A few broad soft gaps of sun where the crown is thin; over the cards the shade is faint.
  float gap = smoothstep(0.6, 0.72, fbm3(p / 120.0 + 2.0));
  shade *= mix(1.0, 1.0 - 0.6 * gap, 1.0 - 0.6 * calm) * vGrowth;
  col = mix(col * 1.12, col * SHADE_TINT * 0.82, shade * 0.85);
  // Off the whole block of cards (the field between their rows too), not only off each card.
  float open = smoothstep(40.0, 140.0, length(max(max(uFootprintBox.xy - p, p - uFootprintBox.zw), 0.0)));
  // Design 083: sun flecks through the crown, shifting as its leaves move; none near the cards.
  col *= 1.0 + 0.3 * dapple(p, t, 22.0) * shade * open;
  // A few fallen leaves on the floor, more under the crown; none near the cards.
  vec2 cell = floor(p / 26.0);
  vec2 jitter = hash22(cell + 41.0);
  vec2 local = p - (cell + 0.2 + 0.6 * jitter) * 26.0;
  float turn = jitter.x * 6.2832;
  vec2 along = vec2(cos(turn) * local.x + sin(turn) * local.y, -sin(turn) * local.x + cos(turn) * local.y);
  float fallen = (1.0 - smoothstep(0.75, 1.0, length(along / vec2(4.6, 2.2)))) * step(0.82 - 0.12 * shade, hash12(cell + 7.0));
  col = mix(col, FALLEN_LEAF * (0.8 + 0.4 * jitter.y), fallen * 0.55 * open * patternFade(filterPixel, 26.0));

  // The glow of the roots and the trunk's foot, golden on the ground near them. Design 084: the veins
  // are lights, so the floor beside each root is lit gold (tinting what it falls on), and the trunk's
  // foot pools in it (the shared contact glow).
  float glow = 0.0;
  for (int i = 0; i < ${MAX_ROOTS}; i++) {
    vec4 end = uRootEnds[i];
    if (end.z <= 0.0) continue;
    vec2 a = uTree.xy;
    vec2 ab = end.xy - a;
    float s = clamp(dot(p - a, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
    float d = distance(p, a + ab * s);
    glow = max(glow, exp(-pow(d / (24.0 * u + 14.0 * u * (1.0 - s)), 2.0)) * (1.0 - 0.55 * s));
  }
  float pulse = 0.94 + 0.06 * sin(t * 0.6 + p.x * 0.02);
  col += (col * 1.4 + 0.04) * GLOW * 0.38 * glow * pulse * vGrowth;
  col = glowOn(col, p);

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.9, 1.0, 0.6);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours, BDSP's (aColor, linear; w 2 and up a light at w - 1): the veins the card art's gold.
const BARK = paint('#6e4a2c');
const BARK_DARK = paint('#57391f');
const ROOT = paint('#86592f');
// Design 084: the veins a light (w 2 and up) in the art's gold, bright enough to bloom.
const VEIN = [...paint(VEIN_GOLD, 2).slice(0, 3).map((v) => v * KEY_GAIN), 3.4];
const FOLIAGE = paint('#3a9a3c');
const FOLIAGE_LIT = paint('#79c446');
const FERN = Object.freeze({ leaf: '#3fa03a', leafLight: '#7fcb4c', heart: '#2a6e2c' });
// Design 083: what the floor's clumps are made of (sizes card-scale px), and their satellites.
const CLUMP_MIX = Object.freeze([
  { asset: 'fern', weight: 3, size: [62, 96], options: { fronds: 6, colors: FERN } },
  { asset: 'bush', weight: 2, size: [26, 42], options: { colors: { leaf: '#3c9a3c', leafLight: '#78c64a' } } },
  { asset: 'boulder', weight: 0.7, size: [14, 24], options: { colors: { body: '#9a8f78', light: '#c4b898', dark: '#5e5646' } } },
]);
const CLUMP_SATELLITES = Object.freeze([
  { asset: 'fern', weight: 2, size: [40, 64], options: { fronds: 5, colors: FERN } },
  { asset: 'bush', weight: 1.4, size: [18, 30], options: { colors: { leaf: '#46a23e', leafLight: '#8acd4e' } } },
  { asset: 'flowers', weight: 1.6, size: [10, 15], options: { petals: ['#ffd84a', '#fff7ec', '#f7a1c4'] } },
  { asset: 'mushroom', weight: 1, size: [6, 10], options: { colors: { cap: '#f2b33d', spot: '#fff6e0' } } },
]);
const SMALL_TREE = Object.freeze({ leaf: '#3a9640', leafLight: '#6fc244', bark: BARK, barkDark: BARK_DARK });
// Design 084: the jungle round the clearing: big-leaf plants (the kit's fern at its biggest), ferns and
// bushes in the art's deep and fresh greens, two or three sizes each.
const JUNGLE_FERN = Object.freeze({ leaf: '#2f8a36', leafLight: '#6fbf45', heart: '#1f5a26' });
const JUNGLE_MIX = Object.freeze([
  { asset: 'fern', weight: 2.5, size: [96, 132], options: { fronds: 7, colors: JUNGLE_FERN }, spread: 0.12, lean: 0.06 },
  { asset: 'bush', weight: 2, size: [34, 52], options: { colors: { leaf: '#2e7f34', leafLight: '#68b847' } }, spread: 0.18, lean: 0.05 },
  { asset: 'fern', weight: 1.5, size: [60, 84], options: { fronds: 6, colors: FERN }, spread: 0.15, lean: 0.08 },
]);
const JUNGLE_SATELLITES = Object.freeze([
  { asset: 'fern', weight: 2, size: [44, 66], options: { fronds: 5, colors: FERN }, spread: 0.15, lean: 0.08 },
  { asset: 'bush', weight: 1.6, size: [22, 34], options: { colors: { leaf: '#3a8f38', leafLight: '#7cc44a' } }, spread: 0.2, lean: 0.05 },
]);

/** The trunk at height s (0 foot, 1 fork): its radius, tapering and flaring at the foot. */
const trunkRadius = (tree, s) => tree.top + (tree.foot - tree.top) * (1 - s) ** 1.6 + tree.foot * 0.22 * Math.exp(-s * 9);

/**
 * The trunk: strands twisting round each other up from the foot, gold veins creeping along some.
 * Design 084: a tighter knot, as the card's: six strands set apart (a dark groove between each),
 * turning most of a full turn on the way up, each swelling and thinning along its run.
 */
function trunk(props, tree, u) {
  const strands = 6;
  const levels = 20;
  for (let k = 0; k < strands; k += 1) {
    const phase = (k / strands) * 2 * Math.PI + 0.3;
    const twist = 2.6 + 0.4 * hash(k, 2, 1);
    const points = [];
    const radii = [];
    for (let i = 0; i <= levels; i += 1) {
      const s = i / levels;
      const R = trunkRadius(tree, s);
      const angle = phase + twist * s * 2 * Math.PI * 0.5;
      const around = R * (0.6 - 0.14 * s);
      points.push([tree.x + Math.cos(angle) * around, tree.y + Math.sin(angle) * around, -4 + s * tree.fork]);
      radii.push(R * (0.5 - 0.08 * s) * (1 + 0.12 * Math.sin(s * 9 + k * 1.7)));
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
    // Design 084: the root's long soft shadow along the floor, thrown away from the low sun.
    const lift = Math.max(GRAND_SUN[2], 0.25);
    const slide = [(-GRAND_SUN[0] / lift) * SHADOW_SLIDE * 2.2, (-GRAND_SUN[1] / lift) * SHADOW_SLIDE * 2.2];
    for (let i = 1; i < steps; i += 2) {
      const [px, py, pz] = points[i];
      props.shadow({ x: px + slide[0] * pz, y: py + slide[1] * pz, rx: radii[i] * 1.5 + pz * 0.25, ry: radii[i] * 1.1, yaw: root.angle, strength: 0.5 });
    }
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
  // Each ball a leafy lump, a lighter one on its sunward top (the art's yellow light), the crown
  // dark in the creases between them; built about the trunk so the leaves on its flat tops lie
  // outward from it.
  const [sx, sy] = GRAND_SUN;
  const lumps = balls.flatMap((ball) => {
    const [x, y] = [ball.x - tree.x, ball.y - tree.y];
    return [
      { x, y, z: ball.z, rx: ball.r, rz: ball.r * 0.82, color: FOLIAGE },
      { x: x + sx * ball.r * 0.3, y: y + sy * ball.r * 0.3, z: ball.z + ball.r * 0.4, rx: ball.r * 0.62, rz: ball.r * 0.5, color: FOLIAGE_LIT },
    ];
  });
  props.at({ x: tree.x, y: tree.y, ground: false }, () =>
    props.look({ kind: LOOK.foliage, leaf: 12 * u }, () => props.lumps(lumps, { crease: 0.5 }))
  );
}

/** Everything solid, as one kit builder (design 081). */
export function grandProps(spots) {
  const { tree, small, toadstools, u } = spots;
  const props = createPropBuilder();
  const kit = { sun: GRAND_SUN };
  trunk(props, tree, u);
  roots(props, spots, u);
  crown(props, spots, u);
  placeAsset(props, 'treeRound', { ...kit, x: small.x, y: small.y, size: small.r * 0.95, height: small.h + small.r * 0.5, seed: 7, colors: SMALL_TREE });
  for (const piece of spots.pieces) placeAsset(props, piece.asset, { ...kit, ...piece.options, x: piece.x, y: piece.y, size: piece.size, seed: piece.seed * 997, yaw: piece.yaw });
  for (const piece of spots.jungle ?? []) {
    placeAsset(props, piece.asset, { ...kit, ...piece.options, x: piece.x, y: piece.y, size: piece.size, seed: piece.seed * 983, yaw: piece.yaw, lean: piece.lean ?? undefined });
  }
  for (const t of toadstools) placeAsset(props, 'mushroom', { ...kit, x: t.x, y: t.y, size: t.size, seed: t.seed * 991, colors: { cap: '#f2b33d', spot: '#fff6e0' } });
  return props;
}

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
    uJungle: { value: JUNGLE_FROM_PX },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    motes: make(MOTE_VERTEX, MOTE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const kit = createKitProps({ three, material, own, mood: 'day', reveal: 'vec3(0.9, 1.0, 0.6)', ground: true });
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const motes = new three.Points(seeded(MOTE_COUNT), materials.motes);
  motes.renderOrder = 2;
  return {
    objects: [terrain, ...kit.objects, motes],
    materials: [...Object.values(materials), ...kit.materials],
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => grandSpots(layout),
    apply(spots, bounds) {
      own.uUnit.value = spots?.u ?? 1;
      own.uJungle.value = JUNGLE_FROM_PX * (spots?.u ?? 1);
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
      kit.set(spots ? grandProps(spots) : null);
    },
  };
}
