// Design 077 (prototype): Fighting Stadium (customhb-239) after its card art (FFI 90, xy3-90 in
// set.json; Ryo Ueda): a wrestling ring in a packed arena at night. The ring's pale canvas sits on
// a white stage edged in a row of white lights; round the stage the arena floor, then a band of
// glowing LED ad boards, then the dark stands full of the crowd, all under a teal haze. Lasers in
// green, magenta, yellow and white sweep across it from the lighting rig high overhead.
// The art looks across the arena at the ring; the board looks down into the ring, so the ring's
// canvas holds every card, its corner posts and three ropes a side stand round them, and the stage,
// the ad boards and the stands ring it out to the scene's edges.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the canvas at the cloth, the stage, the floor
// and the stands below and climbing away in tiers), G signed px from the ring's edge, B the tier's
// id, A the kind (-1 canvas, 0 stage, 1 floor, 2 stands); the shared light bake adds normals and
// occlusion. Per frame: TERRAIN paints all of it, the stage's lights and the crowd; PROPS are the
// posts, ropes and the ad boards' frames (stadium-env-props.mjs); BOARDS the ad boards' faces;
// LASERS the sweeping beams.
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
export const APRON_PX = { drop: 34 };
export const STAGE_PX = { width: 74, drop: 46 };
export const FLOOR_PX = 64;
/** The ad boards: height, thickness. */
export const BOARD_PX = { height: 44, thick: 8 };
/** The stands: each tier's run and rise. */
export const TIER_PX = { run: 40, rise: 26 };
/** The ring's corner posts and ropes: the posts' height and radius, the ropes' heights, radius, sag. */
export const POST_PX = { height: 96, radius: 7 };
export const ROPES = { heights: [36, 60, 84], radius: 2.6, sag: 5 };
/** The lasers: how many, and where they shine from (z over the cloth). */
export const LASER_COUNT = 24;
/**
 * The entrance ramp off the stage, as in the art (there to the right; here off the left side, which
 * both camera presets see, where the sidebox covers the right): its middle's place as a share of
 * the ring's half height (near side negative), its half width.
 */
export const RAMP = { at: -0.42, half: 52 };
const LASER_FROM_Z = 520;

const POST_STEEL = [0.0, 0.17, 0.38, 0.4];
const PAD_BLUE = [0.0, 0.2, 0.44, 0.15];
const ROPE_WHITE = [0.92, 0.93, 0.95, 0.1];
const BOARD_FRAME = [0.05, 0.055, 0.065, 0.3];
const TRUSS = [0.1, 0.14, 0.16, 0.5];

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

