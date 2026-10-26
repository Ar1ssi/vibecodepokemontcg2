// Design 077 (prototype): Steel Shelter (customhb-162) after its card art (PHF 105, xy4-105 in
// set.json; Ryo Ueda): a bright white hall. A glossy floor of pale hex tiles, some of their edges
// inlaid in black, mirrors the hex light panels of the ceiling and the walls round it; a cyan
// hologram of the Poké Ball glows in its middle. The walls are white panels over a band of dark
// louvred vents, a cyan light strip near their top; the far wall holds the art's gate, a white
// chevron frame with dark striped insets round a grey sliding door. The art looks along the hall at
// the gate; the board looks down on its floor, so every card lies on the floor, the walls stand
// round it leaning a little outward (so both camera presets see their faces) and the gate is
// painted on the far wall's face, its pillars clear of the opponent's hand.
//
// No bake of its own: the floor is flat (its bake is empty) and FLOOR paints the tiles, their
// mirror images and the hologram per frame; WALLS draws the four walls from one geometry built
// round the hall (shelterSpots), rising off the floor behind the reveal.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  POKE_BALL,
  REVEAL,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
} from './stadium-environment-glsl.mjs';
import { craterEmblem, environmentFootprints } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

/** Free floor kept between the cards and the side walls' feet, and the far and near walls'. */
export const HALL_GAP_PX = { side: 150, end: 64 };
/** The walls: how tall, how far their tops lean out past their feet, how deep their tops' cornice. */
export const WALL_PX = { height: 245, lean: 105, cap: 60 };
/** The gate on the far wall: half its width at its foot, its height. */
export const GATE_PX = { half: 330, height: 205 };
/** Floor tiles: px per hex unit (inradius half a unit, so 110 px). */
const HEX_SCALE_PX = 220;
/** The big hexagon outlined in the floor: its apothem as a share of the hall's half height. */
const BIG_HEX_SHARE = 0.78;
/** The ceiling the floor mirrors, px over the floor; its light panels' hex unit. */
const CEILING_PX = 300;
const CEILING_HEX_PX = 150;
/** Wall segments along each wall (the reveal lifts them vertex by vertex). */
const WALL_STEP_PX = 24;

/**
 * Steel Shelter's hall: the floor's rect to the walls' feet (round every card footprint, HALL_GAP_PX
 * clear), the gate's place on the far wall and the Poké Ball hologram (craterEmblem, about the
 * table's middle). Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ hall: { x: number, y: number, hw: number, hh: number },
 *   gate: { x: number, y: number, half: number, height: number },
 *   emblem: { x: number, y: number, r: number }|null }|null}
 */
export function shelterSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const rects = [...slabs, ...flats];
  const x0 = rects.length ? Math.min(...rects.map((r) => r.x)) : table.x + table.w * 0.3;
  const x1 = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : table.x + table.w * 0.7;
  const y0 = rects.length ? Math.min(...rects.map((r) => r.y)) : table.y;
  const y1 = rects.length ? Math.max(...rects.map((r) => r.y + r.h)) : table.y + table.h;
  const hall = {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    hw: (x1 - x0) / 2 + HALL_GAP_PX.side,
    hh: (y1 - y0) / 2 + HALL_GAP_PX.end,
  };
  const gate = { x: hall.x, y: hall.y + hall.hh, half: GATE_PX.half, height: GATE_PX.height };
  const emblem = craterEmblem(layout, { x: table.x + table.w / 2, y: layout.depth });
  return { hall, gate, emblem, bigHex: Math.min(hall.hh, hall.hw * 0.866) * BIG_HEX_SHARE };
}

