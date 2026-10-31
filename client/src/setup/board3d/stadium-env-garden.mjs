// Design 077 (prototype): Mystery Garden (customhb-197) after its card art (MEG 122, Ayumi Odashima):
// a garden at night, a round plaza paved in rings of lavender flagstones round a pool whose water
// glows cyan and swirls in rainbow rings, crackling with light; two steps up from the plaza a stone
// balustrade rings it, black iron lanterns on its posts and white flowers in pale urns, big pale-blue
// vases and tall pale pillars beyond, dark hedges and broad leaves all round, fireflies in the air.
// The art looks across the pool at the garden's back wall; the board looks down into the plaza, so
// the plaza holds every card, the pool lies between the Actives and the Bench (its curb runs between
// them; the glowing column at the art's middle would stand on the Actives, so its light wells up
// from the water instead), and the garden rings the plaza where the table is free of cards.
// World scale: a card's footprint is about a flagstone two paces long; a lantern stands chest high.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G px from the plaza's centre, B the stone's
// tone 0..1, A the kind (-2 water, -1 pool curb, 0 plaza, 1 steps, 2 garden ground); the shared light
// bake adds normals, occlusion and the moon's shadow. Per frame: TERRAIN paints the stone, the water,
// the grass and every light (the pool's, the lanterns'); PROPS are the balustrade, the lanterns, the
// urns, vases and pillars (stadium-env-props); BLOBS the hedges, broad leaves and flowers, one
// instanced sphere each; FIREFLIES the motes drifting over the garden.
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
import { craterEmblem, environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const GARDEN_KEY = 'mystery-garden';
/** The moon (toward it, table frame): high, from the far left. */
export const MOON = Object.freeze([-0.42, 0.46, 0.78]);
/** Free paving kept round every card footprint inside the plaza's edge. */
export const PLAZA_MARGIN_PX = 26;
/** The two steps up from the plaza to the garden: each this wide and this high. */
export const STEP = Object.freeze({ width: 28, rise: 9 });
/** The balustrade stands this far past the top step, this high, a post every `spacing` px round it. */
export const BALUSTRADE = Object.freeze({ gap: 16, height: 30, spacing: 82 });
/** The pool's curb, on the emblem's circle between the Actives and the Bench: its width and height. */
export const CURB = Object.freeze({ width: 10, rise: 4 });
export const MAX_LANTERNS = 24;
/** Least gap between any prop, seen from above, and a card or the opponent's hand. */
export const PROP_CARD_GAP_PX = 14;
/** Rings and segments of the instanced sphere every hedge, leaf and flower is drawn with. */
export const BLOB_SEGMENTS = { rings: 12, around: 22 };
const FIREFLY_COUNT = 45;

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

/** The opponent's hand where the board fans it, past the far edge: the cards' width either side of the middle. */
const oppHandRect = (layout, cards) => {
  const hand = layout.opp?.hand;
  const cardH = layout.opp?.cardBox?.hand?.h ?? 0;
  if (!hand || !(cardH > 0) || !Number.isFinite(hand.baselineY)) return null;
  const halfW = Math.max(...cards.map((r) => Math.max(Math.abs(r.x), Math.abs(r.x + r.w))));
  return { x: -halfW, y: hand.baselineY - cardH, w: 2 * halfW, h: cardH };
};

/**
 * Mystery Garden's layout: the plaza (a circle round every card footprint, PLAZA_MARGIN_PX clear),
 * the pool on the emblem's circle, the steps and the balustrade round the plaza with its lanterns and
 * flower urns, and the garden past it (vases, pillars, hedges, broad leaves). Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function gardenSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const scene = sceneBounds(layout, GARDEN_KEY);
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const corners = cards.flatMap((r) => [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]);
  const plaza = Math.max(...corners.map(([x, y]) => Math.hypot(x - centre.x, y - centre.y))) + PLAZA_MARGIN_PX * u;
  const emblem = craterEmblem(layout, centre);
  const ground = 2 * STEP.rise * u;
  const ringR = plaza + 2 * STEP.width * u + BALUSTRADE.gap * u;
  const hand = oppHandRect(layout, cards);
  const obstacles = [...cards, ...(hand ? [hand] : [])];
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;
  const clear = (x, y, r) => obstacles.every((rect) => distanceToRect(x, y, rect) >= r + PROP_CARD_GAP_PX);
  const at = (angle, radius) => ({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });

  // The balustrade's posts round the ring, those inside the scene; every fourth carries a lantern,
  // the second after each lantern an urn of white flowers.
  const count = Math.max(12, Math.round((2 * Math.PI * ringR) / (BALUSTRADE.spacing * u)));
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * 2 * Math.PI + Math.PI / count;
    const { x, y } = at(angle, ringR);
    if (!inScene(x, y, 12 * u)) continue;
    posts.push({ x, y, angle, index: i, lantern: i % 4 === 0, planter: i % 4 === 2 });
  }
  // The garden's furniture on the four diagonals past the balustrade: a big pale-blue vase with a
  // lantern on its rim, and further out a tall pillar.
  const vases = [];
  const pillars = [];
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const vase = at(angle, ringR + 70 * u);
    if (inScene(vase.x, vase.y, 40 * u) && clear(vase.x, vase.y, 36 * u)) vases.push({ ...vase, r: 30 * u, h: 78 * u, angle });
    const pillar = at(angle, ringR + 170 * u);
    // Off the near end a tall pillar would lean up over the player's cards in the tilted view.
    const far = Math.sin(angle) > 0;
    if (inScene(pillar.x, pillar.y, 40 * u) && clear(pillar.x, pillar.y, 40 * u)) {
      pillars.push({ ...pillar, r: 30 * u, h: (far ? 230 : 120) * u, angle });
    }
  }
  // Hedges on the garden ground past the balustrade, clear of the furniture; broad-leaved plants by
  // each vase and pillar.
  const furniture = [...vases.map((v) => ({ ...v, keep: v.r + 18 * u })), ...pillars.map((p) => ({ ...p, keep: p.r + 26 * u }))];
  const hedges = [];
  const step = 46 * u;
  for (let gy = scene.y + step / 2; gy < scene.y + scene.h; gy += step) {
    for (let gx = scene.x + step / 2; gx < scene.x + scene.w; gx += step) {
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * step * 0.7;
      const y = gy + (roll(2) - 0.5) * step * 0.7;
      const r = (24 + 20 * roll(3)) * u;
      const out = Math.hypot(x - centre.x, y - centre.y);
      if (out < ringR + 26 * u + r * 0.6 || !inScene(x, y, r * 0.4) || roll(4) > 0.85) continue;
      if (furniture.some((f) => Math.hypot(x - f.x, y - f.y) < f.keep + r * 0.7)) continue;
      hedges.push({ x, y, z: ground + r * 0.5, r, seed: roll(5) });
    }
  }
  const leaves = [];
  for (const spot of furniture) {
    const turn = Math.atan2(spot.y - centre.y, spot.x - centre.x);
    for (let k = 0; k < 7; k += 1) {
      const yaw = turn + (k / 7 - 0.5) * 2.4 + (hash(spot.x, k, 9) - 0.5) * 0.3;
      const length = (34 + 16 * hash(spot.y, k, 10)) * u;
      const base = { x: spot.x + Math.cos(turn) * (spot.keep - 6 * u), y: spot.y + Math.sin(turn) * (spot.keep - 6 * u) };
      leaves.push({ x: base.x + Math.cos(yaw) * length * 0.6, y: base.y + Math.sin(yaw) * length * 0.6, z: ground + 10 * u, length, yaw, seed: hash(spot.x, k, 11) });
    }
  }
  const lanterns = [
    ...posts.filter((post) => post.lantern).map((post) => ({ x: post.x, y: post.y, z: ground + (BALUSTRADE.height + 7 + 20) * u })),
    ...vases.map((vase) => ({ x: vase.x, y: vase.y, z: ground + vase.h + 26 * u + 20 * u })),
  ].slice(0, MAX_LANTERNS);
  return { table, scene, u, centre, plaza, emblem, ground, ringR, posts, vases, pillars, hedges, leaves, lanterns, hand };
}

const GARDEN = /* glsl */ `
// The plaza's centre and radius, the pool's curb radius (0: no pool), the ground's height past the
// steps; the step's width and rise; every lantern (x, y, z; z 0: none).
uniform vec4 uPlaza;
uniform vec2 uStep;
uniform vec3 uLanterns[${MAX_LANTERNS}];
// The paving: rings of flagstones round the plaza's centre, each ring's stones its own length and
// shifted along by their own share. x: px to the nearest joint, y: the stone's id.
vec2 flagstone(vec2 p) {
  vec2 rel = p - uPlaza.xy;
  float r = length(rel);
  float ringW = 38.0;
  float ring = floor(r / ringW);
  float around = 6.2831853 * (ring + 0.5) * ringW;
  float count = max(5.0, floor(around / (52.0 + 18.0 * hash12(vec2(ring, 2.0)))));
  float s = (atan(rel.y, rel.x) / 6.2831853 + 0.5) * count + hash12(vec2(ring, 5.0));
  float acrossRing = (0.5 - abs(fract(r / ringW) - 0.5)) * ringW;
  float alongRing = (0.5 - abs(fract(s) - 0.5)) * around / count;
  return vec2(min(acrossRing, alongRing), hash12(vec2(ring, floor(s)) + 0.37));
}
// The light of the lanterns at p (at height h): warm pink-white, falling off over ~130 px.
float lanternLight(vec3 p) {
  float light = 0.0;
  for (int i = 0; i < ${MAX_LANTERNS}; i++) {
    vec3 lantern = uLanterns[i];
    if (lantern.z <= 0.0) continue;
    vec3 d = (p - lantern) / vec3(110.0, 110.0, 140.0);
    light += exp(-dot(d, d) * 1.6);
  }
  return light;
}
`;

/**
 * Bake: the plaza's flagstones each a little domed between sunk joints; the pool's water a little
 * below them inside its raised curb; past the plaza's edge two steps up to the garden, its ground
 * gently uneven.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${GARDEN}
void main() {
  vec2 p = uMin + vUv * uSize;
  float r = distance(p, uPlaza.xy);
  vec2 stone = flagstone(p);
  float h = 2.4 * smoothstep(0.0, 4.5, stone.x) - 0.7 * stone.y;
  float kind = 0.0;
  float tone = stone.y;
  if (uPlaza.w > 0.0 && abs(r - uPlaza.w) < ${(CURB.width / 2).toFixed(1)}) {
    h = ${CURB.rise.toFixed(1)} * smoothstep(${(CURB.width / 2).toFixed(1)}, ${(CURB.width / 2 - 2).toFixed(1)}, abs(r - uPlaza.w));
    kind = -1.0;
  } else if (uPlaza.w > 0.0 && r < uPlaza.w) {
    h = -3.0;
    kind = -2.0;
  } else if (r > uPlaza.z) {
    float up = (r - uPlaza.z) / uStep.x;
    float steps = min(floor(up) + 1.0, 2.0);
    // Each step's nose rounded off.
    float nose = smoothstep(0.0, 0.12, fract(up)) * step(up, 2.0) + step(2.0, up);
    h = uStep.y * (steps - 1.0 + nose);
    kind = up < 2.0 ? 1.0 : 2.0;
    if (up >= 2.0) h = 2.0 * uStep.y + 3.0 * (fbm3(p / 60.0) - 0.4);
    tone = hash12(vec2(floor(atan(p.y - uPlaza.y, p.x - uPlaza.x) * 18.0), steps));
  }
  gl_FragColor = vec4(h, r, tone, kind);
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

// The card art's colours (pixel samples, inverted through Neutral tone mapping); the lights a little
// over 1 so they glow.
const PALETTE = /* glsl */ `
const vec3 PAVING = vec3(0.345, 0.263, 0.469);
const vec3 PAVING_DARK = vec3(0.154, 0.12, 0.245);
const vec3 STONE_PALE = vec3(0.469, 0.525, 0.72);
const vec3 GRASS = vec3(0.058, 0.225, 0.139);
const vec3 HEDGE = vec3(0.058, 0.26, 0.26);
const vec3 HEDGE_DARK = vec3(0.028, 0.061, 0.093);
const vec3 NIGHT = vec3(0.033, 0.053, 0.088);
const vec3 POOL_CYAN = vec3(0.32, 1.15, 1.45);
const vec3 LANTERN_GLOW = vec3(1.25, 0.82, 1.0);
// The moonlit night: everything not lit by the pool or a lantern sinks toward its blue.
vec3 nightLight(vec3 albedo, float moonlit) {
  return albedo * (vec3(0.2, 0.24, 0.4) + vec3(0.3, 0.33, 0.48) * moonlit);
}
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.45, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${FILTERING}
${REVEAL}
${PALETTE}
${GARDEN}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float r = field.g;
  float kind = field.a;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  float moonlit = clamp(dot(n, normalize(uSun)), 0.0, 1.0) * mix(0.5, 1.0, light.a);
  float t = uTime;

  // The paving: lavender flagstones a shade apart, their joints dark, worn paler at their middles.
  vec2 stone = flagstone(p);
  // Each flagstone its own tone, from slate-blue through lavender to the dusty rose of the art's
  // older paving, grained and veined, its edge chipped paler where it meets a joint, moss and
  // damp dark in the joints.
  // Design 080: round the cards the stones keep close to one lavender, their joints shallow and
  // their grain faint, so the paving reads as one floor under the cards, richer out by the steps.
  float calm = fieldCalm(p, 110.0);
  vec3 slate = vec3(0.24, 0.235, 0.4);
  vec3 rose = vec3(0.4, 0.25, 0.33);
  vec3 col = mix(mix(slate, PAVING, smoothstep(0.0, 0.5, field.b)), rose, smoothstep(0.62, 1.0, field.b) * 0.85);
  col = mix(col, mix(slate, PAVING, 0.6), calm * 0.6);
  col *= 0.9 + 0.14 * fbm3(p / 26.0);
  col *= 1.0 + 0.12 * (1.0 - calm) * patternFade(pixelSize(p), 9.0)
    * smoothstep(0.55, 0.8, gnoise(vec2(dot(p, vec2(0.8, 0.6)) / 38.0, dot(p, vec2(-0.6, 0.8)) / 9.0)));
  col = mix(col, col * 1.2, (1.0 - smoothstep(1.2, 3.6, stone.x)) * smoothstep(0.5, 1.8, stone.x) * (1.0 - 0.7 * calm));
  float joint = (1.0 - smoothstep(0.4, 1.7, stone.x)) * mix(1.0, 0.45, calm);
  vec3 moss = vec3(0.05, 0.19, 0.14) * (0.85 + 0.3 * fbm3(p / 12.0));
  col = mix(col, PAVING_DARK * 0.55, joint);
  col = mix(col, moss, joint * smoothstep(0.42, 0.68, fbm3(p / 34.0 + 7.0)) * 0.8 * (1.0 - calm));
  // The steps and the curb: the paler wall stone of the art's terrace.
  vec3 pale = STONE_PALE * (0.85 + 0.25 * field.b);
  // The steps are slabs: radial joints between them, the slabs of the lower step set half a slab off.
  float onStep = step(0.5, kind) * step(kind, 1.5);
  float arc = atan(p.y - uPlaza.y, p.x - uPlaza.x) * r / 64.0 + floor((r - uPlaza.z) / uStep.x) * 0.5;
  float slabJoint = (1.0 - smoothstep(0.0, 0.035, fract(arc))) + smoothstep(0.965, 1.0, fract(arc));
  pale *= 1.0 - 0.38 * clamp(slabJoint, 0.0, 1.0) * onStep;
  pale *= 0.96 + 0.08 * fbm3(p / 14.0);
  col = mix(col, pale, step(0.5, kind) * step(kind, 1.5));
  col = mix(col, pale, step(-1.5, kind) * step(kind, -0.5));
  // The garden ground: dark grass.
  vec3 grass = mix(HEDGE_DARK, GRASS * 0.8, smoothstep(0.3, 0.7, fbm3(p / 55.0 + 4.0)));
  col = mix(col, grass, step(1.5, kind));
  col = nightLight(col, moonlit) * mix(0.55, 1.0, smoothstep(0.3, 0.9, light.b));

  // The pool: its water glowing cyan from below, slow rings of light swirling out from the middle,
  // faint threads of light wandering across it. Design 080: the Actives lie on this water, so it is
  // a deep teal lit from its heart, not a bright disc, and nothing on it flashes.
  if (kind < -1.5) {
    float fromMiddle = r / max(uPlaza.w, 1.0);
    float swirl = sin((r - t * 6.0) / 9.0 + 4.0 * fbm3(p / 70.0 + t * 0.03));
    vec3 water = mix(vec3(0.03, 0.17, 0.27), POOL_CYAN * 0.3, 0.45 + 0.55 * (1.0 - fromMiddle));
    water += vec3(0.4, 0.75, 0.9) * smoothstep(0.85, 0.99, swirl) * 0.1;
    float angle = atan(p.y - uPlaza.y, p.x - uPlaza.x);
    float thread = abs(gnoise(vec2(angle * 4.0, r / 60.0 - t * 0.12)) - 0.5);
    float glimmer = smoothstep(0.55, 0.72, gnoise(vec2(angle * 2.0 + t * 0.25, r / 90.0 + t * 0.08)));
    water += vec3(0.6, 0.9, 1.05) * (1.0 - smoothstep(0.004, 0.022, thread)) * glimmer * 0.16;
    water += POOL_CYAN * 0.12 * exp(-fromMiddle * fromMiddle * 3.0);
    col = water;
  }

  // The pool's light over the plaza, and each lantern's warm pool of light.
  if (uPlaza.w > 0.0) {
    float spill = exp(-pow(max(r - uPlaza.w, 0.0) / (uPlaza.w * 0.9), 1.4));
    col += POOL_CYAN * 0.12 * spill * step(-1.5, kind);
  }
  col += LANTERN_GLOW * 0.3 * lanternLight(vec3(p, field.r)) * step(-1.5, kind);

  col = edgeHaze(col, vUv);
  vec3 shimmer = vec3(0.55, 0.95, 1.1);
  col += shimmer * revealGlow(p, 0.035) * 0.7;
  col += shimmer * exitGlow(p) * 0.7;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how glossy, 2 and up a light at w - 1).
const STONE = [0.6, 0.6, 0.78, 0.15];
const PILLAR = [0.78, 0.62, 0.8, 0.15];
const VASE = [0.28, 0.46, 0.78, 0.45];
const IRON = [0.13, 0.125, 0.17, 0.7];
const GLASS = [1.45, 0.9, 1.05, 2.6];
const SOIL = [0.06, 0.05, 0.05, 0];

/** A lathe up a vertical axis at (x, y): `profile` is [[z, radius], ...] from foot to top. */
const lathe = (props, x, y, profile, color) =>
  props.tube(
    profile.map(([z]) => [x, y, z]),
    profile.map(([, radius]) => radius),
    color,
    { sides: 18 }
  );

/** One iron lantern standing at (x, y) from z: a little hipped roof over four glowing panes. */
const lantern = (props, x, y, z, u) => {
  const s = 1.3 * u;
  props.box({ x, y, z0: z, z1: z + 4 * s, hw: 7 * s, hh: 7 * s, color: IRON });
  props.box({ x, y, z0: z + 4 * s, z1: z + 22 * s, hw: 5.5 * s, hh: 5.5 * s, color: GLASS });
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    props.box({ x: x + dx * 5.8 * s, y: y + dy * 5.8 * s, z0: z + 4 * s, z1: z + 22 * s, hw: 1.2 * s, hh: 1.2 * s, color: IRON });
  }
  props.box({ x, y, z0: z + 22 * s, z1: z + 25 * s, hw: 8.5 * s, hh: 8.5 * s, color: IRON });
  const apex = [x, y, z + 34 * s];
  const c = [
    [x - 8.5 * s, y - 8.5 * s, z + 25 * s],
    [x + 8.5 * s, y - 8.5 * s, z + 25 * s],
    [x + 8.5 * s, y + 8.5 * s, z + 25 * s],
    [x - 8.5 * s, y + 8.5 * s, z + 25 * s],
  ];
  for (let k = 0; k < 4; k += 1) props.quad(c[k], c[(k + 1) % 4], apex, apex, IRON);
  lathe(props, x, y, [
    [z + 34 * s, 1.6 * s],
    [z + 39 * s, 1.6 * s],
  ], IRON);
};

/** The balustrade, its lanterns and flower urns, the vases and pillars: one prop geometry. */
export function gardenProps({ posts, vases, pillars, ground, ringR, centre, u }) {
  const props = createPropBuilder();
  const height = BALUSTRADE.height * u;
  for (const post of posts) {
    props.box({ x: post.x, y: post.y, z0: ground - 2, z1: ground + height + 4 * u, hw: 7 * u, hh: 7 * u, yaw: post.angle, color: STONE });
    props.box({ x: post.x, y: post.y, z0: ground + height + 4 * u, z1: ground + height + 7 * u, hw: 9 * u, hh: 9 * u, yaw: post.angle, color: STONE });
    if (post.lantern) lantern(props, post.x, post.y, ground + height + 7 * u, u);
    if (post.planter) {
      lathe(props, post.x, post.y, [
        [ground + height + 7 * u, 4 * u],
        [ground + height + 11 * u, 5 * u],
        [ground + height + 15 * u, 10 * u],
        [ground + height + 22 * u, 12 * u],
      ], STONE);
      props.cylinder({ x: post.x, y: post.y, z0: ground + height + 19 * u, z1: ground + height + 20 * u, r: 11 * u, color: SOIL });
    }
  }
  // The rail and its balusters between neighbouring posts (round the ring, both in the scene).
  const byIndex = new Map(posts.map((post) => [post.index, post]));
  const count = Math.max(12, Math.round((2 * Math.PI * ringR) / (BALUSTRADE.spacing * u)));
  for (const post of posts) {
    const next = byIndex.get((post.index + 1) % count);
    if (!next) continue;
    const mid = { x: (post.x + next.x) / 2, y: (post.y + next.y) / 2 };
    const span = Math.hypot(next.x - post.x, next.y - post.y);
    const yaw = Math.atan2(next.y - post.y, next.x - post.x);
    props.box({ x: mid.x, y: mid.y, z0: ground + height - 3 * u, z1: ground + height + 2 * u, hw: span / 2, hh: 5 * u, yaw, color: STONE });
    props.box({ x: mid.x, y: mid.y, z0: ground - 2, z1: ground + 5 * u, hw: span / 2, hh: 5.5 * u, yaw, color: STONE });
    const balusters = Math.max(2, Math.round(span / (13 * u)) - 1);
    for (let k = 1; k <= balusters; k += 1) {
      const f = k / (balusters + 1);
      const bx = post.x + (next.x - post.x) * f;
      const by = post.y + (next.y - post.y) * f;
      lathe(props, bx, by, [
        [ground + 5 * u, 2.6 * u],
        [ground + 10 * u, 4 * u],
        [ground + 17 * u, 2.2 * u],
        [ground + height - 3 * u, 3 * u],
      ], STONE);
    }
  }
  // Vases: the art's big pale-blue urns, a lantern on each rim.
  for (const vase of vases) {
    const { x, y, r, h } = vase;
    lathe(props, x, y, [
      [ground - 2, r * 0.55],
      [ground + h * 0.08, r * 0.6],
      [ground + h * 0.18, r * 0.78],
      [ground + h * 0.45, r],
      [ground + h * 0.75, r * 0.82],
      [ground + h * 0.9, r * 0.5],
      [ground + h, r * 0.58],
    ], VASE);
    props.cylinder({ x, y, z0: ground + h - 4, z1: ground + h - 3, r: r * 0.5, color: SOIL });
    lathe(props, x, y, [
      [ground + h - 6, 3 * u],
      [ground + h + 30 * u, 3 * u],
    ], IRON);
    lantern(props, x, y, ground + h + 30 * u - 4 * u, u);
  }
  // Pillars: pale fluted columns on a square plinth under a square capital.
  for (const pillar of pillars) {
    const { x, y, r, h } = pillar;
    const turn = Math.atan2(y - centre.y, x - centre.x);
    props.box({ x, y, z0: ground - 2, z1: ground + 14 * u, hw: r * 1.35, hh: r * 1.35, yaw: turn, color: PILLAR });
    props.tube(
      Array.from({ length: 6 }, (_, k) => [x, y, ground + 14 * u + ((h - 30 * u) * k) / 5]),
      Array.from({ length: 6 }, (_, k) => r * (1 - 0.06 * (k / 5))),
      PILLAR,
      { sides: 16 }
    );
    props.box({ x, y, z0: ground + h - 16 * u, z1: ground + h, hw: r * 1.25, hh: r * 1.25, yaw: turn, color: PILLAR });
  }
  return props;
}

/** Every hedge, leaf and flower: per vertex the unit sphere, per instance centre, size, yaw and kind. */
export function blobGeometry(three, { hedges, leaves, posts, ground, u }) {
  const { rings, around } = BLOB_SEGMENTS;
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
  const blobs = [];
  for (const hedge of hedges) blobs.push({ centre: [hedge.x, hedge.y, hedge.z], size: [hedge.r, hedge.r, hedge.r * 0.75], yaw: 0, kind: 0, seed: hedge.seed });
  for (const leaf of leaves) {
    blobs.push({ centre: [leaf.x, leaf.y, leaf.z], size: [leaf.length * 0.55, leaf.length * 0.16, leaf.length * 0.07], yaw: leaf.yaw, kind: 1, seed: leaf.seed });
  }
  // White flowers heaped in each urn on the balustrade.
  const top = ground + (BALUSTRADE.height + 24) * u;
  for (const post of posts.filter((each) => each.planter)) {
    for (let k = 0; k < 6; k += 1) {
      const angle = (k / 6) * 2 * Math.PI + hash(post.x, k, 3);
      const out = k === 0 ? 0 : 6 * u;
      blobs.push({
        centre: [post.x + Math.cos(angle) * out, post.y + Math.sin(angle) * out, top + (k === 0 ? 3 * u : 0)],
        size: [5 * u, 5 * u, 3.5 * u],
        yaw: 0,
        kind: 2,
        seed: hash(post.y, k, 4),
      });
      blobs.push({
        centre: [post.x + Math.cos(angle + 0.5) * 9 * u, post.y + Math.sin(angle + 0.5) * 9 * u, top - 3 * u],
        size: [5 * u, 3 * u, 2 * u],
        yaw: angle + 0.5,
        kind: 1,
        seed: hash(post.x, k, 5),
      });
    }
  }
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aCentre', new three.InstancedBufferAttribute(Float32Array.from(blobs.flatMap((b) => b.centre)), 3));
  geometry.setAttribute('aSize', new three.InstancedBufferAttribute(Float32Array.from(blobs.flatMap((b) => b.size)), 3));
  geometry.setAttribute('aShape', new three.InstancedBufferAttribute(Float32Array.from(blobs.flatMap((b) => [b.yaw, b.kind, b.seed])), 3));
  geometry.instanceCount = blobs.length;
  return geometry;
}

export const BLOB_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec3 aCentre;
attribute vec3 aSize;
// yaw, kind (0 hedge, 1 leaf, 2 flower), seed.
attribute vec3 aShape;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec2 vKind;
void main() {
  vec3 dir = position;
  float seed = aShape.z;
  float kind = aShape.y;
  float lumps = kind < 0.5 ? sin(dir.x * 4.1 + seed * 20.0) * sin(dir.y * 3.7 + seed * 11.0) * sin(dir.z * 3.3 + 1.0) : 0.0;
  vec3 local = dir * aSize * (1.0 + 0.12 * lumps);
  // A leaf arches: its tip lower than its middle.
  if (kind > 0.5 && kind < 1.5) local.z -= aSize.x * 0.25 * dir.x * dir.x;
  float c = cos(aShape.x);
  float s = sin(aShape.x);
  local.xy = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  local.xy += vec2(sin(uTime * 0.8 + seed * 20.0), cos(uTime * 0.7 + seed * 13.0)) * 0.5 * step(0.5, kind) * (dir.x + 1.0);
  float growth = terrainGrowth(aCentre.xy);
  vec3 pos = vec3(aCentre.xy, 0.0) + vec3(local.xy, local.z + aCentre.z) * vec3(1.0, 1.0, growth);
  vec3 scaled = dir / max(aSize, vec3(0.5));
  vNormal = normalize(vec3(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c, scaled.z));
  vPos = pos;
  vSphere = dir;
  vKind = vec2(kind, seed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/** Hedges and leaves in the art's night teals, lit cyan by the pool and pink by the lanterns; flowers white. */
export const BLOB_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec4 uPlaza;
uniform vec3 uLanterns[${MAX_LANTERNS}];
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
float lanternNear(vec3 p) {
  float light = 0.0;
  for (int i = 0; i < ${MAX_LANTERNS}; i++) {
    vec3 lantern = uLanterns[i];
    if (lantern.z <= 0.0) continue;
    vec3 d = (p - lantern) / 130.0;
    light += exp(-dot(d, d) * 1.6);
  }
  return light;
}
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec2 vKind;
void main() {
  if (revealBurned(vPos.xy) * exitKeep(vPos.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 toEye = normalize(uEye - vPos);
  float moonlit = max(dot(n, normalize(uSun)), 0.0);
  float kind = vKind.x;
  vec3 col;
  if (kind < 0.5) {
    // Clipped boxwood: a few broad clumps, their borders wandering, each bulging toward the moon
    // (design 080: the small leaf scale read as speckle from above, so it only tints the lit tops).
    vec2 q = vSphere.xy / (1.3 + vSphere.z) * 1.9 + vKind.y * 17.0;
    q += 0.3 * (vec2(gnoise(q * 1.7), gnoise(q * 1.7 + 6.3)) - 0.5);
    vec4 cluster = voronoiCell(q);
    float inCluster = 1.0 - smoothstep(0.34, 0.6, length(cluster.zw));
    vec4 leaf = voronoiCell(q * 3.3 + 2.1);
    float inLeaf = 1.0 - smoothstep(0.3, 0.55, length(leaf.zw));
    vec3 bulged = normalize(n - vec3(cluster.zw, 0.0) * 0.55 * inCluster - vec3(leaf.zw, 0.0) * 0.08 * inLeaf);
    float lit = max(dot(bulged, normalize(uSun)), 0.0);
    col = mix(HEDGE_DARK * 1.2, HEDGE * 1.2, smoothstep(0.05, 0.5, lit)) * mix(0.72, 1.0, inCluster);
    col = mix(col, HEDGE * 1.7, smoothstep(0.6, 0.85, lit) * mix(0.6, 1.0, inLeaf) * 0.45);
    col *= mix(0.78, 1.0, smoothstep(0.0, 0.2, cluster.x));
  } else if (kind < 1.5) {
    // A broad leaf: its midrib pale, darker toward its edges.
    float rib = 1.0 - smoothstep(0.0, 0.18, abs(vSphere.y));
    col = nightLight(mix(HEDGE * 0.9, HEDGE * 1.6, rib * 0.6), moonlit);
  } else {
    col = nightLight(vec3(0.9, 0.9, 0.96), moonlit) * 1.25;
  }
  float fromPool = max(distance(vPos.xy, uPlaza.xy) - uPlaza.w, 0.0);
  col += POOL_CYAN * 0.1 * exp(-fromPool / 420.0) * (0.5 + 0.5 * max(dot(n, normalize(vec3(uPlaza.xy - vPos.xy, 60.0))), 0.0));
  col += LANTERN_GLOW * 0.2 * lanternNear(vPos) * (0.5 + 0.5 * n.z);
  float edgeOn = 1.0 - abs(dot(n, toEye));
  col = mix(col, col * 0.5, smoothstep(0.7, 0.92, edgeOn));
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The props' light: the moon and the night sky, a gloss on the vases and iron, the pool's cyan and the lanterns' pink. */
const PROP_LIGHT = /* glsl */ `
float lanternFall(vec3 p) {
  float light = 0.0;
  for (int i = 0; i < ${MAX_LANTERNS}; i++) {
    vec3 lantern = uLanterns[i];
    if (lantern.z <= 0.0) continue;
    vec3 d = (p - lantern) / 120.0;
    light += exp(-dot(d, d) * 1.6);
  }
  return light;
}
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 moon = normalize(uSun);
  vec3 col = nightLight(albedo, max(dot(n, moon), 0.0));
  vec3 view = normalize(uEye - world);
  col += vec3(0.5, 0.55, 0.75) * pow(max(dot(reflect(-moon, n), view), 0.0), 18.0) * metal * 0.5;
  vec2 toPool = uPlaza.xy - world.xy;
  float fromPool = max(length(toPool) - uPlaza.w, 0.0);
  col += albedo * POOL_CYAN * 0.35 * exp(-fromPool / 380.0) * max(dot(n, normalize(vec3(toPool, 40.0))), 0.0);
  // The lantern's own light washes the iron nearest it pink, not only the paint on it.
  col += albedo * LANTERN_GLOW * 0.7 * lanternFall(world) + LANTERN_GLOW * 0.16 * lanternFall(world) * (0.4 + 0.6 * max(n.z, 0.0));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({
  light: PROP_LIGHT,
  uniforms: `uniform vec4 uPlaza;\nuniform vec3 uLanterns[${MAX_LANTERNS}];\n${PALETTE}`,
  reveal: 'vec3(0.55, 0.95, 1.1)',
});

/** Fireflies: green-gold, pink and white motes drifting over the garden, glowing on and off. */
export const FIREFLY_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
uniform vec4 uPlaza;
${NOISE}
${FOOTPRINTS}
${REVEAL}
attribute vec4 aSeed;
varying vec3 vHue;
varying float vGlow;
void main() {
  float period = 7.0 + aSeed.w * 6.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 start = uMin + hash22(aSeed.xy * 71.0 + cycle) * uSize;
  vec3 pos = vec3(start, 14.0 + 70.0 * aSeed.y);
  pos.xy += vec2(sin(clock * 0.7 + aSeed.x * 30.0), cos(clock * 0.6 + aSeed.y * 30.0)) * 26.0;
  pos.z += sin(clock * 0.9 + aSeed.w * 10.0) * 10.0;
  // Design 080: fireflies keep to the garden, none over the plaza's cards.
  float shown = revealBurned(start) * exitKeep(start) * step(fieldCalm(start, 110.0), 0.001);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vGlow = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.7, 1.0, life)) * (0.6 + 0.4 * pow(0.5 + 0.5 * sin(clock * 1.2 + aSeed.x * 20.0), 2.0));
  vHue = aSeed.x < 0.5 ? vec3(0.75, 1.05, 0.45) : aSeed.x < 0.8 ? vec3(1.1, 0.6, 0.95) : vec3(0.95, 0.95, 1.0);
  gl_PointSize = max((1.4 + 1.4 * aSeed.z) * uFocal / -mv.z, 1.5) * 2.3 * shown;
}
`;

export const FIREFLY_FRAGMENT = /* glsl */ `
varying vec3 vHue;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.25, 0.5, d);
  float halo = exp(-d * d * 3.5) * 0.6;
  gl_FragColor = vec4(vHue * (core + halo) * vGlow, 1.0);
