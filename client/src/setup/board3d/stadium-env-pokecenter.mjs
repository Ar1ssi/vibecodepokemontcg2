// Design 077 (prototype): Pokemon Center (customhb-362) after its card art (NXD 90, 5ban Graphics):
// the Pokemon Center on a harbour street corner on a bright day, its red bands over navy-latticed
// glass, a red-capped glass drum for an entrance, a cream sidewalk edged in tan kerb stones, dark
// asphalt with the Poke Ball painted on it in thin white lines, the harbour beyond a rail. The art
// looks along the road at the corner; the board looks down on it, so the road holds every card with
// the Poke Ball between the Actives, the Center stands in the left band on its sidewalk (the band
// both camera presets show most of; its face to the cards, its roof seen from above, a few floors
// high), the quay and its rail run down the right band over the sea, and a dark tower stands off the
// far end.
// World scale: a card's footprint is a paving slab of the road; a floor of the Center is about two
// cards high.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the sidewalk's edge
// (negative on it), B unused, A the kind (0 road, 1 sidewalk, 2 sea bed); the shared light bake adds
// normals, occlusion and the sun's shadow. Per frame: TERRAIN paints the asphalt, the Poke Ball, the
// sidewalk, its kerb and the buildings' shadows; WATER one sheet at WATER_LEVEL; PROPS the Center,
// the tower, the quay's rail and the lamps (stadium-env-props).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  POKE_BALL,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { craterEmblem } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { wallBand, windowRun } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { EDGE_HAZE, PAVING, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const CENTER_KEY = 'pokemon-center';
/** The bright day's sun (toward it, table frame): high, from the far left, so the Center's shadow falls toward the road. */
export const CENTER_SUN = Object.freeze([-0.55, 0.3, 0.78]);
/** The road's kerbs stand this far past the cards' box; the sidewalk is this wide; its kerb rises this high. */
export const KERB_GAP_PX = 40;
export const WALK_PX = 96;
export const KERB_RISE_PX = 6;
/** The sea's surface and its bed, px off the cloth. */
export const WATER_LEVEL = -26;
const SEA_BED = -56;
/** The Center: its depth into the left band and its height, in card-scale px, and the dark tower's height. */
export const CENTER_DEPTH_PX = 330;
export const CENTER_HEIGHT_PX = 172;
export const TOWER_HEIGHT_PX = 250;
export const MAX_ROOF_UNITS = 8;

/** The footprint a building record covers, `[x0, y0, x1, y1]`. */
const boxOf = (b) => [b.x0, b.y0, b.x1, b.y1];