const HALL = /* glsl */ `
// The floor's rect to the walls' feet (centre x, y, half width, half height) and the gate on the
// far wall (centre x, the wall's y, half width at its foot, height) (shelterSpots).
uniform vec4 uHall;
uniform vec4 uGate;
const vec3 STRIP_CYAN = vec3(0.35, 1.0, 1.45);
const float WALL_HEIGHT = ${WALL_PX.height}.0;
// The art's gate on the far wall at u px along it (x) and h px up it: a white chevron frame, its
// pillars leaning in to a flat lintel, dark striped insets down them, round a dark recess holding
// a grey sliding door with a cyan light over it. x: 1 on the gate, y: its paint (0 recess, 1
// frame, 2 door), z: px across the pillar or the lintel from its outer edge.
vec3 gateAt(float u, float h) {
  float local = abs(u - uGate.x);
  float outer = uGate.z - 0.55 * h;
  if (h > uGate.w || local > outer) return vec3(0.0);
  float lintel = uGate.w - h;
  float across = min(outer - local, lintel);
  if (across < 64.0) return vec3(1.0, 1.0, across);
  if (local < 84.0 && h < 138.0) return vec3(1.0, 2.0, local);
  return vec3(1.0, 0.0, across);
}
// The wall's colour at u px along it and h px up it (far: 1 on the far wall); its light strips'
// glow in glow. White panels over a dark baseboard with a cyan line, a band of dark louvred vents
// between white piers, panel seams, a cyan light strip near the top under a pale cornice.
vec3 wallPaint(float u, float h, float far, out vec3 glow) {
  glow = vec3(0.0);
  vec3 col = vec3(0.8, 0.82, 0.86);
  // Panel seams over the vents: one above each pier, and one across the panels.
  float pier = abs(mod(u + 85.0, 170.0) - 85.0);
  col = mix(col, vec3(0.46, 0.48, 0.52), (1.0 - smoothstep(0.8, 2.0, pier)) * step(96.0, h));
  col = mix(col, vec3(0.5, 0.52, 0.56), 1.0 - smoothstep(0.8, 2.0, abs(h - 152.0)));
  float bay = mod(u, 170.0);
  if (h > 34.0 && h < 92.0 && bay > 14.0 && bay < 156.0) {
    float slat = smoothstep(0.3, 0.48, abs(fract(h / 6.5) - 0.5));
    col = mix(vec3(0.045, 0.05, 0.06), vec3(0.22, 0.24, 0.28), slat * 0.75);
    float rim = min(min(h - 34.0, 92.0 - h), min(bay - 14.0, 156.0 - bay));
    col = mix(vec3(0.42, 0.44, 0.48), col, smoothstep(2.0, 3.5, rim));
  }
  if (h < 12.0) {
    col = vec3(0.14, 0.15, 0.17);
    glow += STRIP_CYAN * (1.0 - smoothstep(0.5, 1.8, abs(h - 6.0))) * 0.7;
  }
  if (h > 204.0 && h < 216.0) {
    col = vec3(0.55, 0.85, 0.95);
    // A slow shimmer runs along the strip.
    float shimmer = 0.9 + 0.1 * sin(u / 60.0 - uTime * 1.6);
    glow += STRIP_CYAN * smoothstep(0.0, 3.0, min(h - 204.0, 216.0 - h)) * 1.1 * shimmer;
  } else if (h >= 216.0) {
    col = vec3(0.86, 0.88, 0.91);
  }
  if (far > 0.5) {
    vec3 gate = gateAt(u, h);
    if (gate.x > 0.5) {
      if (gate.y > 1.5) {
        // The door: two grey leaves meeting in the middle, a cyan light over them.
        col = mix(vec3(0.36, 0.38, 0.42), vec3(0.52, 0.54, 0.58), smoothstep(0.0, 60.0, h));
        col = mix(vec3(0.16, 0.17, 0.2), col, smoothstep(1.0, 2.5, gate.z));
        glow = STRIP_CYAN * (1.0 - smoothstep(0.8, 2.2, abs(h - 131.0))) * 0.9;
      } else if (gate.y > 0.5) {
        // The frame: white, three dark insets running down it, a grey edge.
        float stripe = step(12.0, gate.z) * step(gate.z, 18.0) + step(26.0, gate.z) * step(gate.z, 34.0)
          + step(42.0, gate.z) * step(gate.z, 50.0);
        col = mix(vec3(0.88, 0.9, 0.93), vec3(0.2, 0.21, 0.24), stripe * 0.9);
        col = mix(vec3(0.55, 0.57, 0.6), col, smoothstep(1.0, 3.0, gate.z));
        glow = vec3(0.0);
      } else {
        col = vec3(0.12, 0.13, 0.15);
        glow = vec3(0.0);
      }
    }
  }
  return col;
}
`;

