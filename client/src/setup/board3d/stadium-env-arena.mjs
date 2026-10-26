// Design 077 (prototype): Fighting Stadium (customhb-239) after its card art (FFI 90, xy3-90 in
// set.json; Ryo Ueda): a wrestling ring in a packed arena at night. The ring's canvas, white under
// the rig's spotlight and teal toward the ropes, sits on a square white stage edged in a row of
// white lights; round the stage the arena floor, then a band of glowing LED ad boards, then the dark
// stands full of the crowd, all under a teal haze. The lighting rig hangs over the ring, a ring of
// lamps; long lasers in yellow-green, magenta, cyan and white criss-cross the crowd from lights
// glaring white high in the arena's four corners.
// The art looks across the arena at the ring; the board looks down into the ring, so the ring's
// canvas holds every card, its corner posts and three ropes a side stand round them, the rig runs
// round over the ropes (its height carries it out past them in both camera presets), and the stage,
// the ad boards and the stands ring it out to the scene's edges; the lasers cross the side and far
// stands, never the ring. (The art's entrance ramp is left out: from above it read as a plank.)
//
// Bake, once per layout: BAKE_FIELD writes R height px (the canvas at the cloth, the stage, the floor
// and the stands below and climbing away in tiers), G signed px from the ring's edge, B the tier's
// id, A the kind (-1 canvas, 0 stage, 1 floor, 2 stands); the shared light bake adds normals and
// occlusion. Per frame: TERRAIN paints all of it, the stage's lights and the crowd; PROPS are the
// posts, ropes, the rig's truss and lamps and the ad boards' rails (stadium-env-props.mjs); BOARDS
// the ad boards' faces; LASERS the sweeping beams; GLINTS the lamps' and the laser lights' glow.
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
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const ARENA_KEY = 'fighting-stadium';
/** Free canvas kept between the cards and the ring's ropes, beside them and off their ends. */
export const RING_GAP_PX = { side: 34, end: 30 };
/** The ring's apron (its skirt down to the stage), the stage round it, the floor to the ad boards. */
export const APRON_PX = { drop: 34, slope: 18 };
export const STAGE_PX = { width: 74, drop: 46 };
export const FLOOR_PX = 64;
/** The ad boards: height, thickness, how far their tops lean back from the ring (their faces show from above). */
export const BOARD_PX = { height: 58, thick: 8, lean: 52 };
/** The stands: each tier's run and rise. */
export const TIER_PX = { run: 40, rise: 26 };
/** The ring's corner posts and ropes: the posts' height and radius, the ropes' heights, radius, sag. */
export const POST_PX = { height: 96, radius: 7 };
export const ROPES = { heights: [36, 60, 84], radius: 2.6, sag: 5 };
/**
 * The lasers: how many (laser k shines from light k % 4: the far corners' sweep along their side
 * stands toward the near end, or for k >= 8 across the far stands; the near corners' along their side
 * stands toward the far end, so the two sets criss-cross), and the lights they shine from, high in
 * the four corners: px out past the ad boards' corner along x and along y, and z over the cloth.
 */
export const LASER_COUNT = 16;
export const LASER_LIGHT_PX = { out: 150, end: 110, z: 240 };
/**
 * The lighting rig over the ring, as the art's: a truss round it `out` px outside the ropes, `z` px
 * over the canvas and `depth` px deep, its corners cut `cut` px; a lamp about every `lampEvery` px.
 */
export const RIG_PX = { out: 40, z: 300, depth: 16, cut: 110, lampEvery: 105 };
/** Half the size of a rig lamp's glow and of a laser light's glare, px. */
const GLINT_PX = { lamp: 22, light: 64 };

const POST_STEEL = [0.0, 0.17, 0.38, 0.4];
const PAD_BLUE = [0.0, 0.2, 0.44, 0.15];
const ROPE_WHITE = [0.92, 0.93, 0.95, 0.1];
const BOARD_FRAME = [0.05, 0.055, 0.065, 0.3];
const TRUSS = [0.1, 0.14, 0.16, 0.5];
const LAMP_CASE = [0.07, 0.09, 0.1, 0.6];
// The ad boards' foot and leaning top, z px.
const BOARD_Z = { foot: -APRON_PX.drop - STAGE_PX.drop + 2, top: -APRON_PX.drop - STAGE_PX.drop + BOARD_PX.height - 4 };

