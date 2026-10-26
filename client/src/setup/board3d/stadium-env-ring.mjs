// Design 077 (prototype): Mountain Ring (customhb-240) after its card art (FFI 97, xy3-97 in
// set.json; Ryo Ueda): a round arena high in the mountains, paved in curved rows of grey stone
// round the Poké Ball laid in lighter stone at its middle; standing stones ring it, thick ropes
// sagging between them, wound round each; a giant rusty chain lies by it; rough rocky ground with
// boulders climbs away to crags and snowy peaks, everything in the art's sepia under an overcast sky.
// The art looks across the ring from its edge; the board looks down into it, so the paving grows
// round every card on the table, the stones stand just outside it where the table is free of cards,
// and the mountains rise past them, toward the table's edges and beyond.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the arena's edge, B the
// stone's id (paving or boulder) 0..1, A the kind (-1 paving, 0 kerb, 1 ground); the shared light
// bake adds normals, occlusion and the sun's soft shadow. Per frame: TERRAIN paints stone, rock,
// snow and the emblem; PROPS are the standing stones, the ropes and the chain (stadium-env-props).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  POKE_BALL,
  REVEAL,
  STONES,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { craterEmblem, environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const RING_KEY = 'mountain-ring';
/** Free paving kept round every card footprint inside the arena's edge. */
export const ARENA_MARGIN_PX = 24;
/** The kerb round the paving, and how far past it the standing stones stand. */
export const KERB_PX = 14;
export const STONE_RING_GAP_PX = 30;
/** Least ground between the kerb and a standing stone's foot. */
const STONE_FOOT_GAP_PX = 8;
/** Spacing of the standing stones round the ring (px of arc). */
const STONE_SPACING_PX = 124;
/** Paving: radial width of a row, arc length of a stone. */
const ROW_PX = 32;
const STONE_PX = 48;
/** Ropes: height on the stones (share of each stone's height), sag, thickness. */
const ROPE = { at: 0.5, sag: 16, radius: 3.4 };
/** The chain: which stone it hangs from (turn round the ring, rad), how many links, link size. */
const CHAIN = { angle: Math.PI * 1.19, links: 15, length: 50, width: 28, thick: 6 };
/** The shelf the stones stand on, from the kerb to the cliff's lip, and the depths below it. */
export const SHELF_PX = 96;
export const DEPTHS_PX = 260;
/**
 * Peaks rising out of the haze below the ring: turn round it (deg), how far past the cliff's lip,
 * base radius, height of the summit over the depths.
 */
const PEAKS = [
  [176, 120, 150, 250],
  [204, 70, 110, 200],
  [150, 80, 120, 215],
  [8, 100, 140, 245],
  [338, 70, 105, 190],
  [34, 70, 115, 205],
  [96, 120, 150, 230],
  [66, 90, 110, 190],
];

const GREY_STONE = [0.43, 0.415, 0.385, 0.05];
const ROPE_LIGHT = [0.4, 0.27, 0.15, 0.05];
const ROPE_DARK = [0.27, 0.17, 0.09, 0.05];
const RUST = [0.44, 0.22, 0.1, 0.3];
const RUST_DARK = [0.3, 0.14, 0.07, 0.25];

const turnBetween = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/** A small deterministic 0..1 from a number. */
const hashOf = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Mountain Ring's layout: the arena (a circle round every card footprint, ARENA_MARGIN_PX clear),
 * the standing stones round it inside the scene, the chain's path and the emblem. Null without a
 * table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function ringSpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const centre = { x: table.x + table.w / 2, y: layout.depth };
  const { slabs, flats } = environmentFootprints(layout);
  const corners = [...slabs, ...flats].flatMap((r) => [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]);
  const reach = corners.length ? Math.max(...corners.map(([x, y]) => Math.hypot(x - centre.x, y - centre.y))) : table.h / 3;
  const arena = { x: centre.x, y: centre.y, r: reach + ARENA_MARGIN_PX };
  const ringR = arena.r + KERB_PX + STONE_RING_GAP_PX;
  const scene = sceneBounds(layout, RING_KEY);
  const count = Math.max(8, Math.round((2 * Math.PI * ringR) / STONE_SPACING_PX));
  const stones = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((i + (hashOf(i) - 0.5) * 0.3) / count) * 2 * Math.PI;
    const radius = 17 + 12 * hashOf(i + 100);
    // Each stone's foot clears the kerb by at least STONE_FOOT_GAP_PX.
    const out = arena.r + KERB_PX + STONE_FOOT_GAP_PX + radius + 12 * hashOf(i + 50);
    const x = arena.x + Math.cos(angle) * out;
    const y = arena.y + Math.sin(angle) * out;
    const inside = x - radius > scene.x && x + radius < scene.x + scene.w && y - radius > scene.y && y + radius < scene.y + scene.h;
    stones.push({ x, y, radius, height: 78 + 74 * hashOf(i + 200), lean: (hashOf(i + 300) - 0.5) * 0.25, seed: hashOf(i + 400), index: i, inside });
  }
  // The chain hangs off the stone nearest its turn and lies on out across the ground.
  const turnOf = (stone) => turnBetween(Math.atan2(stone.y - arena.y, stone.x - arena.x), CHAIN.angle);
  const anchor = stones.reduce((best, stone) => (turnOf(stone) < turnOf(best) ? stone : best));
  const lip = arena.r + KERB_PX + SHELF_PX;
  const peaks = PEAKS.map(([deg, gap, r, height]) => {
    const angle = (deg * Math.PI) / 180;
    const out = lip + gap + r * 0.6;
    return { x: arena.x + Math.cos(angle) * out, y: arena.y + Math.sin(angle) * out, r, height };
  });
  const emblem = craterEmblem(layout, centre);
  return { arena, ringR, stones: stones.filter((stone) => stone.inside), allStones: stones.length, anchor, peaks, emblem };
}