const HEX = /* glsl */ `
const vec2 HEX_STEP = vec2(1.0, 1.7320508);
// The hex tile round q (units: a tile's inradius is half a unit; its flat edges run along x): x px
// to the tile's nearest edge in units, y the tile's hash, zw the tile's centre in units.
vec4 hexTile(vec2 q) {
  vec2 p = q.yx;
  vec4 corners = floor(vec4(p, p - vec2(0.5, 1.0)) / HEX_STEP.xyxy) + 0.5;
  vec4 h = vec4(p - corners.xy * HEX_STEP, p - (corners.zw + 0.5) * HEX_STEP);
  bool first = dot(h.xy, h.xy) < dot(h.zw, h.zw);
  vec2 local = first ? h.xy : h.zw;
  vec2 cell = first ? corners.xy * HEX_STEP : (corners.zw + 0.5) * HEX_STEP;
  vec2 a = abs(local);
  float edge = 0.5 - max(dot(a, HEX_STEP * 0.5), a.x);
  return vec4(edge, hash12(cell * 7.13), cell.yx);
}
// The middle of the tile edge nearest q, in units: the same point from both tiles sharing it.
vec2 hexEdgeMiddle(vec2 q, vec2 centre) {
  vec2 rel = (q - centre).yx;
  float sector = floor(atan(rel.y, rel.x) / 1.0471976 + 0.5) * 1.0471976;
  return centre + 0.5 * vec2(sin(sector), cos(sector));
}
`;

export const FLOOR_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The floor: pale hex tiles, each a shade apart and bevelled toward its edges, thin grey seams and
 * a scatter of edges inlaid in black; a gloss that mirrors the ceiling's hex light panels and, near
 * the walls, the walls themselves (their strips and vents) where the mirrored ray meets them below
 * their top; the cyan hologram of the Poké Ball; shade gathering at the walls' feet.
 */
export const FLOOR_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec3 uEmblem;
// The big hexagon outlined in the floor: its apothem px (shelterSpots).
uniform float uBigHex;
${NOISE}
${REVEAL}
${HALL}
${HEX}
${POKE_BALL}
varying vec2 vPos;

