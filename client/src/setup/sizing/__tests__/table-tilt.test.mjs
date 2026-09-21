import test from 'node:test';
import assert from 'node:assert/strict';

import {
  battleMatBox,
  projectLocal,
  seamShiftPx,
  stadiumTilt,
  tiltTransforms,
} from '../table-tilt.mjs';

const P = 1400;
const D = 380;

const close = (actual, expected, message, tolerance = 0.02) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} vs ${expected}`
  );

// Screen positions are relative to the pivot (near edge centre); y < 0 is up.
const onScreen = {
  near: (tilt, point) => projectLocal(point, tilt.near, P),
  mat: (tilt, point) => projectLocal(point, tilt.mat, P),
  // The far iframe is flipped 180deg: a screen vector v is -v in its local
  // frame, and its result is flipped back the same way.
  far: (tilt, { x, y }) => {
    const local = projectLocal({ x: -x, y: -y }, tilt.far, P);
    return { x: -local.x, y: -local.y };
  },
};

const W = 800;

test('tiltTransforms: mat pivots on its bottom edge; far half is the flip-conjugate', () => {
  const tilt = tiltTransforms({
    tiltDeg: 14,
    perspectivePx: P,
    depthPx: D,
    widthPx: W,
  });
  assert.equal(tilt.mat.origin, '50% 100%');
  assert.match(
    tilt.mat.transform,
    /^translateY\(-?[\d.]+px\) perspective\(1400px\) rotateX\(14deg\)$/
  );
  assert.equal(tilt.far.deg, -14);
  assert.equal(tilt.far.shiftPx, -tilt.near.shiftPx);
});

test('playfield transforms are written for zoom 2: halved lengths, pivot round trip, scale(0.5)', () => {
  const tilt = tiltTransforms({
    tiltDeg: 12,
    perspectivePx: P,
    depthPx: D,
    widthPx: W,
  });
  const s = tilt.near.shiftPx;
  assert.equal(tilt.near.origin, '0 0');
  assert.equal(
    tilt.near.transform,
    `translate(200px, ${(D + s) / 2}px) perspective(700px) rotateX(12deg) translate(-200px, -${D / 2}px) scale(0.5)`
  );
  assert.equal(
    tilt.far.transform,
    `translate(200px, ${(-D - s) / 2}px) perspective(700px) rotateX(-12deg) translate(-200px, ${D / 2}px) scale(0.5)`
  );
});

test('unmeasured board: playfields render flat at their zoomed-back size', () => {
  const tilt = tiltTransforms({ tiltDeg: 12, depthPx: D, widthPx: 0 });
  assert.deepEqual(tilt.near, { transform: 'scale(0.5)', origin: '0 0' });
  assert.deepEqual(tilt.far, { transform: 'scale(0.5)', origin: '0 0' });
});

test('the far half, flipped, and the near half both land on the mat plane', () => {
  const tilt = tiltTransforms({
    tiltDeg: 14,
    perspectivePx: P,
    depthPx: D,
    widthPx: W,
  });
  for (const x of [-300, 0, 250]) {
    for (const y of [-2 * D, -1.5 * D, -D - 1]) {
      const far = onScreen.far(tilt, { x, y });
      const mat = onScreen.mat(tilt, { x, y });
      close(far.x, mat.x, `far x at ${x},${y}`);
      close(far.y, mat.y, `far y at ${x},${y}`);
    }
    for (const y of [-D, -D / 2, 0]) {
      assert.deepEqual(
        onScreen.near(tilt, { x, y }),
        onScreen.mat(tilt, { x, y })
      );
    }
  }
});

test('the seam stays on the iframe boundary (no far-half clipping)', () => {
  const tilt = tiltTransforms({
    tiltDeg: 14,
    perspectivePx: P,
    depthPx: D,
    widthPx: W,
  });
  for (const x of [-300, 0, 300]) {
    close(onScreen.near(tilt, { x: 0, y: -D }).y, -D, 'near seam y');
    close(onScreen.far(tilt, { x: 0, y: -D }).y, -D, 'far seam y');
    close(
      onScreen.far(tilt, { x, y: -D }).y,
      onScreen.near(tilt, { x, y: -D }).y,
      'seam agrees'
    );
  }
});

test('the table recedes from the near edge: nothing is magnified, width shrinks upward', () => {
  const tilt = tiltTransforms({
    tiltDeg: 14,
    perspectivePx: P,
    depthPx: D,
    widthPx: W,
  });
  const widthAt = (y) => {
    const plane = y < -D ? onScreen.far : onScreen.near;
    return plane(tilt, { x: 100, y }).x;
  };
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

test('tiltDeg 0 is flat: no seam shift, only the oversampling scale', () => {
  const tilt = tiltTransforms({ tiltDeg: 0, depthPx: D, widthPx: W });
  assert.equal(tilt.near.shiftPx, 0);
  assert.equal(
    tilt.near.transform,
    `translate(200px, ${D / 2}px) perspective(700px) rotateX(0deg) translate(-200px, -${D / 2}px) scale(0.5)`
  );
  assert.equal(
    tilt.mat.transform,
    'translateY(0px) perspective(1400px) rotateX(0deg)'
  );
});

test('stadiumTilt reuses the mat transform with the pivot in the stadium frame', () => {
  const tilt = tiltTransforms({ tiltDeg: 12, perspectivePx: P, depthPx: D, widthPx: W });
  const spec = stadiumTilt({
    matHalf: tilt.mat,
    matBox: { left: 100, top: 40, width: 800, height: 760 },
    stadiumBox: { left: 384, top: 370 },
  });
  assert.equal(spec.transform, tilt.mat.transform);
  // Pivot = bottom centre of the mat box: (100 + 800/2, 40 + 760) = (500, 800).
  assert.equal(spec.origin, `${500 - 384}px ${800 - 370}px`);
});

test('stadiumTilt returns null without a measured board or boxes', () => {
  const tilt = tiltTransforms({ tiltDeg: 12, perspectivePx: P, depthPx: D, widthPx: W });
  assert.equal(stadiumTilt({ matHalf: null, matBox: null, stadiumBox: null }), null);
  assert.equal(
    stadiumTilt({ matHalf: tilt.mat, matBox: null, stadiumBox: { left: 0, top: 0 } }),
    null
  );
  assert.equal(
    stadiumTilt({
      matHalf: tilt.mat,
      matBox: { left: 0, top: 0, width: Number.NaN, height: 100 },
      stadiumBox: { left: 0, top: 0 },
    }),
    null
  );
});

test('battleMatBox spans both playfields and reports the near playfield depth', () => {
  const box = battleMatBox({
    farRect: { top: 0, height: 250 },
    nearRect: { top: 250, height: 250 },
    cropFrac: 0.16,
  });
  close(box.top, 40, 'top', 1e-9);
  close(box.height, 420, 'height', 1e-9);
  close(box.depth, 210, 'depth', 1e-9);
});

test('battleMatBox handles unequal halves (resizer dragged)', () => {
  const box = battleMatBox({
    farRect: { top: 0, height: 200 },
    nearRect: { top: 200, height: 300 },
    cropFrac: 0.1,
  });
  close(box.top, 20, 'top', 1e-9);
  close(box.height, 450, 'height', 1e-9);
  close(box.depth, 270, 'depth', 1e-9);
});

test('battleMatBox returns null for missing or collapsed frames', () => {
  const near = { top: 0, height: 10 };
  assert.equal(
    battleMatBox({ farRect: null, nearRect: near, cropFrac: 0.16 }),
    null
  );
  assert.equal(
    battleMatBox({
      farRect: { top: 0, height: 0 },
      nearRect: near,
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
  assert.deepEqual(box, { top: 0, height: 200, depth: 100 });
});
