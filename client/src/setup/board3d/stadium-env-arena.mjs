// Design 077 (prototype): Fighting Stadium (customhb-239) after its card art (FFI 90, xy3-90 in
// set.json; Ryo Ueda): a wrestling ring in a packed arena at night. The ring's canvas, white under
// the rig's spotlight and teal toward the ropes, sits on a square white stage edged in a row of
// white lights; round the stage the arena floor, then a band of glowing LED ad boards, then the dark
// stands full of the crowd, all under a teal haze. The lighting rig hangs over the ring, its lamps
// flaring into starbursts; lasers in yellow-green, magenta, cyan and white sweep from it across the
// crowd.
// The art looks across the arena at the ring; the board looks down into the ring, so the ring's
// canvas holds every card, its corner posts and three ropes a side stand round them, the rig runs
// round over the ropes (its height carries it out past them in both camera presets), and the stage
// (its entrance ramp running off one side), the ad boards and the stands ring it out to the scene's
// edges.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the canvas at the cloth, the stage, the floor
// and the stands below and climbing away in tiers), G signed px from the ring's edge, B the tier's
// id, A the kind (-1 canvas, 0 stage, 1 floor, 2 stands); the shared light bake adds normals and
// occlusion. Per frame: TERRAIN paints all of it, the stage's lights and the crowd; PROPS are the
// posts, ropes, the rig's truss and lamps and the ad boards' rails (stadium-env-props.mjs); BOARDS
// the ad boards' faces; LASERS the sweeping beams; GLINTS the lamps' starbursts.
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
export const APRON_PX = { drop: 34, slope: 12 };
export const STAGE_PX = { width: 74, drop: 46 };
export const FLOOR_PX = 64;
/** The ad boards: height, thickness, how far their tops lean back from the ring (their faces show from above). */
export const BOARD_PX = { height: 58, thick: 8, lean: 52 };
/** The stands: each tier's run and rise. */
export const TIER_PX = { run: 40, rise: 26 };
/** The ring's corner posts and ropes: the posts' height and radius, the ropes' heights, radius, sag. */
export const POST_PX = { height: 96, radius: 7 };
export const ROPES = { heights: [36, 60, 84], radius: 2.6, sag: 5 };
/** The lasers: how many, and where they shine from (z over the cloth). */
export const LASER_COUNT = 22;
/**
 * The lighting rig over the ring, as the art's: a truss round it `out` px outside the ropes, `z` px
 * over the canvas and `depth` px deep, its corners cut `cut` px; a lamp about every `lampEvery` px.
 */
export const RIG_PX = { out: 40, z: 300, depth: 16, cut: 110, lampEvery: 105 };
/** Half the size of a lamp's starburst, px. */
const GLINT_PX = 46;
/**
 * The entrance ramp off the stage, as in the art (there to the right; here off the left side, which
 * both camera presets see, where the sidebox covers the right): its middle's place as a share of
 * the ring's half height (near side negative), its half width.
 */
export const RAMP = { at: -0.42, half: 66 };
const LASER_FROM_Z = 520;

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
  const ramp = { y: ring.y + RAMP.at * ring.hh, half: RAMP.half, x0: ring.x - ring.hw - STAGE_PX.width + 2, x1: scene.x };
  const emblem = craterEmblem(layout, { x: table.x + table.w / 2, y: layout.depth });
  return { ring, boards, ramp, scene, emblem };
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

/**
 * The ad boards' runs round the floor, counter-clockwise from the near-left corner (so u runs on
 * round the corners), the left one open where the ramp runs through it: each its ends, length and
 * outward unit vector (to its left as the band runs).
 */
function adRuns({ ring, boards, ramp }) {
  const lo = { x: ring.x - boards.hw, y: ring.y - boards.hh };
  const hi = { x: ring.x + boards.hw, y: ring.y + boards.hh };
  const left = ramp
    ? [
        [lo.x, hi.y, lo.x, ramp.y + ramp.half],
        [lo.x, ramp.y - ramp.half, lo.x, lo.y],
      ]
    : [[lo.x, hi.y, lo.x, lo.y]];
  return [[lo.x, lo.y, hi.x, lo.y], [hi.x, lo.y, hi.x, hi.y], [hi.x, hi.y, lo.x, hi.y], ...left]
    .map(([ax, ay, bx, by]) => ({ ax, ay, bx, by, length: Math.hypot(bx - ax, by - ay) }))
    .filter((run) => run.length >= 1)
    .map((run) => ({ ...run, out: [(run.by - run.ay) / run.length, -(run.bx - run.ax) / run.length] }));
}