// The ceiling's light panels at q: big hex lights in dark frames.
vec3 ceilingAt(vec2 q) {
  vec4 panel = hexTile(q / ${CEILING_HEX_PX}.0);
  // Seen in a polished floor the panels' frames soften to grey.
  float lit = smoothstep(0.04, 0.1, panel.x);
  return mix(vec3(0.45, 0.48, 0.53), vec3(1.15, 1.2, 1.27), lit);
}
// What the glossy floor mirrors at p: the nearest wall the mirrored ray meets below the wall's top,
// else the ceiling over the hall.
vec3 mirroredAt(vec2 p) {
  vec3 ray = vec3(p - uEye.xy, max(uEye.z, 1.0));
  float best = 100000.0;
  vec2 hit = vec2(0.0);
  float far = 0.0;
  vec2 lo = uHall.xy - uHall.zw;
  vec2 hi = uHall.xy + uHall.zw;
  if (ray.x < 0.0) { float t = (lo.x - p.x) / ray.x; if (t > 0.0 && t < best) { best = t; hit = vec2(p.y + t * ray.y, t * ray.z); far = 0.0; } }
  if (ray.x > 0.0) { float t = (hi.x - p.x) / ray.x; if (t > 0.0 && t < best) { best = t; hit = vec2(p.y + t * ray.y, t * ray.z); far = 0.0; } }
  if (ray.y > 0.0) { float t = (hi.y - p.y) / ray.y; if (t > 0.0 && t < best) { best = t; hit = vec2(p.x + t * ray.x, t * ray.z); far = 1.0; } }
  if (ray.y < 0.0) { float t = (lo.y - p.y) / ray.y; if (t > 0.0 && t < best) { best = t; hit = vec2(p.x + t * ray.x, t * ray.z); far = 0.0; } }
  if (best < 100000.0 && hit.y < WALL_HEIGHT) {
    vec3 glow;
    vec3 wall = wallPaint(hit.x, hit.y, far, glow);
    return wall * 0.9 + glow;
  }
  return ceilingAt(p + ray.xy * (${CEILING_PX}.0 / ray.z));
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  // The art's floor: polished white hex tiles with faint seams, mirror-bright, and one big hexagon
  // outlined in a dark hatched band round the hall's middle.
  vec2 q = (p - uHall.xy) / ${HEX_SCALE_PX}.0;
  vec4 tile = hexTile(q);
  float edgePx = tile.x * ${HEX_SCALE_PX}.0;
  vec3 col = mix(vec3(0.7, 0.725, 0.76), vec3(0.76, 0.785, 0.82), tile.y);
  float seam = 1.0 - smoothstep(0.6, 1.5, edgePx);
  vec2 rel = abs(p - uHall.xy);
  float bigHex = max(rel.y, dot(rel, vec2(0.8660254, 0.5))) - uBigHex;
  float band = 1.0 - smoothstep(-0.5, 0.8, abs(bigHex) - 7.0);
  float hatch = step(0.5, fract(dot(p, vec2(0.7071, 0.7071)) / 7.0));
  col = mix(col, mirroredAt(p) * 0.92, 0.5 * (1.0 - seam) * (1.0 - band));
  col = mix(col, vec3(0.52, 0.55, 0.6), seam * 0.6 * (1.0 - band));
  col = mix(col, mix(vec3(0.03, 0.032, 0.038), vec3(0.16, 0.17, 0.19), hatch), band);

  // Shade gathers at the walls' feet; the far reaches of the hall dim a little.
  vec2 fromWall = uHall.zw - abs(p - uHall.xy);
  float nearWall = min(fromWall.x, fromWall.y);
  col *= mix(0.7, 1.0, smoothstep(0.0, 40.0, nearWall));
  col *= mix(0.86, 1.0, smoothstep(-200.0, 300.0, nearWall));

  // The Poke Ball hologram as in the art: thin bright cyan lines (a doubled outline, the band
  // across, the button's two rings), a tight glow round them, light running round it.
  if (uEmblem.z > 0.0) {
    vec2 rel = p - uEmblem.xy;
    float r = length(rel);
    float ring = min(abs(r - uEmblem.z), abs(r - uEmblem.z * 0.88));
    float button = min(abs(r - uEmblem.z * 0.2), abs(r - uEmblem.z * 0.3));
    float band = r > uEmblem.z * 0.3 && r < uEmblem.z * 0.88 ? abs(rel.y) : 100000.0;
    float line = min(min(ring, button), band);
    float lit = 1.0 - smoothstep(0.8, 2.2, line);
    float shimmer = 0.85 + 0.15 * sin(atan(rel.y, rel.x) * 6.0 - uTime * 1.5);
    // On the white floor an added glow would only wash out: the lines are painted a saturated
    // cyan-blue, the glow a tint round them.
    col = mix(col, vec3(0.42, 0.72, 0.95), exp(-line / 9.0) * 0.55);
    col = mix(col, vec3(0.1, 0.62, 1.15) * shimmer, lit * 0.95);
  }

  vec2 edgeUv = min((p - uMin) / uSize, 1.0 - (p - uMin) / uSize);
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));

  float front = revealFront();
  col += STRIP_CYAN * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  col += STRIP_CYAN * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * The walls: each vertex carries aPaint (u px along its wall, h px up it, its face: 0 wall, 1 cornice;
 * which wall: 0 a side wall, 1 the far wall, 2 the near wall).
 */
