// Design 068: the vector, quaternion and matrix maths the attack-impact player shares. Unity's
// conventions throughout (left-handed, Y up, Euler angles applied Z then X then Y), so a prefab's
// transforms mean here what they mean in the game. Matrices are column-major Float32Array(16),
// the layout both the shaders' constant buffers and WebGL take. DOM-free.

export const DEG = Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);

/** `a` at unit length; `fallback` when `a` has no direction. */
export function normalize(a, fallback = [0, 0, 1]) {
  const len = length(a);
  return len > 1e-9 ? [a[0] / len, a[1] / len, a[2] / len] : fallback;
}

export const QUAT_IDENTITY = Object.freeze([0, 0, 0, 1]);

/** The rotation `a` after `b` is applied first (Unity's `a * b`). */
export function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatAxisAngle(axis, radians) {
  const s = Math.sin(radians / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(radians / 2)];
}

/** Unity's `Quaternion.Euler`: radians about Z, then X, then Y. */
export function quatEuler(x, y, z) {
  return quatMul(quatMul(quatAxisAngle([0, 1, 0], y), quatAxisAngle([1, 0, 0], x)), quatAxisAngle([0, 0, 1], z));
}

export function quatRotate(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** Unity's `Quaternion.LookRotation`: +Z onto `forward`, +Y as near `up` as it can be. */
export function quatLook(forward, up = [0, 1, 0]) {
  const f = normalize(forward);
  let r = cross(up, f);
  if (length(r) < 1e-6) r = cross(Math.abs(f[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0], f);
  r = normalize(r, [1, 0, 0]);
  const u = cross(f, r);
  // Rotation matrix with columns r, u, f → quaternion.
  const trace = r[0] + u[1] + f[2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(u[2] - f[1]) / s, (f[0] - r[2]) / s, (r[1] - u[0]) / s, s / 4];
  }
  if (r[0] > u[1] && r[0] > f[2]) {
    const s = Math.sqrt(1 + r[0] - u[1] - f[2]) * 2;
    return [s / 4, (u[0] + r[1]) / s, (f[0] + r[2]) / s, (u[2] - f[1]) / s];
  }
  if (u[1] > f[2]) {
    const s = Math.sqrt(1 + u[1] - r[0] - f[2]) * 2;
    return [(u[0] + r[1]) / s, s / 4, (f[1] + u[2]) / s, (f[0] - r[2]) / s];
  }
  const s = Math.sqrt(1 + f[2] - r[0] - u[1]) * 2;
  return [(f[0] + r[2]) / s, (f[1] + u[2]) / s, s / 4, (r[1] - u[0]) / s];
}

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Translation · rotation · scale. */
export function mat4Compose(position, rotation, scaling) {
  const [x, y, z, w] = rotation;
  const m = new Float32Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * scaling[0];
  m[1] = 2 * (x * y + z * w) * scaling[0];
  m[2] = 2 * (x * z - y * w) * scaling[0];
  m[4] = 2 * (x * y - z * w) * scaling[1];
  m[5] = (1 - 2 * (x * x + z * z)) * scaling[1];
  m[6] = 2 * (y * z + x * w) * scaling[1];
  m[8] = 2 * (x * z + y * w) * scaling[2];
  m[9] = 2 * (y * z - x * w) * scaling[2];
  m[10] = (1 - 2 * (x * x + y * y)) * scaling[2];
  m[12] = position[0];
  m[13] = position[1];
  m[14] = position[2];
  m[15] = 1;
  return m;
}

export function mat4Mul(a, b) {
  const m = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      m[column * 4 + row] = sum;
    }
  }
  return m;
}

export const transformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** A direction through the matrix's rotation and scale (no translation). */
export const transformVector = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
];

/** The lengths of a matrix's three axes: the scale a hierarchy ends up with. */
export const axisScales = (m) => [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];

/**
 * The game's board camera as a view-projection matrix: `height` units straight above
 * `target`, looking down −Y with +Z up the screen and +X to the right, vertical field of view
 * `fovDeg`, `aspect` = width / height. Depth is OpenGL's (−1 near … 1 far).
 */
export function topDownViewProjection({ target, height, fovDeg, aspect, near = 1, far = 1000 }) {
  const f = 1 / Math.tan((fovDeg * DEG) / 2);
  const depth = (far + near) / (far - near);
  const offset = (-2 * far * near) / (far - near);
  // View space: x = X, y = Z, distance along the view = height − Y (camera at target + (0, height, 0)).
  const eye = [target[0], target[1] + height, target[2]];
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[9] = f;
  m[6] = -depth;
  m[7] = -1;
  m[12] = (-f / aspect) * eye[0];
  m[13] = -f * eye[2];
  m[14] = depth * eye[1] + offset;
  m[15] = eye[1];
  return m;
}

/** Clip-space position (x, y, z, w) of a world point. */
export const project = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15],
];