/** The ring's corner posts and ropes, the rig's truss and lamps, and the ad boards' rails. */
export function arenaProps({ ring, boards, ramp }) {
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
  for (const { ax, ay, bx, by, out } of adRuns({ ring, boards, ramp })) {
    const lean = [out[0] * BOARD_PX.lean, out[1] * BOARD_PX.lean];
    props.tube([[ax, ay, BOARD_Z.foot], [bx, by, BOARD_Z.foot]], 3, BOARD_FRAME, { sides: 6 });
    props.tube([[ax + lean[0], ay + lean[1], BOARD_Z.top], [bx + lean[0], by + lean[1], BOARD_Z.top]], 3, BOARD_FRAME, { sides: 6 });
  }
  // The ramp's truss: dark steel lattice under its edges, down to the floor, as in the art.
  if (ramp) {
    const zTop = -APRON_PX.drop - 2;
    const zFoot = -APRON_PX.drop - STAGE_PX.drop;
    for (const edge of [-1, 1]) {
      const y = ramp.y + edge * (ramp.half - 2);
      for (let x = ramp.x0 - 66; x > ramp.x1 + 10; x -= 36) {
        props.tube([[x, y, zTop], [x + 36, y, zFoot]], 1.6, TRUSS, { sides: 4 });
        props.tube([[x, y, zFoot], [x + 36, y, zTop]], 1.6, TRUSS, { sides: 4 });
      }
    }
  }
  return props;
}

/**
 * The ad boards' glowing faces round the floor, facing the ring: one quad per board, `aAd` (u px
 * along the band, v 0..1 up the board, which board).
 */
