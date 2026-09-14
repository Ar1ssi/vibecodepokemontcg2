import test from 'node:test';
import assert from 'node:assert/strict';

import { battleMatBox, projectPoint, tiltTransforms } from '../table-tilt.mjs';

const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: ${actual} vs ${expected}`
  );

test('tiltTransforms bakes perspective into each transform and negates the far half', () => {
  const { near, far, mat } = tiltTransforms({
    tiltDeg: 20,
    perspectivePx: 900,
  });
  assert.equal(near.transform, 'perspective(900px) rotateX(20deg)');
  assert.equal(far.transform, 'perspective(900px) rotateX(-20deg)');
  assert.equal(mat.transform, near.transform);
  assert.equal(near.origin, '50% 0%');
  assert.equal(far.origin, '50% 0%');
});

test('tiltTransforms defaults match the design doc', () => {
  assert.equal(
    tiltTransforms().near.transform,
    'perspective(1400px) rotateX(14deg)'
  );
});

test('tiltDeg 0 keeps a non-none transform (stable containing block for fixed zones)', () => {
  assert.equal(
    tiltTransforms({ tiltDeg: 0 }).near.transform,
    'perspective(1400px) rotateX(0deg)'
  );
});

test('seam points (y = 0) never move, in any half', () => {
  for (const half of ['near', 'far', 'mat']) {
    for (const x of [-300, 0, 42]) {
      const projected = projectPoint(
        { x, y: 0 },
        { tiltDeg: 14, perspectivePx: 1400 },
        half
      );
      close(projected.x, x, `${half} x`);
      close(projected.y, 0, `${half} y`);
    }
  }
});

test('far half, once flipped 180deg, lands exactly where the mat top half does', () => {
  const params = { tiltDeg: 14, perspectivePx: 1400 };
  for (const [screenX, distanceAboveSeam] of [
    [0, 100],
    [250, 40],
    [-180, 300],
  ]) {
    // Flip maps local (x, y) to screen (-x, -y) around the seam centre.
    const farLocal = projectPoint(
      { x: -screenX, y: distanceAboveSeam },
      params,
      'far'
    );
    const farOnScreen = { x: -farLocal.x, y: -farLocal.y };
    const mat = projectPoint(
      { x: screenX, y: -distanceAboveSeam },
      params,
      'mat'
    );
    close(farOnScreen.x, mat.x, 'x');
    close(farOnScreen.y, mat.y, 'y');
  }
});

test('near half matches the mat bottom half', () => {
  const params = { tiltDeg: 14, perspectivePx: 1400 };
  const near = projectPoint({ x: 120, y: 200 }, params, 'near');
  const mat = projectPoint({ x: 120, y: 200 }, params, 'mat');
  assert.deepEqual(near, mat);
});

test('table leans away: far edge shrinks, near edge grows', () => {
  const params = { tiltDeg: 14, perspectivePx: 1400 };
  const far = projectPoint({ x: 100, y: 300 }, params, 'far');
  const near = projectPoint({ x: 100, y: 300 }, params, 'near');
  assert.ok(Math.abs(far.x) < 100, 'far edge narrower than flat');
  assert.ok(Math.abs(near.x) > 100, 'near edge wider than flat');
});

test('battleMatBox spans both playfields and puts the seam at the frame boundary', () => {
  const box = battleMatBox({
    farRect: { top: 0, height: 250 },
    nearRect: { top: 250, height: 250 },
    cropFrac: 0.16,
  });
  close(box.top, 40, 'top');
  close(box.height, 420, 'height');
  close(box.seamOffset, 210, 'seamOffset');
});

test('battleMatBox handles unequal halves (resizer dragged)', () => {
  const box = battleMatBox({
    farRect: { top: 0, height: 200 },
    nearRect: { top: 200, height: 300 },
    cropFrac: 0.1,
  });
  close(box.top, 20, 'top');
  close(box.height, 450, 'height');
  close(box.seamOffset, 180, 'seamOffset');
});

test('battleMatBox returns null for missing or collapsed frames', () => {
  assert.equal(
    battleMatBox({
      farRect: null,
      nearRect: { top: 0, height: 10 },
      cropFrac: 0.16,
    }),
    null
  );
  assert.equal(
    battleMatBox({
      farRect: { top: 0, height: 0 },
      nearRect: { top: 0, height: 10 },
      cropFrac: 0.16,
    }),
    null
  );
});

test('battleMatBox treats a non-numeric crop as no crop', () => {
  const box = battleMatBox({
    farRect: { top: 0, height: 100 },
    nearRect: { top: 100, height: 100 },
    cropFrac: Number.NaN,
  });
  assert.deepEqual(box, { top: 0, height: 200, seamOffset: 100 });
});
