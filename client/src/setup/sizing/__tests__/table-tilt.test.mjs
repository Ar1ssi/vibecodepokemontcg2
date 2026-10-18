import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PERSPECTIVE_PX,
  DEFAULT_TILT_DEG,
  projectFromPivot,
  seamShiftPx,
  tiltTransforms,
} from '../table-tilt.mjs';

const P = 1400;
const D = 380;

const close = (actual, expected, message, tolerance = 0.02) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} vs ${expected}`
  );

test('tiltTransforms: the mat pivots on its bottom edge and carries the seam shift', () => {
  const { mat } = tiltTransforms({ tiltDeg: 14, perspectivePx: P, depthPx: D });
  assert.equal(mat.origin, '50% 100%');
  assert.equal(mat.deg, 14);
  assert.match(
    mat.transform,
    /^translateY\(-?[\d.]+px\) perspective\(1400px\) rotateX\(14deg\)$/
  );
  close(mat.shiftPx, seamShiftPx({ tiltDeg: 14, perspectivePx: P, depthPx: D }), 'shiftPx');
});

test('tiltTransforms: defaults and an unmeasured board', () => {
  const { mat } = tiltTransforms();
  assert.equal(mat.deg, DEFAULT_TILT_DEG);
  assert.equal(mat.shiftPx, 0);
  assert.match(mat.transform, new RegExp(`perspective\\(${DEFAULT_PERSPECTIVE_PX}px\\)`));
});

test('tiltDeg 0 is flat: no seam shift', () => {
  const { mat } = tiltTransforms({ tiltDeg: 0, depthPx: D });
  assert.equal(mat.shiftPx, 0);
  assert.equal(mat.transform, 'translateY(0px) perspective(1400px) rotateX(0deg)');
});

test('the seam lands back at y = -D after the shift', () => {
  const shift = seamShiftPx({ tiltDeg: 14, perspectivePx: P, depthPx: D });
  const seam = projectFromPivot({ x: 0, y: -D }, { deg: 14, perspectivePx: P });
  close(seam.y + shift, -D, 'seam y');
});

test('the table recedes from the near edge: nothing is magnified, width shrinks upward', () => {
  const widthAt = (y) => projectFromPivot({ x: 100, y }, { deg: 14, perspectivePx: P }).x;
  close(widthAt(0), 100, 'near edge keeps its flat width', 1e-9);
  let previous = widthAt(0);
  for (const y of [-D / 2, -D, -1.5 * D, -2 * D]) {
    const width = widthAt(y);
    assert.ok(width < previous, `narrower at y=${y}`);
    assert.ok(width <= 100, `never magnified at y=${y}`);
    previous = width;
  }
});

test('seamShiftPx lifts the table (negative) and is 0 when flat or unmeasured', () => {
  assert.ok(seamShiftPx({ tiltDeg: 14, perspectivePx: P, depthPx: D }) < 0);
  assert.equal(seamShiftPx({ tiltDeg: 0, perspectivePx: P, depthPx: D }), 0);
  assert.equal(seamShiftPx({ tiltDeg: 14, perspectivePx: P, depthPx: 0 }), 0);
});
