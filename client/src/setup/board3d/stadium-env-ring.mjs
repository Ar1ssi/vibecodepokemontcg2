// Design 077 (prototype): Mountain Ring (customhb-240) after its card art (FFI 97, xy3-97 in
// set.json; Ryo Ueda): a round arena high in the mountains, paved in rows of grey-brown bricks
// round the Poké Ball laid in pale stone at its middle; pale standing stones ring it, thick ropes
// sagging between them, wound round each; a giant chain lies by it; rough rocky ground with boulders
// runs on past them, tall dark rock spires standing on it, everything in the art's sepia under an
// overcast sky. The art looks across the ring from its edge; the board looks down into it, so the
// paving grows round every card on the table, the stones stand just outside it where the table is
// free of cards, and the spires rise past them on the sides and the far side, in the haze.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the arena's edge, B the
// stone's id (brick or boulder) 0..1, A the kind (-1 paving, 1 ground); the shared light
// bake adds normals, occlusion and the sun's soft shadow. Per frame: TERRAIN paints stone, rock,
// dust, the emblem and the haze; PROPS are the standing stones, the spires, the ropes and the chain
// (stadium-env-props).
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
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
const STONE_SPACING_PX = 210;
/**
 * Paving: bricks in straight staggered rows right up to the emblem, as the art's; their length (each
 * row's own, up to `vary` px either side) and height.
 */
const BRICK_PX = { long: 46, vary: 14, high: 23, corner: 6 };
/**
 * The two rope strands, as the art's: height on the stones (share of each stone's height), sag, the
 * coils' thickness and how many wind round each stone in a band, the strand's thickness between.
 */
const ROPES = [
  { at: 0.5, sag: 30, radius: 3.6, wraps: 4, strand: 3.0 },
  { at: 0.28, sag: 22, radius: 3.2, wraps: 2, strand: 2.7 },
];
/**
 * The chain, as the art's foreground: massive rusty links hanging from a stone on the left side (its
 * turn round the ring, rad) and lying on along the paving's edge toward the far end, `inset` px in
 * from it, where both camera presets see them; at most `links`, each `length` by `width` px, its
 * metal `thick`. Links stop where the next would come within `clear` px of a card.
 */
export const CHAIN = { angle: Math.PI * 1.14, links: 12, length: 92, width: 50, thick: 10, inset: 34, clear: 10 };
/**
 * The art's rock spires standing on the ground past the stones: turn round the ring (deg), gap past
 * the stones' ring, base radius, height, how flattened. A spire with no room in the scene, or
 * crowding a stone or another spire, is left out.
 */
const SPIRES = [
  [100, 20, 70, 360, 0.75],
  [78, 40, 58, 320, 0.8],
  [120, 45, 54, 290, 0.85],
  [150, 20, 58, 300, 0.8],
  [180, 40, 66, 340, 0.7],
  [207, 20, 52, 260, 0.9],
  [125, 10, 48, 240, 0.75],
  [30, 30, 62, 320, 0.75],
  [0, 40, 64, 300, 0.85],
  [333, 20, 52, 270, 0.8],
  [57, 10, 48, 230, 0.7],
];
/** The spires' dark rock, as the art's crags (83,73,62), darker than the menhirs. */
const SPIRE_STONE = [0.24, 0.21, 0.18, 0.05];

/** The art's pale grey-tan stone, (118,110,101) in shade to (145,138,125) lit. */
const GREY_STONE = [0.68, 0.65, 0.6, 0.05];
// The art's ropes: dark brown, the strands (87,76,68), the wraps (55,44,37) to (84,72,62).
const ROPE_LIGHT = [0.26, 0.19, 0.14, 0.05];
const ROPE_DARK = [0.17, 0.12, 0.085, 0.05];
// The art's rusty chain, (110,84,67), (58,42,38) in its shade.
const RUST = [0.44, 0.31, 0.23, 0.4];
const RUST_DARK = [0.32, 0.22, 0.16, 0.35];

const turnBetween = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/** A small deterministic 0..1 from a number. */
const hashOf = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** px from (x, y) to the rect (0 inside it). */
const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

/**
 * The chain's links, [x, y, z] centres in order: from the anchor stone's inner face, half way up it,
 * down to the paving and on along its edge (CHAIN.inset in from it) toward the far end, while each
 * link stays CHAIN.clear px clear of every card and inside the scene.
 */