export const WALL_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aPaint;
varying vec4 vPaint;
varying vec3 vNormal;
varying vec3 vWall;
void main() {
  vec3 p = position;
  float growth = terrainGrowth(p.xy);
  vPaint = aPaint;
  vNormal = normal;
  vWall = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.xy, p.z * growth, 1.0);
}
`;

export const WALL_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${HALL}
varying vec4 vPaint;
varying vec3 vNormal;
varying vec3 vWall;
void main() {
  vec2 vPos = vWall.xy;
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  // Corners: each wall stops where it meets its neighbour, mitred along their diagonal.
  vec2 past = abs(vWall.xy - uHall.xy) - uHall.zw - ${WALL_PX.lean}.0 * clamp(vWall.z / WALL_HEIGHT, 0.0, 1.0);
  if (vPaint.w < 0.5 ? past.y > past.x + 0.5 : past.x > past.y + 0.5) discard;
  vec3 glow;
  vec3 col = wallPaint(vPaint.x, vPaint.y, step(0.5, vPaint.w) * step(vPaint.w, 1.5), glow);
  vec3 n = normalize(vNormal);
  // The hall's light comes from the ceiling: tops brightest, faces a little dimmer, the foot shaded.
  col *= 0.72 + 0.28 * n.z;
  col *= mix(0.78, 1.0, smoothstep(0.0, 26.0, vPaint.y));
  if (vPaint.z > 0.5) {
    // The wall's top: a pale cornice, a cyan line along its inner edge, then the dark roof over
    // the rooms beyond the hall, panelled, out to the scene's edge.
    float beyond = vPaint.y - WALL_HEIGHT;
    col = vec3(0.7, 0.72, 0.76) * mix(0.85, 1.0, smoothstep(0.0, 20.0, beyond));
    glow = STRIP_CYAN * (1.0 - smoothstep(0.8, 2.5, beyond)) * 0.8;
    vec2 panel = abs(mod(vec2(vPaint.x, beyond) + 60.0, 120.0) - 60.0);
    vec3 roof = vec3(0.075, 0.08, 0.09) * mix(0.75, 1.0, smoothstep(0.8, 2.0, min(panel.x, panel.y)));
    col = mix(col, roof, smoothstep(${WALL_PX.cap - 20}.0, ${WALL_PX.cap}.0, beyond));
  }
  col += glow;
  float front = revealFront();
  col += STRIP_CYAN * smoothstep(front - 0.035, front - 0.004, revealReach(vPos)) * step(uReveal, 0.999);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The bake: the floor is flat, so its field is empty. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.0);
}
`;

/**
 * The four walls round the hall as one geometry: each a leaning face from its foot to its top, then
 * its cornice running out flat, segmented along the wall; every wall runs on to the scene's edges so
 * the corners close.
 */
