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
const STONE_SPACING_PX = 175;
/** Paving: bricks in straight staggered rows, as in the art; their length and height. */
const BRICK_PX = { long: 46, high: 23 };
/** Ropes: height on the stones (share of each stone's height), sag, thickness. */
const ROPE = { at: 0.45, sag: 30, radius: 4.2 };
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

const GREY_STONE = [0.5, 0.46, 0.4, 0.05];
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
    const radius = 26 + 18 * hashOf(i + 100);
    // Each stone's foot clears the kerb by at least STONE_FOOT_GAP_PX.
    const out = arena.r + KERB_PX + STONE_FOOT_GAP_PX + radius + 12 * hashOf(i + 50);
    const x = arena.x + Math.cos(angle) * out;
    const y = arena.y + Math.sin(angle) * out;
    const inside = x - radius > scene.x && x + radius < scene.x + scene.w && y - radius > scene.y && y + radius < scene.y + scene.h;
    // As in the art, no two alike: tall slabs and broad stumps, some flattened, some leaning.
    stones.push({
      x,
      y,
      radius,
      height: 110 + 130 * hashOf(i + 200),
      lean: (hashOf(i + 300) - 0.5) * 0.22,
      flat: 0.55 + 0.45 * hashOf(i + 500),
      yaw: hashOf(i + 600) * Math.PI,
      seed: hashOf(i + 400),
      index: i,
      inside,
    });
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

/**
 * One standing stone, a menhir as in the art: a rough ten-sided column, a little wider at its foot,
 * rounding over to a blunt top, its faces flat so they catch the light as broad planes.
 */
const standingStone = (props, stone) => {
  const sides = 10;
  const levels = [0, 0.3, 0.55, 0.72, 0.84, 0.93, 0.98, 1];
  const rings = levels.map((t, level) => {
    const dome = t < 0.72 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.72) / 0.28) ** 2));
    const taper = (1.08 - 0.22 * t) * Math.max(dome, level === levels.length - 1 ? 0.12 : 0);
    const lean = stone.lean * t * stone.height;
    return Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * 2 * Math.PI + stone.seed * 6;
      const wobble = 0.82 + 0.3 * hashOf(stone.index * 31 + k * 7) + 0.1 * hashOf(stone.index * 17 + k * 3 + level * 5);
      const r = stone.radius * taper * wobble;
      // A flattened section turned by the stone's yaw: slabs, not only columns.
      const u = Math.cos(angle) * r;
      const v = Math.sin(angle) * r * stone.flat;
      const c = Math.cos(stone.yaw);
      const sn = Math.sin(stone.yaw);
      return [stone.x + u * c - v * sn + lean, stone.y + u * sn + v * c, stone.height * t];
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
    // Wound round twice, the turns a rope's width apart.
    for (const wrap of [0, 1]) {
      const loop = [];
      const zWrap = z - wrap * ROPE.radius * 2.2;
      for (let k = 0; k <= 18; k += 1) {
        const angle = (k / 18) * 2 * Math.PI;
        const r = stone.radius * (1.08 - 0.22 * ROPE.at) * 1.08 + ROPE.radius;
        const u = Math.cos(angle) * r;
        const v = Math.sin(angle) * (r - ROPE.radius) * stone.flat + Math.sin(angle) * ROPE.radius;
        const c = Math.cos(stone.yaw);
        const sn = Math.sin(stone.yaw);
        loop.push([stone.x + u * c - v * sn + stone.lean * ROPE.at * stone.height, stone.y + u * sn + v * c, zWrap]);
      }
      props.tube(loop, ROPE.radius, ROPE_LIGHT, { sides: 6, colorAt: ropeColor });
    }
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
// The Poke Ball in the paving, as in the art: a broad disc of pale stone sunk in a dark groove,
// a dark band across it, the button a broad dark ring round a pale core. x: 1 on pale stone,
// 2 on dark stone, 0 off it; y px from its outline (negative inside).
vec2 emblemInlay(vec2 p) {
  if (uEmblem.z <= 0.0) return vec2(0.0, 100000.0);
  vec2 rel = p - uEmblem.xy;
  float r = length(rel);
  float outline = r - uEmblem.z;
  if (outline > 6.0) return vec2(0.0, outline);
  float buttonR = uEmblem.z * 0.3;
  bool groove = outline > -2.0;
  bool band = abs(rel.y) < uEmblem.z * 0.06 && r > buttonR;
  bool buttonRing = r > buttonR * 0.55 && r < buttonR;
  return vec2(groove || band || buttonRing ? 2.0 : 1.0, outline);
}
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
    // Bricks in straight rows, each row staggered half a brick, laid from the middle out.
    vec2 q = (p - uRing.xy) / vec2(${BRICK_PX.long}.0, ${BRICK_PX.high}.0);
    q.x += 0.5 * mod(floor(q.y), 2.0);
    vec2 cell = floor(q);
    vec2 edge = (0.5 - abs(fract(q) - 0.5)) * vec2(${BRICK_PX.long}.0, ${BRICK_PX.high}.0);
    float mortar = min(edge.x, edge.y);
    id = hash12(cell + 0.5);
    // Toward the edge the paving breaks up: bricks go missing into the dust.
    float missing = step(hash12(cell + 9.0), smoothstep(-70.0, 0.0, d + 26.0 * (gnoise(p / 60.0) - 0.5)) * 0.95);
    h = missing > 0.5
      ? -1.0 + 1.5 * fbm3(p / 30.0)
      : 1.8 * smoothstep(0.0, 2.6, mortar) + 0.5 * (gnoise(p / 9.0) - 0.5) - 0.5 * id;
    // The emblem's pale stone lies flush, smooth; its dark lines a little sunk.
    vec2 inlay = emblemInlay(p);
    if (inlay.x > 0.5) {
      h = inlay.x > 1.5 ? -0.6 : 0.6 + 0.3 * (gnoise(p / 12.0) - 0.5);
      missing = 0.0;
      id = 0.5;
    }
    kind = missing > 0.5 ? 1.0 : -1.0;
  } else {
    // The shelf the stones stand on: dusty rock, a few boulders; past its ragged lip a cliff drops
    // into the haze, where peaks rise from far below.
    float beyond = d;
    float lip = ${SHELF_PX + 14}.0 + 26.0 * (fbm3(p / 90.0) - 0.5) + 14.0 * (gnoise(p / 23.0) - 0.5);
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
const vec3 SKY = vec3(0.64, 0.58, 0.49);
const vec3 HAZE = vec3(0.42, 0.37, 0.3);
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
    // Paving: grey-beige stones each a shade apart, darker mortar; the emblem's pale stone and its
    // dark grooves.
    vec3 stone = mix(vec3(0.24, 0.205, 0.17), vec3(0.4, 0.35, 0.29), id);
    stone *= 0.88 + 0.24 * fbm3(p / 23.0);
    vec2 inlay = emblemInlay(p);
    if (inlay.x > 1.5) stone = vec3(0.11, 0.1, 0.09) * (0.85 + 0.3 * gnoise(p / 6.0));
    else if (inlay.x > 0.5) stone = vec3(0.44, 0.42, 0.38) * (0.9 + 0.2 * fbm3(p / 18.0));
    col = stone * (0.55 + 0.35 * facing + 0.25 * sky);
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