${OUTPUT}
}
`;

/** Each lantern's glow: a soft halo round its panes, flickering a little as a candle does. */
export const HALO_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
varying float vFlicker;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // A lantern's glass breathes faintly (design 080: no flicker at the edge of the eye).
  vFlicker = 0.95 + 0.03 * sin(uTime * 2.3 + position.x * 0.3) + 0.02 * sin(uTime * 3.7 + position.y);
  gl_PointSize = 74.0 * uFocal / -mv.z * revealBurned(position.xy) * exitKeep(position.xy);
}
`;

export const HALO_FRAGMENT = /* glsl */ `
varying float vFlicker;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float halo = (exp(-d * d * 7.0) * 0.8 + exp(-d * d * 2.2) * 0.3) * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.85) * halo * 0.75 * vFlicker, 1.0);
${OUTPUT}
}
`;

/** Mystery Garden's board (stadium-environment-mesh.js BOARDS). */
export function mysteryGardenBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...MOON).normalize() },
    uPlaza: { value: new three.Vector4() },
    uStep: { value: new three.Vector2() },
    uLanterns: { value: Array.from({ length: MAX_LANTERNS }, () => new three.Vector3()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    blobs: make(BLOB_VERTEX, BLOB_FRAGMENT, { side: three.DoubleSide }),
    fireflies: make(FIREFLY_VERTEX, FIREFLY_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    halos: make(HALO_VERTEX, HALO_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const blobs = new three.Mesh(new three.BufferGeometry(), materials.blobs);
  const fireflies = new three.Points(seeded(FIREFLY_COUNT), materials.fireflies);
  fireflies.renderOrder = 2;
  const halos = new three.Points(new three.BufferGeometry(), materials.halos);
  halos.renderOrder = 2;
  return {
    objects: [terrain, props, blobs, fireflies, halos],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => gardenSpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uPlaza.value.set(spots?.centre.x ?? 0, spots?.centre.y ?? 0, spots?.plaza ?? 0, spots?.emblem?.r ?? 0);
      own.uStep.value.set(STEP.width * u, STEP.rise * u);
      own.uLanterns.value.forEach((slot, i) => {
        const light = spots?.lanterns[i];
        return light ? slot.set(light.x, light.y, light.z) : slot.set(0, 0, 0);
      });
      replaceGeometry(terrain, terrainGrid(bounds));
      for (const mesh of [props, blobs, halos]) mesh.visible = Boolean(spots);
      if (!spots) return;
      const halo = new three.BufferGeometry();
      halo.setAttribute('position', new three.Float32BufferAttribute(spots.lanterns.flatMap((light) => [light.x, light.y, light.z]), 3));
      replaceGeometry(halos, halo);
      replaceGeometry(props, gardenProps(spots).build(three));
      replaceGeometry(blobs, blobGeometry(three, spots));
    },
  };
}
