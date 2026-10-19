import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOIL_TILT_DEG,
  faceOnViewProjection,
  identity,
  multiply,
  poseAngles,
  rotationMatrix,
  transposeRotation,
} from '../tcgl-foil-pose.mjs';

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

const transform = (m, [x, y, z]) => [0, 1, 2, 3].map((row) => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row]);

// Column-major perspective (three's PerspectiveCamera.projectionMatrix) and a camera at +z looking at the origin.
const perspective = (fovDeg, aspect, near, far) => {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
};
const viewFromZ = (distance) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1];

describe('poseAngles', () => {
  it('turns full tilt into the WebApp 14° range', () => {
    assert.equal(FOIL_TILT_DEG, 14);
    close(poseAngles({ tiltX: 1, tiltY: 0 }).ry, 0.2443460952792061);
    close(poseAngles({ tiltX: 0, tiltY: 1 }).rx, -0.2443460952792061);
  });
  it('clamps to [-1, 1] and reads NaN or missing as 0', () => {
    close(poseAngles({ tiltX: 5, tiltY: -9 }).ry, (14 * Math.PI) / 180);
    close(poseAngles({ tiltX: 5, tiltY: -9 }).rx, (14 * Math.PI) / 180);
    const neutral = poseAngles({ tiltX: Number.NaN, tiltY: undefined });
    assert.equal(neutral.rx, -0);
    assert.equal(neutral.ry, 0);
    assert.deepEqual(poseAngles(), { rx: -0, ry: 0 });
  });
});

describe('rotationMatrix', () => {
  it('is orthonormal: R · Rᵀ = I', () => {
    const r = rotationMatrix(0.3, -0.2);
    const product = multiply(r, transposeRotation(r));
    identity().forEach((value, index) => close(product[index], value));
  });
  it('turns the right edge away from the viewer for a positive y angle', () => {
    const [, , z] = transform(rotationMatrix(0, 0.2), [1, 0, 0]);
    assert.ok(z < 0);
  });
  it('turns the top edge away from the viewer for a positive tiltY', () => {
    const { rx, ry } = poseAngles({ tiltY: 1 });
    const [, , z] = transform(rotationMatrix(rx, ry), [0, 1, 0]);
    assert.ok(z < 0);
  });
});

describe('faceOnViewProjection', () => {
  it('rasterizes a tilted card exactly where the flat card lands', () => {
    const projection = perspective(30, 6.3 / 8.8, 0.1, 100);
    const view = viewFromZ(17.08);
    const { rx, ry } = poseAngles({ tiltX: 0.8, tiltY: -0.6 });
    const rotation = rotationMatrix(rx, ry);
    const rasterVP = faceOnViewProjection(projection, view, rotation);
    const flatVP = multiply(projection, view);
    for (const corner of [
      [-3.15, -4.4, 0],
      [3.15, -4.4, 0],
      [3.15, 4.4, 0],
      [-3.15, 4.4, 0],
    ]) {
      const tilted = transform(rasterVP, transform(rotation, corner).slice(0, 3));
      const flat = transform(flatVP, corner);
      close(tilted[0] / tilted[3], flat[0] / flat[3]);
      close(tilted[1] / tilted[3], flat[1] / flat[3]);
    }
  });
  it('differs from the plain view-projection when tilted (the shader still sees the angle)', () => {
    const projection = perspective(30, 0.7, 0.1, 100);
    const view = viewFromZ(17);
    const rotation = rotationMatrix(0.2, 0.1);
    const rasterVP = faceOnViewProjection(projection, view, rotation);
    assert.notDeepEqual(rasterVP, multiply(projection, view));
  });
});