function chainLinks(arena, anchor, rects, scene) {
  const step = CHAIN.length - CHAIN.width * 0.45;
  const start = Math.atan2(anchor.y - arena.y, anchor.x - arena.x);
  const bed = arena.r - CHAIN.inset;
  const startR = Math.hypot(anchor.x - arena.x, anchor.y - arena.y) - anchor.radius * 0.8;
  const drop = anchor.height * 0.55;
  const links = [];
  for (let i = 0; i < CHAIN.links; i += 1) {
    const s = i * step;
    // Hanging: the first links come in and down off the stone; then the chain lies on the paving.
    const hang = Math.min(1, s / (drop + startR - bed));
    const radius = startR + (bed - startR) * Math.min(1, hang * 1.4);
    const turn = start - Math.max(0, s - drop * 0.6) / bed;
    const x = arena.x + Math.cos(turn) * radius;
    const y = arena.y + Math.sin(turn) * radius;
    const z = drop * (1 - hang) ** 1.6 + CHAIN.width / 2;
    const clear = rects.every((r) => distanceToRect(x, y, r) > CHAIN.length / 2 + CHAIN.clear);
    const inside = x > scene.x && x < scene.x + scene.w && y > scene.y && y < scene.y + scene.h;
    if (!clear || !inside) break;
    links.push([x, y, z]);
  }
  return links;
}

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
  const count = Math.max(7, Math.round((2 * Math.PI * ringR) / STONE_SPACING_PX));
  const stones = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((i + (hashOf(i) - 0.5) * 0.3) / count) * 2 * Math.PI;
    // Squat stones in the side bands (tall ones there lean out of the tilted view like missiles), tall
    // ones off the ends.
    const sideways = Math.abs(Math.cos(angle));
    const squat = sideways > 0.6;
    const radius = squat ? 34 + 14 * hashOf(i + 100) : 26 + 14 * hashOf(i + 100);
    // Each stone's foot clears the kerb by at least STONE_FOOT_GAP_PX.
    const out = arena.r + KERB_PX + STONE_FOOT_GAP_PX + radius + 12 * hashOf(i + 50);
    const x = arena.x + Math.cos(angle) * out;
    const y = arena.y + Math.sin(angle) * out;
    const inside = x - radius > scene.x && x + radius < scene.x + scene.w && y - radius > scene.y && y + radius < scene.y + scene.h;
    // As in the art, no two alike: rough columns of every height, a little flattened, some leaning;
    // each turned about along the ring, so its broader face looks across the arena.
    stones.push({
      x,
      y,
      radius,
      height: squat ? 72 + 40 * hashOf(i + 200) : 140 + 100 * hashOf(i + 200),
      lean: (hashOf(i + 300) - 0.5) * 0.14,
      flat: 0.55 + 0.22 * hashOf(i + 500),
      yaw: angle + Math.PI / 2 + (hashOf(i + 600) - 0.5) * 0.9,
      seed: hashOf(i + 400),
      index: i,
      inside,
    });
  }
  // The chain hangs off the stone nearest its turn and lies on along the paving's edge.
  const turnOf = (stone) => turnBetween(Math.atan2(stone.y - arena.y, stone.x - arena.x), CHAIN.angle);
  const anchor = stones.reduce((best, stone) => (turnOf(stone) < turnOf(best) ? stone : best));
  const rects = [...slabs, ...flats];
  const chain = anchor.inside ? chainLinks(arena, anchor, rects, scene) : [];
  const spires = [];
  SPIRES.forEach(([deg, gap, radius, height, flat], i) => {
    const angle = (deg * Math.PI) / 180;
    const out = ringR + 60 + gap + radius;
    const x = arena.x + Math.cos(angle) * out;
    const y = arena.y + Math.sin(angle) * out;
    const fits =
      x - radius > scene.x && x + radius < scene.x + scene.w && y - radius > scene.y && y + radius < scene.y + scene.h;
    const clear =
      stones.every((stone) => Math.hypot(x - stone.x, y - stone.y) > stone.radius + radius + 12) &&
      spires.every((other) => Math.hypot(x - other.x, y - other.y) > other.radius + radius + 12);
    if (!fits || !clear) return;
    spires.push({
      x,
      y,
      radius,
      height,
      flat,
      yaw: hashOf(i + 800) * Math.PI,
      seed: hashOf(i + 900),
      index: 1000 + i,
    });
  });
  const emblem = craterEmblem(layout, centre);
  return { arena, ringR, stones: stones.filter((stone) => stone.inside), allStones: stones.length, anchor, chain, spires, emblem };
}