export function wallGeometry(three, hall, bounds) {
  const positions = [];
  const normals = [];
  const paints = [];
  const index = [];
  const lo = { x: hall.x - hall.hw, y: hall.y - hall.hh };
  const hi = { x: hall.x + hall.hw, y: hall.y + hall.hh };
  const walls = [
    { foot: [lo.x, 0], along: [0, 1], out: [-1, 0], from: bounds.y, to: bounds.y + bounds.h, kind: 0 },
    { foot: [hi.x, 0], along: [0, 1], out: [1, 0], from: bounds.y, to: bounds.y + bounds.h, kind: 0 },
    { foot: [0, hi.y], along: [1, 0], out: [0, 1], from: bounds.x, to: bounds.x + bounds.w, kind: 1 },
    { foot: [0, lo.y], along: [1, 0], out: [0, -1], from: bounds.x, to: bounds.x + bounds.w, kind: 2 },
  ];
  const { height, lean, cap } = WALL_PX;
  // Profile: [px out from the foot, px up]; face 0 the wall, face 1 the cornice.
  const faces = [
    { from: [0, 0], to: [lean, height], face: 0 },
    { from: [lean, height], to: [lean + cap, height], face: 1 },
  ];
  for (const wall of walls) {
    const steps = Math.max(1, Math.ceil((wall.to - wall.from) / WALL_STEP_PX));
    // The roof runs on to the scene's edge, over the floor beyond the hall (past it, the table's
    // own floor would cover it), the cornice cut short where the edge comes first.
    const toEdge = wall.out[0]
      ? (wall.out[0] < 0 ? lo.x - bounds.x : bounds.x + bounds.w - hi.x)
      : wall.out[1] < 0 ? lo.y - bounds.y : bounds.y + bounds.h - hi.y;
    const roof = Math.max(0, toEdge - lean);
    for (const { from, to: profileTo, face } of faces) {
      if (face && roof < 1) continue;
      const to = face ? [lean + roof, height] : profileTo;
      const rise = to[1] - from[1];
      const run = to[0] - from[0];
      const length = Math.hypot(rise, run);
      const normal = [(-wall.out[0] * rise) / length, (-wall.out[1] * rise) / length, run / length];
      const first = positions.length / 3;
      for (let i = 0; i <= steps; i += 1) {
        const u = wall.from + ((wall.to - wall.from) * i) / steps;
        for (const [out, up] of [from, to]) {
          const x = wall.along[0] ? u : wall.foot[0] + wall.out[0] * out;
          const y = wall.along[1] ? u : wall.foot[1] + wall.out[1] * out;
          positions.push(x, y, up);
          normals.push(...normal);
          // On the cornice h runs on past the top by how far out it is, so its paint can tell.
          paints.push(u, face ? height + (out - lean) : up, face, wall.kind);
        }
      }
      for (let i = 0; i < steps; i += 1) {
        const a = first + i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPaint', new three.Float32BufferAttribute(paints, 4));
  geometry.setIndex(index);
  return geometry;
}

const NO_SPOTS = { hall: null, gate: null, emblem: null, bigHex: 0 };

/** Steel Shelter's board (stadium-environment-mesh.js BOARDS): the floor and the walls. */
export function steelShelterBoard({ three, material, replaceGeometry, bakeOptions }) {
  const own = {
    uHall: { value: new three.Vector4() },
    uGate: { value: new three.Vector4() },
    uEmblem: { value: new three.Vector3() },
    uBigHex: { value: 0 },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    floor: make(FLOOR_VERTEX, FLOOR_FRAGMENT),
    // Both sides: a wall's winding turns with the side it stands on.
    walls: make(WALL_VERTEX, WALL_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
  };
  const floor = new three.Mesh(new three.BufferGeometry(), materials.floor);
  const walls = new three.Mesh(new three.BufferGeometry(), materials.walls);
  return {
    objects: [floor, walls],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    spots: (layout) => shelterSpots(layout) ?? NO_SPOTS,
    apply({ hall, gate, emblem, bigHex }, bounds) {
      own.uBigHex.value = bigHex ?? 0;
      own.uHall.value.set(hall?.x ?? 0, hall?.y ?? 0, hall?.hw ?? 0, hall?.hh ?? 0);
      own.uGate.value.set(gate?.x ?? 0, gate?.y ?? 0, gate?.half ?? 0, gate?.height ?? 0);
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(
        floor,
        new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0)
      );
      walls.visible = Boolean(hall);
      if (hall) replaceGeometry(walls, wallGeometry(three, hall, bounds));
    },
  };
}
