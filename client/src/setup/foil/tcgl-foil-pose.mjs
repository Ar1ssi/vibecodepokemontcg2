// Pose math for the TCG Live foil views (design 069, O4). Board and hand cards never rotate visibly, yet the
// foil has to react to the card's virtual angle: the mesh is rotated for shading (object matrix, normals and
// view vector all see the tilt) but rasterized face-on by handing the shader P·V·R⁻¹ as its view-projection.
// Plain column-major 4×4 arrays (three's Matrix4.elements layout); no three here, so node tests can load it.

// WebApp createFoilView's tilt range (degrees at full pointer deflection).
export const FOIL_TILT_DEG = 14;

const DEG = Math.PI / 180;
const unit = (value) => (Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0);

/**
 * holo.mjs tilt (the value fed to computeLightVars, [-1, 1] per axis) → mesh rotation in radians. tiltX turns
 * the card about its vertical axis (CSS rotateY(--rotate-x): positive = right edge away); tiltY about its
 * horizontal axis (CSS rotateX(--rotate-y): positive = top edge away), so the shader sees the CSS tilt.
 */
export function poseAngles({ tiltX = 0, tiltY = 0 } = {}) {
  return { rx: -unit(tiltY) * FOIL_TILT_DEG * DEG, ry: unit(tiltX) * FOIL_TILT_DEG * DEG };
}

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** R = Ry · Rx (column-major): rotate about x first, then about y. */
export function rotationMatrix(rx, ry) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  return [cy, 0, -sy, 0, sy * sx, cx, cy * sx, 0, sy * cx, -sx, cy * cx, 0, 0, 0, 0, 1];
}

/** a · b for column-major 4×4 matrices. */
export function multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Inverse of a pure rotation: its transpose (translation must be zero). */
export function transposeRotation(m) {
  return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
}

/** The view-projection that draws a mesh rotated by `rotation` exactly where the unrotated mesh would land. */
export function faceOnViewProjection(projection, view, rotation) {
  return multiply(multiply(projection, view), transposeRotation(rotation));
}