/**
 * A standing stone's girth at `t` of its height, as a share of its radius: the art's menhirs keep
 * their girth to half way, then taper into a blunt rounded top (the squat ones round over sooner).
 */
export const stoneGirth = (t, stone) => {
  const shoulder = stone.height < 125 ? 0.6 : 0.5;
  if (t <= shoulder) return 1.06 - 0.12 * t;
  const base = 1.06 - 0.12 * shoulder;
  const cap = Math.min(1, (t - shoulder) / (1 - shoulder));
  return base * Math.max(0, 1 - cap ** 2.2) ** (1 / 2.2);
};

/**
 * One standing stone, a menhir as in the art: a rough twelve-sided column, a little flattened and
 * wider at its foot, tapering to a blunt rounded top (on the taller ones set a little to one side);
 * chiselled faces, no two alike.
 */
const standingStone = (props, stone) => {
  const sides = 12;
  const levels = [0, 0.25, 0.5, 0.62, 0.72, 0.8, 0.87, 0.93, 0.97, 1];
  const side = hashOf(stone.index * 7 + 2) < 0.5 ? -1 : 1;
  const tipShift = stone.height < 125 ? 0 : side * stone.radius * 0.35 * hashOf(stone.index * 7 + 3);
  const rings = levels.map((t, level) => {
    const taper = Math.max(stoneGirth(t, stone), level === levels.length - 1 ? 0.04 : 0.1);
    const lean = stone.lean * t * stone.height;
    const drift = tipShift * Math.max(0, (t - 0.5) / 0.5) ** 2;
    return Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * 2 * Math.PI + stone.seed * 6;
      // Chiselled: each face column its own depth, nicked a little from level to level.
      const wobble = 0.9 + 0.16 * hashOf(stone.index * 31 + k * 7) + 0.05 * hashOf(stone.index * 17 + k * 3 + level * 5);
      const r = stone.radius * taper * wobble;
      // A flattened section turned by the stone's yaw.
      const u = Math.cos(angle) * r + drift;
      const v = Math.sin(angle) * r * stone.flat;
      const c = Math.cos(stone.yaw);
      const sn = Math.sin(stone.yaw);
      return [stone.x + u * c - v * sn + lean, stone.y + u * sn + v * c, stone.height * t];
    });
  });
  const tone = 0.88 + 0.2 * stone.seed;
  // Dark streaks run down some of its faces, as weathering down the art's stones.
  const colorOf = (k) => {
    const streak = hashOf(stone.index * 19 + k * 5) < 0.3 ? 0.74 : 1.0;
    return [GREY_STONE[0] * tone * streak, GREY_STONE[1] * tone * streak, GREY_STONE[2] * tone * streak, GREY_STONE[3]];
  };
  const color = colorOf(-1);
  for (let level = 0; level < rings.length - 1; level += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = rings[level][k];
      const b = rings[level][(k + 1) % sides];
      props.quad(a, b, rings[level + 1][(k + 1) % sides], rings[level + 1][k], colorOf(k));
    }
  }
  const top = rings[rings.length - 1];
  const apex = top.reduce((sum, p) => [sum[0] + p[0] / sides, sum[1] + p[1] / sides, Math.max(sum[2], p[2])], [0, 0, 0]);
  for (let k = 0; k < sides; k += 1) props.quad(top[k], top[(k + 1) % sides], apex, apex, color);
};

/**
 * One rock spire, as the art's dark crags: a tower of ten-sided blocks stacked a little off-centre,
 * narrowing as it climbs, its top broken off at a slant. Faces flat, so they take the light as broad
 * planes; the blocks only gently uneven (rougher ones read as crumpled paper from above).
 */