/**
 * Fighting Stadium's layout: the ring (a rect round every card footprint, RING_GAP_PX clear), the
 * stage, the ad boards' line and the emblem on the canvas. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function arenaSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const rects = [...slabs, ...flats];
  const x0 = rects.length ? Math.min(...rects.map((r) => r.x)) : table.x + table.w * 0.3;
  const x1 = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : table.x + table.w * 0.7;
  const y0 = rects.length ? Math.min(...rects.map((r) => r.y)) : table.y;
  const y1 = rects.length ? Math.max(...rects.map((r) => r.y + r.h)) : table.y + table.h;
  const ring = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: (x1 - x0) / 2 + RING_GAP_PX.side, hh: (y1 - y0) / 2 + RING_GAP_PX.end };
  const boards = { hw: ring.hw + STAGE_PX.width + FLOOR_PX, hh: ring.hh + STAGE_PX.width + FLOOR_PX };
  const scene = sceneBounds(layout, ARENA_KEY);
  const emblem = craterEmblem(layout, { x: table.x + table.w / 2, y: layout.depth });
  return { ring, boards, scene, emblem };
}

/** The rig's outline round the ring: its eight corners (RIG_PX.out outside the ropes, corners cut), counter-clockwise. */
export function rigOutline(ring) {
  const hw = ring.hw + RIG_PX.out;
  const hh = ring.hh + RIG_PX.out;
  const cut = Math.min(RIG_PX.cut, hw * 0.4, hh * 0.4);
  return [
    [hw - cut, -hh],
    [hw, -hh + cut],
    [hw, hh - cut],
    [hw - cut, hh],
    [-hw + cut, hh],
    [-hw, hh - cut],
    [-hw, -hh + cut],
    [-hw + cut, -hh],
  ].map(([x, y]) => [ring.x + x, ring.y + y]);
}

/** The rig's lamps: [x, y] along its outline, about RIG_PX.lampEvery px apart, one at each corner. */
export function rigLamps(ring) {
  const outline = rigOutline(ring);
  const lamps = [];
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / RIG_PX.lampEvery));
    for (let k = 0; k < steps; k += 1) lamps.push([ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps]);
  });
  return lamps;
}

/** The four laser lights high in the corners: [x, y, z] each, far left, far right, near left, near right. */
export function laserLights({ ring, boards }) {
  return [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ].map(([sx, sy]) => [
    ring.x + sx * (boards.hw + LASER_LIGHT_PX.out),
    ring.y + sy * (boards.hh + LASER_LIGHT_PX.end),
    LASER_LIGHT_PX.z,
  ]);
}

/**
 * The ad boards' runs round the floor, counter-clockwise from the near-left corner (so u runs on
 * round the corners): each its ends, length and outward unit vector (to its left as the band runs).
 */
function adRuns({ ring, boards }) {
  const lo = { x: ring.x - boards.hw, y: ring.y - boards.hh };
  const hi = { x: ring.x + boards.hw, y: ring.y + boards.hh };
  return [
    [lo.x, lo.y, hi.x, lo.y],
    [hi.x, lo.y, hi.x, hi.y],
    [hi.x, hi.y, lo.x, hi.y],
    [lo.x, hi.y, lo.x, lo.y],
  ]
    .map(([ax, ay, bx, by]) => ({ ax, ay, bx, by, length: Math.hypot(bx - ax, by - ay) }))
    .filter((run) => run.length >= 1)
    .map((run) => ({ ...run, out: [(run.by - run.ay) / run.length, -(run.bx - run.ax) / run.length] }));
}

