import test from 'node:test';
import assert from 'node:assert/strict';

import { projectPoint, tiltTransforms } from '../table-tilt.mjs';

test('tiltTransforms pivots self/opp at the local top edge and mat at its center', () => {
  const { self, opp, mat } = tiltTransforms({ tiltDeg: 20, perspectivePx: 900 });
  assert.equal(self.origin, '50% 0%');
  assert.equal(opp.origin, '50% 0%');
  assert.equal(mat.origin, '50% 50%');
  // Self and opp share one set of parameters (design: "one set of parameters
  // computed for both halves").
  assert.equal(self.transform, opp.transform);
  assert.equal(self.perspectiveOrigin, opp.perspectiveOrigin);
});

test('tiltTransforms defaults match the design doc', () => {
  const { perspectivePx, self } = tiltTransforms();
  assert.equal(perspectivePx, 1400);
  assert.equal(self.transform, 'rotateX(14deg)');
  assert.equal(self.perspectiveOrigin, '50% 50%');
});

test('seam continuity: self/opp points on the local top edge (y=0) are fixed under any tilt', () => {
  for (const tiltDeg of [0, 5, 14, 30, -10]) {
    for (const perspectivePx of [400, 1400, 5000]) {
      for (const x of [0, 37.5, 100, 320]) {
        for (const half of ['self', 'opp']) {
          const projected = projectPoint({ x, y: 0 }, { tiltDeg, perspectivePx }, half);
          assert.equal(projected.x, x, `${half} x moved at tiltDeg=${tiltDeg}`);
          assert.equal(projected.y, 0, `${half} y moved at tiltDeg=${tiltDeg}`);
        }
      }
    }
  }
});

test('seam continuity: mat points on its vertical center are fixed under any tilt', () => {
  const height = 600;
  for (const tiltDeg of [0, 5, 14, 30]) {
    for (const perspectivePx of [400, 1400, 5000]) {
      for (const x of [0, 150, 600]) {
        const projected = projectPoint({ x, y: height / 2, height }, { tiltDeg, perspectivePx }, 'mat');
        assert.equal(projected.x, x, `mat x moved at tiltDeg=${tiltDeg}`);
        assert.equal(projected.y, height / 2, `mat y moved at tiltDeg=${tiltDeg}`);
      }
    }
  }
});

test('seam continuity: self and opp agree at the shared seam for the same local x', () => {
  const params = { tiltDeg: 14, perspectivePx: 1400 };
  for (const x of [0, 42, 250]) {
    const selfProjected = projectPoint({ x, y: 0 }, params, 'self');
    const oppProjected = projectPoint({ x, y: 0 }, params, 'opp');
    assert.deepEqual(selfProjected, oppProjected);
  }
});

test('projectPoint displaces points off the seam (sanity: tilt actually does something)', () => {
  const projected = projectPoint({ x: 0, y: 100 }, { tiltDeg: 14, perspectivePx: 1400 }, 'self');
  assert.notEqual(projected.y, 100);
});

test('projectPoint is the identity when tiltDeg is 0, regardless of y', () => {
  const projected = projectPoint({ x: 10, y: 100 }, { tiltDeg: 0, perspectivePx: 1400 }, 'self');
  assert.equal(projected.x, 10);
  assert.equal(projected.y, 100);
});
