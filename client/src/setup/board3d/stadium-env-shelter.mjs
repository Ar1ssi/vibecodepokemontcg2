// Design 077 (prototype): Steel Shelter (customhb-162) after its card art (PHF 105, xy4-105 in
// set.json; Ryo Ueda): a bright white hall. A mirror-gloss pale floor reflects the hex light
// panels of the ceiling and the walls round it (the hexes on the art's floor are those
// reflections); a cyan hologram of the Poké Ball glows in its middle. The walls are blocks of white
// panelling with a louvred band, a cyan light strip near their top. The art looks along the hall at
// its gate, a white chevron frame round a grey sliding door; the board looks down on the floor,
// where the far wall's middle lies under the opponent's hand, so every card lies on the floor, the
// walls stand round it leaning a little outward (so both camera presets see their faces) and the
// gate stands in the middle of each side wall, facing the hall.
//
// No bake of its own: the floor is flat (its bake is empty) and FLOOR paints it, its mirror images
// and the hologram per frame; WALLS draws the four walls from one geometry built
// round the hall (shelterSpots), rising off the floor behind the reveal.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
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
/** The gate on each side wall: half its width at its foot, its height. */
export const GATE_PX = { half: 300, height: 205 };
/** The floor's big hex tiles: px per hex unit (inradius half a unit). */
const FLOOR_HEX_PX = 260;
/** How far out from each wall's foot its reflection streaks the floor. */
const STREAK_PX = 150;
/** How far up the side walls (share of the hall's half height) the corner grooves meet them. */
const CORNER_CUT = '0.5';
/** How far in from the side walls the corner strips run (px across the hall). */
const CORNER_STRIP_PX = 240;
/** The ceiling the floor mirrors, px over the floor; its light panels' hex unit. */
const CEILING_PX = 300;
const CEILING_HEX_PX = 340;
/** Wall segments along each wall (the reveal lifts them vertex by vertex). */
const WALL_STEP_PX = 24;

