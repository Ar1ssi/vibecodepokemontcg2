// Design 077 (prototype): Dark City (customhb-254) after its card art (UNM 193, sm11-193 in set.json;
// Ryo Ueda): a city at night seen from a rooftop. Office towers with grids of lit windows rise round
// the roof, the round tower with its lit crown among them; Team Skull has sprayed its marks over two
// billboards; searchlights sweep the purple-blue night; a stairwell hut with a red door and a lamp
// stands on the roof, neon glows pink off the puddles. The art looks across the roof at the
// towers; the board looks down on it, so every card lies on the roof, a low parapet runs round it,
// the towers stand round it across the gaps of the streets far below (their faces to the roof lean
// into view), and the hut stands by the cards' near-right corner, as in the art.
//
// Bake, once per layout: BAKE_FIELD writes R height px (the roof at the cloth, the streets STREET_PX
// below), G signed px from the roof's edge; the shared light bake adds normals and occlusion.
// Per frame: TERRAIN paints the roof (concrete slabs, tar seams, puddles mirroring the neon and the
// windows, the hut lamp's and the neon's light) and the streets; BUILDINGS paints every tower's
// windows; PROPS is the parapet, the hut and the roof's machinery; BOARDS the two billboards;
// BEAMS the searchlights.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const CITY_KEY = 'dark-city';
/** Free roof kept between the cards and the parapet beside them, and off their ends. */
export const ROOF_GAP_PX = { side: 150, end: 70 };
/** How far below the roof the streets lie. */
export const STREET_PX = 300;
/** The parapet: height, thickness. */
const PARAPET = { height: 22, thick: 12 };
/** The stairwell hut by the cards' near-right corner: size, height. */
const HUT = { w: 92, d: 116, h: 84 };
/**
 * The towers round the roof, after the art: a tall block either side with a billboard on its face
 * to the roof, lesser blocks between, the round tower and its neighbours far off, low blocks near.
 * Each stands on a side of the roof (`side`), a street's `gap` px past its edge, running `from`
 * `to` along it (shares of the roof's half size from its centre), `depth` px deep and `height`
 * px over the roof. `board`: the billboard on its face to the roof (0 none, 1 Team Skull's skull,
 * 2 the pink X).
 */
const TOWERS = [
  { side: 'left', from: -1.0, to: -0.22, gap: 46, depth: 280, height: 70, board: 0 },
  { side: 'left', from: -0.1, to: 0.62, gap: 38, depth: 250, height: 230, board: 2 },
  { side: 'left', from: 0.74, to: 1.5, gap: 54, depth: 300, height: 120, board: 0 },
  { side: 'right', from: -1.0, to: -0.3, gap: 44, depth: 280, height: 40, board: 0 },
  { side: 'right', from: -0.18, to: 0.64, gap: 38, depth: 250, height: 270, board: 1 },
  { side: 'right', from: 0.76, to: 1.5, gap: 50, depth: 280, height: 160, board: 0 },
  { side: 'far', from: 0.08, to: 0.8, gap: 46, depth: 230, height: 110, board: 0, hazard: true },
  { side: 'far', from: -1.0, to: -0.68, gap: 60, depth: 220, height: 60, board: 0 },
  { side: 'near', from: -1.2, to: 1.2, gap: 60, depth: 260, height: -110, board: 0 },
];
/** The round tower beyond the far edge: share of the roof's half width, street gap, radius, height. */
const ROUND_TOWER = { at: -0.45, gap: 56, r: 92, height: 330 };
/** The searchlights: where each stands (shares of the roof's half size), its sweep's centre (rad) and phase. */
const BEAMS = [
  { at: [-1.3, 1.3], heading: -0.55, phase: 0 },
  { at: [1.3, 1.28], heading: -2.55, phase: 2.3 },
  { at: [1.35, -0.9], heading: 2.5, phase: 4.1 },
  { at: [-1.35, -0.85], heading: 0.65, phase: 1.2 },
];
const BEAM_LENGTH_PX = 1700;