/** One standing stone: an irregular seven-sided prism tapering to a ragged top, faces flat. */
const standingStone = (props, stone) => {
  const sides = 7;
  const levels = [0, 0.35, 0.7, 0.92, 1];
  const rings = levels.map((t, level) => {
    const taper = level === levels.length - 1 ? 0.18 : 1 - 0.45 * t * t;
    const lean = stone.lean * t * stone.height;
    return Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * 2 * Math.PI + stone.seed * 6;
      const wobble = 0.75 + 0.5 * hashOf(stone.index * 31 + k * 7 + level * 3);
      const r = stone.radius * taper * wobble;
      return [stone.x + Math.cos(angle) * r + lean, stone.y + Math.sin(angle) * r, stone.height * t * (0.94 + 0.12 * hashOf(k + level * 9 + stone.index))];
    });
  });
  const tone = 0.85 + 0.3 * stone.seed;
  const color = [GREY_STONE[0] * tone, GREY_STONE[1] * tone, GREY_STONE[2] * tone, GREY_STONE[3]];
  for (let level = 0; level < rings.length - 1; level += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = rings[level][k];
      const b = rings[level][(k + 1) % sides];
      props.quad(a, b, rings[level + 1][(k + 1) % sides], rings[level + 1][k], color);
    }
  }
  const top = rings[rings.length - 1];
  const apex = top.reduce((sum, p) => [sum[0] + p[0] / sides, sum[1] + p[1] / sides, Math.max(sum[2], p[2])], [0, 0, 0]);
  for (let k = 0; k < sides; k += 1) props.quad(top[k], top[(k + 1) % sides], apex, apex, color);
};

/** One chain link: an oval loop of tube round its centre, along `axis`, its loop opening toward `up`. */
const chainLink = (props, centre, axis, up, { length, width, thick }, color) => {
  const points = [];
  const segments = 14;
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * 2 * Math.PI;
    const along = (Math.cos(t) * length) / 2;
    const across = (Math.sin(t) * width) / 2;
    points.push([0, 1, 2].map((k) => centre[k] + axis[k] * along + up[k] * across));
  }
  props.tube(points, thick, color, { sides: 7 });
};