/**
 * Pokemon Center's layout: the kerbs either side of the road, the Center on its sidewalk in the left
 * band, the quay and its lamps on the right, the dark tower off the far end, the emblem between the
 * Actives. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function centerSpots(layout) {
  const ctx = boardContext(layout, CENTER_KEY);
  if (!ctx) return null;
  const { scene, core, u, hand, centre } = ctx;
  const walk = WALK_PX * u;
  const centerKerb = core.x - KERB_GAP_PX * u;
  const quayKerb = core.x + core.w + KERB_GAP_PX * u;
  const quayX = quayKerb + walk;
  const wallX = centerKerb - walk;
  const farEdge = scene.y + scene.h;
  const center = {
    x0: wallX - CENTER_DEPTH_PX * u,
    x1: wallX,
    y0: core.y + core.h * 0.3,
    y1: farEdge + 90 * u,
    height: CENTER_HEIGHT_PX * u,
  };
  const towerFront = (hand ? hand.y + hand.h : core.y + core.h) + 40 * u;
  const tower = { x0: wallX + 18 * u, x1: quayKerb + 200 * u, y0: towerFront, y1: farEdge + 90 * u, height: TOWER_HEIGHT_PX * u };
  const lamps = [0.2, 0.8].map((share) => ({ x: quayX - 30 * u, y: core.y + core.h * share, h: 62 * u }));
  const roofUnits = [];
  for (let k = 0; k < MAX_ROOF_UNITS; k += 1) {
    const roll = (salt) => hash(k, 5, salt);
    const x = center.x0 + 36 * u + roll(3) * (center.x1 - center.x0 - 72 * u);
    const y = center.y0 + 80 * u + roll(4) * (scene.y + scene.h - center.y0 - 130 * u);
    if (roofUnits.some((other) => Math.hypot(other.x - x, other.y - y) < 70 * u)) continue;
    roofUnits.push({ x, y, w: (16 + 20 * roll(1)) * u, d: (14 + 14 * roll(2)) * u, h: (8 + 10 * roll(5)) * u, fan: roll(6) > 0.45 });
  }
  // The roof's stair hut at the near end by the face, a row of skylights down its middle, a tank.
  const roofMid = (center.x0 + center.x1) / 2;
  const hut = { x: center.x1 - 54 * u, y: center.y0 + 52 * u, w: 62 * u, d: 50 * u, h: 30 * u };
  const skylights = Array.from({ length: 5 }, (_, k) => ({ x: roofMid - 20 * u, y: center.y0 + (190 + 96 * k) * u, w: 54 * u, d: 40 * u }));
  const tank = { x: center.x0 + 70 * u, y: center.y0 + 120 * u, r: 20 * u, h: 36 * u };
  return {
    ...ctx,
    hut,
    skylights,
    tank,
    walk,
    centerKerb,
    quayKerb,
    quayX,
    wallX,
    center,
    tower,
    lamps,
    roofUnits,
    entrance: { x: wallX + 4 * u, y: center.y0 + 78 * u, r: 36 * u },
    emblem: craterEmblem(layout, centre),
  };
}

const CENTER = /* glsl */ `
// The sidewalk round the Center (its footprint grown by the walk's width, the corners rounded):
// centre x, y, half width, half height; then the corner radius, the quay strip's road kerb x, the
// quay's x, the kerb's rise. The emblem (x, y, outline radius; 0: none). The scale of a card (u).
uniform vec4 uBuild;
uniform vec4 uWalk;
uniform vec3 uEmblem;
uniform float uUnit;
// The two buildings' footprints (x0, y0, x1, y1) and their heights, for the shadows they cast.
uniform vec4 uBoxes[2];
uniform vec2 uHeights;
float centerWalk(vec2 p) {
  vec2 q = abs(p - uBuild.xy) - (uBuild.zw - uWalk.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uWalk.x;
}
// Signed px from a sidewalk's edge, negative on it: the Center's, or the quay's strip.
float walkDistance(vec2 p) {
  return min(centerWalk(p), uWalk.y - p.x);
}
// 1 where the building's shadow falls on a ground point o (a ray toward the sun hits its box), a few
// taps over the sun's disc so the edge is soft.
float boxShadow(vec3 o, vec3 sun, vec4 box, float top) {
  float shade = 0.0;
  for (int k = 0; k < 4; k++) {
    vec3 s = normalize(sun + vec3(float(k) - 1.5, mod(float(k) * 1.7, 2.0) - 1.0, 0.0) * 0.045);
    vec3 inv = 1.0 / s;
    vec3 t0 = (vec3(box.xy, 0.0) - o) * inv;
    vec3 t1 = (vec3(box.zw, top) - o) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float a = max(max(tmin.x, tmin.y), tmin.z);
    float b = min(min(tmax.x, tmax.y), tmax.z);
    shade += step(max(a, 0.0), b) * step(0.0, b);
  }
  return shade * 0.25;
}
`;

