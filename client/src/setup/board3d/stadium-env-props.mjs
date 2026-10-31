// Design 077 (prototype): solid props for the Stadium boards built of shapes rather than ground
// (Full Metal Lab's railings, tanks and pipes; Mountain Ring's standing stones and ropes; Fighting
// Stadium's ring and stands; Dark City's buildings). createPropBuilder collects tubes, cylinders,
// boxes and quads into one geometry (one draw call per board): position, normal, and aColor (rgb,
// then w: 0..1 how metallic a lit surface is, 2 and up an emissive one at w - 1 strength).
// PROP_VERTEX lifts them off the floor behind the reveal for a board that lights them itself (Dark
// City's buildings). Pure: the builder takes three only to hand back a BufferGeometry.
//
// Design 081 (the Stadium kit) adds to the builder what the kit's assets (stadium-kit-assets.mjs)
// are modelled with: placement frames (an asset is built about its own foot, then moved, turned,
// leant and scaled into the table frame), a look per part (aLook: the light's kind, the sway in px, a
// shade, and since design 082 the size of its leaves in px) and contact shadows (soft ellipses on the
// ground, built apart by buildShadows). Design 082 adds the BDSP shapes: `lumps` (leafy or rocky
// clusters, dark in their creases) and `roundBox` (a box with rounded edges).
import { NOISE, REVEAL, TERRAIN_GROUND, TERRAIN_UNIFORMS } from './stadium-environment-glsl.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
/** A face's unit normal, straight up when the face has no area (a lit part never gets a zero normal). */
const faceNormal = (n) => (Math.hypot(n[0], n[1], n[2]) > 1e-9 ? unit(n) : [0, 0, 1]);

/**
 * Kinds a part is lit as (aLook.x; stadium-kit.mjs KIT_LIGHT). `matte`: a thin dry stalk or blade,
 * lit without sheen (seen from above it is all edge).
 */
export const LOOK = Object.freeze({ plain: 0, foliage: 1, gloss: 2, crystal: 3, cloud: 4, chrome: 5, matte: 6 });

/**
 * A part's look unless it says otherwise: plain, still, unshaded, no leaves. `leaf` (px, in the
 * part's own frame) covers a foliage part with shingled leaves that size (stadium-kit.mjs KIT_LEAVES).
 */
export const DEFAULT_LOOK = Object.freeze({ kind: LOOK.plain, sway: 0, shade: 1, leaf: 0 });

/** The most a roundBox's edges round without an `r` of their own, px. */
export const ROUND_EDGE_MAX = 8;

const IDENTITY = Object.freeze({ m: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: Object.freeze([0, 0, 0]), k: 1 });

const multiply = (a, b) => {
  const m = new Array(9);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return m;
};
const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/**
 * A placement as a frame: the part's own frame (its foot at the origin, z up) leant by `lean`
 * (rad about x, then about y), turned by `yaw` (rad about z), scaled by `scale`, its origin moved to
 * (x, y, z). Non-finite numbers count as their defaults.
 * @param {{ x?: number, y?: number, z?: number, yaw?: number, lean?: number[], scale?: number }} placement
 */
export function frameOf({ x = 0, y = 0, z = 0, yaw = 0, lean = [0, 0], scale = 1 } = {}) {
  const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const k = finite(scale, 1);
  const [ax, ay] = [finite(lean?.[0], 0), finite(lean?.[1], 0)];
  const turn = finite(yaw, 0);
  const rx = [1, 0, 0, 0, Math.cos(ax), -Math.sin(ax), 0, Math.sin(ax), Math.cos(ax)];
  const ry = [Math.cos(ay), 0, Math.sin(ay), 0, 1, 0, -Math.sin(ay), 0, Math.cos(ay)];
  const rz = [Math.cos(turn), -Math.sin(turn), 0, Math.sin(turn), Math.cos(turn), 0, 0, 0, 1];
  const m = multiply(rz, multiply(ry, rx)).map((v) => v * k);
  return { m, t: [finite(x, 0), finite(y, 0), finite(z, 0)], k };
}

/** The frame `child` (a frame in `parent`'s space) makes in the frame above `parent`. */
export const composeFrames = (parent, child) => ({
  m: multiply(parent.m, child.m),
  t: apply(parent.m, child.t).map((v, i) => v + parent.t[i]),
  k: parent.k * child.k,
});