const rockSpire = (props, spire) => {
  const sides = 10;
  const levels = 7;
  const c = Math.cos(spire.yaw);
  const sn = Math.sin(spire.yaw);
  let drift = [0, 0];
  const rings = [];
  for (let level = 0; level <= levels; level += 1) {
    const t = level / levels;
    const roll = (k) => hashOf(spire.index * 53 + level * 11 + k);
    // Each block sits a little off the one below: the tower kinks as it climbs.
    if (level > 0) drift = [drift[0] + (roll(1) - 0.5) * spire.radius * 0.12, drift[1] + (roll(2) - 0.5) * spire.radius * 0.12];
    const girth = spire.radius * (1.0 - 0.7 * t ** 1.1) * (0.92 + 0.14 * roll(3));
    // The top breaks off at a slant.
    const slant = level === levels ? (roll(4) - 0.5) * spire.radius * 0.9 : 0;
    rings.push(
      Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * 2 * Math.PI + spire.seed * 6;
        const r = girth * (0.9 + 0.18 * hashOf(spire.index * 31 + k * 7 + level * 3));
        const u = Math.cos(angle) * r;
        const v = Math.sin(angle) * r * spire.flat;
        const x = u * c - v * sn + drift[0];
        const y = u * sn + v * c + drift[1];
        return [spire.x + x, spire.y + y, spire.height * t + (slant * x) / Math.max(spire.radius, 1)];
      })
    );
  }
  const tone = 0.82 + 0.3 * spire.seed;
  const color = [SPIRE_STONE[0] * tone, SPIRE_STONE[1] * tone, SPIRE_STONE[2] * tone, SPIRE_STONE[3]];
  for (let level = 0; level < levels; level += 1) {
    for (let k = 0; k < sides; k += 1) {
      props.quad(rings[level][k], rings[level][(k + 1) % sides], rings[level + 1][(k + 1) % sides], rings[level + 1][k], color);
    }
  }
  const top = rings[levels];
  const middle = top.reduce((sum, point) => [sum[0] + point[0] / sides, sum[1] + point[1] / sides, sum[2] + point[2] / sides], [0, 0, 0]);
  for (let k = 0; k < sides; k += 1) props.quad(top[k], top[(k + 1) % sides], middle, middle, color);
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

/** The standing stones, the spires, the ropes between them, and the chain. */
export function ringProps({ stones, allStones, chain = [], spires = [] }) {
  const props = createPropBuilder();
  for (const stone of stones) standingStone(props, stone);
  for (const spire of spires) rockSpire(props, spire);
  // Ropes, as in the art: two strands, each wound round every stone in a band of turns and sagging
  // to the next stone where both stand in the scene.
  const ropeColor = (i) => (i % 2 ? ROPE_DARK : ROPE_LIGHT);
  const byIndex = new Map(stones.map((stone) => [stone.index, stone]));
  /** A point of the stone's surface, `share` of its height up, pushed out by `out` px at `angle`. */
  const onStone = (stone, share, angle, out) => {
    const r = stone.radius * stoneGirth(share, stone) * 1.1 + out;
    const u = Math.cos(angle) * r;
    const v = Math.sin(angle) * ((r - out) * stone.flat + out);
    const c = Math.cos(stone.yaw);
    const sn = Math.sin(stone.yaw);
    return [stone.x + u * c - v * sn + stone.lean * share * stone.height, stone.y + u * sn + v * c];
  };
  for (const stone of stones) {
    const next = byIndex.get((stone.index + 1) % allStones);
    for (const rope of ROPES) {
      for (let wrap = 0; wrap < rope.wraps; wrap += 1) {
        const z = stone.height * rope.at - wrap * rope.radius * 1.9;
        const loop = [];
        for (let k = 0; k <= 18; k += 1) {
          const angle = (k / 18) * 2 * Math.PI;
          loop.push([...onStone(stone, rope.at, angle, rope.radius), z]);
        }
        props.tube(loop, rope.radius, ROPE_LIGHT, { sides: 6, colorAt: ropeColor });
      }
      if (!next) continue;
      const from = [...onStone(stone, rope.at, Math.atan2(next.y - stone.y, next.x - stone.x), 0), stone.height * rope.at];
      const to = [...onStone(next, rope.at, Math.atan2(stone.y - next.y, stone.x - next.x), 0), next.height * rope.at];
      const span = [];
      for (let k = 0; k <= 14; k += 1) {
        const t = k / 14;
        span.push([0, 1, 2].map((axis) => from[axis] + (to[axis] - from[axis]) * t - (axis === 2 ? rope.sag * 4 * t * (1 - t) : 0)));
      }
      props.tube(span, rope.strand, ROPE_LIGHT, { sides: 6, colorAt: ropeColor });
    }
  }
  // The chain: each link along the line to the next (the last along the one before), alternate links
  // lying flat and standing.
  chain.forEach((centre, i) => {
    const a = chain[Math.max(0, Math.min(i, chain.length - 2))];
    const b = chain[Math.min(chain.length - 1, Math.max(i + 1, 1))];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const dLength = Math.hypot(...d) || 1;
    const axis = d.map((v) => v / dLength);
    const flat = [-axis[1], axis[0], 0];
    const flatLength = Math.hypot(...flat) || 1;
    const across = flat.map((v) => v / flatLength);
    const up = [axis[1] * across[2] - axis[2] * across[1], axis[2] * across[0] - axis[0] * across[2], axis[0] * across[1] - axis[1] * across[0]];
    chainLink(props, centre, axis, i % 2 ? up : across, CHAIN, i % 3 ? RUST : RUST_DARK);
  });
  return props;
}

