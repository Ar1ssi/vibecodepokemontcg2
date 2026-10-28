// Design 077 (prototype): Magnetic Storm (customhb-358) after its card art (FLF 91, Ryo Ueda): a
// marsh plain at night under a green and violet aurora, dry olive-brown reeds and wet black mud,
// bare gnarled trees against dark hills, a Poke Ball glowing pink and white on the ground with pink
// pools of light round it, and white-blue lightning arcing between them. The art looks across the
// marsh at the hills; the board looks down on it, so the trampled mud holds every card with the ring
// round the Actives, the reeds stand thick in the margins, a pad of pink light lies in each side band
// on a coil post with a lightning arc leaping to the next, bare trees stand off the far end and in
// the far corners, and the aurora lights the ground in slow drifting colour.
// The storm is magnetic and the board shows it: a tall coil pylon stands at each side's pole, the iron
// dust of the marsh lies along the flux between them in fine dashes, a dome of force field closes the
// whole arena (a faint blue sheen, its rim glowing where it is seen edge-on) and each strike of
// lightning from a pad lands on it, now and then sending a ring of light out across it. The field is
// not always there: it swells into view and fades out again on a slow beat, each part of it on its
// own, so it never sits over the cards for long. A vortex of dark mist turns over the ground.
// World scale: a card's footprint is a trampled patch of mud; a reed stands a hand high.
//
// Bake, once per layout: BAKE_FIELD is the flat marsh (R height px) with the clearing's distance in
// G; the shared light bake adds nothing. Per frame: TERRAIN paints the mud, puddles, reeds, the ring,
// the pads, the iron dust along the field, the mist, the aurora's wash and the lightning's flashes;
// PROPS the trees, boulders, reeds and pylons; BOLTS the lightning's ribbons (additive); DOME the
// force field (additive, one hemisphere of unit directions the shader scales to the arena).
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
import { boardContext, hash } from './stadium-env-spots.mjs';
import { BLADES, EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const STORM_KEY = 'magnetic-storm';
/** The moonless night's light (toward it): the aurora's, low and wide, from the far left. */
export const STORM_LIGHT = Object.freeze([-0.3, 0.5, 0.6]);
/** Least trampled mud kept round the cards' box before the reeds begin, and how far its edge wanders. */
export const CLEARING_PX = 36;
export const CLEARING_WOBBLE_PX = 70;
export const MAX_PADS = 4;
/** Two links between the pads, then one strike from each pad up to the force field. */
export const MAX_ARCS = 6;
/** Only every sixth strike from a pad sends a ring out across the field. */
export const RIPPLE_EVERY = 6;
/** Seconds a ring runs for. */
export const RIPPLE_SECONDS = 4;
export const MAX_IMPACTS = 4;
export const MAX_TREES = 6;
export const MAX_CLUMPS = 170;
const BOLT_POINTS = 16;
/** Heights of the coil posts (card-scale px): a pad's, a pole's. */
const PAD_POST_PX = 46;
const POLE_PX = 150;

/** A signed distance in px from the clearing's edge at (x, y), negative on it (the shader's `clearingDistance`). */
export const clearingWobble = (x, y) =>
  0.5 +
  0.3 * Math.sin(x * 0.021 + 1.3) * Math.sin(y * 0.017 + 0.4) +
  0.2 * Math.sin((x + y) * 0.013 + 2.2) +
  0.16 * Math.sin(x * 0.047 - y * 0.039 + 0.7);

/**
 * One lightning bolt from `from` to `to` ([x, y, z]), jagged: each point pushed a little aside in the
 * plane and up and down, more in the middle, the whole arching up by `arch` px. Seeded, so it is the
 * same every time.
 */
export function boltPath(from, to, arch, jag, seed) {
  const points = [];
  for (let k = 0; k <= BOLT_POINTS; k += 1) {
    const s = k / BOLT_POINTS;
    const bend = Math.sin(Math.PI * s);
    const roll = (salt) => hash(seed, k, salt) - 0.5;
    points.push([
      from[0] + (to[0] - from[0]) * s + roll(1) * jag * bend * 2,
      from[1] + (to[1] - from[1]) * s + roll(2) * jag * bend * 2,
      from[2] + (to[2] - from[2]) * s + arch * bend + roll(3) * jag * bend * 1.2,
    ]);
  }
  return points;
}

/**
 * Magnetic Storm's layout: the clearing, the ring, the pads and the bolts between them, the trees,
 * the boulders and the reed clumps. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function stormSpots(layout) {
  const ctx = boardContext(layout, STORM_KEY);
  if (!ctx) return null;
  const { scene, table, core, u, hand, centre } = ctx;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  const reach = Math.max(Math.abs(core.x), core.x + core.w);
  const sideX = Math.max(reach + 120 * u, table.w * 0.5 - 70 * u);
  // Two pads a side, one at each end of the side bands; a bolt leaps from each to its partner.
  const pads = [];
  for (const side of [-1, 1]) {
    for (const share of [0.12, 0.84]) {
      pads.push({ x: centre.x + side * sideX, y: core.y + core.h * share, r: 34 * u, side });
    }
  }
  // The poles: a tall coil pylon in the middle of each side band, the north one pink on the left, the south one cyan on the right.
  const poleX = sideX + 56 * u;
  const poles = [-1, 1].map((side) => ({ x: centre.x + side * poleX, y: centre.y, r: 30 * u, h: POLE_PX * u, side }));
  // The force field: a dome over the whole arena, its rim at the scene's edges, grown where the pads and poles would stand outside it.
  const spread = [...poles, ...pads].reduce((worst, p) => Math.max(worst, ((p.x - centre.x) / (scene.w * 0.46)) ** 2 + ((p.y - centre.y) / (scene.h * 0.44)) ** 2), 0);
  const grow = Math.max(1, Math.sqrt(spread / 0.85));
  const dome = { x: centre.x, y: centre.y, a: scene.w * 0.46 * grow, b: scene.h * 0.44 * grow };
  dome.h = Math.min(dome.a, dome.b) * 0.92;
  const postTop = PAD_POST_PX * u;
  const arcs = [];
  for (let side = 0; side < 2; side += 1) {
    const a = pads[side * 2];
    const b = pads[side * 2 + 1];
    arcs.push({
      pads: [side * 2, side * 2 + 1],
      points: boltPath([a.x, a.y, postTop], [b.x, b.y, postTop], 96 * u, 34 * u, side * 7 + 1),
      period: 3.4 + 1.1 * side,
      phase: 0.35 + 0.4 * side,
    });
  }
  // A strike from each pad's post up to the force field: where it lands the field's cells light and a ripple runs out.
  pads.forEach((pad, i) => {
    const azimuth = Math.atan2((pad.y - dome.y) / dome.b, (pad.x - dome.x) / dome.a);
    const elevation = 0.7 + 0.35 * hash(i, 2, 1);
    const dir = [Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation)];
    const landing = [dome.x + dome.a * dir[0], dome.y + dome.b * dir[1], dome.h * dir[2]];
    arcs.push({
      pads: [i, i],
      points: boltPath([pad.x, pad.y, postTop], landing, 30 * u, 30 * u, i * 13 + 3),
      period: 4.6 + 0.9 * i,
      phase: 0.1 + 0.23 * i,
      dir,
    });
  });
  const nearPylon = (x, y, gap) => [...poles, ...pads].every((p) => Math.hypot(x - p.x, y - p.y) > p.r + gap);
  const treeSlots = [
    [-0.82, 0.3],
    [0.8, 0.46],
    [-0.62, 1.12],
    [0.58, 1.18],
    [-0.9, 0.78],
    [0.9, 0.9],
  ];
  const trees = treeSlots
    .map(([sx, sy], k) => ({ x: centre.x + sx * Math.max(sideX + 80 * u, table.w * 0.5), y: core.y + sy * core.h, h: (150 + 50 * hash(sx, sy, 1)) * u, seed: hash(sx, sy, 2), k }))
    .filter((tree) => ctx.inScene(tree.x, tree.y, 40 * u) && ctx.clear(tree.x, tree.y, 50 * u + tree.h * 0.5, 14 * u) && nearPylon(tree.x, tree.y, 70 * u))
    .slice(0, MAX_TREES);
  const boulders = [];
  for (let k = 0; k < 9; k += 1) {
    const x = scene.x + 60 * u + hash(k, 4, 1) * (scene.w - 120 * u);
    const y = core.y + (0.05 + 1.1 * hash(k, 4, 2)) * core.h;
    const r = (14 + 20 * hash(k, 4, 3)) * u;
    if (ctx.clear(x, y, r + 18 * u, 8 * u) && nearPylon(x, y, r + 24 * u)) boulders.push({ x, y, r });
  }
  // Reed clumps over the scene outside the clearing, clear of the pads and the trees' feet.
  const clumps = [];
  const step = 62 * u;
  for (let gy = scene.y + step / 2; gy < scene.y + scene.h && clumps.length < MAX_CLUMPS; gy += step) {
    for (let gx = scene.x + step / 2; gx < scene.x + scene.w && clumps.length < MAX_CLUMPS; gx += step) {
      const roll = (salt) => hash(gx, gy, salt + 60);
      const x = gx + (roll(1) - 0.5) * step * 0.9;
      const y = gy + (roll(2) - 0.5) * step * 0.9;
      if (roll(3) > 0.78 || !ctx.inScene(x, y, 10 * u)) continue;
      const out = distanceOut(ctx.core, x, y);
      if (out < (CLEARING_PX + CLEARING_WOBBLE_PX * 0.7) * u + 22 * u) continue;
      if (!nearPylon(x, y, 22 * u)) continue;
      if (!ctx.clear(x, y, 10 * u, 18 * u)) continue;
      clumps.push({ x, y, h: (24 + 24 * roll(4)) * u, lean: roll(5) * 6.28, seed: roll(6), blades: 7 + Math.floor(roll(7) * 4) });
    }
  }
  return { ...ctx, handEnd, pads, poles, dome, arcs, trees, boulders, clumps, ring: craterEmblem(layout, centre) };
}

const distanceOut = (rect, x, y) => Math.hypot(Math.max(rect.x - x, 0, x - rect.x - rect.w), Math.max(rect.y - y, 0, y - rect.y - rect.h));

const STORM = /* glsl */ `
// The cards' box (x0, y0, x1, y1); the ring (x, y, radius; 0: none); the scale of a card (u); every
// pad (x, y, radius; 0: none) with its strike's strength this frame (w).
uniform vec4 uCore;
uniform vec3 uRing;
uniform float uUnit;
uniform vec4 uPads[${MAX_PADS}];
// The poles (x, y, radius; 0: none), north then south; the force field's centre and half sizes (x, y,
// a, b) and its height; the strikes' landings on it (unit direction, seconds since the strike; below
// 0: none).
uniform vec3 uPoleA;
uniform vec3 uPoleB;
uniform vec4 uDome;
uniform float uDomeHeight;
uniform vec4 uImpacts[${MAX_IMPACTS}];
// The flux of two opposite point poles at p (cos of the angle each makes with the axis, one from the
// other): its level lines are the field lines, 0 far out round them up to 2 on the axis between.
float flux(vec2 p) {
  vec2 a = p - uPoleA.xy;
  vec2 b = p - uPoleB.xy;
  vec2 axis = normalize(uPoleB.xy - uPoleA.xy);
  return dot(a, axis) / (length(a) + 1.0) - dot(b, axis) / (length(b) + 1.0);
}
// The poles' potential at p: falling along every field line from the north pole to the south.
float potential(vec2 p) {
  return uUnit * 260.0 * (1.0 / (length(p - uPoleA.xy) + 40.0 * uUnit) - 1.0 / (length(p - uPoleB.xy) + 40.0 * uUnit));
}
float wobble(vec2 p) {
  return 0.5 + 0.3 * sin(p.x * 0.021 + 1.3) * sin(p.y * 0.017 + 0.4) + 0.2 * sin((p.x + p.y) * 0.013 + 2.2) + 0.16 * sin(p.x * 0.047 - p.y * 0.039 + 0.7);
}
// Signed px from the trampled clearing's edge, negative on it.
float clearingDistance(vec2 p) {
  float box = length(max(max(uCore.xy - p, p - uCore.zw), 0.0));
  return box - ${CLEARING_PX.toFixed(1)} * uUnit - ${CLEARING_WOBBLE_PX.toFixed(1)} * uUnit * wobble(p);
}
// How much of the force field shows at p, 0..1: it fades out of view altogether for a while, and
// while it is there a swell runs round it, so each part comes and goes on its own beat.
float fieldPresence(vec2 p) {
  vec2 rel = (p - uDome.xy) / max(uDome.zw, vec2(1.0));
  float gate = smoothstep(-0.25, 0.55, sin(uTime * 0.23 + 1.0));
  float swell = smoothstep(0.1, 0.95, 0.5 + 0.5 * sin(uTime * 0.55 - atan(rel.y, rel.x) + length(rel) * 2.0));
  return gate * (0.2 + 0.8 * swell);
}
// The strike's flash 0..1: a quick flicker up, then a slow fade, once every period, offset by phase.
float strike(float period, float phase) {
  float t = fract(uTime / period + phase);
  float flash = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(0.03, 0.2, t));
  return flash * (0.65 + 0.35 * step(0.5, fract(t * 61.0))) + 0.18 * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.2, 0.5, t));
}
`;

/** Bake: the marsh lies flat. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = uMin + vUv * uSize;
  gl_FragColor = vec4(0.5 * (fbm3(p / 60.0) - 0.5), 0.0, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 MUD = vec3(0.056, 0.054, 0.051);
const vec3 WATER = vec3(0.071, 0.088, 0.094);
const vec3 REED = vec3(0.144, 0.117, 0.058);
const vec3 REED_DARK = vec3(0.045, 0.047, 0.038);
const vec3 PINK = vec3(1.008, 0.077, 0.479);
const vec3 PINK_SOFT = vec3(0.617, 0.071, 0.345);
const vec3 RING_WHITE = vec3(1.866, 1.596, 1.866);
const vec3 AURORA_BLUE = vec3(0.085, 0.442, 0.618);
const vec3 AURORA_VIOLET = vec3(0.196, 0.085, 0.496);
const vec3 BOLT = vec3(1.2, 1.45, 1.7);
const vec3 DUST = vec3(0.2, 0.25, 0.34);
const vec3 MIST = vec3(0.07, 0.05, 0.13);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${POKE_BALL}
${BLADES}
${EDGE_HAZE}
${PALETTE}
${STORM}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float t = uTime;
  float d = clearingDistance(p);
  float u = uUnit;

  // The ground: wet black-brown mud in the trampled clearing; outside it dry olive-brown grass lying
  // in swathes over the mud, broad drifts of dark and pale. Puddles in the low places hold the sky
  // as dark glass, the aurora's colour only a gleam on it.
  float wild = smoothstep(-10.0 * u, 100.0 * u, d + 8.0 * u * (gnoise(p / 24.0) - 0.5));
  vec3 mud = mix(MUD * 0.8, MUD * 1.5, smoothstep(0.3, 0.7, fbm3(p / 110.0 + 2.0)));
  mud *= 0.88 + 0.24 * fbm3(p / 26.0 + 5.0);
  vec3 turf = mix(REED_DARK * 1.5, REED * 0.8, smoothstep(0.3, 0.75, fbm3(p / 150.0 + 6.0)));
  turf *= 0.86 + 0.28 * fbm3(p / 19.0 + 2.0);
  vec3 col = mix(mud, turf, wild * 0.85);
  float puddleMask = smoothstep(0.66, 0.74, fbm3(p / 70.0 + 9.0)) * (0.35 + 0.65 * smoothstep(0.0, 40.0 * u, d + 20.0 * u));
  vec3 view = normalize(uEye - vec3(p, 0.0));
  vec3 ripple = normalize(vec3((gnoise(p / 7.0 + t * 0.2) - 0.5) * 0.6, (gnoise(p / 7.0 + 5.0 - t * 0.17) - 0.5) * 0.6, 1.0));
  float sky = pow(clamp(reflect(-view, ripple).z, 0.0, 1.0), 3.0);
  float auroraBand = 0.5 + 0.5 * sin(p.x * 0.007 + p.y * 0.004 + t * 0.12 + 2.0 * fbm3(p / 300.0));
  vec3 aurora = mix(AURORA_VIOLET, AURORA_BLUE, auroraBand);
  col = mix(col, WATER * 0.55 + aurora * 0.22 * sky, puddleMask * 0.92);

  // Reeds: tufts of long blades in the dry grass, thick toward the edge of the scene.
  vec4 tuft = voronoiCell(p / (12.0 * u) + 1.7);
  vec2 blades = bladeFan(-tuft.zw * 12.0 * u, tuft.y, 17.0 * u);
  float reeds = blades.x * step(fract(tuft.y * 19.7), 0.5 + 0.45 * wild) * wild * (1.0 - puddleMask);
  col = mix(col, mix(REED_DARK, REED * 1.15, blades.y), reeds * 0.95);
  // Inside the clearing a few short tufts, trampled.
  col = mix(col, REED_DARK * 1.3, blades.x * step(fract(tuft.y * 19.7), 0.2) * (1.0 - wild) * 0.5);

  // The Poke Ball: the glowing pink and white line the art shows, with a soft bloom.
  float rd = emblemDistance(p, uRing);
  float line = 1.0 - smoothstep(0.8 * u, 2.6 * u, rd);
  float bloom = exp(-pow(rd / (13.0 * u), 2.0));
  float breath = 0.88 + 0.12 * sin(t * 1.6);
  col += PINK_SOFT * 0.45 * bloom * breath;
  col = mix(col, mix(PINK * 0.9, RING_WHITE, smoothstep(0.0, 1.0, 1.0 - rd / (2.2 * u))), line);

  // The pads: a pink pool of light on the ground, a hot white-pink heart, pulsing; flashing with its bolt.
  vec3 lightning = vec3(0.0);
  for (int i = 0; i < ${MAX_PADS}; i++) {
    vec4 pad = uPads[i];
    if (pad.z <= 0.0) continue;
    float dist = distance(p, pad.xy) / pad.z;
    float pool = exp(-dist * dist * 1.6);
    float heart = exp(-dist * dist * 9.0);
    col += PINK_SOFT * 0.8 * pool * (0.8 + 0.2 * sin(t * 1.4 + float(i) * 2.0)) + mix(PINK, RING_WHITE, 0.45) * 0.55 * heart;
    lightning += vec3(0.55, 0.7, 1.0) * pad.w * exp(-dist * dist * 0.35) * 0.8;
  }
  // The storm: a vortex of dark mist turning about the force field's centre, thicker toward the middle.
  vec2 rel = p - uDome.xy;
  float cr = length(rel / max(uDome.zw, vec2(1.0)));
  float turn = 2.4 * exp(-cr * 1.3) + t * 0.025;
  vec2 swirled = vec2(cos(turn) * rel.x - sin(turn) * rel.y, sin(turn) * rel.x + cos(turn) * rel.y);
  float mist = smoothstep(0.5, 0.82, fbm3(swirled / 230.0 + 3.0 + vec2(t * 0.01, 0.0)));
  col = mix(col, MIST * (1.0 + lightning * 6.0), mist * 0.38);

  // The magnetic field: the marsh's iron dust lies along the poles' flux, dashes brightening as a
  // pulse runs along their line from the north pole to the south.
  if (uPoleA.z > 0.0) {
    vec2 wob = (vec2(gnoise(p / 150.0 + vec2(t * 0.06, 0.0)), gnoise(p / 150.0 + vec2(9.0, t * 0.05))) - 0.5) * 40.0 * u;
    vec2 q = p + wob;
    float psi = flux(q);
    float eps = 2.0;
    vec2 grad = vec2(flux(q + vec2(eps, 0.0)) - psi, flux(q + vec2(0.0, eps)) - psi) / eps;
    float slope = max(length(grad), 1e-5);
    float volts = potential(q);
    float run = sign(volts) * log(1.0 + abs(volts) * 3.0);
    float inside = 1.0 - smoothstep(0.9, 1.2, cr);
    // Twelve level lines of the flux between the poles, a pulse running along each.
    float levels = psi * 6.0;
    float gap = abs(fract(levels + 0.5) - 0.5) / (6.0 * slope);
    float lineId = floor(levels + 0.5);
    float core = exp(-gap * gap / (2.0 * 1.4 * 1.4 * u * u));
    float pulse = smoothstep(0.55, 1.0, fract(run * 1.15 - t * 0.38 + hash12(vec2(lineId, 3.0))));
    // The iron dust: fine dashes along a hundred and twenty lines, thinning out where the lines crowd.
    float fine = psi * 120.0;
    float spacing = 1.0 / (120.0 * slope);
    float gap2 = abs(fract(fine + 0.5) - 0.5) / (120.0 * slope);
    float dashes = smoothstep(0.5, 0.72, gnoise(vec2(run * 36.0, floor(fine + 0.5) * 3.7)));
    float dust = (1.0 - smoothstep(0.4 * u, 1.2 * u, gap2)) * dashes * smoothstep(3.0, 7.0, spacing) * (1.0 - puddleMask);
    col = mix(col, DUST * (0.7 + 0.8 * pulse + 0.5 * core), dust * 0.55 * (0.3 + 0.7 * inside));
  }

  // The aurora's wash over the whole marsh, drifting, strongest toward the far end.
  float far = smoothstep(0.0, 1.0, (p.y - uMin.y) / uSize.y);
  col += aurora * 0.05 * (0.5 + 0.8 * far) * (0.5 + 0.5 * fbm3(p / 260.0 + t * 0.02));
  col += lightning * (0.5 + 0.5 * puddleMask);

  col = edgeHaze(col, vUv, 0.4);
  vec3 spark = vec3(0.7, 0.9, 1.1);
  col += spark * revealGlow(p, 0.035) * 0.6;
  col += spark * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.12 bark, 0.16 reed, 0.2 rock).
const BARK = [0.07, 0.06, 0.05, 0.12];
const ROCK = [0.11, 0.105, 0.105, 0.2];
const REED_COLOR = [0.2, 0.16, 0.065, 0.16];
const IRON = [0.07, 0.075, 0.09, 0.3];
const COPPER = [0.5, 0.2, 0.09, 0.3];
const ORB_PINK = [1.4, 0.18, 0.8, 2.4];
const ORB_CYAN = [0.35, 1.0, 1.5, 2.4];

/** A coil pylon: an iron plinth, a tapering iron column wound with copper rings, a glowing orb on top. */
function pylon(props, p, u) {
  props.cylinder({ x: p.x, y: p.y, z0: -3, z1: 8 * u, r: p.r * 1.5, color: IRON, sides: 18 });
  props.tube([[p.x, p.y, 6 * u], [p.x, p.y, p.h * 0.5], [p.x, p.y, p.h]], [p.r * 0.7, p.r * 0.52, p.r * 0.4], IRON, { sides: 14 });
  const coils = Math.max(4, Math.round(p.h / (22 * u)));
  for (let k = 0; k < coils; k += 1) {
    const z = p.h * (0.16 + (0.72 * k) / (coils - 1));
    props.ring({ x: p.x, y: p.y, z0: z - 3 * u, z1: z + 3 * u, r: p.r * (0.95 - 0.35 * (z / p.h)), color: COPPER, sides: 18 });
  }
  props.sphere({ x: p.x, y: p.y, z: p.h + p.r * 0.45, r: p.r * 0.5, color: p.orb, sides: 16, rings: 10 });
}

/** A bare tree: a forking trunk of tapering boughs reaching up and out, twisted. */
function bareTree(props, tree, u) {
  const branch = (from, angle, tilt, length, radius, depth) => {
    const mid = [
      from[0] + Math.cos(angle) * Math.sin(tilt) * length * 0.5 + (hash(from[0], depth, 3) - 0.5) * 8 * u,
      from[1] + Math.sin(angle) * Math.sin(tilt) * length * 0.5 + (hash(from[1], depth, 4) - 0.5) * 8 * u,
      from[2] + Math.cos(tilt) * length * 0.5,
    ];
    const to = [
      from[0] + Math.cos(angle) * Math.sin(tilt) * length,
      from[1] + Math.sin(angle) * Math.sin(tilt) * length,
      from[2] + Math.cos(tilt) * length,
    ];
    props.tube([from, mid, to], [radius, radius * 0.8, radius * 0.55], BARK, { sides: 8 });
    if (depth <= 0) return;
    for (let k = 0; k < 3; k += 1) {
      const roll = hash(to[0] + k, to[1] + depth, 9);
      branch(to, angle + (k - 1) * 1.0 + (roll - 0.5) * 0.6, Math.min(1.35, tilt + 0.2 + 0.3 * roll), length * 0.66, radius * 0.6, depth - 1);
    }
  };
  props.tube([[tree.x, tree.y, -3], [tree.x, tree.y, tree.h * 0.12], [tree.x, tree.y, tree.h * 0.2]], [16 * u, 11 * u, 8.5 * u], BARK, { sides: 10 });
  for (let k = 0; k < 3; k += 1) {
    branch([tree.x, tree.y, tree.h * 0.18], tree.seed * 6 + k * 2.1, 0.22 + 0.15 * k, tree.h * 0.45, 8.4 * u, 3);
  }
}

/** Reed clumps: each a fan of thin tapering blades leaning out, dry olive-brown, some bent over. */
function reedClumps(props, clumps, u) {
  for (const clump of clumps) {
    for (let b = 0; b < clump.blades; b += 1) {
      const roll = (salt) => hash(clump.seed * 100, b, salt);
      const angle = clump.lean + (b / clump.blades) * 6.28 + roll(1) * 0.5;
      const lean = 0.18 + 0.4 * roll(2);
      const h = clump.h * (0.6 + 0.4 * roll(3));
      const tip = [clump.x + Math.cos(angle) * h * lean, clump.y + Math.sin(angle) * h * lean, h];
      const mid = [clump.x + Math.cos(angle) * h * lean * 0.35, clump.y + Math.sin(angle) * h * lean * 0.35, h * 0.55];
      props.tube([[clump.x, clump.y, -1], mid, tip], [1.5 * u, 1.1 * u, 0.15 * u], REED_COLOR, { sides: 4 });
    }
  }
}

/** The props, as one geometry. */
export function stormProps(spots) {
  const props = createPropBuilder();
  for (const tree of spots.trees) bareTree(props, tree, spots.u);
  for (const rock of spots.boulders) props.sphere({ x: rock.x, y: rock.y, z: -2, r: rock.r, color: ROCK, sides: 10, rings: 7, squash: 0.62 });
  reedClumps(props, spots.clumps, spots.u);
  for (const pole of spots.poles) pylon(props, { ...pole, orb: pole.side < 0 ? ORB_PINK : ORB_CYAN }, spots.u);
  for (const pad of spots.pads) pylon(props, { x: pad.x, y: pad.y, r: 11 * spots.u, h: PAD_POST_PX * spots.u, orb: ORB_PINK }, spots.u);
  return props;
}

/** The props by the aurora's light: dark and cool, a rim of blue where a surface turns edge-on, the pads' pink on what faces them. */
const PROP_LIGHT = /* glsl */ `
uniform vec4 uPads[${MAX_PADS}];
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 view = normalize(uEye - world);
  vec3 l = normalize(uSun);
  float lit = max(dot(n, l), 0.0);
  vec3 col = albedo * (vec3(0.32, 0.4, 0.55) * (0.6 + 0.4 * n.z) + vec3(0.35, 0.55, 0.7) * lit);
  float rim = pow(1.0 - abs(dot(n, view)), 3.0);
  col += vec3(0.1, 0.32, 0.4) * rim * 0.5;
  if (metal > 0.19 && metal < 0.21) col *= 0.75 + 0.5 * fbm3(world.xy / 9.0 + world.z / 7.0);
  for (int i = 0; i < ${MAX_PADS}; i++) {
    vec4 pad = uPads[i];
    if (pad.z <= 0.0) continue;
    vec3 d = (world - vec3(pad.xy, 14.0)) / (pad.z * 2.6);
    float near = exp(-dot(d, d));
    col += vec3(0.8, 0.12, 0.5) * near * albedo * 3.0 * (0.5 + 0.5 * max(dot(n, -normalize(d + vec3(0.0, 0.0, 0.001))), 0.0));
    col += vec3(0.7, 0.85, 1.1) * pad.w * near * albedo * 3.5;
  }
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, reveal: 'vec3(0.7, 0.9, 1.1)' });

/**
 * The lightning ribbons: each bolt a strip of quads along its path, widened toward the camera in the
 * vertex shader; per vertex position, aTan (the path's direction there), aInfo (side -1..1, how far
 * along 0..1, the arc's index, its width).
 */
export function boltGeometry(three, arcs, u) {
  const positions = [];
  const tangents = [];
  const infos = [];
  const index = [];
  arcs.forEach((arc, id) => {
    const first = positions.length / 3;
    arc.points.forEach((point, k) => {
      const ahead = arc.points[Math.min(k + 1, arc.points.length - 1)];
      const behind = arc.points[Math.max(k - 1, 0)];
      const tangent = [ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]];
      for (const side of [-1, 1]) {
        positions.push(...point);
        tangents.push(...tangent);
        infos.push(side, k / (arc.points.length - 1), id, (3.4 + 1.2 * hash(id, k, 1)) * u);
      }
    });
    for (let k = 0; k < arc.points.length - 1; k += 1) {
      const a = first + k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aTan', new three.Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('aInfo', new three.Float32BufferAttribute(infos, 4));
  geometry.setIndex(index);
  return geometry;
}

export const BOLT_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${STORM}
uniform vec4 uStrikes[${MAX_ARCS}];
attribute vec3 aTan;
attribute vec4 aInfo;
varying float vSide;
varying float vFlash;
varying float vAlong;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 ahead = modelViewMatrix * vec4(position + normalize(aTan) * 4.0, 1.0);
  vec2 dir = normalize(ahead.xy - mv.xy + 1e-5);
  vec2 aside = vec2(-dir.y, dir.x);
  int id = int(aInfo.z + 0.5);
  float flash = uStrikes[id].x;
  mv.xy += aside * aInfo.x * aInfo.w * (0.5 + 1.4 * flash);
  gl_Position = projectionMatrix * mv;
  vSide = aInfo.x;
  vAlong = aInfo.y;
  vFlash = flash * revealBurned(position.xy) * exitKeep(position.xy);
}
`;

export const BOLT_FRAGMENT = /* glsl */ `
varying float vSide;
varying float vFlash;
varying float vAlong;
void main() {
  float across = abs(vSide);
  float core = exp(-across * across * 7.0);
  float glow = exp(-across * across * 1.4) * 0.5;
  vec3 col = vec3(0.7, 0.85, 1.2) * glow + vec3(1.4, 1.5, 1.7) * core;
  gl_FragColor = vec4(col * vFlash * (0.7 + 0.3 * sin(vAlong * 40.0)), 1.0);
${OUTPUT}
}
`;

/** The force field's mesh: a hemisphere of unit directions the vertex shader scales to the arena's ellipsoid, apex at +z. */
export function domeGeometry(three, rings = 32, segments = 96) {
  const positions = [];
  const index = [];
  for (let i = 0; i <= rings; i += 1) {
    const polar = (i / rings) * (Math.PI / 2);
    for (let k = 0; k <= segments; k += 1) {
      const azimuth = (k / segments) * 2 * Math.PI;
      positions.push(Math.sin(polar) * Math.cos(azimuth), Math.sin(polar) * Math.sin(azimuth), Math.cos(polar));
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let k = 0; k < segments; k += 1) {
      const a = i * (segments + 1) + k;
      const b = a + segments + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

export const DOME_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${STORM}
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vDir = position;
  vWorld = vec3(uDome.x + position.x * uDome.z, uDome.y + position.y * uDome.w, position.z * uDomeHeight);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorld, 1.0);
}
`;

/**
 * The force field: a faint blue sheen drifting over the dome, its rim glowing where it is seen
 * edge-on, all of it swelling into view and fading out again; where a strike lands a flash and a ring of
 * light running out across it, measured on the dome itself so that it is round, not stretched.
 */
export const DOME_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${STORM}
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 dir = normalize(vDir);
  vec3 n = normalize(vec3(dir.x / uDome.z, dir.y / uDome.w, dir.z / uDomeHeight));
  vec3 view = normalize(uEye - vWorld);
  float rim = pow(1.0 - abs(dot(n, view)), 2.8);
  float present = fieldPresence(vWorld.xy);
  vec2 q = (vWorld.xy + vec2(vWorld.z, -0.6 * vWorld.z)) / (190.0 * uUnit);
  float sheen = smoothstep(0.35, 0.8, fbm3(q + vec2(uTime * 0.03, -uTime * 0.02)));
  float charge = 0.0;
  float flash = 0.0;
  for (int i = 0; i < ${MAX_IMPACTS}; i++) {
    vec4 hit = uImpacts[i];
    if (hit.w < 0.0) continue;
    vec3 landing = vec3(uDome.x + hit.x * uDome.z, uDome.y + hit.y * uDome.w, hit.z * uDomeHeight);
    float away = distance(vWorld, landing) / uUnit;
    float ahead = (away - hit.w * 190.0) / 38.0;
    charge += exp(-ahead * ahead) * exp(-hit.w * 1.1);
    flash += exp(-away * away / 7200.0) * exp(-hit.w * 4.5);
  }
  float intensity = present * (0.2 * rim + 0.05 * sheen * (0.4 + rim)) + charge * 0.22 + flash * 0.5 + (charge + flash) * rim * 0.3;
  vec3 tint = mix(vec3(0.12, 0.55, 1.0), vec3(0.7, 0.9, 1.0), clamp(charge + flash, 0.0, 1.0) * 0.5);
  gl_FragColor = vec4(tint * intensity * 0.7, 1.0);
${OUTPUT}
}
`;

/**
 * Seconds since the strike of this arc that rings the field, or -1: a strike rings it only one time
 * in RIPPLE_EVERY (each pad on its own count, so the rings do not come together), and only for
 * RIPPLE_SECONDS after it.
 */
export function rippleAge(arc, slot, now) {
  const count = now / arc.period + arc.phase;
  const strike = Math.floor(count);
  if ((((strike + slot) % RIPPLE_EVERY) + RIPPLE_EVERY) % RIPPLE_EVERY !== 0) return -1;
  const age = (count - strike) * arc.period;
  return age < RIPPLE_SECONDS ? age : -1;
}

/** Magnetic Storm's board (stadium-environment-mesh.js BOARDS). */
export function magneticStormBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...STORM_LIGHT).normalize() },
    uCore: { value: new three.Vector4() },
    uRing: { value: new three.Vector3() },
    uUnit: { value: 1 },
    uPads: { value: Array.from({ length: MAX_PADS }, () => new three.Vector4()) },
    uStrikes: { value: Array.from({ length: MAX_ARCS }, () => new three.Vector4()) },
    uPoleA: { value: new three.Vector3() },
    uPoleB: { value: new three.Vector3() },
    uDome: { value: new three.Vector4() },
    uDomeHeight: { value: 1 },
    uImpacts: { value: Array.from({ length: MAX_IMPACTS }, () => new three.Vector4(0, 0, 1, -1)) },
  };
  let arcsNow = [];
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const additive = { transparent: true, depthWrite: false, blending: three.AdditiveBlending, side: three.DoubleSide };
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bolts: make(BOLT_VERTEX, BOLT_FRAGMENT, additive),
    dome: make(DOME_VERTEX, DOME_FRAGMENT, additive),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const bolts = new three.Mesh(new three.BufferGeometry(), materials.bolts);
  const dome = new three.Mesh(domeGeometry(three), materials.dome);
  bolts.renderOrder = 2;
  dome.renderOrder = 3;
  // The strike's clock: where in its period it is, 0..1.
  const clockAt = (period, phase, now) => (((now / period + phase) % 1) + 1) % 1;
  // Each frame the strikes' flashes, the pads' brightness and the landings' ripples follow the clock, on the CPU: a handful of numbers.
  const strikeAt = (period, phase, now) => {
    const t = clockAt(period, phase, now);
    const flash = Math.min(1, t / 0.012) * (1 - Math.min(1, Math.max(0, (t - 0.03) / 0.17)));
    const flicker = 0.65 + 0.35 * (((t * 61) % 1) >= 0.5 ? 1 : 0);
    const tail = 0.18 * Math.min(1, t / 0.03) * (1 - Math.min(1, Math.max(0, (t - 0.2) / 0.3)));
    return flash * flicker + tail;
  };
  return {
    objects: [terrain, props, bolts, dome],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => stormSpots(layout),
    tick(seconds) {
      arcsNow.forEach((arc, i) => {
        // Frozen (null): no strike, the bolts dark.
        const flash = seconds === null ? 0 : strikeAt(arc.period, arc.phase, seconds);
        own.uStrikes.value[i].set(flash, 0, 0, 0);
      });
      own.uPads.value.forEach((slot, i) => {
        let strength = 0;
        arcsNow.forEach((arc, k) => {
          if (arc.pads.includes(i)) strength = Math.max(strength, own.uStrikes.value[k].x);
        });
        slot.w = strength;
      });
      // A strike's ripple runs from the moment it lands for a few seconds.
      const landings = arcsNow.filter((arc) => arc.dir);
      own.uImpacts.value.forEach((slot, i) => {
        const arc = landings[i];
        if (!arc || seconds === null) return slot.set(0, 0, 1, -1);
        return slot.set(arc.dir[0], arc.dir[1], arc.dir[2], rippleAge(arc, i, seconds));
      });
    },
    apply(spots, bounds) {
      const u = spots?.u ?? 1;
      own.uUnit.value = u;
      const core = spots?.core;
      own.uCore.value.set(core?.x ?? 0, core?.y ?? 0, (core?.x ?? 0) + (core?.w ?? 0), (core?.y ?? 0) + (core?.h ?? 0));
      own.uRing.value.set(spots?.ring?.x ?? 0, spots?.ring?.y ?? 0, spots?.ring?.r ?? 0);
      own.uPads.value.forEach((slot, i) => {
        const pad = spots?.pads[i];
        return pad ? slot.set(pad.x, pad.y, pad.r, 0) : slot.set(0, 0, 0, 0);
      });
      const [north, south] = spots?.poles ?? [];
      own.uPoleA.value.set(north?.x ?? 0, north?.y ?? 0, north?.r ?? 0);
      own.uPoleB.value.set(south?.x ?? 0, south?.y ?? 0, south?.r ?? 0);
      own.uDome.value.set(spots?.dome.x ?? 0, spots?.dome.y ?? 0, spots?.dome.a ?? 1, spots?.dome.b ?? 1);
      own.uDomeHeight.value = spots?.dome.h ?? 1;
      arcsNow = spots?.arcs ?? [];
      own.uStrikes.value.forEach((slot) => slot.set(0, 0, 0, 0));
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(spots);
      bolts.visible = Boolean(spots);
      dome.visible = Boolean(spots);
      if (spots) {
        replaceGeometry(props, stormProps(spots).build(three));
        replaceGeometry(bolts, boltGeometry(three, spots.arcs, u));
      }
    },
  };
}
