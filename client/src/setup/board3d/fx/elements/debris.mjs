// Design 077 § Kinds: the debris element's pure half — solid rock and earth: a jagged stone mesh
// per instance, tumbling, optionally stretched along a heading into a shard or spike.
//
// Row (DEBRIS_FLOATS), four vec4: x y z size · colour alpha · light seed · stretch heading spin dissolve.
// The rock mesh itself (rockMesh) is built once: an icosahedron's faces with each corner pushed
// in or out by a hash of its position, so shared corners move together and the stone stays closed.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const DEBRIS_FLOATS = 16;
export const DEBRIS_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);
const STONE = Object.freeze([0.55, 0.5, 0.45]);
const DEG = Math.PI / 180;

/**
 * @param {{ at: object, size: number, alpha?: number, seed?: number, colour?: number[], light?: number[],
 *   stretch?: number, headingDeg?: number, spin?: number, dissolve?: number }} params `size` stage px
 *   (the stone's radius); `stretch` ≥ 1 its length over its width along `headingDeg`; `spin`
 *   radians it has tumbled; `light` its lit edge colour.
 * @returns {object|null}
 */
export function normalizeDebris(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const size = positive(params.size);
  const alpha = unit(params.alpha, 1);
  if (!at || !size || !(alpha > 0)) return null;
  return {
    at,
    size,
    alpha,
    seed: finite(params.seed) ? params.seed : 0,
    colour: rgb(params.colour, STONE),
    light: rgb(params.light, [1, 1, 1]),
    stretch: finite(params.stretch) && params.stretch >= 1 ? params.stretch : 1,
    heading: finite(params.headingDeg) ? params.headingDeg * DEG : 0,
    spin: finite(params.spin) ? params.spin : 0,
    dissolve: unit(params.dissolve, 0),
  };
}

export function packDebris(row, out, index) {
  const o = index * DEBRIS_FLOATS;
  out.set([row.at.x, row.at.y, row.at.z, row.size, ...row.colour, row.alpha, ...row.light, row.seed, row.stretch, row.heading, row.spin, row.dissolve], o);
}

/** The 12 corners and 20 faces of a unit icosahedron. */
function icosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  const corners = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { corners, faces };
}

/** A position's hash in [0, 1): the same corner always moves by the same amount. */
const hash = ([x, y, z]) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * The jagged stone: an icosahedron subdivided once (80 faces), each corner pushed to a radius in
 * [1 − rough, 1 + rough·0.5] by its hash. Flat-shaded triangles, no index.
 * @returns {{ positions: number[] }}
 */
export function rockMesh({ rough = 0.32 } = {}) {
  const { corners, faces } = icosahedron();
  const mid = (a, b) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const l = Math.hypot(...m);
    return m.map((v) => v / l);
  };
  const push = (p) => {
    const r = 1 - rough + hash(p.map((v) => Math.round(v * 1000) / 1000)) * rough * 1.5;
    return p.map((v) => v * r);
  };
  const positions = [];
  for (const [ia, ib, ic] of faces) {
    const a = corners[ia];
    const b = corners[ib];
    const c = corners[ic];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    for (const tri of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) {
      for (const p of tri) positions.push(...push(p));
    }
  }
  return { positions };
}

/** Emits for scripts/fx/check-element-shaders.mjs: boulders, a shard, a spike. */
export const debrisSamples = () => [
  { at: { x: -80, y: 0, z: 40 }, size: 36, seed: 1, spin: 0.7 },
  { at: { x: 0, y: 10, z: 50 }, size: 22, seed: 2, stretch: 2.6, headingDeg: -60, spin: 1.3, colour: [0.62, 0.45, 0.3] },
  { at: { x: 80, y: 0, z: 40 }, size: 30, seed: 3, spin: 2.2, dissolve: 0.4 },
];