const RING = /* glsl */ `
// The arena: centre x, y and its paving's radius (ringSpots).
uniform vec3 uRing;
uniform vec3 uEmblem;
// The paving's brick at p: x, y its cell, z px to its nearest mortar line, w its row's length px.
// Straight rows, each shifted along by its own share of a brick and with its own brick length.
vec4 brickAt(vec2 p) {
  vec2 rel = p - uRing.xy;
  float row = floor(rel.y / ${BRICK_PX.high}.0);
  float brickLong = ${BRICK_PX.long}.0 + ${BRICK_PX.vary}.0 * (2.0 * hash12(vec2(row, 3.0)) - 1.0);
  vec2 q = vec2(rel.x / brickLong + hash12(vec2(row, 7.0)), rel.y / ${BRICK_PX.high}.0);
  vec2 edge = (0.5 - abs(fract(q) - 0.5)) * vec2(brickLong, ${BRICK_PX.high}.0);
  // Worn: each brick's corners rounded off.
  float rounded = ${BRICK_PX.corner}.0 - length(max(vec2(${BRICK_PX.corner}.0) - edge, 0.0));
  return vec4(floor(q), min(min(edge.x, edge.y), rounded), brickLong);
}
// The emblem in the paving, as in the art: a broad disc of pale stone sunk in a dark groove, a dark
// ring round its pale centre and a shallower band carved across it from that ring to the rim. x: 1 on
// pale stone, 2 on dark stone, 3 on the band, 0 off it; y px from its outline (negative inside).
vec2 emblemInlay(vec2 p) {
  if (uEmblem.z <= 0.0) return vec2(0.0, 100000.0);
  vec2 rel = p - uEmblem.xy;
  float r = length(rel);
  float outline = r - uEmblem.z;
  if (outline > 6.0) return vec2(0.0, outline);
  float buttonR = uEmblem.z * 0.3;
  bool groove = outline > -2.0;
  bool buttonRing = r > buttonR * 0.55 && r < buttonR;
  if (groove || buttonRing) return vec2(2.0, outline);
  bool band = abs(rel.y) < uEmblem.z * 0.045 && r > buttonR;
  return vec2(band ? 3.0 : 1.0, outline);
}
`;

