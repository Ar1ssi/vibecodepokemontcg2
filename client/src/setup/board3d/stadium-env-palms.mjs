// Design 077 (prototype): the Surfing Beach palms as plain vertex arrays (no three.js), in the table
// frame with z up and every vertex relative to its tree's base; the shader (stadium-env-beach.mjs
// PALM_VERTEX) stands each tree on the ground and sways it. A trunk leaning out and curving back up,
// thinning to the top over a flared foot; a crown of feathered fronds, the young ones upright, the
// old ones arching and drooping; a cluster of coconuts under them.

const TRUNK_SIDES = 9;
const TRUNK_RINGS = 22;
const FROND_STEPS = 16;
const COCONUT_BANDS = 5;
const COCONUT_SIDES = 7;
/** Leaflets hang this far below the rib (radians), so a frond is a shallow upside-down V. */
const FROND_FOLD = 0.5;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 0 ? scale(a, 1 / length) : [0, 0, 1];
};
const UP = [0, 0, 1];

/** A small seeded generator (mulberry32), so a tree is the same on every load. */
const seeded = (seed) => {
  let state = Math.floor(seed * 4294967295) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return add(add(scale(p0, u * u * u), scale(p1, 3 * u * u * t)), add(scale(p2, 3 * u * t * t), scale(p3, t * t * t)));
};

/**
 * @param {{ x: number, y: number, height: number, lean: number, leanAngle: number, seed: number }[]} palms
 *   `stadium-environment-layout.mjs` beachSpots palms.
 * @returns {{ position: Float32Array, normal: Float32Array, tree: Float32Array, part: Float32Array,
 *   frond: Float32Array, index: Uint32Array }} Per vertex: `position` and `normal` (vec3, relative to
 *   the tree's base), `tree` (vec4: base x, base y, seed, height), `part` (vec4: kind 0 trunk /
 *   1 frond / 2 coconut, along 0..1, across -1..1 on a frond or round 0..1 on the trunk, sway weight)
 *   and `frond` (the frond's own 0..1 seed, 0 off the fronds: its leaflets and colour).
 */
