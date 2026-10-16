import test from 'node:test';
import assert from 'node:assert/strict';

import { projectFromPivot, seamShiftPx } from '../../sizing/table-tilt.mjs';
import { cameraFromCssTilt, projectToScreen, tableToWorld } from '../board-camera.mjs';

const close = (actual, expected, message, tolerance = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

const TILT = 12;
const P = 1400;

/**
 * Today's screen position of a flat table point (y up the table): the near
 * iframe is 75.5vw × 50vh at the bottom-left, the pivot sits one 16% hand strip
 * above its bottom edge, and every plane is translateY(shift) perspective(p)
 * rotateX(a) about it (table-tilt.mjs, apply-table-tilt.js).
 */
function cssScreen({ x, y }, viewport) {
  const half = { w: viewport.w * 0.755, h: viewport.h * 0.5 };
  const depthPx = half.h * 0.84;
  const pivot = { x: half.w / 2, y: viewport.h - half.h * 0.16 };
  const shift = seamShiftPx({ tiltDeg: TILT, perspectivePx: P, depthPx });
  const projected = projectFromPivot({ x, y: -y }, { deg: TILT, perspectivePx: P });
  return { x: pivot.x + projected.x, y: pivot.y + projected.y + shift };
}

function cornerPoints(viewport) {
  const w = viewport.w * 0.755;
  const D = viewport.h * 0.5 * 0.84;
  return {
    pivot: { x: 0, y: 0 },
    nearLeft: { x: -w / 2, y: 0 },
    nearRight: { x: w / 2, y: 0 },
    seamLeft: { x: -w / 2, y: D },
    seamCentre: { x: 0, y: D },
    seamRight: { x: w / 2, y: D },
    farLeft: { x: -w / 2, y: 2 * D },
    farRight: { x: w / 2, y: 2 * D },
  };
}

for (const viewport of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }]) {
  test(`camera reproduces the CSS tilt at ${viewport.w}×${viewport.h}`, () => {
    const camera = cameraFromCssTilt({
      viewportW: viewport.w,
      viewportH: viewport.h,
      tiltDeg: TILT,
      perspectivePx: P,
    });
    for (const [name, point] of Object.entries(cornerPoints(viewport))) {
      const actual = projectToScreen(camera, tableToWorld(point, { tiltDeg: TILT }));
      const expected = cssScreen(point, viewport);
      close(actual.x, expected.x, `${name}.x`);
      close(actual.y, expected.y, `${name}.y`);
    }
    // The seam shift lands the seam on the iframe boundary (50vh).
    const seam = projectToScreen(camera, tableToWorld(cornerPoints(viewport).seamCentre, camera));
    close(seam.y, viewport.h / 2, 'seam on the iframe boundary');
  });
}

test('fov is 2·atan((H/2)/p); aspect and view offset are the viewport', () => {
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080, tiltDeg: TILT, perspectivePx: P });
  const fov = (2 * Math.atan(540 / P) * 180) / Math.PI;
  assert.ok(Math.abs(camera.fov - fov) < 1e-9, `${camera.fov} vs ${fov}`);
  close(camera.aspect, 1920 / 1080, 'aspect', 1e-12);
  assert.deepEqual(camera.position, [0, 0, P]);
  assert.deepEqual(camera.target, [0, 0, 0]);
  assert.deepEqual(camera.up, [0, 1, 0]);
  const { viewOffset, principalPoint } = camera;
  assert.equal(viewOffset.fullWidth, 1920);
  assert.equal(viewOffset.height, 1080);
  close(viewOffset.x, 960 - principalPoint.x, 'offset x', 1e-9);
  close(viewOffset.y, 540 - principalPoint.y, 'offset y', 1e-9);
  // Pivot: centre of the near iframe's bottom edge, one hand strip up, plus the shift.
  close(principalPoint.x, 724.8, 'pivot x', 1e-9);
  close(principalPoint.y, 993.6 + camera.shiftPx, 'pivot y', 1e-9);
  assert.ok(camera.near > 0 && camera.far > P * 2);
});

test('tableToWorld lifts the far edge away from the viewer and keeps height on the normal', () => {
  const [x, y, z] = tableToWorld({ x: 10, y: 100 }, { tiltDeg: TILT });
  assert.equal(x, 10);
  close(y, 100 * Math.cos((TILT * Math.PI) / 180), 'y', 1e-9);
  close(z, -100 * Math.sin((TILT * Math.PI) / 180), 'z', 1e-9);
  const lifted = tableToWorld({ x: 0, y: 0, z: 5 }, { tiltDeg: 0 });
  assert.deepEqual(lifted, [0, 0, 5]);
});

test('broadcast turns the table 90°: near hand on the left, far edge on the right', () => {
  const viewport = { w: 1920, h: 1080 };
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080, broadcast: true });
  assert.equal(camera.tiltDeg, 0);
  const points = cornerPoints(viewport);
  const at = (name) => projectToScreen(camera, tableToWorld(points[name], camera));
  // --bc-scale = min(1, 1080 / 1449.6, 1449.6 / 1080) = 0.745 (3 dp, apply-table-tilt.js:115).
  const s = 0.745;
  // #selfContainer: left -25vh·s, 1449.6 wide → centre x 724.8 - 270s; the pivot is
  // (270 - 86.4)·s left of it after the clockwise turn; y is the screen's middle.
  const pivot = at('pivot');
  close(pivot.x, 724.8 - 270 * s - 183.6 * s, 'pivot x');
  close(pivot.y, 540, 'pivot y');
  // Seam at x = boardW / 2 (the stadium's broadcast left, index.css:6463-6466).
  close(at('seamCentre').x, 724.8, 'seam x');
  close(at('seamLeft').x, 724.8, 'seam left x');
  // Flat +x (the near player's right) turns to screen down; +y (up the table) to the right.
  const nearRight = at('nearRight');
  close(nearRight.x, pivot.x, 'near-right x');
  close(nearRight.y, 540 + (1449.6 / 2) * s, 'near-right y');
  assert.ok(at('farRight').x > at('seamRight').x && at('seamRight').x > nearRight.x);
  close(at('farLeft').x - pivot.x, 2 * 453.6 * s, 'far edge distance');
});

test('projectToScreen returns null behind the eye', () => {
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
  assert.equal(projectToScreen(camera, [0, 0, P + 10]), null);
});