/** The ring's corner posts and ropes, the rig's truss and lamps, and the ad boards' rails. */
export function arenaProps({ ring, boards }) {
  const props = createPropBuilder();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => [ring.x + sx * ring.hw, ring.y + sy * ring.hh]);
  for (const [x, y] of corners) {
    props.cylinder({ x, y, z0: -APRON_PX.drop, z1: POST_PX.height, r: POST_PX.radius, color: POST_STEEL, sides: 14 });
    // The turnbuckle pads on the ropes' side of the post.
    for (const z of ROPES.heights) {
      props.cylinder({ x, y, z0: z - 7, z1: z + 7, r: POST_PX.radius + 3.5, color: PAD_BLUE, sides: 14 });
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const [ax, ay] = corners[k];
    const [bx, by] = corners[(k + 1) % 4];
    for (const z of ROPES.heights) {
      const points = [];
      for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        points.push([ax + (bx - ax) * t, ay + (by - ay) * t, z - ROPES.sag * 4 * t * (1 - t)]);
      }
      props.tube(points, ROPES.radius, ROPE_WHITE, { sides: 6 });
    }
  }
  // The lighting rig: a truss of two chords and a zigzag web round over the ropes, a lamp's case
  // hung under it at each lamp.
  const outline = rigOutline(ring);
  const top = RIG_PX.z;
  const bottom = RIG_PX.z - RIG_PX.depth;
  for (const z of [top, bottom]) props.tube([...outline, outline[0]].map(([x, y]) => [x, y, z]), 2.6, TRUSS, { sides: 6 });
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 28));
    for (let k = 0; k < steps; k += 1) {
      const [za, zb] = k % 2 ? [top, bottom] : [bottom, top];
      const a = [ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, za];
      const b = [ax + ((bx - ax) * (k + 1)) / steps, ay + ((by - ay) * (k + 1)) / steps, zb];
      props.tube([a, b], 1.2, TRUSS, { sides: 4 });
    }
  });
  for (const [x, y] of rigLamps(ring)) props.cylinder({ x, y, z0: bottom - 16, z1: bottom, r: 8, color: LAMP_CASE, sides: 12 });
  // The ad boards' frame: a dark rail along their foot and another capping their leaning tops.
  for (const { ax, ay, bx, by, out } of adRuns({ ring, boards })) {
    const lean = [out[0] * BOARD_PX.lean, out[1] * BOARD_PX.lean];
    props.tube([[ax, ay, BOARD_Z.foot], [bx, by, BOARD_Z.foot]], 3, BOARD_FRAME, { sides: 6 });
    props.tube([[ax + lean[0], ay + lean[1], BOARD_Z.top], [bx + lean[0], by + lean[1], BOARD_Z.top]], 3, BOARD_FRAME, { sides: 6 });
  }
  // Each laser light: a dark lamp housing on a short bracket, high in its corner.
  for (const [x, y, z] of laserLights({ ring, boards })) {
    props.cylinder({ x, y, z0: z - 34, z1: z - 10, r: 3, color: TRUSS, sides: 6 });
    props.cylinder({ x, y, z0: z - 10, z1: z + 6, r: 12, color: LAMP_CASE, sides: 14 });
  }
  return props;
}

/**
 * The ad boards' glowing faces round the floor, facing the ring: one quad per board, `aAd` (u px
 * along the band, v 0..1 up the board, which board).
 */