/**
 * Bake: the road lies flat with the faintest wear; the sidewalk stands a step proud with a rounded
 * kerb; the quay's wall drops to the sea's bed.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${CENTER}
void main() {
  vec2 p = uMin + vUv * uSize;
  float sd = walkDistance(p);
  float h = 0.3 * (fbm3(p / 90.0) - 0.5);
  float kind = 0.0;
  if (sd < 0.0) {
    h = uWalk.w * smoothstep(0.0, -4.0, sd);
    kind = 1.0;
  }
  if (p.x > uWalk.z) {
    float shelf = smoothstep(uWalk.z, uWalk.z + 70.0, p.x);
    h = mix(uWalk.w, mix(${(WATER_LEVEL - 14).toFixed(1)}, ${SEA_BED.toFixed(1)}, shelf), smoothstep(uWalk.z, uWalk.z + 5.0, p.x));
    kind = 2.0;
  }
  gl_FragColor = vec4(h, sd, 0.0, kind);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 ASPHALT = vec3(0.088, 0.118, 0.127);
const vec3 ASPHALT_MID = vec3(0.101, 0.133, 0.142);
const vec3 ASPHALT_LIT = vec3(0.196, 0.228, 0.256);
const vec3 WALK = vec3(0.567, 0.567, 0.392);
const vec3 WALK_LIT = vec3(0.644, 0.698, 0.644);
const vec3 KERB = vec3(0.432, 0.336, 0.221);
const vec3 LINE = vec3(0.637, 0.756, 0.778);
const vec3 SEA = vec3(0.218, 0.377, 0.561);
const vec3 SEA_DEEP = vec3(0.085, 0.149, 0.256);
const vec3 SEA_SHALLOW = vec3(0.2, 0.5, 0.58);
const vec3 SHADE_TINT = vec3(0.56, 0.66, 0.86);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${POKE_BALL}
${PAVING}
${EDGE_HAZE}
${PALETTE}
${CENTER}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
// The sidewalk's edge direction at p (the distance's gradient), for the kerb stones' courses.
vec2 walkGradient(vec2 p) {
  return normalize(vec2(walkDistance(p + vec2(1.0, 0.0)) - walkDistance(p - vec2(1.0, 0.0)), walkDistance(p + vec2(0.0, 1.0)) - walkDistance(p - vec2(0.0, 1.0))) + 1e-5);
}
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float sd = field.g;
  float kind = field.a;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  float lit = clamp(dot(n, sun) / sun.z, 0.0, 1.3) * mix(0.62, 1.0, light.a);

  // The asphalt: dark blue-grey in broad drifts, paler where tyres have polished it, a few mended
  // strips with ragged edges, hairline cracks that wander, oil stains, a grain below the eye.
  vec3 col = mix(ASPHALT, ASPHALT_MID, smoothstep(0.3, 0.7, fbm3(p / 170.0 + 2.0)));
  col = mix(col, ASPHALT_LIT * 0.8, 0.5 * smoothstep(0.55, 0.9, fbm3(vec2(p.x / 55.0, p.y / 340.0) + 7.0)));
  vec2 warp = (vec2(gnoise(p / 40.0), gnoise(p / 40.0 + 5.0)) - 0.5) * 14.0;
  vec2 strip = floor((p + warp) / vec2(230.0, 120.0));
  vec2 inStrip = fract((p + warp) / vec2(230.0, 120.0));
  float mended = step(0.82, hash12(strip + 4.0)) * step(0.05, inStrip.x) * step(inStrip.x, 0.95) * step(0.12, inStrip.y) * step(inStrip.y, 0.88);
  col = mix(col, ASPHALT * 0.86, mended * 0.5);
  float crackLine = abs(gnoise(p / 85.0 + 9.0 * vec2(gnoise(p / 230.0), gnoise(p / 230.0 + 3.0))) - 0.5);
  float crackZone = smoothstep(0.58, 0.72, fbm3(p / 300.0 + 11.0));
  col *= 1.0 - 0.34 * (1.0 - smoothstep(0.003, 0.012, crackLine)) * crackZone;
  col *= 1.0 - 0.22 * smoothstep(0.64, 0.8, fbm3(p / 44.0 + 12.0)) * smoothstep(0.5, 0.7, fbm3(p / 210.0 + 1.0));
  col *= 0.96 + 0.08 * gnoise(p / 2.8);
  // The Poke Ball painted on it: thin white lines, worn through here and there.
  float d = emblemDistance(p, uEmblem);
  float paint = 1.0 - smoothstep(0.0, 1.0, (d - 2.8 * uUnit + 1.1 * (gnoise(p / 5.0) - 0.5)) / 1.3);
  float worn = smoothstep(0.55, 0.78, fbm3(p / 19.0 + 5.0)) * 0.5;
  col = mix(col, LINE * (0.92 + 0.12 * gnoise(p / 7.0)), paint * (1.0 - worn));

  // The road's edge lines, a little off each kerb, and storm drains in the quay's kerb.
  if (kind < 0.5 && sd > 0.0) {
    float edgeLine = 1.0 - smoothstep(0.0, 1.0, (abs(sd - 17.0 * uUnit) - 2.0 * uUnit + 1.0 * (gnoise(p / 6.0) - 0.5)) / 1.2);
    col = mix(col, LINE * (0.9 + 0.12 * gnoise(p / 7.0)), edgeLine * (1.0 - worn * 1.3) * 0.9);
    float drainAlong = abs(fract(p.y / (300.0 * uUnit) + 0.37) - 0.5) * 300.0 * uUnit;
    float drain = (1.0 - smoothstep(10.0 * uUnit, 11.0 * uUnit, drainAlong)) * (1.0 - smoothstep(3.0, 4.0, abs(sd - 7.0 * uUnit))) * step(uWalk.y, p.x);
    float bars = step(0.5, fract(drainAlong / (3.4 * uUnit)));
    col = mix(col, vec3(0.03, 0.04, 0.045) * (0.8 + 0.5 * bars), drain);
  }
  // The sidewalk: cream slabs, each a shade of its own, grime at the kerb.
  if (kind > 0.5 && kind < 1.5) {
    vec3 slab = paving(p, vec2(44.0, 44.0) * uUnit, 0.0);
    vec3 cream = mix(WALK * 0.94, WALK_LIT, 0.3 + 0.7 * slab.y);
    cream *= 0.93 + 0.12 * fbm3(p / 21.0);
    cream *= 0.97 + 0.06 * gnoise(p / 3.2);
    cream = mix(cream, cream * 0.7, 1.0 - smoothstep(0.4, 1.5, slab.x));
    cream *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 22.0, -sd));
    col = cream;
    // The kerb: tan stones in a course along the edge.
    float kerbBand = smoothstep(-7.0, -6.0, sd) * (1.0 - smoothstep(-0.8, 0.0, sd));
    vec2 g = walkGradient(p);
    float along = dot(p, vec2(-g.y, g.x)) / (22.0 * uUnit);
    float stone = hash12(vec2(floor(along), floor(sd / 7.0)));
    float mortar = 1.0 - smoothstep(0.02, 0.07, abs(fract(along) - 0.5) * 2.0 - 0.9);
    vec3 kerb = KERB * (0.8 + 0.35 * stone) * (1.0 - 0.45 * mortar);
    col = mix(col, kerb, kerbBand);
  }
  // The quay's coping: stone along the wall's top.
  float coping = (1.0 - smoothstep(4.0, 6.0, uWalk.z - p.x)) * step(p.x, uWalk.z);
  col = mix(col, KERB * (0.9 + 0.2 * hash12(vec2(floor(p.y / (20.0 * uUnit)), 3.0))), coping * step(kind, 1.5) * 0.9);
  // The sea's bed under the shallow water: pale sand near the wall, dark out in the deep.
  if (kind > 1.5) {
    float depth = smoothstep(0.0, 70.0, p.x - uWalk.z);
    col = mix(vec3(0.33, 0.38, 0.32), SEA_DEEP * 0.7, depth) * (0.9 + 0.2 * gnoise(vec2(p.x / 7.0, p.y / 60.0)));
  }

  col *= 0.78 + 0.3 * min(lit, 1.2);
  col *= mix(0.62, 1.0, smoothstep(0.3, 0.9, light.b));
  // The buildings' shadows, cool where the sky fills them.
  float shadow = 0.0;
  if (kind < 1.5) {
    vec3 ground = vec3(p, max(field.r, 0.0));
    shadow = max(boxShadow(ground, sun, uBoxes[0], uHeights.x), boxShadow(ground, sun, uBoxes[1], uHeights.y)) * vGrowth;
  }
  col = mix(col, col * SHADE_TINT, shadow * 0.8);

  col = edgeHaze(col, vUv, 0.55);
  vec3 spark = vec3(0.95, 1.0, 1.1);
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

/**
 * The harbour: shallow green-blue over the sand by the wall, deepening to blue; long swells rolling
 * in against the quay, the sun glittering on their faces, foam lapping the wall.
 */