/**
 * Bake: rows of bricks, each a little domed between mortar grooves and breaking up into dust toward
 * the ring's edge, the Poke Ball's pale disc flush with them and its dark lines sunk; then the
 * ground the stones and spires stand on, rising in low swells, boulders scattered over it.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${VORONOI}
${RING}
float ridged(vec2 q) {
  return 1.0 - abs(2.0 * gnoise(q) - 1.0);
}
void main() {
  vec2 p = uMin + vUv * uSize;
  vec2 rel = p - uRing.xy;
  float r = length(rel);
  // The edge wanders, mostly outward (the cards' margin stays paved), so it reads as worn paving
  // giving way to the sand, not a drawn circle.
  float d = r - uRing.z + 34.0 * (fbm3(p / 70.0) - 0.62) + 10.0 * (gnoise(p / 22.0) - 0.5);
  float h;
  float id;
  float kind;
  if (d < 0.0) {
    // Bricks in straight rows, each row shifted along by its own share of a brick.
    vec4 brick = brickAt(p);
    vec2 cell = brick.xy;
    float mortar = brick.z;
    id = hash12(cell + 0.5);
    // Toward the edge the paving breaks up: bricks go missing into the dust.
    float missing = step(hash12(cell + 9.0), smoothstep(-110.0, 0.0, d + 40.0 * (gnoise(p / 60.0) - 0.5)) * 0.95);
    h = missing > 0.5
      ? -1.0 + 1.5 * fbm3(p / 30.0)
      : 1.8 * smoothstep(0.0, 2.6, mortar) + 0.5 * (gnoise(p / 9.0) - 0.5) - 0.5 * id;
    // The emblem's pale stone lies flush, smooth; its dark lines a little sunk.
    vec2 inlay = emblemInlay(p);
    if (inlay.x > 0.5) {
      h = inlay.x > 2.5 ? 0.1 : inlay.x > 1.5 ? -0.6 : 0.6 + 0.3 * (gnoise(p / 12.0) - 0.5);
      missing = 0.0;
      id = 0.5;
    }
    kind = missing > 0.5 ? 1.0 : -1.0;
  } else {
    // The ground the stones and spires stand on, as in the art: dusty rock rising in low swells
    // further out, boulders scattered over it, more of them further out.
    float beyond = d;
    float land = 2.0 + 6.0 * fbm3(p / 70.0) + 2.0 * (gnoise(p / 9.0) - 0.5)
      + 26.0 * smoothstep(120.0, 520.0, beyond) * fbm3(p / 160.0 + 4.0);
    // A boulder: a round dome about its Voronoi cell's point (faceted ones, or domes filling the
    // cells' polygons, read as shards from above).
    vec4 rock = voronoiCell((p + 17.0) / 52.0);
    float radius = 11.0 + 9.0 * fract(rock.y * 3.3);
    // An elongated, lumpy outline turned its own way, so no two read as marbles.
    float turn = rock.y * 6.2831853;
    vec2 o = rock.zw * 52.0;
    vec2 e = vec2(cos(turn) * o.x + sin(turn) * o.y, cos(turn) * o.y - sin(turn) * o.x) * vec2(1.0, 1.5);
    float inner = clamp(1.0 - length(e) * (1.0 + 0.3 * (gnoise(p / 6.0) - 0.5)) / radius, 0.0, 1.0);
    float dome = sqrt(inner * (2.0 - inner));
    float share = mix(0.92, 0.84, smoothstep(100.0, 400.0, beyond));
    float scatter = step(share, fract(rock.y * 13.1)) * smoothstep(10.0, 30.0, beyond);
    h = land + dome * (4.0 + 5.0 * fract(rock.y * 5.7)) * scatter;
    // B: a boulder's tone 0.6..1 on its dome, plain ground 0.3.
    id = scatter * inner > 0.0 ? 0.6 + 0.4 * rock.y : 0.3;
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
    // Paving: grey-beige stones a shade apart, a few worn darker, thin joints only a few shades darker
    // than the stone, as the art's (85,76,70) between (128,120,112) bricks, grime in broad pools; the
    // emblem's pale stone, its dark grooves and its carved band.
    vec4 brick = brickAt(p);
    float wear = hash12(brick.xy + 21.0);
    vec3 stone = mix(vec3(0.215, 0.196, 0.17), vec3(0.32, 0.292, 0.252), id) * (wear < 0.15 ? 0.84 : 1.0);
    float gap = 1.0 - smoothstep(0.3, 0.9 + 0.5 * gnoise(p / 30.0), brick.z);
    stone *= 0.92 + 0.16 * fbm3(p / 23.0);
    stone = mix(stone, stone * 0.6, gap * 0.85);
    // Dark grime gathers in broad pools, as on the art's paving.
    stone *= mix(1.0, 0.74, smoothstep(0.58, 0.78, fbm3(p / 210.0 + 3.0)));
    vec2 inlay = emblemInlay(p);
    if (inlay.x > 2.5) stone = vec3(0.24, 0.22, 0.2) * (0.9 + 0.2 * fbm3(p / 18.0));
    else if (inlay.x > 1.5) stone = vec3(0.11, 0.1, 0.09) * (0.85 + 0.3 * gnoise(p / 6.0));
    else if (inlay.x > 0.5) stone = vec3(0.4, 0.37, 0.34) * (0.9 + 0.2 * fbm3(p / 18.0));
    col = stone * (0.55 + 0.35 * facing + 0.25 * sky);
  } else {
    // Rock and dust, faces to the light pale; the boulders a darker grey-brown.
    vec3 rock = mix(vec3(0.17, 0.16, 0.145), vec3(0.37, 0.35, 0.32), smoothstep(0.35, 0.85, facing));
    float boulder = step(0.55, id);
    vec3 boulderRock = mix(vec3(0.24, 0.225, 0.2), vec3(0.42, 0.4, 0.36), smoothstep(0.2, 0.9, facing)) * (0.9 + 0.25 * (id - 0.6));
    rock = mix(rock, boulderRock, boulder);
    vec3 dust = vec3(0.27, 0.245, 0.205) * (0.9 + 0.2 * fbm3(p / 40.0));
    rock = mix(dust, rock, max(smoothstep(0.92, 0.75, n.z), boulder));
    col = rock * (0.75 + 0.3 * sky);
  }
  col = mix(col * 0.55, col, smoothstep(0.3, 0.9, light.b));
  // The overcast sky's thicker clouds drift over, their soft shadows crossing the ring.
  float clouds = fbm3((p - vec2(uTime * 9.0, uTime * 4.0)) / 520.0 + 3.7);
  col *= 1.0 - 0.16 * smoothstep(0.48, 0.72, clouds);
  // The art's sepia haze, thicker with distance from the ring, its mist drifting.
  float far = smoothstep(140.0, 560.0, d);
  float mist = fbm3((p + vec2(uTime * 14.0, -uTime * 6.0)) / 160.0);
  col = mix(col, HAZE * (0.92 + 0.22 * mist), far * (0.6 + 0.2 * mist));
  vec2 edgeUv = min(vUv, 1.0 - vUv);
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.05, min(edgeUv.x, edgeUv.y)));
  vec3 dust = vec3(0.75, 0.68, 0.55);
  col += dust * revealGlow(p, 0.035) * 0.6;
  col += dust * exitGlow(p) * 0.6;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * The props' light: the overcast sky from above, a pale sun from the far left, rust's dull sheen;
 * the stones and spires sink into the art's sepia haze with distance from the ring, as the ground
 * does.
 */