/**
 * Steel Shelter's hall: the floor's rect to the walls' feet (round every card footprint, HALL_GAP_PX
 * clear), the gate's place along the side walls (`u`: px along them, the hall's middle) and the
 * Poké Ball hologram (craterEmblem, about the table's middle). Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ hall: { x: number, y: number, hw: number, hh: number },
 *   gate: { u: number, half: number, height: number },
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
  const gate = { u: hall.y, half: Math.min(GATE_PX.half, hall.hh * 0.62), height: GATE_PX.height };
  const emblem = craterEmblem(layout, { x: table.x + table.w / 2, y: layout.depth });
  return { hall, gate, emblem };
}

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
`;

const HALL = /* glsl */ `
// The floor's rect to the walls' feet (centre x, y, half width, half height) and the gate on each
// side wall (its middle as px along the wall, half width at its foot, height) (shelterSpots).
uniform vec4 uHall;
uniform vec3 uGate;
const vec3 STRIP_CYAN = vec3(0.35, 1.0, 1.45);
const float WALL_HEIGHT = ${WALL_PX.height}.0;
// The art's gate on a side wall at u px along it and h px up it: a chunky white frame (GATE_BAND
// thick) round a trapezoid opening that narrows upward, its legs leaning in to a flat lintel, each
// corner flaring out into an arm, up and out at the top, out along the floor at the foot, the arm's
// end a dark block ribbed with level slats; the grey double door filling the opening. x: 0 off it,
// 1 frame, 2 slats, 3 door; y: on the frame px in from its edge, on the slats h, on the door px in
// from the opening's edge; z: px from the gate's middle.
const float GATE_BAND = 30.0;
float segmentDistance(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(q - a - ab * clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0));
}
float segmentAlong(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return dot(q - a, ab) / dot(ab, ab);
}
float doorTop() {
  return uGate.z * 0.62;
}
vec3 gateAt(float u, float h) {
  vec2 m = vec2(abs(u - uGate.x), h);
  float bottomWide = uGate.y * 0.42;
  float topWide = uGate.y * 0.3;
  float top = doorTop();
  vec2 legFoot = vec2(bottomWide + GATE_BAND * 0.5, GATE_BAND * 0.5);
  vec2 legTop = vec2(topWide + GATE_BAND * 0.5, top + GATE_BAND * 0.5);
  vec2 upperEnd = legTop + vec2(GATE_BAND * 1.9, GATE_BAND * 1.3);
  vec2 lowerEnd = legFoot + vec2(GATE_BAND * 1.9, -GATE_BAND * 0.15);
  float upper = segmentDistance(m, legTop, upperEnd);
  float lower = segmentDistance(m, legFoot, lowerEnd);
  float frame = min(min(segmentDistance(m, legFoot, legTop), segmentDistance(m, vec2(0.0, legTop.y), legTop)), min(upper, lower));
  frame -= GATE_BAND * 0.5;
  if (frame < 0.0) {
    float upperAt = segmentAlong(m, legTop, upperEnd);
    float lowerAt = segmentAlong(m, legFoot, lowerEnd);
    float armLength = length(upperEnd - legTop);
    if (upper <= GATE_BAND * 0.5 && upperAt > 0.45) return vec3(2.0, h, u - uGate.x);
    if (lower <= GATE_BAND * 0.5 && lowerAt > 0.45) return vec3(2.0, h, u - uGate.x);
    return vec3(1.0, -frame, u - uGate.x);
  }
  float legX = mix(bottomWide, topWide, clamp(h / top, 0.0, 1.0));
  float inside = min(legX - m.x, top - h);
  if (inside > 0.0) return vec3(3.0, inside, u - uGate.x);
  return vec3(0.0);
}
// The wall's colour at u px along it and h px up it (gated: 1 on a side wall, which holds the
// gate); its light strips'
// glow in glow. As in the art: blocks of white panelling one bay wide, dark seams between them,
// each block a lower panel (a small access hatch in some), a band of dark louvres across its middle
// and an upper panel; a dark baseboard at the foot, a cyan light strip near the top under a pale
// cornice.
vec3 wallPaint(float u, float h, float gated, out vec3 glow) {
  glow = vec3(0.0);
  float bay = mod(u, 170.0);
  float block = floor(u / 170.0);
  vec3 col = vec3(0.7, 0.72, 0.75) * (0.97 + 0.06 * hash12(vec2(block, 3.0)));
  // The louvre band across the block's middle, recessed a little: dark slats.
  if (h > 98.0 && h < 172.0) {
    float slat = smoothstep(0.3, 0.48, abs(fract(h / 7.0) - 0.5));
    col = mix(vec3(0.17, 0.18, 0.2), vec3(0.3, 0.32, 0.35), slat * 0.8);
    col = mix(vec3(0.08, 0.085, 0.1), col, smoothstep(1.0, 3.0, min(h - 98.0, 172.0 - h)));
  }
  // A small access hatch low on some blocks.
  if (hash12(vec2(block, 9.0)) < 0.45 && h > 20.0 && h < 58.0 && bay > 104.0 && bay < 150.0) {
    float edge = min(min(h - 20.0, 58.0 - h), min(bay - 104.0, 150.0 - bay));
    col = mix(col, vec3(0.42, 0.44, 0.48), 1.0 - smoothstep(0.8, 1.8, edge));
  }
  // Panel seams: dark between blocks, faint across the upper panel.
  float seam = min(bay, 170.0 - bay);
  col = mix(col, vec3(0.16, 0.17, 0.2), 1.0 - smoothstep(1.0, 2.6, seam));
  col = mix(col, vec3(0.52, 0.54, 0.58), (1.0 - smoothstep(0.6, 1.6, abs(h - 196.0))) * 0.8);
  if (h < 12.0) {
    col = vec3(0.14, 0.15, 0.17);
  }
  if (h > 212.0 && h < 222.0) {
    col = vec3(0.55, 0.85, 0.95);
    // A slow shimmer runs along the strip.
    float shimmer = 0.9 + 0.1 * sin(u / 60.0 - uTime * 1.6);
    glow += STRIP_CYAN * smoothstep(0.0, 3.0, min(h - 212.0, 222.0 - h)) * 1.1 * shimmer;
  } else if (h >= 222.0) {
    col = vec3(0.86, 0.88, 0.91);
  }
  if (gated > 0.5) {
    vec3 gate = gateAt(u, h);
    if (gate.x > 0.5) {
      glow = vec3(0.0);
      if (gate.x < 1.5) {
        // The frame: chunky and white, a grey bevel along its edges.
        col = mix(vec3(0.55, 0.57, 0.6), vec3(0.9, 0.92, 0.95), smoothstep(1.0, 6.0, gate.y));
      } else if (gate.x < 2.5) {
        // An arm's end: a chunky dark block, its vent slats running level (gate.y is h here).
        col = mix(vec3(0.12, 0.13, 0.15), vec3(0.3, 0.32, 0.36), step(0.55, fract(gate.y / 7.0)));
      } else {
        // The door, as in the art: two grey leaves filling the opening, a dark seam between them
        // and a dark border round them; three vent slits near the top of each leaf, a cluster of
        // hexagon outlines at each leaf's foot by the frame.
        float inset = gate.y;
        float fromSeam = abs(gate.z);
        float top = doorTop();
        col = mix(vec3(0.5, 0.52, 0.56), vec3(0.6, 0.62, 0.66), smoothstep(0.0, top, h));
        float vents = step(top - 34.0, h) * step(h, top - 16.0) * step(18.0, fromSeam) * step(fromSeam, 58.0)
          * (1.0 - smoothstep(0.4, 1.2, abs(fract((h - top + 34.0) / 6.0) - 0.5) * 6.0));
        col = mix(col, vec3(0.3, 0.31, 0.34), vents);
        float cluster = step(h, 44.0) * step(inset + h * 0.9, 62.0) * step(4.0, inset);
        vec4 hex = hexTile(vec2(inset, h) / 17.0 + vec2(0.25, 0.1));
        col = mix(col, vec3(0.36, 0.38, 0.42), cluster * (1.0 - smoothstep(0.03, 0.08, hex.x)));
        col = mix(vec3(0.22, 0.23, 0.26), col, smoothstep(0.8, 2.0, fromSeam));
        col = mix(vec3(0.2, 0.21, 0.24), col, smoothstep(2.0, 4.0, inset));
      }
    }
  }
  return col;
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
 * The floor: pale and mirror-glossy, reflecting the ceiling's hex light panels and, near the walls,
 * the walls themselves (their strips, louvres and gates) where the mirrored ray meets them below
 * their top; the cyan hologram of the Poké Ball; shade gathering at the walls' feet.
 */
export const FLOOR_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform vec3 uEmblem;
${NOISE}
${REVEAL}
${HEX}
${HALL}
varying vec2 vPos;

// The ceiling's light panels at q: big hex lights in dark frames.
vec3 ceilingAt(vec2 q) {
  vec4 panel = hexTile(q / ${CEILING_HEX_PX}.0);
  // Seen in a polished floor the panels' frames are hairlines of pale grey, as the art's.
  float lit = smoothstep(0.006, 0.02, panel.x);
  return mix(vec3(0.64, 0.67, 0.7), vec3(0.88, 0.9, 0.92), lit);
}
// What the glossy floor mirrors at p: the nearest wall the mirrored ray meets below the wall's top,
// else the ceiling over the hall.
vec3 mirroredAt(vec2 p) {
  vec3 ray = vec3(p - uEye.xy, max(uEye.z, 1.0));
  float best = 100000.0;
  vec2 hit = vec2(0.0);
  float gated = 0.0;
  vec2 lo = uHall.xy - uHall.zw;
  vec2 hi = uHall.xy + uHall.zw;
  if (ray.x < 0.0) { float t = (lo.x - p.x) / ray.x; if (t > 0.0 && t < best) { best = t; hit = vec2(p.y + t * ray.y, t * ray.z); gated = 1.0; } }
  if (ray.x > 0.0) { float t = (hi.x - p.x) / ray.x; if (t > 0.0 && t < best) { best = t; hit = vec2(p.y + t * ray.y, t * ray.z); gated = 1.0; } }
  if (ray.y > 0.0) { float t = (hi.y - p.y) / ray.y; if (t > 0.0 && t < best) { best = t; hit = vec2(p.x + t * ray.x, t * ray.z); gated = 0.0; } }
  if (ray.y < 0.0) { float t = (lo.y - p.y) / ray.y; if (t > 0.0 && t < best) { best = t; hit = vec2(p.x + t * ray.x, t * ray.z); gated = 0.0; } }
  if (best < 100000.0 && hit.y < WALL_HEIGHT) {
    vec3 glow;
    return wallPaint(hit.x, hit.y, gated, glow) * 0.9;
  }
  return ceilingAt(p + ray.xy * (${CEILING_PX}.0 / ray.z));
}

void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  // The art's floor: near-white (222,224,226), polished to a mirror (strongest toward the walls, whose gates,
  // louvres and strips it reflects), big hex tiles parted by crisp dark hairline seams; short black
  // hatched strips cut across the hall's four corners (the slanted sides of a great hexagon whose
  // flat sides lie past the near and far walls), as the art's.
  vec2 fromWalls = uHall.zw - abs(p - uHall.xy);
  float gloss = mix(0.62, 0.34, smoothstep(30.0, 260.0, min(fromWalls.x, fromWalls.y)));
  vec3 col = vec3(0.63, 0.655, 0.68) * (0.98 + 0.03 * fbm3(p / 220.0));
  col = mix(col, mirroredAt(p) * 0.98, gloss);
  // The art's floor seen low along it: each wall unit and gate mirrored into a soft streak running
  // out from the wall's foot across the floor's margin, its white panels, dark louvres and gates
  // stretched and blurred, fading out toward the cards.
  vec3 streak = vec3(0.0);
  float streakWeight = 0.0;
  for (int i = 0; i < 4; i++) {
    // Walls 0 and 1 are the side walls (their u runs along y), 2 and 3 the far and near walls.
    bool alongX = i < 2;
    float d = alongX ? fromWalls.x : fromWalls.y;
    float u = alongX ? p.y : p.x;
    float w = (1.0 - smoothstep(20.0, ${STREAK_PX}.0, d)) * step(0.0, d);
    if (w <= 0.0) continue;
    vec3 glow;
    vec3 seen = wallPaint(u, min(d * 1.2 + 14.0, WALL_HEIGHT - 30.0), alongX ? 1.0 : 0.0, glow);
    streak += seen * w;
    streakWeight += w;
  }
  col = mix(col, streak / max(streakWeight, 0.0001) * 1.02, min(streakWeight, 1.0) * 0.45);
  vec4 tile = hexTile((p - uHall.xy) / ${FLOOR_HEX_PX}.0);
  col = mix(col, vec3(0.42, 0.44, 0.48), 1.0 - smoothstep(0.5, 1.2, tile.x * ${FLOOR_HEX_PX}.0));
  vec2 rel = abs(p - uHall.xy);
  float corner = dot(rel, vec2(0.8660254, 0.5)) - (0.8660254 * uHall.z + 0.5 * uHall.w * ${CORNER_CUT});
  float groove = (1.0 - smoothstep(-0.5, 0.8, abs(corner) - 5.0)) * step(rel.y, uHall.w)
    * smoothstep(uHall.z - ${CORNER_STRIP_PX}.0, uHall.z - ${CORNER_STRIP_PX - 20}.0, rel.x);
  float hatch = step(0.75, fract(dot(p, vec2(0.7071, 0.7071)) / 8.0));
  col = mix(col, mix(vec3(0.025, 0.027, 0.032), vec3(0.16, 0.17, 0.19), hatch), groove);

  // Shade gathers at the walls' feet; the far reaches of the hall dim a little.
  vec2 fromWall = uHall.zw - abs(p - uHall.xy);
  float nearWall = min(fromWall.x, fromWall.y);
  col *= mix(0.7, 1.0, smoothstep(0.0, 40.0, nearWall));
  col *= mix(0.86, 1.0, smoothstep(-200.0, 300.0, nearWall));

  // The Poke Ball hologram as in the art: bright glowing cyan lines (a doubled outline, the band
  // across, the button's two rings), a tight glow round them, light running round it.
  if (uEmblem.z > 0.0) {
    vec2 rel = p - uEmblem.xy;
    float r = length(rel);
    float ring = min(abs(r - uEmblem.z), abs(r - uEmblem.z * 0.93));
    float button = min(abs(r - uEmblem.z * 0.2), abs(r - uEmblem.z * 0.3));
    float band = r > uEmblem.z * 0.3 && r < uEmblem.z * 0.93 ? abs(rel.y) : 100000.0;
    float line = min(min(ring, button), band);
    float lit = 1.0 - smoothstep(1.0, 2.6, line);
    float core = 1.0 - smoothstep(0.2, 0.9, line);
    float shimmer = 0.85 + 0.15 * sin(atan(rel.y, rel.x) * 6.0 - uTime * 1.5);
    // On the pale floor an added glow would only wash out: the bloom is a blue tint round the lines,
    // the lines a saturated cyan with a near-white core.
    col = mix(col, vec3(0.36, 0.7, 1.02), exp(-line / 9.0) * 0.5);
    col = mix(col, vec3(0.2, 0.78, 1.25) * shimmer, lit);
    col = mix(col, vec3(0.85, 1.05, 1.15), core * 0.85);
  }

  vec2 edgeUv = min((p - uMin) / uSize, 1.0 - (p - uMin) / uSize);
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));

  col += STRIP_CYAN * revealGlow(p, 0.035);
  col += STRIP_CYAN * exitGlow(p);
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
${HEX}
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
  vec3 col = wallPaint(vPaint.x, vPaint.y, 1.0 - step(0.5, vPaint.w), glow);
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
    // Past the hall, the building's roof: pale grey panels with dark seams, and long skylights over
    // the rooms below glowing with the hall's white light, a cyan line round each.
    // panel: px from the seams (every 240 px).
    vec2 cellAt = floor(vec2(vPaint.x, beyond) / 240.0);
    vec2 panel = abs(mod(vec2(vPaint.x, beyond) + 120.0, 240.0) - 120.0);
    vec3 roof = vec3(0.4, 0.42, 0.45) * (0.95 + 0.1 * hash12(cellAt + vec2(vPaint.w * 7.0, 3.0)));
    roof *= mix(0.55, 1.0, smoothstep(0.8, 2.0, min(panel.x, panel.y)));
    float lane = abs(mod(beyond - ${WALL_PX.cap}.0 - 60.0, 160.0) - 80.0);
    float skylight = (1.0 - smoothstep(13.0, 14.5, lane)) * smoothstep(40.0, 60.0, beyond - ${WALL_PX.cap}.0)
      * step(16.0, panel.x);
    roof = mix(roof, vec3(0.94, 0.97, 1.0), skylight);
    roof = mix(roof, STRIP_CYAN * 0.6, (1.0 - smoothstep(0.6, 1.6, abs(lane - 14.5))) * step(16.0, panel.x) * smoothstep(40.0, 60.0, beyond - ${WALL_PX.cap}.0));
    col = mix(col, roof, smoothstep(${WALL_PX.cap - 20}.0, ${WALL_PX.cap}.0, beyond));
  }
  col += glow;
  col += STRIP_CYAN * revealGlow(vPos, 0.035);
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

const NO_SPOTS = { hall: null, gate: null, emblem: null };

/** Steel Shelter's board (stadium-environment-mesh.js BOARDS): the floor and the walls. */
export function steelShelterBoard({ three, material, replaceGeometry, bakeOptions }) {
  const own = {
    uHall: { value: new three.Vector4() },
    uGate: { value: new three.Vector3() },
    uEmblem: { value: new three.Vector3() },
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
    apply({ hall, gate, emblem }, bounds) {
      own.uHall.value.set(hall?.x ?? 0, hall?.y ?? 0, hall?.hw ?? 0, hall?.hh ?? 0);
      own.uGate.value.set(gate?.u ?? 0, gate?.half ?? 0, gate?.height ?? 0);
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