export const WATER_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${EDGE_HAZE}
${PALETTE}
${CENTER}
varying vec2 vPos;
varying vec2 vUv;
// The sea's height at p: two swells rolling toward the quay, crests lengthwise, and a chop.
float seaHeight(vec2 p, float t) {
  float along = p.y * 0.012 + 1.7 * gnoise(p / 150.0);
  float swell = sin(p.x * 0.052 + t * 0.9 + along) * 0.6 + sin(p.x * 0.031 - p.y * 0.008 + t * 0.55 + 2.0) * 0.4;
  float chop = (gnoise(vec2(p.x / 14.0 + t * 0.7, p.y / 22.0)) - 0.5) * 0.5;
  return swell + chop;
}
void main() {
  vec2 p = vPos;
  vec4 field = texture2D(uField, vUv);
  if (field.r > ${WATER_LEVEL.toFixed(1)} + 0.5 || revealBurned(p) * exitKeep(p) < 0.5) discard;
  float t = uTime;
  float wall = p.x - uWalk.z;
  vec3 col = mix(SEA_SHALLOW * 0.9, SEA, smoothstep(0.0, 120.0, wall));
  col = mix(col, SEA_DEEP * 1.2, smoothstep(80.0, 420.0, wall));
  // The swell's own shading, from its slope, and the sun glittering on the faces turned to it.
  float h = seaHeight(p, t);
  vec2 slope = vec2(seaHeight(p + vec2(1.5, 0.0), t) - h, seaHeight(p + vec2(0.0, 1.5), t) - h) / 1.5;
  vec3 n = normalize(vec3(-slope * 3.2, 1.0));
  vec3 view = normalize(uEye - vec3(p, ${WATER_LEVEL.toFixed(1)}));
  vec3 sun = normalize(uSun);
  col *= 0.88 + 0.22 * dot(n, sun) + 0.1 * h;
  float glitter = pow(max(dot(reflect(-sun, n), view), 0.0), 40.0);
  col += vec3(1.0, 0.98, 0.92) * glitter * 0.55;
  // Crests: a pale thread along each swell's top, breaking up as it runs.
  float crest = smoothstep(0.7, 0.95, h) * smoothstep(0.35, 0.65, gnoise(vec2(p.y / 190.0 + t * 0.05, p.x / 600.0)));
  col = mix(col, vec3(0.86, 0.95, 1.0), crest * 0.32 * smoothstep(10.0, 90.0, wall));
  col = mix(col, vec3(0.8, 0.9, 1.0) * 0.8, 0.18 * pow(1.0 - abs(dot(n, view)), 3.0));
  // The sandy bed shows its light ripples through the shallows.
  col += vec3(0.04, 0.07, 0.05) * (1.0 - smoothstep(0.0, 60.0, wall)) * smoothstep(0.35, 0.65, gnoise(vec2(p.x / 9.0 + 0.6 * sin(t * 0.5 + p.y * 0.02), p.y / 70.0)));
  // Foam where the swell breaks on the wall.
  float lap = 0.5 + 0.5 * sin(t * 0.8 + p.y * 0.04 + 3.0 * gnoise(p / 40.0));
  float foam = (1.0 - smoothstep(1.5, 4.0 + 5.0 * lap, wall)) * (0.55 + 0.45 * gnoise(p / 5.0));
  col = mix(col, vec3(0.97, 1.0, 1.03), foam * 0.85);
  col *= mix(0.8, 1.0, smoothstep(0.0, 18.0, wall));
  col = edgeHaze(col, vUv, 0.55);
  col += vec3(0.95, 1.0, 1.1) * revealGlow(p, 0.035) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w 0..1 how glossy, 2 and up a light at w - 1; 0.9 reads as glass).