export function adBoardGeometry(three, { ring, boards }) {
  const positions = [];
  const ads = [];
  const index = [];
  const z0 = BOARD_Z.foot;
  const z1 = BOARD_Z.top;
  // Their tops lean back away from the ring, so the boards' faces show from above.
  const lean = BOARD_PX.lean;
  let u = 0;
  adRuns({ ring, boards }).forEach(({ ax, ay, bx, by, length, out }) => {
    const first = positions.length / 3;
    positions.push(ax, ay, z0, bx, by, z0, bx + out[0] * lean, by + out[1] * lean, z1, ax + out[0] * lean, ay + out[1] * lean, z1);
    ads.push(u, 0, 0, u + length, 0, 0, u + length, 1, 0, u, 1, 0);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    u += length;
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAd', new three.Float32BufferAttribute(ads, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The lasers: one camera-facing strip each, aBeam (along 0..1, across -1..1, which laser). */
export function laserGeometry(three, count = LASER_COUNT) {
  const positions = [];
  const beams = [];
  const index = [];
  const segments = 10;
  for (let laser = 0; laser < count; laser += 1) {
    const first = positions.length / 3;
    for (let i = 0; i <= segments; i += 1) {
      for (const side of [-1, 1]) {
        positions.push(0, 0, 0);
        beams.push(i / segments, side, laser);
      }
    }
    for (let i = 0; i < segments; i += 1) {
      const a = first + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBeam', new three.Float32BufferAttribute(beams, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * The glows: one camera-facing quad per rig lamp (under the rig) and per laser light, aGlint (corner
 * x, y -1..1, which glow, its half size px).
 */
export function glintGeometry(three, lamps, lights = []) {
  const positions = [];
  const glints = [];
  const index = [];
  const z = RIG_PX.z - RIG_PX.depth - 18;
  const points = [...lamps.map(([x, y]) => [x, y, z, GLINT_PX.lamp]), ...lights.map(([x, y, lz]) => [x, y, lz, GLINT_PX.light])];
  points.forEach(([x, y, pz, size], k) => {
    const first = positions.length / 3;
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push(x, y, pz);
      glints.push(cx, cy, k, size);
    }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aGlint', new three.Float32BufferAttribute(glints, 4));
  geometry.setIndex(index);
  return geometry;
}

const ARENA = /* glsl */ `
// The ring: centre x, y, half width, half height; the ad boards' line: half width, half height
// (arenaSpots).
uniform vec4 uRing;
uniform vec2 uBoards;
uniform vec3 uEmblem;
const vec3 HAZE_TEAL = vec3(0.0, 0.07, 0.075);
const vec3 STAGE_GLOW = vec3(0.55, 0.95, 1.05);
// Signed px from the ring's edge, negative on the canvas; square outside it as well, so the apron
// and the stage round it keep the art's square corners.
float ringDistance(vec2 p) {
  vec2 q = abs(p - uRing.xy) - uRing.zw;
  return max(q.x, q.y);
}
// Px along the stands' tier at p round the ring (x for the near and far stands, y for the sides).
float alongStands(vec2 p) {
  vec2 rel = (p - uRing.xy) / max(uBoards, vec2(1.0));
  return abs(rel.x) > abs(rel.y) ? p.y : p.x;
}
`;

/** Bake: the canvas at the cloth, the apron down to the stage, the floor, the stands in tiers. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${ARENA}
void main() {
  vec2 p = uMin + vUv * uSize;
  float d = ringDistance(p);
  vec2 q = abs(p - uRing.xy) - uBoards;
  float boardD = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float h;
  float id = 0.0;
  float kind;
  if (d < 0.0) {
    // The canvas, stretched taut: a faint sag toward the middle.
    h = -1.2 * smoothstep(0.0, -300.0, d);
    kind = -1.0;
  } else if (d < ${STAGE_PX.width}.0) {
    h = d < ${APRON_PX.slope}.0 ? mix(0.0, -${APRON_PX.drop}.0, d / ${APRON_PX.slope}.0) : -${APRON_PX.drop}.0;
    kind = 0.0;
  } else if (boardD < ${BOARD_PX.thick}.0) {
    h = -${APRON_PX.drop + STAGE_PX.drop}.0;
    kind = 1.0;
  } else {
    float tier = floor((boardD - ${BOARD_PX.thick}.0) / ${TIER_PX.run}.0);
    h = -${APRON_PX.drop + STAGE_PX.drop}.0 + 20.0 + tier * ${TIER_PX.rise}.0;
    id = fract(tier * 0.37);
    kind = 2.0;
  }
  // The stage's outer wall drops to the floor over a few px, so its edge stays smooth on the grid.
  if (kind > -0.5 && kind < 0.5) {
    h = mix(h, -${APRON_PX.drop + STAGE_PX.drop}.0, smoothstep(${STAGE_PX.width - 9}.0, ${STAGE_PX.width - 1}.0, d));
  }
  gl_FragColor = vec4(h, d, id, kind);
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, texture2D(uField, uv).r * growth * edgeSkirt(uv), 1.0);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${POKE_BALL}
${ARENA}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float ground = field.r;
  float d = field.g;
  float id = field.b;
  float kind = field.a;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 col;
  if (kind < -0.5) {
    // The canvas: white under the rig's spotlight, as the art's (190,221,242), a pale blue toward the
    // ropes (120,170,205), both inverted through Neutral tone mapping; faint scuffs; a navy band
    // round its edge; the Poke Ball painted on it in light grey lines.
    vec2 fromMiddle = (p - uRing.xy) / max(uRing.zw, vec2(1.0));
    float spot = exp(-dot(fromMiddle, fromMiddle) * 0.9);
    col = mix(vec3(0.228, 0.442, 0.65), vec3(0.63, 0.878, 1.074), spot) * (0.97 + 0.04 * fbm3(p / 50.0));
    col = mix(col, vec3(0.022, 0.06, 0.16), smoothstep(-22.0, -16.0, d));
    float e = emblemDistance(p, uEmblem);
    col = mix(col, vec3(0.88, 0.93, 0.96), (1.0 - smoothstep(1.5, 3.0, e)) * 0.85 * step(0.001, uEmblem.z));
  } else if (kind < 0.5) {
    if (d < ${APRON_PX.slope}.0 || ground < -${APRON_PX.drop - 2}.0 && d < ${APRON_PX.slope + 2}.0) {
      // The apron: the ring's deep blue skirt, the art's (0,123,175) where the rig lights it,
      // darkening down to the stage.
      col = vec3(0.0, 0.198, 0.429) * mix(0.45, 1.0, smoothstep(${APRON_PX.slope}.0, 0.0, d));
    } else {
      // The stage: glowing white, a row of white lights along its outer edge.
      col = mix(vec3(0.64, 0.88, 0.95), vec3(0.82, 0.96, 1.02), smoothstep(${STAGE_PX.width}.0, ${APRON_PX.slope + 6}.0, d));
      float rim = ${STAGE_PX.width - 9}.0;
      vec2 rel = p - uRing.xy;
      float along = abs(rel.x) / (uRing.z + rim) > abs(rel.y) / (uRing.w + rim) ? p.y : p.x;
      // The art's big round lamps along the stage's outer edge, a glow round each.
      float bulb = length(vec2(mod(along, 32.0) - 16.0, d - rim));
      col += vec3(1.5, 1.6, 1.7) * (1.0 - smoothstep(5.5, 7.0, bulb)) + vec3(0.3, 0.6, 0.66) * exp(-bulb / 9.0) * 0.7;
      col = mix(col, vec3(0.08, 0.14, 0.18), smoothstep(${STAGE_PX.width - 3}.0, ${STAGE_PX.width}.0, d));
    }
  } else if (kind < 1.5) {
    col = vec3(0.02, 0.05, 0.07);
  } else {
    // The stands: tiers of seats in the dark, packed with the crowd seen from above: dim heads over
    // shoulders, shirts in close shades of dark teal, close enough to merge into one mass as the
    // art's; a phone's light here and there.
    float tierTop = smoothstep(0.8, 0.95, n.z);
    vec3 seat = mix(vec3(0.0, 0.035, 0.038), vec3(0.008, 0.055, 0.058), tierTop);
    float along = alongStands(p);
    float tierD = mod(length(max(abs(p - uRing.xy) - uBoards, 0.0)) - ${BOARD_PX.thick}.0, ${TIER_PX.run}.0);
    col = seat;
    // Aisles of stairs climb the stands every so often, empty of the crowd.
    float aisle = abs(mod(along + 140.0, 280.0) - 140.0);
    if (aisle < 10.0) {
      col = mix(vec3(0.03, 0.09, 0.1), vec3(0.07, 0.16, 0.17), smoothstep(0.0, 3.0, mod(tierD, 13.0)) * tierTop);
    }
    // Two neighbouring seats either side, so a person leaning past their slot isn't cut off.
    for (int k = -1; k <= 1; k++) {
      if (aisle < 12.0) break;
      float slot = floor(along / 17.0) + float(k);
      float seed = hash12(vec2(slot, id * 97.0));
      if (seed < 0.08) continue;
      float size = 1.3 + 0.35 * hash12(vec2(slot, id * 31.0 + 5.0));
      vec2 at = vec2((slot + 0.5) * 17.0 + (hash12(vec2(slot, id + 7.0)) - 0.5) * 5.0, 23.0 + (hash12(vec2(slot, id + 9.0)) - 0.5) * 5.0);
      vec2 local = (vec2(along, tierD) - at) / size;
      float body = 1.0 - smoothstep(4.6, 5.8, length(local * vec2(1.0, 1.5) - vec2(0.0, -5.5)));
      float head = 1.0 - smoothstep(2.9, 3.7, length(local - vec2(0.0, 2.0)));
      float pick = hash12(vec2(slot, id * 53.0));
      vec3 shirt = pick < 0.55 ? vec3(0.01, 0.085, 0.09) : pick < 0.75 ? vec3(0.02, 0.06, 0.1) : pick < 0.9 ? vec3(0.05, 0.045, 0.065) : vec3(0.05, 0.1, 0.1);
      col = mix(col, shirt * (0.75 + 0.25 * smoothstep(-6.0, 2.0, local.y)), body);
      // The head: dark hair, its crown catching the rig's light.
      col = mix(col, mix(vec3(0.012, 0.035, 0.038), vec3(0.035, 0.09, 0.095), smoothstep(-1.5, 2.5, local.y - 2.0)), head);
      // A raised phone's light here and there, twinkling.
      float phone = step(0.985, hash12(vec2(slot * 3.1, id * 13.0))) * (0.35 + 0.25 * sin(uTime * 2.5 + seed * 40.0));
      col += vec3(0.9, 1.0, 1.1) * phone * (1.0 - smoothstep(0.8, 1.8, length(local - vec2(3.0, 4.0))));
    }
  }
  col = mix(col * 0.55, col, smoothstep(0.3, 0.9, light.b));
  // The glowing stage throws cyan light across the floor and the front rows, as in the art.
  float fromStage = max(d - ${STAGE_PX.width}.0, 0.0);
  col += vec3(0.05, 0.3, 0.38) * exp(-fromStage / 70.0) * step(0.5, kind) * 0.8;
  // The teal haze over the arena, thicker away from the ring; the back rows fade into the dark.
  col = mix(col, HAZE_TEAL, smoothstep(${STAGE_PX.width}.0, 500.0, d) * 0.45);
  col *= mix(1.0, 0.45, smoothstep(220.0, 520.0, d) * step(1.5, kind));
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.3, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));
  col += STAGE_GLOW * revealGlow(p, 0.035);
  col += STAGE_GLOW * exitGlow(p);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const BOARD_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec3 aAd;
varying vec3 vAd;
varying vec2 vPos;
void main() {
  vAd = aAd;
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, position.z * terrainGrowth(position.xy), 1.0);
}
`;

/**
 * The LED ad boards: a run of panels round the band, each one of the art's designs (red with white
 * lettering, white with a red and blue mark, blue with the Poké Ball, yellow with dark lettering),
 * the lettering in blocky bars; a slow sheen runs along them.
 */
export const BOARD_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec3 vAd;
varying vec2 vPos;
const float PANEL = 150.0;
// Lettering: bold words as solid rounded blocks of different lengths along a line at height y0..y1;
// seen from the stands' side they read as print, where letter detail smeared into a barcode.
float lettering(vec2 q, float y0, float y1, float seed) {
  if (q.x < 0.0) return 0.0;
  float word = floor(q.x / 36.0);
  float wordLength = 14.0 + 16.0 * hash12(vec2(word, seed));
  vec2 inWord = vec2(mod(q.x, 36.0), q.y);
  float radius = (y1 - y0) * 0.5;
  vec2 rel = vec2(max(abs(inWord.x - wordLength * 0.5) - (wordLength * 0.5 - radius), 0.0), inWord.y - (y0 + radius));
  return 1.0 - smoothstep(radius - 0.8, radius + 0.4, length(rel));
}
void main() {
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  float panel = floor(vAd.x / PANEL);
  // As in the art, most boards are white with a coloured mark and lettering; others red with yellow
  // lettering, green with white, or blue with the Poke Ball.
  float pick = hash12(vec2(panel, 4.0));
  vec2 q = vec2(mod(vAd.x, PANEL), vAd.y * 38.0);
  vec3 col;
  if (pick < 0.46) {
    col = vec3(0.95, 0.96, 0.97);
    float hue = hash12(vec2(panel, 8.0));
    vec3 ink = hue < 0.4 ? vec3(0.12, 0.6, 0.2) : hue < 0.75 ? vec3(0.1, 0.25, 0.75) : vec3(0.85, 0.12, 0.14);
    // A mark (a swoosh or a disc) then a line of lettering, placed differently on each board.
    float swoosh = abs(length((q - vec2(26.0, 6.0)) * vec2(0.8, 1.0)) - 15.0) - 2.6;
    float disc = length(q - vec2(26.0, 19.0)) - 9.0;
    float mark = hash12(vec2(panel, 9.0)) < 0.5 ? max(swoosh, -(q.y - 12.0)) : disc;
    col = mix(col, ink, 1.0 - smoothstep(-0.5, 0.8, mark));
    col = mix(col, ink * 0.7, lettering(q - vec2(48.0, 0.0), 13.0, 25.0, panel) * step(q.x, 140.0));
  } else if (pick < 0.64) {
    col = vec3(0.82, 0.1, 0.1);
    col = mix(col, vec3(1.0, 0.85, 0.2), lettering(q - vec2(14.0, 0.0), 12.0, 26.0, panel + 2.0));
  } else if (pick < 0.8) {
    col = vec3(0.08, 0.55, 0.22);
    col = mix(col, vec3(0.95, 1.0, 0.95), lettering(q - vec2(20.0, 0.0), 13.0, 25.0, panel + 5.0));
  } else {
    col = vec3(0.08, 0.25, 0.8);
    vec2 ball = q - vec2(PANEL * 0.5, 19.0);
    float r = length(ball);
    float outline = 1.0 - smoothstep(0.8, 1.6, abs(r - 12.0));
    float band = (1.0 - smoothstep(0.8, 1.6, abs(ball.y))) * step(r, 12.0);
    float button = 1.0 - smoothstep(0.8, 1.6, abs(r - 4.0));
    col = mix(col, vec3(1.0), max(max(outline, band), button));
    col = mix(col, vec3(0.95, 0.3, 0.3), step(r, 11.0) * step(1.2, ball.y) * step(5.0, r));
  }
  // Seams between panels, a dark frame along the top and foot, a sheen running along the band.
  col *= 0.4 + 0.6 * smoothstep(0.0, 2.0, min(q.x, PANEL - q.x));
  col *= 0.25 + 0.75 * smoothstep(0.0, 0.06, min(vAd.y, 1.0 - vAd.y));
  col *= 1.0 + 0.25 * smoothstep(0.9, 1.0, sin(vAd.x / 180.0 - uTime * 1.2));
  gl_FragColor = vec4(col * 1.25, 1.0);
${OUTPUT}
}
`;

export const LASER_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec4 uRing;
uniform vec2 uBoards;
attribute vec3 aBeam;
varying vec2 vBeam;
varying float vLaser;
${NOISE}
varying float vOutside;
void main() {
  // As in the art, long lasers criss-cross the arena from the lights high in its corners
  // (laserLights): light k % 4 shines laser k. The far lights' sweep down their side stands toward
  // the near end, the near lights' up theirs toward the far end, so they cross; past k = 8 the far
  // lights' sweep across the far stands to the other side instead. Each stays out past the ad
  // boards, so none crosses the ring or the stage.
  float k = aBeam.z;
  float sweep = sin(uTime * (0.1 + 0.07 * hash12(vec2(k, 2.0))) + hash12(vec2(k, 3.0)) * 6.28);
  float light = mod(k, 4.0);
  float side = mod(light, 2.0) < 0.5 ? -1.0 : 1.0;
  float end = light < 1.5 ? 1.0 : -1.0;
  vec3 source = vec3(uRing.x + side * (uBoards.x + ${LASER_LIGHT_PX.out}.0), uRing.y + end * (uBoards.y + ${LASER_LIGHT_PX.end}.0), ${LASER_LIGHT_PX.z}.0);
  vec2 target;
  if (end < 0.0 || k < 7.5) {
    float outward = 60.0 + 110.0 * hash12(vec2(k, 4.0)) + 30.0 * sweep;
    target = vec2(uRing.x + side * (uBoards.x + outward), uRing.y - end * uBoards.y * (0.1 + 0.9 * hash12(vec2(k, 5.0))) + 90.0 * sweep);
  } else {
    float share = 0.2 + 0.75 * hash12(vec2(k, 6.0)) + 0.12 * sweep;
    target = vec2(uRing.x - side * uBoards.x * share, uRing.y + uBoards.y + 50.0 + 90.0 * hash12(vec2(k, 7.0)));
  }
  vec3 to = vec3(target, 22.0);
  vec3 here = mix(source, to, aBeam.x);
  vec2 q = abs(here.xy - uRing.xy) - uBoards;
  vOutside = smoothstep(-20.0, 40.0, max(q.x, q.y));
  vec4 view = modelViewMatrix * vec4(here, 1.0);
  vec2 tangent = (modelViewMatrix * vec4(to - source, 0.0)).xy;
  vec2 across = length(tangent) > 0.0001 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(1.0, 0.0);
  view.xy += across * aBeam.y * 3.0;
  gl_Position = projectionMatrix * view;
  vBeam = aBeam.xy;
  vLaser = k;
}
`;

export const LASER_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform float uExit;
varying vec2 vBeam;
varying float vLaser;
varying float vOutside;
void main() {
  // The art's laser colours: yellow-green, magenta, cyan, green and white.
  float which = mod(vLaser, 5.0);
  vec3 tint = which < 0.5 ? vec3(0.75, 1.4, 0.25) : which < 1.5 ? vec3(1.4, 0.3, 1.1) : which < 2.5 ? vec3(0.25, 1.15, 1.4) : which < 3.5 ? vec3(0.3, 1.4, 0.45) : vec3(1.3, 1.4, 1.5);
  // A thin bright core in a soft haze, falling to nothing at the ribbon's edges.
  float core = exp(-vBeam.y * vBeam.y * 14.0) + 0.35 * (1.0 - vBeam.y * vBeam.y);
  // Out of the light's glare, on along its length to the crowd, gone at its very end.
  float fade = smoothstep(0.02, 0.12, vBeam.x) * (1.0 - smoothstep(0.88, 1.0, vBeam.x)) * vOutside;
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  gl_FragColor = vec4(tint * core * fade * 0.7 * shown, 1.0);
${OUTPUT}
}
`;

export const GLINT_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
attribute vec4 aGlint;
varying vec2 vCorner;
varying float vTwinkle;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  view.xy += aGlint.xy * aGlint.w;
  vCorner = aGlint.xy;
  float seed = hash12(vec2(aGlint.z, 4.0));
  vTwinkle = 0.85 + 0.15 * sin(uTime * (1.1 + 1.4 * seed) + seed * 40.0);
  gl_Position = projectionMatrix * view;
}
`;

/**
 * A glow: a rig lamp's round bulb in a small halo, or a laser light's soft white glare; each breathes
 * gently on its own beat. No rays.
 */
export const GLINT_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform float uExit;
varying vec2 vCorner;
varying float vTwinkle;
void main() {
  float r = length(vCorner);
  float glow = exp(-r * r * 60.0) * 1.6 + exp(-r * 4.5) * 0.35;
  glow *= 1.0 - smoothstep(0.85, 1.0, r);
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  gl_FragColor = vec4(vec3(0.85, 0.97, 1.05) * glow * vTwinkle * shown, 1.0);
${OUTPUT}
}
`;

/** The props' light: the rig's white from above, the teal haze round them. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 col = albedo * (vec3(0.14, 0.24, 0.27) + vec3(0.75, 0.82, 0.85) * max(n.z, 0.0) * 0.8 + 0.25 * max(dot(n, normalize(uSun)), 0.0));
  vec3 view = normalize(uEye - world);
  col += vec3(0.7, 0.9, 1.0) * pow(max(dot(reflect(-view, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * metal * 0.5;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, uniforms: ARENA, reveal: 'STAGE_GLOW' });

const NO_SPOTS = { ring: null, boards: null, scene: null, emblem: null };

/** Fighting Stadium's board (stadium-environment-mesh.js BOARDS). */
export function fightingStadiumBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uRing: { value: new three.Vector4() },
    uBoards: { value: new three.Vector2() },
    uEmblem: { value: new three.Vector3() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    boards: make(BOARD_VERTEX, BOARD_FRAGMENT, { side: three.DoubleSide }),
    lasers: make(LASER_VERTEX, LASER_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
      side: three.DoubleSide,
    }),
    glints: make(GLINT_VERTEX, GLINT_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      // In front of their own lamps' cases; the pass draws under the cards, so no card is covered.
      depthTest: false,
      blending: three.AdditiveBlending,
      side: three.DoubleSide,
    }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const boards = new three.Mesh(new three.BufferGeometry(), materials.boards);
  const lasers = new three.Mesh(laserGeometry(three), materials.lasers);
  lasers.renderOrder = 2;
  const glints = new three.Mesh(new three.BufferGeometry(), materials.glints);
  glints.renderOrder = 2;
  return {
    objects: [terrain, props, boards, lasers, glints],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => arenaSpots(layout) ?? NO_SPOTS,
    apply(spots, bounds) {
      const { ring, emblem } = spots;
      own.uRing.value.set(ring?.x ?? 0, ring?.y ?? 0, ring?.hw ?? 0, ring?.hh ?? 0);
      own.uBoards.value.set(spots.boards?.hw ?? 0, spots.boards?.hh ?? 0);
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      for (const mesh of [props, boards, lasers, glints]) mesh.visible = Boolean(ring);
      if (!ring) return;
      replaceGeometry(props, arenaProps(spots).build(three));
      replaceGeometry(boards, adBoardGeometry(three, spots));
      replaceGeometry(glints, glintGeometry(three, rigLamps(ring), laserLights(spots)));
    },
  };
}