/** The standing stones, the ropes between them, and the chain. */
export function ringProps({ stones, allStones, anchor }) {
  const props = createPropBuilder();
  for (const stone of stones) standingStone(props, stone);
  // Ropes: wound round each stone, sagging to the next where both stand in the scene.
  const ropeColor = (i) => (i % 2 ? ROPE_DARK : ROPE_LIGHT);
  const byIndex = new Map(stones.map((stone) => [stone.index, stone]));
  for (const stone of stones) {
    const z = stone.height * ROPE.at;
    const loop = [];
    for (let k = 0; k <= 16; k += 1) {
      const angle = (k / 16) * 2 * Math.PI;
      const r = stone.radius * (1 - 0.45 * ROPE.at * ROPE.at) * 0.98 + ROPE.radius;
      loop.push([stone.x + Math.cos(angle) * r + stone.lean * ROPE.at * stone.height, stone.y + Math.sin(angle) * r, z]);
    }
    props.tube(loop, ROPE.radius, ROPE_LIGHT, { sides: 6, colorAt: ropeColor });
    const next = byIndex.get((stone.index + 1) % allStones);
    if (!next) continue;
    const z2 = next.height * ROPE.at;
    const span = [];
    for (let k = 0; k <= 14; k += 1) {
      const t = k / 14;
      span.push([
        stone.x + (next.x - stone.x) * t + stone.lean * ROPE.at * stone.height * (1 - t),
        stone.y + (next.y - stone.y) * t,
        z + (z2 - z) * t - ROPE.sag * 4 * t * (1 - t),
      ]);
    }
    props.tube(span, ROPE.radius, ROPE_LIGHT, { sides: 6, colorAt: ropeColor });
  }
  // The chain: from the anchor stone's top it drops to the ground and lies on outward.
  if (anchor && stones.includes(anchor)) {
    const out = [Math.cos(CHAIN.angle), Math.sin(CHAIN.angle)];
    const side = [-out[1], out[0]];
    let previous = null;
    for (let i = 0; i < CHAIN.links; i += 1) {
      const s = i * (CHAIN.length - CHAIN.width * 0.45);
      const drop = Math.max(0, anchor.height * 0.8 - s * 1.1);
      const lying = Math.max(0, s - anchor.height * 0.8 / 1.1);
      const centre = [
        anchor.x + out[0] * (anchor.radius + 8 + lying * 0.9) + side[0] * Math.sin(lying / 70) * 30,
        anchor.y + out[1] * (anchor.radius + 8 + lying * 0.9) + side[1] * Math.sin(lying / 70) * 30,
        drop + CHAIN.width / 2,
      ];
      const axis = previous
        ? (() => {
            const d = [centre[0] - previous[0], centre[1] - previous[1], centre[2] - previous[2]];
            const length = Math.hypot(...d) || 1;
            return d.map((v) => v / length);
          })()
        : [out[0], out[1], -0.5];
      const flat = [-axis[1], axis[0], 0];
      const flatLength = Math.hypot(...flat) || 1;
      const across = flat.map((v) => v / flatLength);
      const up = [axis[1] * across[2] - axis[2] * across[1], axis[2] * across[0] - axis[0] * across[2], axis[0] * across[1] - axis[1] * across[0]];
      chainLink(props, centre, axis, i % 2 ? up : across, CHAIN, i % 3 ? RUST : RUST_DARK);
      previous = centre;
    }
  }
  return props;
}

const RING = /* glsl */ `
// The arena: centre x, y, its paving's radius, the standing stones' ring radius (ringSpots); the
// peaks below it (x, y, base radius, summit height over the depths; radius 0 none).
uniform vec4 uRing;
uniform vec3 uEmblem;
uniform vec4 uPeaks[${PEAKS.length}];
`;