const RED = [0.627, 0.067, 0.054, 0.3];
const RED_SHADE = [0.249, 0.057, 0.056, 0.2];
const DOME = [0.871, 0.102, 0.077, 0.45];
const CREAM = [0.5, 0.4, 0.28, 0.1];
const CREAM_PALE = [0.64, 0.62, 0.52, 0.1];
const WHITE = [0.92, 0.95, 0.92, 0.25];
const MULLION = [0.62, 0.7, 0.78, 0.3];
const NAVY = [0.038, 0.044, 0.087, 0.3];
const GLASS = [0.15, 0.3, 0.52, 0.9];
const GLASS_DARK = [0.04, 0.06, 0.13, 0.9];
const YELLOW = [1.0, 0.7, 0.06, 0.2];
const ROOF = [0.3, 0.32, 0.32, 0];
const UNIT = [0.46, 0.5, 0.54, 0.3];
const UNIT_TOP = [0.58, 0.62, 0.66, 0.3];
const FAN = [0.12, 0.13, 0.15, 0.3];
const TOWER = [0.03, 0.04, 0.075, 0];
const RAIL = [0.52, 0.58, 0.66, 0.5];
const LAMP_GLOBE = [1.5, 1.4, 1.1, 2.4];

/**
 * The Center: ground floor of glazing under a yellow stripe, a red band, a second glazed floor, a red
 * band, a cream cornice and a parapet round a flat roof with its units. Its faces run so that their
 * outer side is on the right of a to b: the one to the road (+x) runs toward the far end, the near
 * end (-y) runs toward +x.
 */