/** The ring's corner posts and ropes, and the ad boards' frames and backs. */
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
  // The ad boards' frame: a dark band behind the glowing faces, its top capped.
  const z0 = -APRON_PX.drop - STAGE_PX.drop;
  const z1 = z0 + BOARD_PX.height;
  const t = BOARD_PX.thick / 2;
  const sides = [
    { x: ring.x, y: ring.y - boards.hh - t, hw: boards.hw + 2 * t, hh: t },
    { x: ring.x, y: ring.y + boards.hh + t, hw: boards.hw + 2 * t, hh: t },
    { x: ring.x - boards.hw - t, y: ring.y, hw: t, hh: boards.hh },
    { x: ring.x + boards.hw + t, y: ring.y, hw: t, hh: boards.hh },
  ];
  for (const [i, side] of sides.entries()) {
    if (i !== 2 || !ramp) {
      props.box({ ...side, z0, z1: z1 + 3, color: BOARD_FRAME });
      continue;
    }
    // The left side's band opens where the ramp runs through it.
    const lo = side.y - side.hh;
    const hi = side.y + side.hh;
    for (const [a, b] of [
      [lo, ramp.y - ramp.half],
      [ramp.y + ramp.half, hi],
    ]) {
      if (b - a > 1) props.box({ x: side.x, y: (a + b) / 2, hw: side.hw, hh: (b - a) / 2, z0, z1: z1 + 3, color: BOARD_FRAME });
    }
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
  const z0 = -APRON_PX.drop - STAGE_PX.drop + 2;
  const z1 = z0 + BOARD_PX.height - 6;
  const lo = { x: ring.x - boards.hw, y: ring.y - boards.hh };
  const hi = { x: ring.x + boards.hw, y: ring.y + boards.hh };
  // Round the band counter-clockwise from the near-left corner, so u runs on round the corners.
  // The left run opens where the ramp runs through it.
  const left = ramp
    ? [
        [lo.x, hi.y, lo.x, ramp.y + ramp.half],
        [lo.x, ramp.y - ramp.half, lo.x, lo.y],
      ]
    : [[lo.x, hi.y, lo.x, lo.y]];
  const runs = [[lo.x, lo.y, hi.x, lo.y], [hi.x, lo.y, hi.x, hi.y], [hi.x, hi.y, lo.x, hi.y], ...left];
  let u = 0;
  runs.forEach(([ax, ay, bx, by]) => {
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1) return;
    const first = positions.length / 3;
    positions.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1);
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
// Signed px from the ring's edge, negative on the canvas.
float ringDistance(vec2 p) {
  vec2 q = abs(p - uRing.xy) - uRing.zw;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
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
    h = d < 3.0 ? mix(0.0, -${APRON_PX.drop}.0, d / 3.0) : -${APRON_PX.drop}.0;
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
  if (kind > -0.5 && kind < 0.5 && d > ${STAGE_PX.width - 3}.0) h = -${APRON_PX.drop + STAGE_PX.drop}.0;
  // The entrance ramp runs off the stage at its level, out through the boards and the stands; B
  // carries px inside its edges (-1 on the stage itself).
  float ramp = rampInside(p);
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
    // The canvas: pale blue-grey, brightest under the rig in the middle, faint scuffs; a darker
    // band round its edge; the Poke Ball painted on it in light grey lines.
    float spot = exp(-dot(p - uRing.xy, p - uRing.xy) / (2.0 * 420.0 * 420.0));
    col = mix(vec3(0.42, 0.5, 0.56), vec3(0.72, 0.8, 0.84), spot) * (0.95 + 0.06 * fbm3(p / 50.0));
    col = mix(col, vec3(0.2, 0.26, 0.32), smoothstep(-26.0, -20.0, d));
    float e = emblemDistance(p, uEmblem);
    col = mix(col, vec3(0.88, 0.93, 0.96), (1.0 - smoothstep(1.5, 3.0, e)) * 0.85 * step(0.001, uEmblem.z));
  } else if (kind < 0.5) {
    if (d < 3.0 || ground < -${APRON_PX.drop - 2}.0 && d < 5.0) {
      // The apron: the ring's dark navy skirt, a white line along it.
      col = vec3(0.0, 0.16, 0.36);
    } else if (id >= 0.0) {
      // The ramp: the stage's glowing white running out to the left, lights along both edges.
      col = mix(vec3(0.6, 0.84, 0.9), vec3(0.78, 0.93, 0.98), smoothstep(0.0, 30.0, id));
      float bulb = length(vec2(mod(p.x, 26.0) - 13.0, id - 9.0));
      col += vec3(1.4, 1.5, 1.6) * (1.0 - smoothstep(2.0, 3.5, bulb));
      col = mix(vec3(0.08, 0.14, 0.18), col, smoothstep(0.0, 3.0, id));
    } else {
      // The stage: glowing white, a row of white lights along its outer edge.
      col = mix(vec3(0.62, 0.86, 0.92), vec3(0.8, 0.95, 1.0), smoothstep(${STAGE_PX.width}.0, 10.0, d));
      float rim = ${STAGE_PX.width - 9}.0;
      vec2 rel = p - uRing.xy;
      float along = abs(rel.x) / (uRing.z + rim) > abs(rel.y) / (uRing.w + rim) ? p.y : p.x;
      float bulb = length(vec2(mod(along, 26.0) - 13.0, d - rim));
      col += vec3(1.4, 1.5, 1.6) * (1.0 - smoothstep(2.0, 3.5, bulb));
      col = mix(col, vec3(0.08, 0.14, 0.18), smoothstep(${STAGE_PX.width - 3}.0, ${STAGE_PX.width}.0, d));
    }
  } else if (kind < 1.5) {
    col = vec3(0.02, 0.05, 0.07);
  } else {
    // The stands: tiers of seats in the dark, packed with the crowd: heads and shoulders in
    // silhouette, shirts a dim teal, a phone's light here and there.
    float tierTop = smoothstep(0.8, 0.95, n.z);
    vec3 seat = mix(vec3(0.0, 0.025, 0.026), vec3(0.008, 0.06, 0.06), tierTop);
    float along = alongStands(p);
    float tierD = mod(length(max(abs(p - uRing.xy) - uBoards, 0.0)) - ${BOARD_PX.thick}.0, ${TIER_PX.run}.0);
    col = seat;
    // Two neighbouring seats either side, so a person leaning past their slot isn't cut off.
    for (int k = -1; k <= 1; k++) {
      float slot = floor(along / 15.0) + float(k);
      float seed = hash12(vec2(slot, id * 97.0));
      if (seed < 0.14) continue;
      float size = 1.1 + 0.5 * hash12(vec2(slot, id * 31.0 + 5.0));
      vec2 at = vec2((slot + 0.5) * 15.0 + (hash12(vec2(slot, id + 7.0)) - 0.5) * 6.0, 23.0 + (hash12(vec2(slot, id + 9.0)) - 0.5) * 6.0);
      vec2 local = (vec2(along, tierD) - at) / size;
      float body = 1.0 - smoothstep(4.6, 5.6, length(local * vec2(1.0, 1.5) - vec2(0.0, -6.5)));
      float head = 1.0 - smoothstep(2.8, 3.6, length(local - vec2(0.0, 2.0)));
      float pick = hash12(vec2(slot, id * 53.0));
      vec3 shirt = pick < 0.6 ? vec3(0.0, 0.06, 0.06) : pick < 0.74 ? vec3(0.18, 0.04, 0.06) : pick < 0.88 ? vec3(0.02, 0.06, 0.16) : vec3(0.2, 0.26, 0.27);
      col = mix(col, shirt * (0.7 + 0.3 * smoothstep(-6.0, 2.0, local.y)), body);
      col = mix(col, vec3(0.02, 0.08, 0.08), head);
      // A raised phone's light here and there, twinkling.
      float phone = step(0.95, hash12(vec2(slot * 3.1, id * 13.0))) * (0.55 + 0.45 * sin(uTime * 2.5 + seed * 40.0));
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
// Blocky lettering: bars of words along a line at height y0..y1, words breaking at random.
float lettering(vec2 q, float y0, float y1, float seed) {
  if (q.y < y0 || q.y > y1) return 0.0;
  float glyph = floor(q.x / 7.0);
  float gap = step(0.82, hash12(vec2(floor(q.x / 34.0), seed)));
  float stem = step(0.18, fract(q.x / 7.0)) * step(fract(q.x / 7.0), 0.82);
  float holes = step(0.7, hash12(vec2(glyph, seed + 3.0))) * step(0.35, (q.y - y0) / (y1 - y0)) * step((q.y - y0) / (y1 - y0), 0.65);
  return stem * (1.0 - gap) * (1.0 - holes * 0.8);
}
void main() {
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  float panel = floor(vAd.x / PANEL);
  float design = floor(hash12(vec2(panel, 4.0)) * 5.0);
  vec2 q = vec2(mod(vAd.x, PANEL), vAd.y * 38.0);
  vec3 col;
  if (design < 0.5) {
    col = vec3(0.85, 0.08, 0.1);
    col = mix(col, vec3(1.0), lettering(q - vec2(14.0, 0.0), 13.0, 25.0, panel));
  } else if (design < 1.5) {
    col = vec3(0.95);
    float mark = length((q - vec2(28.0, 19.0)) * vec2(1.0, 1.2));
    col = mix(col, vec3(0.85, 0.1, 0.12), 1.0 - smoothstep(9.0, 10.0, mark));
    col = mix(col, vec3(0.1, 0.2, 0.75), lettering(q - vec2(48.0, 0.0), 14.0, 24.0, panel) * step(q.x, 140.0));
  } else if (design < 2.5) {
    col = vec3(0.08, 0.25, 0.8);
    vec2 ball = q - vec2(PANEL * 0.5, 19.0);
    float r = length(ball);
    float outline = 1.0 - smoothstep(0.8, 1.6, abs(r - 12.0));
    float band = (1.0 - smoothstep(0.8, 1.6, abs(ball.y))) * step(r, 12.0);
    float button = 1.0 - smoothstep(0.8, 1.6, abs(r - 4.0));
    col = mix(col, vec3(1.0), max(max(outline, band), button));
    col = mix(col, vec3(0.95, 0.3, 0.3), step(r, 11.0) * step(1.2, ball.y) * step(5.0, r));
  } else if (design < 3.5) {
    col = vec3(0.98, 0.78, 0.1);
    col = mix(col, vec3(0.08, 0.08, 0.1), lettering(q - vec2(20.0, 0.0), 12.0, 26.0, panel + 9.0));
  } else {
    col = vec3(0.1, 0.62, 0.3);
    col = mix(col, vec3(0.95, 1.0, 0.9), lettering(q - vec2(26.0, 0.0), 14.0, 24.0, panel + 5.0));
  }
  // Seams between panels, a sheen running along the band.
  col *= 0.4 + 0.6 * smoothstep(0.0, 2.0, min(q.x, PANEL - q.x));
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
  // spot sweeps slowly. Over the ring they dim, so the cards' gaps don't flicker with them.
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
  vec2 q = abs(here.xy - uRing.xy) - uRing.zw - 40.0;
  vOutside = mix(0.12, 1.0, smoothstep(0.0, 60.0, max(q.x, q.y)));
  vec4 view = modelViewMatrix * vec4(here, 1.0);
  vec2 tangent = (modelViewMatrix * vec4(to - source, 0.0)).xy;
  vec2 across = length(tangent) > 0.0001 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(1.0, 0.0);
  view.xy += across * aBeam.y * 3.2;
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
  float which = mod(vLaser, 5.0);
  vec3 tint = which < 0.5 ? vec3(0.3, 1.4, 0.4) : which < 1.5 ? vec3(1.4, 0.3, 1.1) : which < 2.5 ? vec3(1.4, 1.2, 0.3) : which < 3.5 ? vec3(1.3, 1.4, 1.5) : vec3(0.3, 0.6, 1.5);
  float core = exp(-vBeam.y * vBeam.y * 3.0);
  // Brightest where it reaches the crowd, fading up into the haze toward the rig.
  float fade = smoothstep(0.0, 0.6, vBeam.x) * vOutside;
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  gl_FragColor = vec4(tint * core * fade * 0.75 * shown, 1.0);
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
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  const boards = new three.Mesh(new three.BufferGeometry(), materials.boards);
  const lasers = new three.Mesh(laserGeometry(three), materials.lasers);
  lasers.renderOrder = 2;
  return {
    objects: [terrain, props, boards, lasers],
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
      for (const mesh of [props, boards, lasers]) mesh.visible = Boolean(ring);
      if (!ring) return;
      replaceGeometry(props, arenaProps(spots).build(three));
      replaceGeometry(boards, adBoardGeometry(three, spots));
    },
  };
}