/**
 * Bake: the paving in curved rows round the middle, each stone a little domed between mortar
 * grooves, the emblem laid proud in lighter stone; a kerb of big blocks round it; then rough ground
 * strewn with boulders, climbing to crags past the standing stones.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${STONES}
${POKE_BALL}
${RING}
float ridged(vec2 q) {
  return 1.0 - abs(2.0 * gnoise(q) - 1.0);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 rel = p - uRing.xy;
  float r = length(rel);
  float d = r - uRing.z;
  float h;
  float id;
  float kind;
  if (d < 0.0) {
    // Rows of paving round the middle, each stone offset half a stone from the row inside it.
    float row = floor(r / ${ROW_PX}.0);
    float rowR = (row + 0.5) * ${ROW_PX}.0;
    float count = max(6.0, floor(6.2831853 * rowR / ${STONE_PX}.0));
    float turn = (atan(rel.y, rel.x) / 6.2831853 + 0.5) * count + 0.5 * mod(row, 2.0);
    float stone = floor(turn);
    float acrossRow = (0.5 - abs(fract(r / ${ROW_PX}.0) - 0.5)) * ${ROW_PX}.0;
    float alongRow = (0.5 - abs(fract(turn) - 0.5)) * 6.2831853 * r / count;
    float mortar = min(acrossRow, alongRow);
    id = hash12(vec2(row, mod(stone, count)));
    h = 1.6 * smoothstep(0.0, 3.0, mortar) + 0.5 * (gnoise(p / 9.0) - 0.5) - 0.4 * id;
    // The emblem stands a hair proud in its lighter stone.
    h += 0.8 * (1.0 - smoothstep(2.5, 4.5, emblemDistance(p, uEmblem)));
    kind = -1.0;
  } else if (d < ${KERB_PX}.0) {
    float block = floor(atan(rel.y, rel.x) / 6.2831853 * floor(6.2831853 * uRing.z / 60.0));
    id = hash12(vec2(block, 7.0));
    h = 4.0 + 2.0 * id + 1.5 * sin(3.14159 * d / ${KERB_PX}.0);
    kind = 0.0;
  } else {
    // The shelf the stones stand on: dusty rock, a few boulders; past its ragged lip a cliff drops
    // into the haze, where peaks rise from far below.
    float beyond = d - ${KERB_PX}.0;
    float lip = ${SHELF_PX}.0 + 26.0 * (fbm3(p / 90.0) - 0.5) + 14.0 * (gnoise(p / 23.0) - 0.5);
    float shelf = 2.0 + 6.0 * fbm3(p / 70.0) + 2.0 * (gnoise(p / 9.0) - 0.5);
    float fall = smoothstep(lip - 6.0, lip + 34.0, beyond);
    h = mix(shelf, -${DEPTHS_PX}.0 + 30.0 * fbm3(p / 140.0), pow(fall, 0.7));
    vec3 boulder = stones(p + 17.0, 46.0, 3.0);
    float scatter = step(0.72, fract(boulder.y * 13.1)) * smoothstep(10.0, 30.0, beyond) * (1.0 - fall);
    h += boulder.x * 16.0 * scatter;
    id = boulder.y;
    // Peaks out of the depths: five-faced crags, each face one broad plane.
    for (int i = 0; i < ${PEAKS.length}; i++) {
      vec4 peak = uPeaks[i];
      if (peak.z <= 0.0) continue;
      vec2 q = p - peak.xy;
      float reach = 0.0;
      for (int k = 0; k < 5; k++) {
        float angle = float(i) * 2.1 + float(k) * 1.2566;
        reach = max(reach, dot(q, vec2(cos(angle), sin(angle))) / (0.85 + 0.25 * hash12(vec2(float(k), float(i)))));
      }
      float t = clamp(1.0 - max(reach, length(q) * 0.82) / peak.z, 0.0, 1.0);
      float summit = -${DEPTHS_PX}.0 + peak.w * pow(t, 1.1);
      if (summit > h) { h = summit; id = hash12(vec2(float(i), 3.0)); }
    }
    kind = 1.0;
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * growth * edgeSkirt(uv), 1.0);
}
`;

const OVERCAST = /* glsl */ `
// The art's light: an overcast sky, soft and from everywhere above, a pale sun from the far left.
const vec3 SKY = vec3(0.62, 0.58, 0.52);
const vec3 HAZE = vec3(0.4, 0.37, 0.32);
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${POKE_BALL}
${RING}
${OVERCAST}
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
  float facing = dot(n, normalize(uSun)) * mix(0.6, 1.0, light.a);
  float sky = 0.55 + 0.45 * n.z;
  vec3 col;
  if (kind < -0.5) {
    // Paving: grey-beige stones each a shade apart, darker mortar; the emblem in paler stone.
    vec3 stone = mix(vec3(0.23, 0.21, 0.185), vec3(0.38, 0.35, 0.31), id);
    stone *= 0.88 + 0.24 * fbm3(p / 23.0);
    float e = emblemDistance(p, uEmblem);
    float inlay = 1.0 - smoothstep(2.5, 4.0, e);
    stone = mix(stone, vec3(0.42, 0.41, 0.38), inlay);
    stone = mix(stone, vec3(0.12, 0.115, 0.11), (1.0 - smoothstep(0.5, 1.5, abs(e - 3.8))) * 0.7);
    col = stone * (0.55 + 0.35 * facing + 0.25 * sky);
  } else if (kind < 0.5) {
    col = mix(vec3(0.26, 0.25, 0.23), vec3(0.36, 0.35, 0.32), id) * (0.55 + 0.4 * facing + 0.2 * sky);
  } else {
    // Rock and dust, faces to the light pale; snow on the peaks' heads.
    vec3 rock = mix(vec3(0.17, 0.16, 0.145), vec3(0.37, 0.35, 0.32), smoothstep(0.35, 0.85, facing));
    rock *= 0.88 + 0.24 * id;
    vec3 dust = vec3(0.3, 0.27, 0.23) * (0.9 + 0.2 * fbm3(p / 40.0));
    rock = mix(dust, rock, smoothstep(0.92, 0.75, n.z));
    // The cliff's lip: bare dark rock where the shelf breaks off.
    rock *= mix(1.0, 0.62, smoothstep(-4.0, -40.0, ground) * (1.0 - smoothstep(-90.0, -150.0, ground)));
    float snow = smoothstep(-${DEPTHS_PX - 150}.0, -${DEPTHS_PX - 175}.0, ground + (gnoise(p / 30.0) - 0.5) * 40.0) * step(ground, -10.0) * smoothstep(0.3, 0.6, n.z);
    rock = mix(rock, mix(vec3(0.52, 0.51, 0.5), vec3(0.78, 0.77, 0.74), smoothstep(0.4, 0.8, facing)), snow);
    col = rock * (0.75 + 0.3 * sky);
  }
  col = mix(col * 0.55, col, smoothstep(0.3, 0.9, light.b));
  // The haze filling the depths, in the art's sepia, thicker the deeper.
  col = mix(col, HAZE, smoothstep(-10.0, -${DEPTHS_PX}.0, ground) * 0.7);
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));
  vec3 dust = vec3(0.75, 0.68, 0.55);
  float front = revealFront();
  col += dust * smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999) * 0.6;
  float gone = uExit * 1.1;
  col += dust * (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** The props' light: the overcast sky from above, a pale sun from the far left, rust's dull sheen. */
const PROP_LIGHT = /* glsl */ `
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 col = albedo * (SKY * (0.42 + 0.3 * n.z) + vec3(0.55, 0.52, 0.47) * max(dot(n, sun), 0.0));
  vec3 view = normalize(uEye - world);
  col += vec3(0.5, 0.45, 0.38) * pow(max(dot(reflect(-sun, n), view), 0.0), 12.0) * metal * 0.4;
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, uniforms: OVERCAST, reveal: 'vec3(0.45, 0.4, 0.33)' });

const NO_SPOTS = { arena: null, ringR: 0, stones: [], anchor: null, peaks: [], emblem: null };

/** Mountain Ring's board (stadium-environment-mesh.js BOARDS): the ground and the props. */
export function mountainRingBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uRing: { value: new three.Vector4() },
    uEmblem: { value: new three.Vector3() },
    uPeaks: { value: Array.from({ length: PEAKS.length }, () => new three.Vector4()) },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment({ aoFollowsSlope: true }), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const props = new three.Mesh(new three.BufferGeometry(), materials.props);
  return {
    objects: [terrain, props],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => ringSpots(layout) ?? NO_SPOTS,
    apply(spots, bounds) {
      const { arena, ringR, emblem, peaks = [] } = spots;
      own.uRing.value.set(arena?.x ?? 0, arena?.y ?? 0, arena?.r ?? 0, ringR ?? 0);
      own.uPeaks.value.forEach((slot, i) => {
        const peak = peaks[i];
        if (peak) slot.set(peak.x, peak.y, peak.r, peak.height);
        else slot.set(0, 0, 0, 0);
      });
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(arena);
      if (arena) replaceGeometry(props, ringProps(spots).build(three));
    },
  };
}