function pokemonCenterBuilding(props, spots) {
  const { center, entrance, roofUnits, u } = spots;
  const H = center.height;
  const faces = [
    { a: [center.x1, center.y0], b: [center.x1, center.y1], length: center.y1 - center.y0 },
    { a: [center.x0, center.y0], b: [center.x1, center.y0], length: center.x1 - center.x0 },
  ];
  const depth = 12 * u;
  const mid = [(center.x0 + center.x1) / 2, (center.y0 + center.y1) / 2];
  const half = [(center.x1 - center.x0) / 2, (center.y1 - center.y0) / 2];
  props.box({ x: mid[0], y: mid[1], z0: -2, z1: H, hw: half[0], hh: half[1], color: NAVY, topColor: ROOF });
  for (const { a, b, length } of faces) {
    const panes = Math.max(4, Math.round(length / (30 * u)));
    // Ground floor: a plinth, glass in pale mullions, the yellow stripe under the red band.
    wallBand(props, { a, b, depth, z0: -2, z1: 8 * u, over: 2 * u, color: CREAM_PALE });
    windowRun(props, { a, b, z0: 8 * u, z1: 42 * u, panes, rows: 2, glass: GLASS, frame: MULLION, frameW: 3 * u });
    wallBand(props, { a, b, depth, z0: 42 * u, z1: 48 * u, over: 1 * u, color: YELLOW });
    wallBand(props, { a, b, depth, z0: 48 * u, z1: 80 * u, over: 2 * u, color: RED, topColor: RED_SHADE });
    windowRun(props, { a, b, z0: 82 * u, z1: 118 * u, panes, rows: 2, glass: GLASS, frame: MULLION, frameW: 3 * u });
    wallBand(props, { a, b, depth, z0: 118 * u, z1: 148 * u, over: 2 * u, color: RED, topColor: RED_SHADE });
    wallBand(props, { a, b, depth, z0: 148 * u, z1: H - 6 * u, over: 5 * u, color: CREAM, topColor: CREAM_PALE });
  }
  // The roof: a parapet round it, a membrane of panels inside, units on it.
  const corners = [
    [center.x0, center.y0],
    [center.x1, center.y0],
    [center.x1, center.y1],
    [center.x0, center.y1],
  ];
  for (let k = 0; k < 4; k += 1) {
    wallBand(props, { a: corners[k], b: corners[(k + 1) % 4], depth: 5 * u, z0: H - 6 * u, z1: H + 5 * u, over: 0, color: CREAM_PALE, topColor: CREAM });
  }
  const { hut, skylights, tank } = spots;
  props.box({ x: hut.x, y: hut.y, z0: H, z1: H + hut.h, hw: hut.w / 2, hh: hut.d / 2, color: CREAM_PALE, topColor: CREAM, frontColor: CREAM_PALE });
  props.box({ x: hut.x + hut.w / 2 - 0.5, y: hut.y, z0: H, z1: H + hut.h * 0.72, hw: 1, hh: hut.d * 0.2, color: NAVY });
  for (const sky of skylights) {
    props.box({ x: sky.x, y: sky.y, z0: H, z1: H + 5 * u, hw: sky.w / 2, hh: sky.d / 2, color: UNIT, topColor: GLASS_DARK });
    props.quad([sky.x - sky.w / 2 + 3 * u, sky.y - sky.d / 2 + 3 * u, H + 5.4 * u], [sky.x + sky.w / 2 - 3 * u, sky.y - sky.d / 2 + 3 * u, H + 5.4 * u], [sky.x + sky.w / 2 - 3 * u, sky.y + sky.d / 2 - 3 * u, H + 5.4 * u], [sky.x - sky.w / 2 + 3 * u, sky.y + sky.d / 2 - 3 * u, H + 5.4 * u], GLASS);
  }
  props.cylinder({ x: tank.x, y: tank.y, z0: H, z1: H + tank.h, r: tank.r, color: UNIT, capColor: UNIT_TOP, sides: 18, domeRise: 6 * u });
  props.tube([[tank.x + tank.r, tank.y, H + tank.h * 0.3], [tank.x + tank.r + 26 * u, tank.y, H + tank.h * 0.3], [tank.x + tank.r + 26 * u, tank.y + 90 * u, H + 3 * u]], 2.2 * u, UNIT, { sides: 8 });
  for (const unit of roofUnits) {
    props.box({ x: unit.x, y: unit.y, z0: H, z1: H + unit.h, hw: unit.w / 2, hh: unit.d / 2, color: UNIT, topColor: UNIT_TOP });
    if (unit.fan) props.cylinder({ x: unit.x, y: unit.y, z0: H + unit.h, z1: H + unit.h + 1.2, r: Math.min(unit.w, unit.d) * 0.36, color: FAN, sides: 14 });
  }
  // The entrance: a glass drum on the face, a white collar and a red dome over it.
  props.cylinder({ x: entrance.x, y: entrance.y, z0: -2, z1: 50 * u, r: entrance.r, color: GLASS, capColor: GLASS_DARK, sides: 28 });
  props.ring({ x: entrance.x, y: entrance.y, z0: 18 * u, z1: 24 * u, r: entrance.r + 0.8, color: MULLION, sides: 28 });
  props.cylinder({ x: entrance.x, y: entrance.y, z0: 50 * u, z1: 56 * u, r: entrance.r + 10 * u, color: WHITE, capColor: DOME, sides: 32, domeRise: 20 * u });
}