const CONCRETE = [0.26, 0.27, 0.31, 0.05];
const COPING = [0.42, 0.43, 0.47, 0.15];
const HUT_WALL = [0.34, 0.35, 0.39, 0.05];
const DOOR_RED = [0.2, 0.035, 0.04, 0.2];
const LAMP = [1.4, 1.1, 0.7, 2.6];
const MACHINE = [0.3, 0.32, 0.35, 0.4];
const GRILLE = [0.06, 0.065, 0.075, 0.2];
const HAZARD_YELLOW = [0.75, 0.6, 0.06, 1.7];
const TOWER_PARAPET = [0.3, 0.32, 0.37, 0.05];
const HAZARD_BLACK = [0.03, 0.03, 0.03, 0.1];

/**
 * Dark City's layout: the roof (round every card footprint, ROOF_GAP_PX clear), the hut, the roof's
 * machinery, the towers and searchlights round it. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function citySpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const rects = [...slabs, ...flats];
  const x0 = rects.length ? Math.min(...rects.map((r) => r.x)) : table.x + table.w * 0.3;
  const x1 = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : table.x + table.w * 0.7;
  const y0 = rects.length ? Math.min(...rects.map((r) => r.y)) : table.y;
  const y1 = rects.length ? Math.max(...rects.map((r) => r.y + r.h)) : table.y + table.h;
  const roof = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: (x1 - x0) / 2 + ROOF_GAP_PX.side, hh: (y1 - y0) / 2 + ROOF_GAP_PX.end };
  // The hut stands in the roof's near-right corner, clear of the cards and the parapet.
  const hut = {
    x: (x1 + roof.x + roof.hw) / 2 + 4,
    y: roof.y - roof.hh + PARAPET.thick + 18 + HUT.d / 2,
    w: HUT.w,
    d: HUT.d,
    h: HUT.h,
  };
  const at = ([u, v]) => ({ x: roof.x + u * roof.hw, y: roof.y + v * roof.hh });
  const towers = TOWERS.map(({ side, from, to, gap, depth, height, board, hazard = false }) => {
    const across = side === 'left' || side === 'right';
    const sign = side === 'left' || side === 'near' ? -1 : 1;
    const run = across ? roof.hh : roof.hw;
    const reach = (across ? roof.hw : roof.hh) + gap + depth / 2;
    const middle = ((from + to) / 2) * run;
    const length = (to - from) * run;
    return across
      ? { x: roof.x + sign * reach, y: roof.y + middle, w: depth, d: length, height, board, hazard }
      : { x: roof.x + middle, y: roof.y + sign * reach, w: length, d: depth, height, board, hazard };
  });
  const round = {
    x: roof.x + ROUND_TOWER.at * roof.hw,
    y: roof.y + roof.hh + ROUND_TOWER.gap + ROUND_TOWER.r,
    r: ROUND_TOWER.r,
    height: ROUND_TOWER.height,
  };
  const beams = BEAMS.map(({ at: where, heading, phase }) => ({ ...at(where), heading, phase }));
  // Machinery on the roof's left: air-conditioning units beside the cards.
  const machines = [-0.55, -0.1, 0.4].map((v) => ({ x: (x0 + roof.x - roof.hw) / 2 - 6, y: roof.y + v * roof.hh, w: 58, d: 74 }));
  return { roof, hut, towers, round, beams, machines };
}

/** The parapet round the roof, the hut with its door and lamp, the machinery, the towers' rooftops. */
export function cityProps({ roof, hut, machines, towers }) {
  const props = createPropBuilder();
  for (const tower of towers) {
    // A low parapet round every tower's roof.
    if (tower.height > 0) {
      const t = 3;
      const top = tower.height + 8;
      for (const edge of [
        { x: tower.x, y: tower.y - tower.d / 2 + t, hw: tower.w / 2, hh: t },
        { x: tower.x, y: tower.y + tower.d / 2 - t, hw: tower.w / 2, hh: t },
        { x: tower.x - tower.w / 2 + t, y: tower.y, hw: t, hh: tower.d / 2 - 2 * t },
        { x: tower.x + tower.w / 2 - t, y: tower.y, hw: t, hh: tower.d / 2 - 2 * t },
      ]) {
        props.box({ ...edge, z0: tower.height, z1: top, color: TOWER_PARAPET, topColor: COPING });
      }
    }
    if (tower.hazard) {
      // The art's yellow and black hazard band along the roof edge facing the rooftop.
      const edgeY = tower.y - tower.d / 2 - 1.5;
      const count = Math.max(2, Math.round(tower.w / 18));
      for (let k = 0; k < count; k += 1) {
        const x0 = tower.x - tower.w / 2 + (tower.w * k) / count;
        const x1 = x0 + tower.w / count;
        const z1 = tower.height - 2;
        props.quad([x1, edgeY, z1 - 10], [x0, edgeY, z1 - 10], [x0 + 5, edgeY, z1], [x1 + 5, edgeY, z1], k % 2 ? HAZARD_BLACK : HAZARD_YELLOW);
      }
    }
    if (tower.height < 60) continue;
    // On top: a machine room, a water tank, an antenna with its red aircraft light.
    props.box({
      x: tower.x + tower.w * 0.18,
      y: tower.y - tower.d * 0.2,
      z0: tower.height,
      z1: tower.height + 26,
      hw: tower.w * 0.16,
      hh: tower.d * 0.12,
      color: [0.2, 0.21, 0.25, 0.3],
    });
    props.cylinder({ x: tower.x - tower.w * 0.22, y: tower.y + tower.d * 0.24, z0: tower.height, z1: tower.height + 30, r: 16, color: [0.24, 0.22, 0.22, 0.3], sides: 14 });
    const mast = { x: tower.x - tower.w * 0.1, y: tower.y - tower.d * 0.3 };
    props.cylinder({ x: mast.x, y: mast.y, z0: tower.height, z1: tower.height + 58, r: 1.6, color: [0.3, 0.3, 0.34, 0.6], sides: 6 });
    props.box({ x: mast.x, y: mast.y, z0: tower.height + 58, z1: tower.height + 63, hw: 2.8, hh: 2.8, color: [1.5, 0.12, 0.08, 2.0] });
  }
  const lo = { x: roof.x - roof.hw, y: roof.y - roof.hh };
  const hi = { x: roof.x + roof.hw, y: roof.y + roof.hh };
  const t = PARAPET.thick / 2;
  const walls = [
    { x: roof.x, y: lo.y + t, hw: roof.hw, hh: t },
    { x: roof.x, y: hi.y - t, hw: roof.hw, hh: t },
    { x: lo.x + t, y: roof.y, hw: t, hh: roof.hh - 2 * t },
    { x: hi.x - t, y: roof.y, hw: t, hh: roof.hh - 2 * t },
  ];
  for (const wall of walls) {
    props.box({ ...wall, z0: 0, z1: PARAPET.height, color: CONCRETE, topColor: COPING });
  }
  // The hut: concrete walls, a flat roof with a vent, its red door to the cards, a lamp over it.
  props.box({ x: hut.x, y: hut.y, z0: 0, z1: hut.h, hw: hut.w / 2, hh: hut.d / 2, color: HUT_WALL, topColor: COPING });
  props.box({ x: hut.x + 10, y: hut.y + 18, z0: hut.h, z1: hut.h + 14, hw: 12, hh: 12, color: MACHINE });
  const doorX = hut.x - hut.w / 2 - 0.6;
  props.quad([doorX, hut.y + 20, 0], [doorX, hut.y - 20, 0], [doorX, hut.y - 20, 58], [doorX, hut.y + 20, 58], DOOR_RED);
  props.box({ x: doorX - 3, y: hut.y, z0: 64, z1: 70, hw: 3, hh: 9, color: LAMP });
  for (const machine of machines) {
    props.box({ x: machine.x, y: machine.y, z0: 0, z1: 34, hw: machine.w / 2, hh: machine.d / 2, color: MACHINE, topColor: MACHINE });
    // Two fans on top: a dark grille in a rim, three blades round a hub.
    for (const side of [-1, 1]) {
      const fan = { x: machine.x, y: machine.y + side * machine.d * 0.24, r: machine.w * 0.34 };
      props.cylinder({ x: fan.x, y: fan.y, z0: 33, z1: 34.4, r: fan.r, color: GRILLE, sides: 20 });
      props.ring({ x: fan.x, y: fan.y, z0: 33, z1: 37, r: fan.r + 1.5, color: MACHINE, sides: 20 });
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = blade * ((2 * Math.PI) / 3) + side;
        props.box({
          x: fan.x + Math.cos(angle) * fan.r * 0.5,
          y: fan.y + Math.sin(angle) * fan.r * 0.5,
          z0: 34.4,
          z1: 35.2,
          hw: fan.r * 0.42,
          hh: 3.2,
          yaw: angle,
          color: MACHINE,
        });
      }
      props.cylinder({ x: fan.x, y: fan.y, z0: 34.4, z1: 36, r: fan.r * 0.2, color: MACHINE, sides: 10 });
    }
  }
  return props;
}

