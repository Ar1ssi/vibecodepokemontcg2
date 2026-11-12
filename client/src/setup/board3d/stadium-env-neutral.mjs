// Design 077 (prototype): Neutralization Zone (customhb-378) after its card art (SFA 60, imoniii): a
// round hall of pale-blue panelled walls round a glossy blue platform, rings of white-cyan light
// set in its floor, tall columns of blue light standing up round it, green-lit screens floating
// under the ceiling, yellow guide lines on the dark floor at its edge. The art looks across the
// platform at the far wall; the board looks down on it, so the platform holds every card with its
// rings of light running behind them, a pulse of light travelling out along the rings every few
// seconds, the light columns stand on the dark floor round its rim, panelled walls close the hall at
// both sides and the far end, and three screens float over the far side.
// World scale: a card's footprint is a panel of the platform; a light column is a card wide.
//
// Bake, once per layout: BAKE_FIELD is the flat floor (R height px) with the platform's distance in
// G; the shared light bake adds nothing. Per frame: TERRAIN paints the platform (panels, rings, the
// travelling pulse, the polish) and the dark floor round it; PROPS the walls, the machinery, the
// screens (stadium-env-props); BEAMS the columns of light (additive).
// Design 084 (the visual audit): each column a bright white-cyan disc at its base, its light pooled
// round it on the floor (the shared contact glow), the tall shaft over it faint and fading fast (seen
// from above a bright full shaft read as a comet); the floor's rings emissive lines with a soft bloom,
// a broad soft streak of the lit ceiling across the polished platform; small green screens floating
// over the rim's side arcs, facing the platform; the walls the card's pale blue, the navy kept for the
// floor past the platform.
import {
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
import { createKitProps } from './stadium-kit.mjs';
import { wallBand } from './stadium-env-buildings.mjs';
import { boardContext, hash } from './stadium-env-spots.mjs';
import { GLOW } from './stadium-env-ground.mjs';
import { EDGE_HAZE, STANDARD_TERRAIN_VERTEX } from './stadium-env-surfaces.mjs';

export const NEUTRAL_KEY = 'neutralization-zone';
/** The hall's light (toward it): overhead, a little from the far left, cool and even. */
export const NEUTRAL_LIGHT = Object.freeze([-0.12, 0.2, 0.97]);
/** Free platform kept round every card footprint inside the rim; the rings' radii as shares of the platform's. */
export const PLATFORM_MARGIN_PX = 24;
export const MAX_BEAMS = 8;
export const MAX_SCREENS = 4;
/** Design 084: each column's base light on the floor round it. */
export const COLUMN_GLOW = Object.freeze({ colour: '#7fe0ff', reach: 4.2, strength: 0.9, breath: 0.15 });
const BEAM_SIDES = 14;

/**
 * Neutralization Zone's layout: the round platform, the light columns round its rim, the walls at
 * both sides and the far end, the screens floating over the far side. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function neutralSpots(layout) {
  const ctx = boardContext(layout, NEUTRAL_KEY);
  if (!ctx) return null;
  const { scene, cards, core, u, hand, centre } = ctx;
  const corners = cards.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]);
  const platform = Math.max(...corners.map(([x, y]) => Math.hypot(x - centre.x, y - centre.y))) + PLATFORM_MARGIN_PX * u;
  const handEnd = hand ? hand.y + hand.h : core.y + core.h;
  // The walls stand clear of the platform's rim and its columns, wherever the scene's edge lies.
  const wallX = platform + 110 * u;
  const walls = {
    left: { x0: centre.x - wallX - 90 * u, x1: centre.x - wallX, y0: scene.y - 40 * u, y1: scene.y + scene.h + 40 * u },
    right: { x0: centre.x + wallX, x1: centre.x + wallX + 90 * u, y0: scene.y - 40 * u, y1: scene.y + scene.h + 40 * u },
    far: { x0: centre.x - wallX - 90 * u, x1: centre.x + wallX + 90 * u, y0: Math.max(handEnd + 70 * u, centre.y + wallX), y1: Math.max(handEnd + 160 * u, centre.y + wallX + 90 * u) },
    height: 190 * u,
  };
  // Columns of light on the dark floor just outside the platform's rim, away from the near arc
  // (a tall one there would lean up over the player's cards in the tilted view).
  const beams = [];
  for (let k = 0; k < 16 && beams.length < MAX_BEAMS; k += 1) {
    const angle = (k / 16) * 2 * Math.PI + 0.1;
    if (Math.sin(angle) < -0.15) continue;
    const reach = platform + 34 * u;
    const x = centre.x + Math.cos(angle) * reach;
    const y = centre.y + Math.sin(angle) * reach;
    if (!ctx.inScene(x, y, 20 * u) || !ctx.clear(x, y, 14 * u, 14 * u)) continue;
    // Design 083: each column its own height and girth.
    beams.push({ x, y, r: (10 + 6 * hash(k, 5, 2)) * u, h: (170 + 110 * hash(k, 5, 3)) * u, phase: hash(k, 5, 1) * 6.28 });
  }
  // Design 084: small screens floating over the rim's side arcs (past the opponent's hand row they
  // never showed), each a tilted green-lit panel facing the platform.
  const screens = [0.12, 0.36, Math.PI - 0.36, Math.PI - 0.12].map((angle, k) => {
    const reach = platform + 64 * u;
    return {
      x: centre.x + Math.cos(angle) * reach,
      y: centre.y + Math.sin(angle) * reach,
      z: (118 + 22 * hash(k, 6, 1)) * u,
      w: 62 * u,
      h: 38 * u,
      facing: angle + Math.PI,
    };
  });
  const glows = beams.map((beam) => ({ x: beam.x, y: beam.y, r: beam.r * COLUMN_GLOW.reach, colour: COLUMN_GLOW.colour, strength: COLUMN_GLOW.strength, breath: COLUMN_GLOW.breath }));
  return { ...ctx, platform, handEnd, wallX, walls, beams, screens, centre, glows };
}

const NEUTRAL = /* glsl */ `
// The platform (centre x, y, radius), the scale of a card (u).
uniform vec3 uPlatform;
uniform float uUnit;
`;

/** Bake: the floor, flat. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NEUTRAL}
void main() {
  vec2 p = uMin + vUv * uSize;
  // Design 084: clamped under the half-float target's 65504 (no platform leaves its radius at 1e5).
  gl_FragColor = vec4(0.0, clamp(distance(p, uPlatform.xy) - uPlatform.z, -9000.0, 9000.0), 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = STANDARD_TERRAIN_VERTEX;

// The card art's colours (pixel samples, inverted through Neutral tone mapping), the platform a shade
// deeper than the art's so white card borders keep their edges.
const PALETTE = /* glsl */ `
const vec3 FLOOR = vec3(0.17, 0.26, 0.46);
const vec3 FLOOR_PALE = vec3(0.24, 0.35, 0.6);
const vec3 OUTER = vec3(0.075, 0.09, 0.18);
const vec3 RING = vec3(0.6, 1.5, 2.3);
const vec3 RING_WHITE = vec3(2.2, 3.0, 3.4);
const vec3 YELLOW = vec3(0.79, 0.79, 0.085);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${REVEAL}
${EDGE_HAZE}
${GLOW}
${PALETTE}
${NEUTRAL}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float t = uTime;
  float u = uUnit;
  vec2 rel = p - uPlatform.xy;
  float r = length(rel);
  float share = r / uPlatform.z;
  float angle = atan(rel.y, rel.x);

  // Outside the platform: a dark panelled floor with yellow guide lines parallel to its rim.
  vec3 outer = OUTER * (0.86 + 0.28 * fbm3(p / 40.0 + 4.0));
  vec2 plate = abs(fract(p / (84.0 * u)) - 0.5) * 84.0 * u;
  outer = mix(outer, outer * 0.55, 1.0 - smoothstep(0.4, 1.4, min(84.0 * u * 0.5 - plate.x, 84.0 * u * 0.5 - plate.y)));
  float fromRim = r - uPlatform.z;
  float guide = (1.0 - smoothstep(1.0 * u, 2.4 * u, abs(fromRim - 22.0 * u))) + (1.0 - smoothstep(1.0 * u, 2.4 * u, abs(fromRim - 30.0 * u)));
  float guideOn = smoothstep(0.1, 0.3, fract(angle * 3.0 / 6.2831853 + 0.2)) * (1.0 - smoothstep(0.7, 0.9, fract(angle * 3.0 / 6.2831853 + 0.2)));
  outer = mix(outer, YELLOW * (0.84 + 0.16 * fbm3(p / 14.0)), clamp(guide, 0.0, 1.0) * guideOn * 0.85);

  // The platform: panels in two blues between the rings, polished; radial seams; each panel its own tone.
  // Each band between two rings is its own ring of panels, the same number all the way round it, so
  // its seams run straight from one ring to the next.
  float bandIndex = floor((share - 0.3) / 0.16 + 1.0);
  float panels = 6.0 * (bandIndex + 2.0);
  float sector = floor(angle / 6.2831853 * panels);
  float tone = hash12(vec2(sector, bandIndex));
  vec3 plat = mix(FLOOR, FLOOR_PALE, 0.2 + 0.5 * tone);
  plat *= 0.95 + 0.1 * fbm3(p / 36.0 + 2.0);
  float acrossSeam = abs(fract(angle / 6.2831853 * panels) - 0.5) * 6.2831853 * r / panels;
  plat = mix(plat, plat * 0.72, (1.0 - smoothstep(0.4, 1.4, acrossSeam)) * step(0.3, share));
  // Rings of light set in the floor: a bright core line, a bloom either side, brighter toward the rim.
  float ringLight = 0.0;
  float ringBloom = 0.0;
  for (int i = 0; i < 5; i++) {
    float rr = (0.3 + 0.16 * float(i)) * uPlatform.z;
    float d = abs(r - rr);
    ringLight = max(ringLight, 1.0 - smoothstep(0.8 * u, 2.4 * u, d));
    ringBloom = max(ringBloom, exp(-pow(d / (8.0 * u), 2.0)) * (0.55 + 0.1 * float(i)));
  }
  // The pulse: a front of light travelling out along the rings, lighting each as it passes. Design
  // 080: the cards lie on these rings, so the pulse is a slow, faint brightening of the rings
  // themselves, no wash of light across the floor between them.
  float front = fract(t / 7.0) * 1.18;
  float pulse = exp(-pow((share - front) / 0.07, 2.0)) * 0.35;
  // The rings are thin lines of light, not bands: little bloom, a cyan core that goes white only
  // as the pulse passes.
  plat += RING * 0.07 * ringBloom * (0.75 + 0.5 * pulse);
  plat = mix(plat, mix(RING * 0.75, RING_WHITE, 0.15 + 0.6 * pulse), ringLight * (0.62 + 0.25 * pulse));
  // Design 084: the rings emissive, a soft bloom of their light either side (quieter by the cards).
  float wideBloom = 0.0;
  for (int i = 0; i < 5; i++) {
    float rr = (0.3 + 0.16 * float(i)) * uPlatform.z;
    wideBloom = max(wideBloom, exp(-pow(abs(r - rr) / (16.0 * u), 2.0)));
  }
  plat += RING * 0.05 * wideBloom * (1.0 - 0.6 * fieldCalm(p, 60.0));
  // Polish: the floor mirrors the lit ceiling, a broad soft sheen toward the middle that drifts.
  vec3 view = normalize(uEye - vec3(p, 0.0));
  float sheen = pow(max(dot(reflect(-normalize(uSun), vec3(0.0, 0.0, 1.0)), view), 0.0), 5.0);
  plat += vec3(0.08, 0.11, 0.15) * sheen * (0.6 + 0.4 * fbm3(p / 200.0 + t * 0.02));
  // Design 084: a broad soft streak of the lit ceiling lying across the polished platform.
  float streakAt = dot(rel, normalize(vec2(0.62, 1.0))) / (uPlatform.z * 0.32) - 0.25 * sin(t * 0.04);
  plat += vec3(0.07, 0.1, 0.14) * exp(-streakAt * streakAt);
  // The rim: a bright edge line where the platform ends.
  float rim = 1.0 - smoothstep(0.5 * u, 2.0 * u, abs(fromRim));
  plat = mix(plat, RING * (0.9 + 0.4 * pulse), rim * 0.9);

  vec3 col = mix(plat, outer, smoothstep(-1.5, 1.5, fromRim));
  // Light spilling over the dark floor from the rim and the columns.
  col += RING * 0.1 * exp(-max(fromRim, 0.0) / (60.0 * u)) * step(0.0, fromRim);
  // Design 084: each column's base light pooled on the floor round it.
  col = glowOn(col, p);
  col = edgeHaze(col, vUv, 0.5);
  col += vec3(0.7, 0.95, 1.2) * revealGlow(p, 0.035) * 0.6;
  col += vec3(0.7, 0.95, 1.2) * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// Prop colours (aColor; w: 0 matte, 0.3 metal panel, 0.9 glass, 2 and up a light at w - 1).
// Design 084: the card's pale blue walls (the navy kept for the floor past the platform).
const WALL = [0.55, 0.68, 0.86, 0.3];
const WALL_LIGHT = [0.62, 0.74, 0.9, 0.3];
const WALL_DARK = [0.3, 0.4, 0.58, 0.3];
const STRIP = [0.3, 1.2, 1.7, 2.5];
const FRAME = [0.42, 0.52, 0.7, 0.3];
/** Design 084: a column's base light, white-cyan. */
const BASE_LIGHT = [1.3, 1.65, 1.85, 2.4];
const SCREEN = [0.4, 1.5, 0.6, 2.4];
const SCREEN_WHITE = [1.4, 1.5, 1.35, 2.7];
const SCREEN_RIM = [0.046, 0.384, 0.135, 0.3];
const GRATE = [0.04, 0.045, 0.08, 0];

/** A wall: panelled blue boards, a dark grate band, a glowing cyan strip near the top, vertical ribs. */
function wall(props, box, height, face, u) {
  const mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  props.roundBox({ x: mid[0], y: mid[1], z0: -2, z1: height, hw: (box.x1 - box.x0) / 2, hh: (box.y1 - box.y0) / 2, color: WALL, topColor: WALL_LIGHT });
  const a = face === 'right' ? [box.x1, box.y0] : face === 'left' ? [box.x0, box.y1] : [box.x0, box.y0];
  const b = face === 'right' ? [box.x1, box.y1] : face === 'left' ? [box.x0, box.y0] : [box.x1, box.y0];
  wallBand(props, { a, b, depth: 8 * u, z0: -2, z1: 18 * u, over: 4 * u, color: WALL_DARK });
  wallBand(props, { a, b, depth: 6 * u, z0: 18 * u, z1: 24 * u, over: 7 * u, color: FRAME });
  wallBand(props, { a, b, depth: 6 * u, z0: 60 * u, z1: 112 * u, over: 2.5 * u, color: GRATE });
  wallBand(props, { a, b, depth: 6 * u, z0: 116 * u, z1: 120 * u, over: 5 * u, color: STRIP });
  wallBand(props, { a, b, depth: 6 * u, z0: height - 24 * u, z1: height - 18 * u, over: 7 * u, color: FRAME });
  // Ribs: vertical posts between panels.
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const out = [along[1], -along[0]];
  const count = Math.max(3, Math.round(length / (120 * u)));
  for (let k = 0; k <= count; k += 1) {
    const s = (length * k) / count;
    props.roundBox({ x: a[0] + along[0] * s + out[0] * 4 * u, y: a[1] + along[1] * s + out[1] * 4 * u, z0: 24 * u, z1: height - 24 * u, hw: 4 * u, hh: 4 * u, yaw: Math.atan2(along[1], along[0]), color: FRAME });
  }
}

/**
 * A floating screen: a dark-green rim round a bright green pane, tilted toward the platform, showing
 * the Poke Ball in pale lines (design 080: anonymous pale blocks on a screen read as fake content).
 */
function screenPanel(props, s, u) {
  // Design 084: facing the platform (s.facing: the way to it), leaning back away from it.
  const face = [Math.cos(s.facing), Math.sin(s.facing)];
  const along = [-face[1], face[0]];
  const lean = 0.5;
  const at = (x, h, push) => {
    const up = h - s.h / 2;
    return [s.x + along[0] * x - face[0] * Math.sin(lean) * up + face[0] * push * 0.3, s.y + along[1] * x - face[1] * Math.sin(lean) * up + face[1] * push * 0.3, s.z + Math.cos(lean) * up + push];
  };
  const hw = s.w / 2;
  props.quad(at(-hw, 0, 0), at(hw, 0, 0), at(hw, s.h, 0), at(-hw, s.h, 0), SCREEN_RIM);
  props.quad(at(-hw + 4 * u, 4 * u, 0.8), at(hw - 4 * u, 4 * u, 0.8), at(hw - 4 * u, s.h - 4 * u, 0.8), at(-hw + 4 * u, s.h - 4 * u, 0.8), SCREEN);
  // A ring of quads in the pane's plane round (0, cy), from radius r0 out to r1.
  const ring = (cy, r0, r1, push, steps = 28) => {
    for (let k = 0; k < steps; k += 1) {
      const a0 = (k / steps) * 2 * Math.PI;
      const a1 = ((k + 1) / steps) * 2 * Math.PI;
      const on = (r, a) => at(Math.cos(a) * r, cy + Math.sin(a) * r, push);
      props.quad(on(r0, a0), on(r1, a0), on(r1, a1), on(r0, a1), SCREEN_WHITE);
    }
  };
  const cy = s.h / 2;
  const r = Math.min(hw, s.h / 2) * 0.62;
  const line = Math.max(1.6 * u, r * 0.1);
  ring(cy, r - line, r, 1.4);
  ring(cy, r * 0.22, r * 0.22 + line, 1.4, 16);
  // Design 083: a status light in the pane's corner blinks, each screen on its own beat.
  props.look({ kind: LOOK.blink, rate: 0.6 + 0.4 * ((s.x * 0.01) % 1 + 1) % 1, phase: ((s.x * 0.0071) % 1 + 1) % 1 }, () => {
    const lx = hw - 9 * u;
    const ly = s.h - 9 * u;
    props.quad(at(lx - 2.6 * u, ly - 2.6 * u, 1.6), at(lx + 2.6 * u, ly - 2.6 * u, 1.6), at(lx + 2.6 * u, ly + 2.6 * u, 1.6), at(lx - 2.6 * u, ly + 2.6 * u, 1.6), SCREEN_WHITE);
  });
  props.quad(at(-r + line * 0.5, cy - line / 2, 1.4), at(-r * 0.22, cy - line / 2, 1.4), at(-r * 0.22, cy + line / 2, 1.4), at(-r + line * 0.5, cy + line / 2, 1.4), SCREEN_WHITE);
  props.quad(at(r * 0.22, cy - line / 2, 1.4), at(r - line * 0.5, cy - line / 2, 1.4), at(r - line * 0.5, cy + line / 2, 1.4), at(r * 0.22, cy + line / 2, 1.4), SCREEN_WHITE);
}

/** Everything solid, as one prop geometry. */
/** The zone's light for the kit (designs 081, 082): a cool blue-white from the beams, a deep blue fill. */
export const NEUTRAL_MOOD = Object.freeze({
  key: [0.85, 0.92, 1.05],
  sky: [0.3, 0.36, 0.5],
  bounce: [0.16, 0.18, 0.26],
  sheen: [0.35, 0.65],
  shadow: [0.42, 0.46, 0.66, 0.5],
});

export function neutralProps(spots) {
  const props = createPropBuilder();
  props.look({ kind: LOOK.chrome }, () => neutralSolids(props, spots));
  return props;
}

/** The walls, the screens and the columns' glowing bases. */
function neutralSolids(props, spots) {
  const { walls, screens, beams, u } = spots;
  wall(props, walls.left, walls.height, 'right', u);
  wall(props, walls.right, walls.height, 'left', u);
  wall(props, walls.far, walls.height, 'near', u);
  for (const s of screens) screenPanel(props, s, u);
  // Each column stands on a round base of dark metal with a glowing ring.
  for (const beam of beams) {
    props.cylinder({ x: beam.x, y: beam.y, z0: -2, z1: 9 * u, r: beam.r * 1.35, color: FRAME, capColor: WALL_LIGHT, sides: 18 });
    // Design 084: a bright white-cyan disc at the base, the column's foot of light.
    props.cylinder({ x: beam.x, y: beam.y, z0: 9 * u, z1: 11 * u, r: beam.r * 1.05, color: STRIP, capColor: BASE_LIGHT, sides: 18 });
  }
}



/** The columns of light: open cylinders, bright at their foot, fading up, a shimmer running up them. */
export function beamGeometry(three, beams) {
  const positions = [];
  const infos = [];
  const index = [];
  beams.forEach((beam, id) => {
    const first = positions.length / 3;
    for (let ring = 0; ring <= 1; ring += 1) {
      for (let k = 0; k <= BEAM_SIDES; k += 1) {
        const angle = (k / BEAM_SIDES) * 2 * Math.PI;
        positions.push(beam.x + Math.cos(angle) * beam.r, beam.y + Math.sin(angle) * beam.r, ring * beam.h);
        infos.push(ring, angle, beam.phase, id);
      }
    }
    for (let k = 0; k < BEAM_SIDES; k += 1) {
      const a = first + k;
      const b = a + BEAM_SIDES + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aInfo', new three.Float32BufferAttribute(infos, 4));
  geometry.setIndex(index);
  return geometry;
}

export const BEAM_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
attribute vec4 aInfo;
varying vec4 vInfo;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vInfo = aInfo;
  vNormal = vec3(cos(aInfo.y), sin(aInfo.y), 0.0);
  vWorld = position;
  float shown = revealBurned(position.xy) * exitKeep(position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, position.z * shown, 1.0);
}
`;

export const BEAM_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
varying vec4 vInfo;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float up = vInfo.x;
  vec3 toEye = normalize(uEye - vWorld);
  float edge = pow(1.0 - abs(dot(normalize(vNormal), toEye)), 1.6);
  float shimmer = 0.88 + 0.12 * sin(vWorld.z * 0.06 - uTime * 1.0 + vInfo.z);
  // Design 084: translucent, fading fast upward, so from above the shaft is a faint haze over its bright
  // base, not a comet.
  float fade = pow(1.0 - up, 2.4);
  vec3 col = mix(vec3(0.3, 0.75, 1.5), vec3(1.2, 1.6, 1.9), edge);
  gl_FragColor = vec4(col * (0.06 + 0.22 * edge) * fade * shimmer, 1.0);
${OUTPUT}
}
`;

/** Neutralization Zone's board (stadium-environment-mesh.js BOARDS). */
export function neutralizationZoneBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...NEUTRAL_LIGHT).normalize() },
    uPlatform: { value: new three.Vector3() },
    uUnit: { value: 1 },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    beams: make(BEAM_VERTEX, BEAM_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending, side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const kit = createKitProps({ three, material, own, mood: NEUTRAL_MOOD, reveal: 'vec3(0.7, 0.9, 1.1)' });
  const beams = new three.Mesh(new three.BufferGeometry(), materials.beams);
  beams.renderOrder = 2;
  return {
    objects: [terrain, ...kit.objects, beams],
    materials: [...Object.values(materials), ...kit.materials],
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => neutralSpots(layout),
    apply(spots, bounds) {
      own.uUnit.value = spots?.u ?? 1;
      own.uPlatform.value.set(spots?.centre.x ?? 0, spots?.centre.y ?? 0, spots?.platform ?? 1e5);
      replaceGeometry(terrain, terrainGrid(bounds));
      kit.set(spots ? neutralProps(spots) : null);
      beams.visible = Boolean(spots);
      if (spots) replaceGeometry(beams, beamGeometry(three, spots.beams));
    },
  };
}