export function adBoardGeometry(three, { ring, boards, ramp }) {
  const positions = [];
  const ads = [];
  const index = [];
  const z0 = BOARD_Z.foot;
  const z1 = BOARD_Z.top;
  // Their tops lean back away from the ring, so the boards' faces show from above.
  const lean = BOARD_PX.lean;
  let u = 0;
  adRuns({ ring, boards, ramp }).forEach(({ ax, ay, bx, by, length, out }) => {
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

/** The lamps' starbursts: one camera-facing quad per lamp under the rig, aGlint (corner x, y -1..1, which lamp). */
export function glintGeometry(three, lamps) {
  const positions = [];
  const glints = [];
  const index = [];
  const z = RIG_PX.z - RIG_PX.depth - 18;
  lamps.forEach(([x, y], k) => {
    const first = positions.length / 3;
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push(x, y, z);
      glints.push(cx, cy, k);
    }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aGlint', new three.Float32BufferAttribute(glints, 3));
  geometry.setIndex(index);
  return geometry;
}

const ARENA = /* glsl */ `
// The ring: centre x, y, half width, half height; the ad boards' line: half width, half height
// (arenaSpots).
uniform vec4 uRing;
uniform vec2 uBoards;
uniform vec3 uEmblem;
// The entrance ramp: its middle's y, half width, the x it leaves the stage at, out to the left
// (arenaSpots).
uniform vec3 uRamp;
const vec3 HAZE_TEAL = vec3(0.0, 0.07, 0.075);
// px inside the ramp's edges (negative off it).
float rampInside(vec2 p) {
  if (uRamp.y <= 0.0 || p.x > uRamp.z) return -100000.0;
  return uRamp.y - abs(p.y - uRamp.x);
}
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
  // The entrance ramp runs off the stage at its level, out through the boards and the stands; B
  // carries px inside its edges (-1 on the stage itself).
  float ramp = rampInside(p);
  // The stage's outer wall drops to the floor over a few px, so its edge stays smooth on the grid;
  // not where the ramp runs on.
  if (kind > -0.5 && kind < 0.5 && ramp <= 0.0) {
    h = mix(h, -${APRON_PX.drop + STAGE_PX.drop}.0, smoothstep(${STAGE_PX.width - 9}.0, ${STAGE_PX.width - 1}.0, d));
  }
  if (ramp > 0.0 && d >= ${STAGE_PX.width - 3}.0) {
    h = ramp < 3.0 ? mix(-${APRON_PX.drop + STAGE_PX.drop}.0, -${APRON_PX.drop}.0, ramp / 3.0) : -${APRON_PX.drop}.0;
    kind = 0.0;
    id = ramp;
  } else if (kind > -0.5 && kind < 0.5) {
    id = -1.0;
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
    // The canvas: white under the rig's spotlight in the middle, as the art's (190,221,242), shading
    // through pale blue to the arena's teal toward the ropes; faint scuffs; a darker band round its
    // edge; the Poke Ball painted on it in light grey lines.
    vec2 fromMiddle = (p - uRing.xy) / max(uRing.zw, vec2(1.0));
    float spot = exp(-dot(fromMiddle, fromMiddle) * 1.3);
    col = mix(vec3(0.2, 0.46, 0.55), vec3(0.74, 0.88, 0.96), spot) * (0.97 + 0.04 * fbm3(p / 50.0));
    col = mix(col, vec3(0.12, 0.24, 0.3), smoothstep(-26.0, -20.0, d));
    float e = emblemDistance(p, uEmblem);
    col = mix(col, vec3(0.88, 0.93, 0.96), (1.0 - smoothstep(1.5, 3.0, e)) * 0.85 * step(0.001, uEmblem.z));
  } else if (kind < 0.5) {
    if (d < ${APRON_PX.slope}.0 || ground < -${APRON_PX.drop - 2}.0 && d < ${APRON_PX.slope + 2}.0) {
      // The apron: the ring's navy skirt, as the art's (0,123,175) under the rig.
      col = vec3(0.0, 0.17, 0.4) * mix(0.75, 1.0, smoothstep(0.0, ${APRON_PX.slope}.0, d));
    } else if (id >= 0.0) {
      // The ramp: the stage's glowing white running out to the left, lights along both edges.
      col = mix(vec3(0.6, 0.84, 0.9), vec3(0.78, 0.93, 0.98), smoothstep(0.0, 30.0, id));
      float bulb = length(vec2(mod(p.x, 32.0) - 16.0, id - 10.0));
      col += vec3(1.5, 1.6, 1.7) * (1.0 - smoothstep(5.5, 7.0, bulb)) + vec3(0.3, 0.6, 0.66) * exp(-bulb / 9.0) * 0.7;
      col = mix(vec3(0.08, 0.14, 0.18), col, smoothstep(0.0, 3.0, id));
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
    vec3 seat = mix(vec3(0.0, 0.03, 0.032), vec3(0.01, 0.07, 0.072), tierTop);
    float along = alongStands(p);
    float tierD = mod(length(max(abs(p - uRing.xy) - uBoards, 0.0)) - ${BOARD_PX.thick}.0, ${TIER_PX.run}.0);
    col = seat;
    // Two neighbouring seats either side, so a person leaning past their slot isn't cut off.
    for (int k = -1; k <= 1; k++) {
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
  // The teal haze over the arena, thicker away from the ring.
  col = mix(col, HAZE_TEAL, smoothstep(${STAGE_PX.width}.0, 500.0, d) * 0.45);
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
// Lettering: words of small glyphs along a line at height y0..y1, each glyph a random 3 x 5 of
// pixels, a space between words; from afar it reads as print.
float lettering(vec2 q, float y0, float y1, float seed) {
  if (q.y < y0 || q.y > y1 || q.x < 0.0) return 0.0;
  float glyph = floor(q.x / 8.0);
  float word = floor(q.x / 40.0);
  if (mod(q.x, 40.0) > 32.0 || hash12(vec2(word, seed)) > 0.85) return 0.0;
  vec2 inGlyph = vec2(fract(q.x / 8.0) / 0.75, (q.y - y0) / (y1 - y0));
  if (inGlyph.x >= 1.0) return 0.0;
  vec2 pixel = floor(inGlyph * vec2(3.0, 5.0));
  return step(0.42, hash12(vec2(glyph * 17.0 + pixel.x * 3.0 + pixel.y * 5.0, seed + 11.0)));
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
  // As in the art, the rig high over the ring fans lasers out to the crowd all round (even lasers),
  // and lights at the corners criss-cross the arena to the stands on the far side (odd ones); every
  // spot sweeps slowly. They show only past the ad boards, so none crosses the ring or the stage.
  float k = aBeam.z;
  float sweep = uTime * (0.08 + 0.06 * hash12(vec2(k, 2.0))) + hash12(vec2(k, 3.0)) * 6.28;
  vec2 stands = uBoards + 70.0;
  vec3 source;
  vec2 dir;
  if (mod(k, 2.0) < 0.5) {
    source = vec3(uRing.xy + (hash22(vec2(k, 5.0)) - 0.5) * 60.0, ${LASER_FROM_Z}.0);
    float angle = hash12(vec2(k, 4.0)) * 6.2831853 + 0.6 * sin(sweep);
    dir = vec2(cos(angle), sin(angle));
  } else {
    vec2 corner = vec2(hash12(vec2(k, 6.0)) < 0.5 ? -1.0 : 1.0, hash12(vec2(k, 7.0)) < 0.5 ? -1.0 : 1.0);
    source = vec3(uRing.xy + corner * (uBoards + 140.0), ${LASER_FROM_Z - 120}.0);
    float angle = atan(-corner.y, -corner.x) + 0.55 * sin(sweep);
    dir = vec2(cos(angle), sin(angle));
  }
  // Where the line from the middle along dir meets the stands' rectangle.
  vec2 hitAt = stands / max(abs(dir), vec2(0.0001));
  vec2 target = uRing.xy + dir * min(hitAt.x, hitAt.y);
  vec3 to = vec3(target, 24.0);
  vec3 here = mix(source, to, aBeam.x);
  vec2 q = abs(here.xy - uRing.xy) - uBoards;
  vOutside = smoothstep(-20.0, 60.0, max(q.x, q.y));
  vec4 view = modelViewMatrix * vec4(here, 1.0);
  vec2 tangent = (modelViewMatrix * vec4(to - source, 0.0)).xy;
  vec2 across = length(tangent) > 0.0001 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(1.0, 0.0);
  view.xy += across * aBeam.y * 3.5;
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
  // Brightest where it reaches the crowd, fading up into the haze toward the rig.
  float fade = smoothstep(0.0, 0.6, vBeam.x) * vOutside;
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  gl_FragColor = vec4(tint * core * fade * 0.6 * shown, 1.0);
${OUTPUT}
}
`;

export const GLINT_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
attribute vec3 aGlint;
varying vec2 vCorner;
varying float vTwinkle;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  view.xy += aGlint.xy * ${GLINT_PX}.0;
  vCorner = aGlint.xy;
  float seed = hash12(vec2(aGlint.z, 4.0));
  vTwinkle = 0.75 + 0.25 * sin(uTime * (1.1 + 1.4 * seed) + seed * 40.0);
  gl_Position = projectionMatrix * view;
}
`;

/**
 * A lamp's starburst, as the art's rig lamps flare: a hot core, four long thin rays crossing as an
 * X and four shorter ones along the screen's axes; each twinkles gently on its own beat, never
 * turning.
 */
export const GLINT_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform float uExit;
varying vec2 vCorner;
varying float vTwinkle;
void main() {
  vec2 q = vCorner;
  vec2 diagonal = vec2(q.x + q.y, q.x - q.y) * 0.7071;
  float rays = exp(-abs(diagonal.y) * 16.0) * (1.0 - smoothstep(0.0, 1.0, abs(diagonal.x)))
    + exp(-abs(diagonal.x) * 16.0) * (1.0 - smoothstep(0.0, 1.0, abs(diagonal.y)));
  rays += 0.55 * (exp(-abs(q.y) * 20.0) * (1.0 - smoothstep(0.0, 0.55, abs(q.x)))
    + exp(-abs(q.x) * 20.0) * (1.0 - smoothstep(0.0, 0.55, abs(q.y))));
  float r = length(q);
  float core = exp(-r * r * 60.0) * 1.8 + exp(-r * 7.0) * 0.35;
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  gl_FragColor = vec4(vec3(0.85, 0.97, 1.05) * (core + rays * 0.8) * vTwinkle * shown, 1.0);
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

const NO_SPOTS = { ring: null, boards: null, ramp: null, scene: null, emblem: null };

/** Fighting Stadium's board (stadium-environment-mesh.js BOARDS). */
export function fightingStadiumBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uRing: { value: new three.Vector4() },
    uBoards: { value: new three.Vector2() },
    uEmblem: { value: new three.Vector3() },
    uRamp: { value: new three.Vector3() },
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
      own.uRamp.value.set(spots.ramp?.y ?? 0, spots.ramp?.half ?? 0, spots.ramp?.x0 ?? 0);
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      for (const mesh of [props, boards, lasers, glints]) mesh.visible = Boolean(ring);
      if (!ring) return;
      replaceGeometry(props, arenaProps(spots).build(three));
      replaceGeometry(boards, adBoardGeometry(three, spots));
      replaceGeometry(glints, glintGeometry(three, rigLamps(ring)));
    },
  };
}