export function palmGeometry(palms = []) {
  const position = [];
  const normal = [];
  const tree = [];
  const part = [];
  const frond = [];
  const index = [];

  for (const palm of palms) {
    const random = seeded(palm.seed);
    let frondSeed = 0;
    const vertex = (point, direction, kind, along, across, sway) => {
      position.push(...point);
      normal.push(...unit(direction));
      tree.push(palm.x, palm.y, palm.seed, palm.height);
      part.push(kind, along, across, sway);
      frond.push(kind === 1 ? frondSeed : 0);
      return position.length / 3 - 1;
    };
    const grid = (first, rows, columns) => {
      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const a = first + row * columns + column;
          index.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns);
        }
      }
    };

    // Trunk: leans out early, curves back toward upright at the top.
    const height = palm.height;
    const lean = [Math.cos(palm.leanAngle), Math.sin(palm.leanAngle), 0];
    const reach = height * palm.lean;
    const spine = [
      [0, 0, 0],
      add(scale(lean, reach * 0.3), [0, 0, height * 0.3]),
      add(scale(lean, reach * 0.75), [0, 0, height * 0.65]),
      add(scale(lean, reach * 0.85), [0, 0, height]),
    ];
    const side = [-lean[1], lean[0], 0];
    const baseRadius = height * 0.045;
    const trunkFirst = position.length / 3;
    for (let ring = 0; ring <= TRUNK_RINGS; ring += 1) {
      const t = ring / TRUNK_RINGS;
      const centre = bezier(...spine, t);
      const tangent = unit(sub(bezier(...spine, Math.min(1, t + 0.01)), bezier(...spine, Math.max(0, t - 0.01))));
      const across = unit(cross(side, tangent));
      const binormal = unit(cross(tangent, across));
      const radius = baseRadius * (1 - 0.32 * t) * (1 + 0.6 * (1 - t) ** 8);
      for (let k = 0; k <= TRUNK_SIDES; k += 1) {
        const angle = (k / TRUNK_SIDES) * Math.PI * 2;
        const out = add(scale(across, Math.cos(angle)), scale(binormal, Math.sin(angle)));
        vertex(add(centre, scale(out, radius)), out, 0, t, k / TRUNK_SIDES, 0.5 * t * t);
      }
    }
    grid(trunkFirst, TRUNK_RINGS + 1, TRUNK_SIDES + 1);

    const top = add(spine[3], [0, 0, 2]);
    const fronds = 12 + Math.floor(random() * 3);
    for (let i = 0; i < fronds; i += 1) {
      const young = i % 4 === 0;
      const azimuth = (i / fronds) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const elevation = young ? 0.75 + 0.25 * random() : -0.05 + 0.5 * random();
      const length = height * (young ? 0.32 + 0.08 * random() : 0.45 + 0.13 * random());
      const droop = young ? 0.15 : 0.45 + 0.3 * random();
      frondSeed = random();
      const outward = [Math.cos(azimuth), Math.sin(azimuth), 0];
      const ribAt = (s) =>
        add(
          top,
          add(scale(outward, length * s * Math.cos(elevation)), [0, 0, length * (s * Math.sin(elevation) - droop * s * s)])
        );
      const width = length * 0.2;
      const first = position.length / 3;
      for (let step = 0; step <= FROND_STEPS; step += 1) {
        const s = step / FROND_STEPS;
        const rib = ribAt(s);
        const tangent = unit(sub(ribAt(Math.min(1, s + 0.02)), ribAt(Math.max(0, s - 0.02))));
        const flat = cross(tangent, UP);
        const sideways = Math.hypot(...flat) > 1e-3 ? unit(flat) : [-outward[1], outward[0], 0];
        const ribUp = unit(cross(sideways, tangent));
        const half = width * Math.sin(Math.PI * Math.min(1, s * 1.08)) ** 0.65 * (1 - 0.3 * s);
        const sway = 0.5 + 1.5 * s * s;
        for (const sign of [-1, 1]) {
          const edge = add(rib, add(scale(sideways, sign * half * Math.cos(FROND_FOLD)), scale(ribUp, -half * Math.sin(FROND_FOLD))));
          const facing = unit(add(ribUp, scale(sideways, sign * Math.sin(FROND_FOLD))));
          vertex(rib, facing, 1, s, 0, sway);
          vertex(edge, facing, 1, s, sign, sway);
        }
      }
      // Per step: [rib, left edge, rib, right edge]; each half is its own strip.
      for (let step = 0; step < FROND_STEPS; step += 1) {
        for (const offset of [0, 2]) {
          const a = first + step * 4 + offset;
          const b = a + 4;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }

    const nuts = 3 + Math.floor(random() * 2);
    const nutRadius = height * 0.028;
    for (let i = 0; i < nuts; i += 1) {
      const angle = (i / nuts) * Math.PI * 2 + random();
      const centre = add(top, [Math.cos(angle) * nutRadius * 1.3, Math.sin(angle) * nutRadius * 1.3, -nutRadius * (1.2 + random())]);
      const first = position.length / 3;
      for (let band = 0; band <= COCONUT_BANDS; band += 1) {
        const polar = (band / COCONUT_BANDS) * Math.PI;
        for (let k = 0; k <= COCONUT_SIDES; k += 1) {
          const around = (k / COCONUT_SIDES) * Math.PI * 2;
          const out = [Math.sin(polar) * Math.cos(around), Math.sin(polar) * Math.sin(around), Math.cos(polar)];
          vertex(add(centre, scale(out, nutRadius)), out, 2, band / COCONUT_BANDS, k / COCONUT_SIDES, 0.5);
        }
      }
      grid(first, COCONUT_BANDS + 1, COCONUT_SIDES + 1);
    }
  }

  return {
    position: Float32Array.from(position),
    normal: Float32Array.from(normal),
    tree: Float32Array.from(tree),
    part: Float32Array.from(part),
    frond: Float32Array.from(frond),
    index: Uint32Array.from(index),
  };
}