/** The towers: boxes from the streets up, the round tower in three tiers with its crown. */
export function cityBuildings({ towers, round }) {
  const props = createPropBuilder();
  towers.forEach((tower, i) => {
    props.box({
      x: tower.x,
      y: tower.y,
      z0: -STREET_PX,
      z1: tower.height,
      hw: tower.w / 2,
      hh: tower.d / 2,
      color: [0.17 + 0.03 * (i % 3), 0.26 + 0.03 * (i % 3), 0.4 + 0.04 * (i % 2), (i * 0.137) % 1],
    });
  });
  const tiers = [
    [-STREET_PX, round.height * 0.62, round.r],
    [round.height * 0.62, round.height * 0.86, round.r * 0.82],
    [round.height * 0.86, round.height, round.r * 0.6],
  ];
  for (const [z0, z1, r] of tiers) {
    props.cylinder({ x: round.x, y: round.y, z0, z1, r, color: [0.22, 0.23, 0.27, 1.25], sides: 40, capColor: [0.2, 0.21, 0.25, 1.25] });
  }
  return props;
}

/** The billboards: one quad each on its tower's face to the roof, uv across it, aBoard its design. */
export function billboardGeometry(three, { roof, towers }) {
  const positions = [];
  const uvs = [];
  const designs = [];
  const index = [];
  for (const tower of towers) {
    if (!tower.board) continue;
    const facesLeft = tower.x > roof.x;
    const faceX = tower.x + (facesLeft ? -1 : 1) * (tower.w / 2 + 1.5);
    const w = Math.min(tower.d * 0.7, 210);
    const h = w * 0.62;
    const top = Math.min(tower.height - 24, 150);
    const first = positions.length / 3;
    const ends = facesLeft ? [tower.y + w / 2, tower.y - w / 2] : [tower.y - w / 2, tower.y + w / 2];
    positions.push(faceX, ends[0], top - h, faceX, ends[1], top - h, faceX, ends[1], top, faceX, ends[0], top);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    designs.push(tower.board, tower.board, tower.board, tower.board);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new three.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aBoard', new three.Float32BufferAttribute(designs, 1));
  geometry.setIndex(index);
  return geometry;
}

/** The searchlights: one camera-facing strip each, aBeam (along 0..1, across -1..1), aSource (x, y, heading, phase). */
export function beamGeometry(three, beams) {
  const positions = [];
  const along = [];
  const sources = [];
  const index = [];
  const segments = 12;
  beams.forEach((beam) => {
    const first = positions.length / 3;
    for (let i = 0; i <= segments; i += 1) {
      for (const side of [-1, 1]) {
        positions.push(0, 0, 0);
        along.push(i / segments, side);
        sources.push(beam.x, beam.y, beam.heading, beam.phase);
      }
    }
    for (let i = 0; i < segments; i += 1) {
      const a = first + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBeam', new three.Float32BufferAttribute(along, 2));
  geometry.setAttribute('aSource', new three.Float32BufferAttribute(sources, 4));
  geometry.setIndex(index);
  return geometry;
}

const ROOF = /* glsl */ `
// The roof: centre x, y, half width, half height (citySpots); the hut: centre x, y, half width, half depth.
uniform vec4 uRoof;
uniform vec4 uHut;
const vec3 NEON_PINK = vec3(1.5, 0.16, 0.62);
const vec3 LAMP_WARM = vec3(1.3, 0.95, 0.55);
const vec3 NIGHT = vec3(0.03, 0.036, 0.07);
// Signed px from the roof's edge, negative on it.
float roofDistance(vec2 p) {
  vec2 q = abs(p - uRoof.xy) - uRoof.zw;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
`;

/** Bake: the roof at the cloth, the streets far below it. */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${ROOF}
void main() {
  vec2 p = uMin + vUv * uSize;
  float d = roofDistance(p);
  gl_FragColor = vec4(d < 0.0 ? 0.0 : -${STREET_PX}.0, d, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float h = texture2D(uField, uv).r;
  vPos = p;
  vUv = uv;
  vHeight = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h * terrainGrowth(p) * edgeSkirt(uv), 1.0);
}
`;

const WINDOWS = /* glsl */ `
// A facade's windows at px along it and px up it: x 1 in a pane, y how lit it is (0 dark, warm or a
// cold green-white), seeded per tower.
vec3 windowAt(float along, float up, float seed) {
  vec2 cell = floor(vec2(along / 22.0, up / 30.0));
  vec2 f = fract(vec2(along / 22.0, up / 30.0));
  float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
  float roll = hash12(cell + seed * 131.0);
  // Now and then someone switches a light on or off: one window in nine keeps its own slow clock.
  float restless = step(0.89, hash12(cell * 2.3 + seed));
  float hour = floor(uTime / 9.0 + hash12(cell * 5.1 + seed) * 9.0);
  roll = mix(roll, hash12(cell + seed * 131.0 + hour * 7.13), restless);
  return vec3(pane, step(roll, 0.3) * (0.6 + 0.6 * hash12(cell * 1.7 + seed)), step(0.7, hash12(cell * 3.1 + seed)));
}
vec3 facadeColor(vec3 wall, float along, float up, float seed) {
  vec3 w = windowAt(along, up, seed);
  vec3 lamp = mix(vec3(0.85, 1.12, 0.8), vec3(1.25, 0.98, 0.6), w.z);
  vec3 glass = mix(vec3(0.03, 0.04, 0.065), lamp, w.y);
  return mix(wall, glass, w.x);
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${ROOF}
${WINDOWS}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float d = field.g;
  vec3 col;
  if (vHeight > -${STREET_PX - 4}.0 && vHeight < -4.0) {
    // The roof building's own face where it drops to the street: windows, darker going down.
    vec2 rel = p - uRoof.xy;
    float along = abs(rel.x) / uRoof.z > abs(rel.y) / uRoof.w ? p.y : p.x;
    col = facadeColor(vec3(0.07, 0.075, 0.095), along, vHeight + ${STREET_PX}.0, 7.0);
    col *= mix(0.35, 1.0, smoothstep(-${STREET_PX}.0, 0.0, vHeight));
  } else if (d < 0.0) {
    // The roof, as in the art: smooth pale grey concrete under the moon in broad slabs with dark
    // seams, a soft stain here and there; the moonlight falls brighter toward the far side.
    vec2 slab = abs(mod(p + 90.0, 180.0) - 90.0);
    float slabTone = 0.94 + 0.12 * hash12(floor((p + 90.0) / 180.0));
    col = vec3(0.088, 0.1, 0.122) * (0.9 + 0.2 * fbm3(p / 90.0)) * slabTone;
    col *= 0.96 + 0.06 * gnoise(p / 4.0);
    col *= mix(0.85, 1.12, smoothstep(-1.0, 1.0, (p.y - uRoof.y) / uRoof.w));
    col = mix(col, vec3(0.04, 0.042, 0.05), (1.0 - smoothstep(0.8, 2.0, min(slab.x, slab.y))) * 0.65);
    col = mix(col, col * 0.78, smoothstep(0.74, 0.8, fbm3(p / 70.0 + 9.0)) * 0.7);
    col = mix(col * 0.5, col, smoothstep(0.3, 0.9, light.b));
    // Pink neon from the left tower washes the roof's left side; the hut lamp pools by its door.
    float neon = exp(-max(p.x - (uRoof.x - uRoof.z), 0.0) / 170.0) * smoothstep(-0.8, 0.4, (p.y - uRoof.y) / uRoof.w);
    col += NEON_PINK * neon * 0.1 * (0.92 + 0.08 * sin(uTime * 7.0) * step(0.7, fract(uTime * 0.13)));
    vec2 door = vec2(uHut.x - uHut.z - 30.0, uHut.y);
    col += LAMP_WARM * exp(-dot(p - door, p - door) / (2.0 * 70.0 * 70.0)) * 0.35;
  } else {
    // The streets far below: dark, a few street lamps and car lights in the haze.
    col = NIGHT * 0.8 + vec3(0.02, 0.015, 0.03) * fbm3(p / 50.0);
    vec2 lampCell = floor(p / 60.0);
    float lamp = step(0.86, hash12(lampCell)) * (1.0 - smoothstep(1.0, 3.0, length(p - (lampCell + 0.5) * 60.0)));
    col += LAMP_WARM * lamp * 0.6;
  }
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.3, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));
  col += NEON_PINK * revealGlow(p, 0.035);
  col += NEON_PINK * exitGlow(p);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The towers: concrete faces full of windows, dark roofs with a blinking red light, haze in the streets. */
export const BUILDING_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${ROOF}
${WINDOWS}
uniform vec4 uRound;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  float isRound = step(1.0, vColor.w);
  float seed = fract(vColor.w) * 10.0 + isRound * 3.0;
  vec3 col;
  if (n.z > 0.5) {
    // A roof: dark tar, its gravel mottled, the city's glow faint on it.
    col = vColor.rgb * 0.24 * (0.8 + 0.4 * gnoise(vWorld.xy / 14.0)) + vec3(0.006, 0.006, 0.014);
  } else {
    float along = isRound > 0.5
      ? atan(vWorld.y - uRound.y, vWorld.x - uRound.x) * uRound.z
      : (abs(n.x) > abs(n.y) ? vWorld.y : vWorld.x);
    vec3 wall = vColor.rgb * (0.3 + 0.32 * max(dot(n, normalize(vec3(-0.5, -0.5, 0.4))), 0.0));
    col = facadeColor(wall, along, vWorld.z + ${STREET_PX}.0, seed);
    // The round tower's crown: a lit band under its top.
    col = mix(col, vec3(1.2, 1.05, 0.8), isRound * step(uRound.w - 18.0, vWorld.z) * step(vWorld.z, uRound.w - 8.0));
  }
  // Down in the streets the night's haze swallows the towers' feet.
  col = mix(col, NIGHT, smoothstep(-40.0, -${STREET_PX}.0, vWorld.z) * 0.85);
  col += NEON_PINK * revealGlow(vWorld.xy, 0.035);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const BILLBOARD_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute float aBoard;
varying vec2 vBoardUv;
varying float vBoard;
varying vec2 vPos;
void main() {
  vBoardUv = uv;
  vBoard = aBoard;
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, position.z * terrainGrowth(position.xy), 1.0);
}
`;

/**
 * The billboards, lit from below: Team Skull's skull sprayed red over a white board of faded
 * checks (the art's right tower), and a pink X sprayed over a purple board (its left tower).
 */
export const BILLBOARD_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
varying vec2 vBoardUv;
varying float vBoard;
varying vec2 vPos;
// Distance to a sprayed stroke from a to b, its edge roughened.
float stroke(vec2 uv, vec2 a, vec2 b, float width) {
  vec2 ab = b - a;
  float t = clamp(dot(uv - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(uv - a - ab * t) - width * (0.85 + 0.3 * gnoise(uv * 40.0));
}
void main() {
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  vec2 uv = vBoardUv;
  vec2 q = (uv - 0.5) * vec2(1.6, 1.0);
  vec3 col;
  vec3 paint;
  float sprayed;
  if (vBoard < 1.5) {
    vec2 check = floor(uv * vec2(12.0, 7.0));
    col = mix(vec3(0.92, 0.92, 0.95), vec3(0.78, 0.8, 0.86), mod(check.x + check.y, 2.0));
    // The skull: a round head, a jaw, two X eyes, two crossed bones behind.
    float head = length((q - vec2(0.0, 0.08)) * vec2(1.0, 1.15)) - 0.26;
    float jaw = max(abs(q.x) - 0.15, abs(q.y + 0.2) - 0.07);
    float skull = min(head, jaw);
    float ring = abs(skull) - 0.025;
    float eyes = min(min(stroke(q, vec2(-0.16, 0.13), vec2(-0.05, 0.02), 0.022), stroke(q, vec2(-0.16, 0.02), vec2(-0.05, 0.13), 0.022)),
      min(stroke(q, vec2(0.05, 0.13), vec2(0.16, 0.02), 0.022), stroke(q, vec2(0.05, 0.02), vec2(0.16, 0.13), 0.022)));
    float bones = min(stroke(q, vec2(-0.62, -0.38), vec2(0.62, 0.38), 0.03), stroke(q, vec2(-0.62, 0.38), vec2(0.62, -0.38), 0.03));
    sprayed = 1.0 - smoothstep(-0.004, 0.006, min(min(ring, eyes), max(bones, -skull)));
    paint = vec3(0.85, 0.04, 0.05);
  } else {
    col = mix(vec3(0.42, 0.12, 0.62), vec3(0.85, 0.3, 0.75), uv.y);
    float x = min(stroke(q, vec2(-0.45, -0.38), vec2(0.45, 0.38), 0.06), stroke(q, vec2(-0.45, 0.38), vec2(0.45, -0.38), 0.06));
    float tag = stroke(q, vec2(-0.7, -0.42), vec2(-0.2, -0.3), 0.018);
    sprayed = 1.0 - smoothstep(-0.004, 0.006, min(x, tag));
    paint = vec3(1.0, 0.25, 0.55);
  }
  col = mix(col, paint, sprayed);
  // Lit from below by a spotlight, fading up the board.
  col *= mix(1.15, 0.75, uv.y);
  float frame = step(0.02, uv.x) * step(uv.x, 0.98) * step(0.03, uv.y) * step(uv.y, 0.97);
  col = mix(vec3(0.12, 0.12, 0.14), col, frame);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const BEAM_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
attribute vec2 aBeam;
attribute vec4 aSource;
varying vec2 vBeam;
void main() {
  // Each light sweeps slowly to and fro across the rooftop, tipped up so its shaft passes over it.
  float sweep = aSource.z + 0.42 * sin(uTime * 0.21 + aSource.w);
  float tip = 0.42 + 0.08 * sin(uTime * 0.17 + aSource.w * 1.7);
  vec3 axis = normalize(vec3(cos(sweep) * cos(tip), sin(sweep) * cos(tip), sin(tip)));
  vec3 source = vec3(aSource.xy, -${STREET_PX}.0 + 10.0);
  vec3 here = source + axis * aBeam.x * ${BEAM_LENGTH_PX}.0;
  vec4 view = modelViewMatrix * vec4(here, 1.0);
  vec2 tangent = (modelViewMatrix * vec4(axis, 0.0)).xy;
  vec2 across = length(tangent) > 0.0001 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(1.0, 0.0);
  view.xy += across * aBeam.y * mix(8.0, 70.0, aBeam.x);
  gl_Position = projectionMatrix * view;
  vBeam = aBeam;
}
`;

export const BEAM_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform float uExit;
varying vec2 vBeam;
void main() {
  float core = exp(-vBeam.y * vBeam.y * 4.0);
  float fade = smoothstep(0.0, 0.06, vBeam.x) * (1.0 - smoothstep(0.15, 0.95, vBeam.x));
  float shown = smoothstep(0.6, 1.0, uReveal) * (1.0 - uExit);
  // A bright core in a soft shaft, the art's pale blue-white.
  float shaft = exp(-vBeam.y * vBeam.y * 1.5) * 0.4 + core;
  gl_FragColor = vec4(vec3(0.62, 0.74, 1.0) * shaft * fade * 0.32 * shown, 1.0);
${OUTPUT}
}
`;

/** The props' light: the night's cold fill, the city glow from below, the hut lamp and the neon. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 col = albedo * (vec3(0.11, 0.125, 0.155) + vec3(0.18, 0.2, 0.25) * (0.5 + 0.5 * n.z));
  vec3 door = vec3(uHut.x - uHut.z - 26.0, uHut.y, 66.0);
  vec3 toLamp = door - world;
  col += albedo * LAMP_WARM * max(dot(n, normalize(toLamp)), 0.0) * exp(-length(toLamp) / 90.0) * 1.4;
  float neon = exp(-max(world.x - (uRoof.x - uRoof.z), 0.0) / 170.0);
  col += albedo * NEON_PINK * neon * 0.25 * max(-n.x * 0.5 + 0.5, 0.0);
  vec3 view = normalize(uEye - world);
  col += vec3(0.4, 0.45, 0.7) * pow(max(dot(reflect(-view, n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0) * metal * 0.3;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, uniforms: ROOF, reveal: 'NEON_PINK' });

const NO_SPOTS = { roof: null, hut: null, towers: [], round: null, beams: [], machines: [] };

/** Dark City's board (stadium-environment-mesh.js BOARDS). */
export function darkCityBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uRoof: { value: new three.Vector4() },
    uHut: { value: new three.Vector4() },
    uRound: { value: new three.Vector4() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    buildings: make(PROP_VERTEX, BUILDING_FRAGMENT, { side: three.DoubleSide }),
    billboards: make(BILLBOARD_VERTEX, BILLBOARD_FRAGMENT, { side: three.DoubleSide }),
    beams: make(BEAM_VERTEX, BEAM_FRAGMENT, {
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
  const buildings = new three.Mesh(new three.BufferGeometry(), materials.buildings);
  const billboards = new three.Mesh(new three.BufferGeometry(), materials.billboards);
  const beams = new three.Mesh(new three.BufferGeometry(), materials.beams);
  beams.renderOrder = 2;
  return {
    objects: [terrain, buildings, props, billboards, beams],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => citySpots(layout) ?? NO_SPOTS,
    apply(spots, bounds) {
      const { roof, hut, round } = spots;
      own.uRoof.value.set(roof?.x ?? 0, roof?.y ?? 0, roof?.hw ?? 0, roof?.hh ?? 0);
      own.uHut.value.set(hut?.x ?? 0, hut?.y ?? 0, (hut?.w ?? 0) / 2, (hut?.d ?? 0) / 2);
      own.uRound.value.set(round?.x ?? 0, round?.y ?? 0, round?.r ?? 0, round?.height ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      for (const mesh of [props, buildings, billboards, beams]) mesh.visible = Boolean(roof);
      if (!roof) return;
      replaceGeometry(props, cityProps(spots).build(three));
      replaceGeometry(buildings, cityBuildings(spots).build(three));
      replaceGeometry(billboards, billboardGeometry(three, spots));
      replaceGeometry(beams, beamGeometry(three, spots.beams));
    },
  };
}