/**
 * A builder of lit solids in the table frame (x right, y far, z up, px).
 * @returns {{ tube: Function, cylinder: Function, box: Function, roundBox: Function, quad: Function, triangle: Function,
 *   ring: Function, sphere: Function, cone: Function, blob: Function, lumps: Function, lathe: Function, facets: Function, surface: Function,
 *   at: Function, look: Function, withoutShadows: Function, shadow: Function, frame: () => object,
 *   vertexCount: () => number, shadowCount: () => number,
 *   build: (three: typeof import('three')) => import('three').BufferGeometry,
 *   buildShadows: (three: typeof import('three')) => import('three').BufferGeometry }}
 */
export function createPropBuilder() {
  const positions = [];
  const normals = [];
  const colors = [];
  const looks = [];
  const feet = [];
  const index = [];
  const shadows = [];
  let frame = IDENTITY;
  let look = DEFAULT_LOOK;
  // The foot of the asset being built (its outermost placement's x, y) and whether it stands on the
  // board's baked ground there (aFoot.z 1) or keeps its own height (0). Outside any placement a
  // vertex is its own foot and keeps its height.
  let foot = null;
  let castShadows = true;
  const vertex = (p, n, color) => {
    const at = frame === IDENTITY ? p : apply(frame.m, p).map((v, i) => v + frame.t[i]);
    const facing = frame === IDENTITY ? n : unit(apply(frame.m, n));
    positions.push(at[0], at[1], at[2]);
    normals.push(facing[0], facing[1], facing[2]);
    colors.push(color[0], color[1], color[2], color[3] ?? 0);
    looks.push(look.kind, look.sway, look.shade, look.leaf > 0 ? look.leaf * frame.k : 0);
    if (foot) feet.push(foot[0], foot[1], foot[2]);
    else feet.push(at[0], at[1], 0);
    return positions.length / 3 - 1;
  };

  /**
   * Builds `draw` in a placement's frame (frameOf), inside the current one: a part modelled about
   * its own foot lands where the placement puts it. Frames nest; the outermost placement is the
   * asset's foot, where it meets the ground (`ground: false` keeps it off the baked ground).
   */
  const at = (placement, draw) => {
    const outer = frame;
    const outerFoot = foot;
    frame = composeFrames(outer, frameOf(placement));
    foot ??= [frame.t[0], frame.t[1], placement.ground === false ? 0 : 1];
    try {
      draw();
    } finally {
      frame = outer;
      foot = outerFoot;
    }
  };

  /** The look (DEFAULT_LOOK's fields) every part built inside `draw` takes; looks nest, unset fields carry on. */
  const withLook = (partial, draw) => {
    const outer = look;
    look = { ...outer, ...partial };
    try {
      draw();
    } finally {
      look = outer;
    }
  };

  /** Builds `draw` without its contact shadows (a board whose own ground already shades under it). */
  const withoutShadows = (draw) => {
    const outer = castShadows;
    castShadows = false;
    try {
      draw();
    } finally {
      castShadows = outer;
    }
  };

  /**
   * A contact shadow: a soft ellipse on the ground under (x, y) of the current frame, radii rx and
   * ry turned by `yaw`, `strength` 0..1 of the board's shadow. Its radii scale with the frame.
   */
  const shadow = ({ x = 0, y = 0, z = 0, rx, ry = rx, yaw = 0, strength = 1 }) => {
    if (!castShadows || !(rx > 0 && ry > 0 && strength > 0)) return;
    const centre = apply(frame.m, [x, y, z]).map((v, i) => v + frame.t[i]);
    const heading = Math.atan2(frame.m[3], frame.m[0]) + yaw;
    shadows.push([centre[0], centre[1], centre[2], rx * frame.k, ry * frame.k, heading, Math.min(1, strength), foot ? foot[2] : 0]);
  };

  /** A flat quad a-b-c-d (counter-clockwise seen from its front), one normal. */
  const face = (a, b, c, d, color) => {
    // Across the diagonals: a quad with one corner pinched to a point (a frond's tip) still has a normal.
    const n = faceNormal(cross(sub(c, a), sub(d, b)));
    const first = vertex(a, n, color);
    vertex(b, n, color);
    vertex(c, n, color);
    vertex(d, n, color);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  const quad = (a, b, c, d, color) => face(a, b, c, d, color);

  /** A flat triangle a-b-c (counter-clockwise seen from its front), one normal. */
  const triangle = (a, b, c, color) => {
    const n = faceNormal(cross(sub(b, a), sub(c, a)));
    const first = vertex(a, n, color);
    vertex(b, n, color);
    vertex(c, n, color);
    index.push(first, first + 1, first + 2);
  };

  /**
   * A round tube along a polyline of [x, y, z] points, `sides` round, its frames turned so a
   * mostly level run keeps its seams level. `colorAt(i)` may colour each ring (collars).
   */
  const tube = (points, radius, color, { sides = 8, colorAt = null } = {}) => {
    if (points.length < 2) return;
    const first = positions.length / 3;
    points.forEach((point, i) => {
      const ahead = points[Math.min(i + 1, points.length - 1)];
      const behind = points[Math.max(i - 1, 0)];
      const tangent = unit(sub(ahead, behind));
      const up = Math.abs(tangent[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const side = unit(cross(tangent, up));
      const lift = cross(side, tangent);
      const ringColor = colorAt ? colorAt(i) : color;
      const r = Array.isArray(radius) ? radius[i] : radius;
      for (let k = 0; k < sides; k += 1) {
        const angle = (k / sides) * 2 * Math.PI;
        const n = [0, 1, 2].map((axis) => side[axis] * Math.cos(angle) + lift[axis] * Math.sin(angle));
        vertex([0, 1, 2].map((axis) => point[axis] + n[axis] * r), n, ringColor);
      }
    });
    for (let i = 0; i < points.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = first + i * sides + k;
        const b = first + i * sides + ((k + 1) % sides);
        index.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  };

  /** A standing cylinder from z0 to z1, its top capped (a dome of `domeRise` px when set) unless `open`. */
  const cylinder = ({ x, y, z0, z1, r, color, sides = 20, capColor = color, domeRise = 0, open = false }) => {
    const first = positions.length / 3;
    for (const z of [z0, z1]) {
      for (let k = 0; k <= sides; k += 1) {
        const angle = (k / sides) * 2 * Math.PI;
        const n = [Math.cos(angle), Math.sin(angle), 0];
        vertex([x + n[0] * r, y + n[1] * r, z], n, color);
      }
    }
    for (let k = 0; k < sides; k += 1) index.push(first + k, first + k + 1, first + sides + 1 + k, first + k + 1, first + sides + 2 + k, first + sides + 1 + k);
    if (open) return;
    // The top: flat, or a half-ellipsoid dome rising domeRise px.
    const levels = domeRise > 0 ? 4 : 1;
    const capFirst = positions.length / 3;
    for (let level = 0; level <= levels; level += 1) {
      const turn = ((level / levels) * Math.PI) / 2;
      const rr = domeRise > 0 ? r * Math.cos(turn) : r * (1 - level / levels);
      const z = z1 + domeRise * Math.sin(turn);
      for (let k = 0; k <= sides; k += 1) {
        const angle = (k / sides) * 2 * Math.PI;
        const n =
          domeRise > 0
            ? unit([(Math.cos(turn) * Math.cos(angle)) / r, (Math.cos(turn) * Math.sin(angle)) / r, Math.sin(turn) / domeRise + 0.001])
            : [0, 0, 1];
        vertex([x + Math.cos(angle) * rr, y + Math.sin(angle) * rr, z], n, capColor);
      }
    }
    for (let level = 0; level < levels; level += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = capFirst + level * (sides + 1) + k;
        const b = a + sides + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  };

  /** An open band round a standing axis (a collar or a hoop): from z0 to z1 at radius r. */
  const ring = ({ x, y, z0, z1, r, color, sides = 20 }) => cylinder({ x, y, z0, z1, r, color, sides, open: true });

  /**
   * A box from z0 to z1, half sizes hw (along its yaw) and hh, turned by yaw (rad); its five faces
   * but the floor; `topColor` paints its top.
   */
  const box = ({ x, y, z0, z1, hw, hh, yaw = 0, color, topColor = color, frontColor = color }) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const corner = (u, v, z) => [x + u * c - v * s, y + u * s + v * c, z];
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    face(corner(...corners[0], z1), corner(...corners[1], z1), corner(...corners[2], z1), corner(...corners[3], z1), topColor);
    for (let k = 0; k < 4; k += 1) {
      const [u0, v0] = corners[k];
      const [u1, v1] = corners[(k + 1) % 4];
      face(corner(u0, v0, z0), corner(u1, v1, z0), corner(u1, v1, z1), corner(u0, v0, z1), k === 0 ? frontColor : color);
    }
  };

  /**
   * A smooth ellipsoid centred at (x, y, z), radii rx, ry, rz; `color` may be a function of the unit
   * direction [dx, dy, dz] out of the centre (a two-tone cap, a band). `from` and `to` (0..1 of the
   * way down from the top) draw a band of it: 0 to 0.5 the upper half only. Without `sides` and
   * `rings` its tessellation grows with its size.
   */
  const blob = ({ x = 0, y = 0, z = 0, rx, ry = rx, rz = rx, color, sides: around, rings: down, from = 0, to = 1 }) => {
    // Rounder the bigger it is on screen: a light's terminator shows every facet of a coarse sphere.
    const sides = around ?? Math.round(Math.min(34, Math.max(12, Math.sqrt(Math.max(rx, ry) * frame.k) * 3.4)));
    const rings = down ?? Math.round(sides * 0.66);
    const first = positions.length / 3;
    for (let i = 0; i <= rings; i += 1) {
      const theta = (from + ((to - from) * i) / rings) * Math.PI;
      for (let k = 0; k <= sides; k += 1) {
        const phi = (k / sides) * 2 * Math.PI;
        const d = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const tint = typeof color === 'function' ? color(d) : color;
        vertex([x + d[0] * rx, y + d[1] * ry, z + d[2] * rz], unit([d[0] / rx, d[1] / ry, d[2] / rz]), tint);
      }
    }
    for (let i = 0; i < rings; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = first + i * (sides + 1) + k;
        const b = a + sides + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };

  /** A smooth-shaded sphere at (x, y, z), `squash` flattening z (a balloon's, a dome's). */
  const sphere = ({ x, y, z, r, color, sides = 16, rings = 10, squash = 1 }) => {
    const first = positions.length / 3;
    for (let i = 0; i <= rings; i += 1) {
      const theta = (i / rings) * Math.PI;
      for (let k = 0; k <= sides; k += 1) {
        const phi = (k / sides) * 2 * Math.PI;
        const n = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        vertex([x + n[0] * r, y + n[1] * r, z + n[2] * r * squash], unit([n[0], n[1], n[2] / squash]), color);
      }
    }
    for (let i = 0; i < rings; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = first + i * (sides + 1) + k;
        const b = a + sides + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };

  /** A cone (a pyramid with few `sides`, turned by `turn` rad) from radius r at z0 up to its apex at z1; its base is left open. */
  const cone = ({ x, y, z0, z1, r, color, sides = 16, turn = 0 }) => {
    const first = positions.length / 3;
    const rise = z1 - z0;
    for (let k = 0; k <= sides; k += 1) {
      const angle = (k / sides) * 2 * Math.PI + turn;
      const n = unit([Math.cos(angle) * rise, Math.sin(angle) * rise, r]);
      vertex([x + Math.cos(angle) * r, y + Math.sin(angle) * r, z0], n, color);
      vertex([x, y, z1], n, color);
    }
    for (let k = 0; k < sides; k += 1) index.push(first + k * 2, first + k * 2 + 2, first + k * 2 + 1);
  };

  /**
   * A solid of revolution about the frame's z axis: `profile` is [radius, z] from the foot up (a
   * radius of 0 closes it there), smooth round and along. `color` is one colour or a function of
   * the profile point's index (bands, a lighter rim).
   */
  const lathe = (profile, { color, sides = 16, turn = 0 }) => {
    if (profile.length < 2) return;
    const first = positions.length / 3;
    profile.forEach(([r, z], i) => {
      const ahead = profile[Math.min(i + 1, profile.length - 1)];
      const behind = profile[Math.max(i - 1, 0)];
      // The profile's outward normal in the (r, z) plane: its tangent turned a quarter.
      const dr = ahead[0] - behind[0];
      const dz = ahead[1] - behind[1];
      const length = Math.hypot(dr, dz) || 1;
      const nr = dz / length;
      const nz = -dr / length;
      const tint = typeof color === 'function' ? color(i) : color;
      for (let k = 0; k <= sides; k += 1) {
        const angle = (k / sides) * 2 * Math.PI + turn;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        vertex([c * r, s * r, z], unit([c * nr, s * nr, nz]), tint);
      }
    });
    for (let i = 0; i < profile.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = first + i * (sides + 1) + k;
        const b = a + sides + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  };

  /**
   * A box from z0 to z1, half sizes hw (along its yaw) and hh, its every edge rounded at radius r
   * (an inner box swept by a ball: smooth normals round each edge), turned by yaw; its five faces
   * but the floor. Without `r` its edges round at a third of its smallest half size, at most
   * ROUND_EDGE_MAX px: the art bible's soft toy edge, which on a building would read as a cushion
   * (design 082). Vertices facing up (n.z > 0.5) take `topColor`, the rest of its front (the -hh
   * side, as `box` paints it) `frontColor`.
   */
  const roundBox = ({ x, y, z0, z1, hw, hh, r, yaw = 0, color, topColor = color, frontColor = color }) => {
    const half = [hw, hh, (z1 - z0) / 2];
    const edge = Number.isFinite(r) ? r : Math.min(Math.min(...half) / 3, ROUND_EDGE_MAX);
    const radius = Math.max(0, Math.min(edge, 0.999 * Math.min(...half)));
    // The inner box the ball sweeps: inset by the radius but at its floor, which stands square on
    // the ground (its bottom edges are not rounded).
    const low = [radius - hw, radius - hh, -half[2]];
    const high = half.map((h) => h - radius);
    const centre = [x, y, (z0 + z1) / 2];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Samples along one axis of a face: through the flat middle, then a quarter of each bevel (the
    // neighbouring face draws the other quarter): tan spacing puts them evenly round the bevel.
    const steps = 3;
    const along = (axis) => {
      const bevel = (edge, sign) => Array.from({ length: steps }, (_, k) => edge + sign * radius * Math.tan((((k + 1) / steps) * Math.PI) / 4));
      const below = axis === 2 ? [] : bevel(low[axis], -1).reverse();
      return [...below, low[axis], high[axis], ...bevel(high[axis], 1)];
    };
    const faces = [
      { axis: 2, sign: 1, u: 0, v: 1 },
      { axis: 0, sign: 1, u: 1, v: 2 },
      { axis: 0, sign: -1, u: 2, v: 1 },
      { axis: 1, sign: 1, u: 2, v: 0 },
      { axis: 1, sign: -1, u: 0, v: 2 },
    ];
    for (const { axis, sign, u, v } of faces) {
      const us = along(u);
      const vs = along(v);
      const first = positions.length / 3;
      for (const b of vs) {
        for (const a of us) {
          const q = [0, 0, 0];
          q[axis] = sign * half[axis];
          q[u] = a;
          q[v] = b;
          const core = q.map((value, k) => Math.max(low[k], Math.min(high[k], value)));
          const n = unit(q.map((value, k) => value - core[k] + (k === axis ? sign * 1e-6 : 0)));
          const local = core.map((value, k) => value + n[k] * radius);
          const world = [centre[0] + local[0] * c - local[1] * s, centre[1] + local[0] * s + local[1] * c, centre[2] + local[2]];
          const facing = [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]];
          vertex(world, facing, facing[2] > 0.5 ? topColor : n[1] < -0.5 ? frontColor : color);
        }
      }
      const width = us.length;
      for (let j = 0; j < vs.length - 1; j += 1) {
        for (let i = 0; i < width - 1; i += 1) {
          const a = first + j * width + i;
          index.push(a, a + 1, a + width + 1, a, a + width + 1, a + width);
        }
      }
    }
  };

  /**
   * A cluster of soft lumps (a canopy's, a bush's, a boulder's): each an ellipsoid as `blob` builds
   * it ({ x, y, z, rx, ry, rz, color }), its colour darkened where it tucks in against another lump,
   * so the creases between lumps read deep. `crease` 0..1 is how dark a crease gets.
   */
  const lumps = (list, { crease = 0.45 } = {}) => {
    list.forEach((lump, i) => {
      const { x = 0, y = 0, z = 0, rx, ry = rx, rz = rx, color } = lump;
      const tint = (d) => {
        const base = typeof color === 'function' ? color(d) : color;
        const p = [x + d[0] * rx, y + d[1] * ry, z + d[2] * rz];
        let open = 1;
        list.forEach((other, j) => {
          if (j === i) return;
          const q = [(p[0] - (other.x ?? 0)) / other.rx, (p[1] - (other.y ?? 0)) / (other.ry ?? other.rx), (p[2] - (other.z ?? 0)) / (other.rz ?? other.rx)];
          const reach = Math.hypot(q[0], q[1], q[2]);
          const near = 1 - Math.min(1, Math.max(0, (reach - 1) / 0.5));
          open *= 1 - crease * near * near;
        });
        return [base[0] * open, base[1] * open, base[2] * open, base[3] ?? 0];
      };
      blob({ ...lump, color: tint });
    });
  };

  /**
   * Faceted solid: `points` [x, y, z] and `faces` (index triples, counter-clockwise seen from
   * outside), every face flat shaded. `color` is one colour or a function of the face's centre and
   * normal (a lighter top, a darker foot).
   */
  const facets = (points, faces, color) => {
    for (const [i, j, k] of faces) {
      const a = points[i];
      const b = points[j];
      const c = points[k];
      const n = faceNormal(cross(sub(b, a), sub(c, a)));
      const centre = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3);
      const tint = typeof color === 'function' ? color(centre, n) : color;
      const first = vertex(a, n, tint);
      vertex(b, n, tint);
      vertex(c, n, tint);
      index.push(first, first + 1, first + 2);
    }
  };

  /**
   * A smooth sheet through a grid of [x, y, z] points (`grid[i][k]`, rows along i), its normals
   * from its neighbours; `wrap` closes each row round on itself (a trunk round its spine). `color`
   * is one colour or a function of (i, k).
   */
  const surface = (grid, { color, wrap = false }) => {
    const rows = grid.length;
    const columns = grid[0]?.length ?? 0;
    if (rows < 2 || columns < 2) return;
    const first = positions.length / 3;
    const at = (i, k) => grid[Math.max(0, Math.min(rows - 1, i))][wrap ? (k + columns) % columns : Math.max(0, Math.min(columns - 1, k))];
    for (let i = 0; i < rows; i += 1) {
      for (let k = 0; k < columns; k += 1) {
        const across = sub(at(i, k + 1), at(i, k - 1));
        const along = sub(at(i + 1, k), at(i - 1, k));
        vertex(grid[i][k], faceNormal(cross(across, along)), typeof color === 'function' ? color(i, k) : color);
      }
    }
    const spans = wrap ? columns : columns - 1;
    for (let i = 0; i < rows - 1; i += 1) {
      for (let k = 0; k < spans; k += 1) {
        const a0 = first + i * columns + k;
        const a1 = first + i * columns + ((k + 1) % columns);
        index.push(a0, a1, a0 + columns, a1, a1 + columns, a0 + columns);
      }
    }
  };

  const build = (three) => {
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aColor', new three.Float32BufferAttribute(colors, 4));
    geometry.setAttribute('aLook', new three.Float32BufferAttribute(looks, 4));
    geometry.setAttribute('aFoot', new three.Float32BufferAttribute(feet, 3));
    geometry.setIndex(index);
    return geometry;
  };

  /**
   * Every contact shadow as a quad on the ground (z a hair above its foot): position, and aShadow
   * (x, y: the corner in the ellipse's own -1..1 frame; z: its strength; w: 1 on the baked ground).
   */
  const buildShadows = (three) => {
    const at = new Float32Array(shadows.length * 12);
    const corner = new Float32Array(shadows.length * 16);
    const order = [];
    shadows.forEach(([x, y, z, rx, ry, yaw, strength, grounded], i) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].forEach(([u, v], k) => {
        at.set([x + u * rx * c - v * ry * s, y + u * rx * s + v * ry * c, z + 0.5], (i * 4 + k) * 3);
        corner.set([u, v, strength, grounded], (i * 4 + k) * 4);
      });
      order.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(at, 3));
    geometry.setAttribute('aShadow', new three.Float32BufferAttribute(corner, 4));
    geometry.setIndex(order);
    return geometry;
  };

  return {
    tube,
    cylinder,
    ring,
    box,
    roundBox,
    quad,
    triangle,
    sphere,
    cone,
    blob,
    lumps,
    lathe,
    facets,
    surface,
    at,
    look: withLook,
    withoutShadows,
    shadow,
    frame: () => frame,
    vertexCount: () => positions.length / 3,
    shadowCount: () => shadows.length,
    build,
    buildShadows,
  };
}

export const PROP_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aColor;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float growth = terrainGrowth(position.xy);
  vColor = aColor;
  vNormal = normal;
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, position.z * growth, 1.0);
}
`;
