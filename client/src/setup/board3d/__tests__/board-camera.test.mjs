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

// Design 074 H3: the TCG Live camera.
import { cameraTcgLive } from '../board-camera.mjs';

const TCGL_VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 800, h: 1000 },
  { w: 600, h: 1200 },
];

test('both camera presets put the seam centre on the viewport middle line', () => {
  for (const { w, h } of TCGL_VIEWPORTS) {
    const seam = { x: 0, y: h * 0.5 * 0.84 };
    const tilted = cameraFromCssTilt({ viewportW: w, viewportH: h });
    const topDown = cameraTcgLive({ viewportW: w, viewportH: h });
    const atTilted = projectToScreen(tilted, tableToWorld(seam, tilted));
    const atTopDown = projectToScreen(topDown, tableToWorld(seam, topDown));
    // The 12° table sits in the iframe's 75.5% column (index.css:186), so only y is the middle.
    close(atTilted.x, (w * 0.755) / 2, `${w}x${h} tilt12 x`, 1);
    close(atTilted.y, h / 2, `${w}x${h} tilt12 y`, 1);
    close(atTopDown.x, w / 2, `${w}x${h} tcgl x`, 1);
    close(atTopDown.y, h / 2, `${w}x${h} tcgl y`, 1);
  }
});

test('cameraTcgLive is a straight-down fov-20 pose with no perspective skew between the halves', () => {
  for (const { w, h } of TCGL_VIEWPORTS) {
    const camera = cameraTcgLive({ viewportW: w, viewportH: h });
    const D = h * 0.5 * 0.84;
    assert.equal(camera.fov, 20);
    assert.equal(camera.tiltDeg, 0);
    assert.deepEqual(camera.up, [0, 1, 0]);
    const at = (point) => projectToScreen(camera, tableToWorld(point, camera));
    const d = 300;
    const far = at({ x: 0, y: D + d });
    const near = at({ x: 0, y: D - d });
    const centre = at({ x: 0, y: D });
    close(centre.y - far.y, near.y - centre.y, `${w}x${h} far/near distance from the centre`, 1e-6);
    // A card's height 130 px up the far half and down the near half projects to the same size.
    const cardHeight = (y) => at({ x: 0, y }).y - at({ x: 0, y: y + 100 }).y;
    const farHeight = cardHeight(D + d);
    const nearHeight = cardHeight(D - d - 100);
    assert.ok(Math.abs(farHeight - nearHeight) / nearHeight < 0.005, `${w}x${h} ${farHeight} vs ${nearHeight}`);
  }
});

test('cameraTcgLive shows the whole table (both playfields and hand strips) and reports the fit', () => {
  for (const { w, h } of TCGL_VIEWPORTS) {
    const camera = cameraTcgLive({ viewportW: w, viewportH: h });
    const half = { w: w * 0.755, h: h * 0.5 };
    const edgeY = 2 * half.h * 0.84 + half.h * 0.16;
    const at = (point) => projectToScreen(camera, tableToWorld(point, camera));
    const farCorner = at({ x: -half.w / 2, y: edgeY });
    const nearCorner = at({ x: half.w / 2, y: -half.h * 0.16 });
    assert.ok(farCorner.y >= -1e-6 && farCorner.x >= 0, `${w}x${h} far corner on screen`);
    assert.ok(nearCorner.y <= h + 1e-6 && nearCorner.x <= w, `${w}x${h} near corner on screen`);
    assert.ok(camera.distanceScale >= 1);
  }
});

test('cameraTcgLive keeps TCG Live scale (183 units per 8.9-unit card) when the table already fits', () => {
  // A small card makes 183 × cardH / 8.9 shorter than the fit distance: the fit wins and is reported.
  const fitted = cameraTcgLive({ viewportW: 1920, viewportH: 1080, cardHeightPx: 100 });
  assert.ok(fitted.distanceScale > 1);
  // A large card pushes the eye past the fit: the nominal distance is kept as is.
  const big = cameraTcgLive({ viewportW: 1920, viewportH: 1080, cardHeightPx: 200 });
  close(big.position[2], 183 * (200 / 8.9), 'nominal distance', 1e-6);
  assert.equal(big.distanceScale, 1);
  // The default card size is the sim profile's: 145.152 px at 1080 tall.
  const dflt = cameraTcgLive({ viewportW: 1920, viewportH: 1080 });
  const explicit = cameraTcgLive({ viewportW: 1920, viewportH: 1080, cardHeightPx: 145.152 });
  close(dflt.position[2], explicit.position[2], 'default card height', 1e-6);
});

test('screenToPlane inverts projectToScreen on the cloth and on lifted planes', async () => {
  const { screenToPlane } = await import('../board-camera.mjs');
  for (const broadcast of [false, true]) {
    const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080, broadcast });
    for (const planeZ of [0, 1.5, 60, 140]) {
      for (const [x, y] of [[960, 540], [100, 900], [1800, 120], [400, 300]]) {
        const world = screenToPlane(camera, { x, y }, planeZ);
        assert.ok(world, `hit at ${x},${y} z=${planeZ}`);
        const back = projectToScreen(camera, [world.x, world.y, world.z]);
        close(back.x, x, `x (z=${planeZ}, broadcast=${broadcast})`, 1e-6);
        close(back.y, y, `y (z=${planeZ}, broadcast=${broadcast})`, 1e-6);
        // The hit lies on the plane: undoing tableToWorld's tilt leaves height planeZ.
        const rad = (camera.tiltDeg * Math.PI) / 180;
        close(world.y * Math.sin(rad) + world.z * Math.cos(rad), planeZ, 'plane height', 1e-6);
      }
    }
  }
});

test('screenToPlane is null for a ray that never meets the plane in front of the eye', async () => {
  const { screenToPlane } = await import('../board-camera.mjs');
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
  // The eye is P above the cloth: a plane above the eye is behind every ray.
  assert.equal(screenToPlane(camera, { x: 960, y: 540 }, P + 500), null);
});