/** The dark tower off the far end: a block of lit blue-grey glass over a navy core. */
function darkTower(props, spots) {
  const { tower, u } = spots;
  props.box({
    x: (tower.x0 + tower.x1) / 2,
    y: (tower.y0 + tower.y1) / 2,
    z0: -2,
    z1: tower.height,
    hw: (tower.x1 - tower.x0) / 2,
    hh: (tower.y1 - tower.y0) / 2,
    color: TOWER,
    topColor: [0.05, 0.06, 0.1, 0],
  });
  windowRun(props, {
    a: [tower.x0, tower.y0],
    b: [tower.x1, tower.y0],
    z0: 14 * u,
    z1: tower.height - 20 * u,
    panes: Math.round((tower.x1 - tower.x0) / (34 * u)),
    rows: 5,
    glass: GLASS_DARK,
    frame: TOWER,
    frameW: 6 * u,
  });
}

/** The quay's rail along the right band and the two lamps by it: a post topped with a glowing globe. */
function quayProps(props, spots) {
  const { quayX, scene, lamps, u } = spots;
  const x = quayX - 6 * u;
  const step = 52 * u;
  const y0 = scene.y + 14 * u;
  const y1 = scene.y + scene.h - 14 * u;
  for (let y = y0; y <= y1; y += step) props.cylinder({ x, y, z0: -2, z1: 42 * u, r: 2.2 * u, color: RAIL, sides: 8 });
  for (const z of [22 * u, 40 * u]) props.tube([[x, y0, z], [x, y1, z]], 1.5 * u, RAIL, { sides: 8 });
  for (const lamp of lamps) {
    props.tube([[lamp.x, lamp.y, -2], [lamp.x, lamp.y, lamp.h]], [5.6 * u, 3.2 * u], RAIL, { sides: 12 });
    props.cylinder({ x: lamp.x, y: lamp.y, z0: lamp.h, z1: lamp.h + 3 * u, r: 6 * u, color: RAIL, sides: 12 });
    props.sphere({ x: lamp.x, y: lamp.y, z: lamp.h + 12 * u, r: 9 * u, color: LAMP_GLOBE, sides: 14, rings: 9 });
  }
}

/** Everything solid: the Center, the tower, the quay's rail and lamps, as one prop geometry. */
export function centerProps(spots) {
  const props = createPropBuilder();
  pokemonCenterBuilding(props, spots);
  darkTower(props, spots);
  quayProps(props, spots);
  return props;
}

