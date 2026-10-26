// Design 077 (prototype): solid props for the Stadium boards built of shapes rather than ground
// (Full Metal Lab's railings, tanks and pipes; Mountain Ring's standing stones and ropes; Fighting
// Stadium's ring and stands; Dark City's buildings). createPropBuilder collects tubes, cylinders,
// boxes and quads into one geometry (one draw call per board): position, normal, and aColor (rgb,
// then w: 0..1 how metallic a lit surface is, 2 and up an emissive one at w - 1 strength).
// PROP_VERTEX lifts them off the floor behind the reveal; propFragment lights them with the board's
// own light function. Pure: the builder takes three only to hand back a BufferGeometry.
import { NOISE, OUTPUT, REVEAL, TERRAIN_GROUND, TERRAIN_UNIFORMS } from './stadium-environment-glsl.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * A builder of lit solids in the table frame (x right, y far, z up, px).
 * @returns {{ tube: Function, cylinder: Function, box: Function, quad: Function, ring: Function,
 *   vertexCount: () => number, build: (three: typeof import('three')) => import('three').BufferGeometry }}
 */
export function createPropBuilder() {
  const positions = [];
  const normals = [];
  const colors = [];
  const index = [];
  const vertex = (p, n, color) => {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    colors.push(color[0], color[1], color[2], color[3] ?? 0);
    return positions.length / 3 - 1;
  };

  /** A flat quad a-b-c-d (counter-clockwise seen from its front), one normal. */
  const quad = (a, b, c, d, color) => {
    const n = unit(cross(sub(b, a), sub(d, a)));
    const first = vertex(a, n, color);
    vertex(b, n, color);
    vertex(c, n, color);
    vertex(d, n, color);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
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
    const at = (u, v, z) => [x + u * c - v * s, y + u * s + v * c, z];
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    quad(at(...corners[0], z1), at(...corners[1], z1), at(...corners[2], z1), at(...corners[3], z1), topColor);
    for (let k = 0; k < 4; k += 1) {
      const [u0, v0] = corners[k];
      const [u1, v1] = corners[(k + 1) % 4];
      quad(at(u0, v0, z0), at(u1, v1, z0), at(u1, v1, z1), at(u0, v0, z1), k === 0 ? frontColor : color);
    }
  };

  const build = (three) => {
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aColor', new three.Float32BufferAttribute(colors, 4));
    geometry.setIndex(index);
    return geometry;
  };

  return { tube, cylinder, ring, box, quad, vertexCount: () => positions.length / 3, build };
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

/**
 * The props' fragment shader around a board's light: `light` is GLSL defining
 * `vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal)`, `uniforms` any it needs.
 * @param {{ light: string, uniforms?: string, reveal: string }} parts `reveal` colours the reveal's
 *   front (a GLSL vec3 expression).
 */
export const propFragment = ({ light, uniforms = '', reveal }) => /* glsl */ `
${TERRAIN_UNIFORMS}
${uniforms}
${NOISE}
${REVEAL}
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
${light}
void main() {
  if (revealBurned(vWorld.xy) * exitKeep(vWorld.xy) < 0.5) discard;
  vec3 col = vColor.w >= 1.5
    ? vColor.rgb * (vColor.w - 1.0)
    : lightProp(vColor.rgb, normalize(gl_FrontFacing ? vNormal : -vNormal), vWorld, vColor.w);
  col += (${reveal}) * revealGlow(vWorld.xy, 0.035);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;