const PROP_LIGHT = /* glsl */ `
uniform vec3 uRing;
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  vec3 col = albedo * (SKY * (0.42 + 0.3 * n.z) + vec3(0.55, 0.52, 0.47) * max(dot(n, sun), 0.0));
  vec3 view = normalize(uEye - world);
  col += vec3(0.5, 0.45, 0.38) * pow(max(dot(reflect(-sun, n), view), 0.0), 12.0) * metal * 0.4;
  float far = smoothstep(140.0, 560.0, distance(world.xy, uRing.xy) - uRing.z);
  return mix(col, HAZE, far * 0.6);
}
`;

export const PROP_FRAGMENT = propFragment({ light: PROP_LIGHT, uniforms: OVERCAST, reveal: 'vec3(0.45, 0.4, 0.33)' });

const NO_SPOTS = { arena: null, ringR: 0, stones: [], anchor: null, spires: [], emblem: null };

/** Mountain Ring's board (stadium-environment-mesh.js BOARDS): the ground and the props. */
export function mountainRingBoard({ three, material, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uRing: { value: new three.Vector3() },
    uEmblem: { value: new three.Vector3() },
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
      const { arena, emblem } = spots;
      own.uRing.value.set(arena?.x ?? 0, arena?.y ?? 0, arena?.r ?? 0);
      own.uEmblem.value.set(emblem?.x ?? 0, emblem?.y ?? 0, emblem?.r ?? 0);
      replaceGeometry(terrain, terrainGrid(bounds));
      props.visible = Boolean(arena);
      if (arena) replaceGeometry(props, ringProps(spots).build(three));
    },
  };
}