/** The props in the bright day: sun and a pale sky, glass that shows the sky and a sun glint, bands shaded under their overhangs. */
const PROP_LIGHT = /* glsl */ `
uniform float uUnit;
// The two flat roofs' heights (the Center's, the tower's).
uniform vec2 uHeights;
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  // A flat roof: sheets of membrane laid side by side with a seam between, stained by rain, a pale
  // ballast edge where the parapet shades it.
  float onRoof = step(0.97, n.z) * step(metal, 0.02) * (step(abs(world.z - uHeights.x), 1.5) + step(abs(world.z - uHeights.y), 1.5));
  if (onRoof > 0.5) {
    float sheet = world.x / (40.0 * uUnit);
    float toSeam = min(fract(sheet), 1.0 - fract(sheet)) * 40.0 * uUnit;
    albedo *= 0.9 + 0.2 * hash12(vec2(floor(sheet), 4.0));
    albedo *= 0.88 + 0.24 * fbm3(world.xy / 60.0);
    albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.4, 1.5, toSeam));
    albedo += vec3(0.05) * smoothstep(0.6, 0.8, fbm3(world.xy / 24.0 + 3.0));
  }
  vec3 view = normalize(uEye - world);
  float lit = max(dot(n, sun), 0.0);
  vec3 col = albedo * (vec3(0.5, 0.58, 0.72) * (0.6 + 0.4 * n.z) + vec3(1.0, 0.97, 0.9) * lit * 0.8);
  if (metal > 0.6) {
    // Glass: a mirror of the pale sky with the dark room behind it, a hot glint of the sun.
    vec3 r = reflect(-view, n);
    vec3 sky = mix(vec3(0.5, 0.64, 0.82), vec3(0.86, 0.94, 1.02), clamp(r.z + 0.2, 0.0, 1.0));
    float fres = pow(1.0 - abs(dot(n, view)), 2.0);
    col = mix(albedo * (0.6 + 0.6 * lit), sky * 0.85, 0.2 + 0.5 * fres);
    col += vec3(1.0) * pow(max(dot(reflect(-sun, n), view), 0.0), 50.0) * 0.7;
  }
  // The band above shades the glazing under it.
  float band = 48.0 * uUnit;
  float band2 = 118.0 * uUnit;
  float under = exp(-max(band - world.z, 0.0) / (5.0 * uUnit)) * step(world.z, band) + exp(-max(band2 - world.z, 0.0) / (5.0 * uUnit)) * step(world.z, band2) * step(82.0 * uUnit, world.z);
  col *= 1.0 - 0.3 * under * step(0.3, albedo.b + albedo.g) * step(metal, 0.95);
  // Grime and wear at a wall's foot.
  col *= mix(0.8, 1.0, smoothstep(0.0, 14.0 * uUnit, world.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, uniforms: '', reveal: 'vec3(0.95, 1.0, 1.1)' });

/** Pokemon Center's board (stadium-environment-mesh.js BOARDS). */
export function pokemonCenterBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...CENTER_SUN).normalize() },
    uBuild: { value: new three.Vector4() },
    uWalk: { value: new three.Vector4() },
    uEmblem: { value: new three.Vector3() },
    uUnit: { value: 1 },
    uBoxes: { value: [new three.Vector4(), new three.Vector4()] },
    uHeights: { value: new three.Vector2() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    // Pushed back a hair so the quay's wall at the water's level wins the depth test, not flickers.
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
    spots: (layout) => centerSpots(layout),
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uUnit.value = u;
      if (spots) {
        const { center, centerKerb, walk, quayX, quayKerb } = spots;
        const grown = { x0: center.x0 - walk, y0: center.y0 - walk, x1: centerKerb, y1: center.y1 + walk };
        own.uBuild.value.set((grown.x0 + grown.x1) / 2, (grown.y0 + grown.y1) / 2, (grown.x1 - grown.x0) / 2, (grown.y1 - grown.y0) / 2);
        own.uWalk.value.set(70 * u, quayKerb, quayX, KERB_RISE_PX);
        own.uEmblem.value.set(spots.emblem?.x ?? 0, spots.emblem?.y ?? 0, spots.emblem?.r ?? 0);
        own.uBoxes.value[0].set(...boxOf(center));
        own.uBoxes.value[1].set(...boxOf(spots.tower));
        own.uHeights.value.set(center.height, spots.tower.height);
      } else {
        own.uBuild.value.set(0, 0, 1e5, 1e5);
        own.uWalk.value.set(0, -1e5, 1e5, KERB_RISE_PX);
        own.uEmblem.value.set(0, 0, 0);
        own.uBoxes.value.forEach((box) => box.set(0, 0, 0, 0));
        own.uHeights.value.set(0, 0);
      }
      replaceGeometry(terrain, terrainGrid(bounds));
      replaceGeometry(water, new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0));
      props.visible = Boolean(spots);
      if (spots) replaceGeometry(props, centerProps(spots).build(three));
    },
  };
}
