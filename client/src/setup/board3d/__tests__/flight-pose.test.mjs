import test from 'node:test';
import assert from 'node:assert/strict';

import { cameraFromCssTilt, cameraTcgLive, projectToScreen } from '../board-camera.mjs';
import { flightPlacement } from '../flight-pose.mjs';

const close = (actual, expected, message, tolerance = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

/** Rotates v by the quaternion [x, y, z, w]. */
function rotate([x, y, z, w], v) {
  const [qx, qy, qz] = [x, y, z];
  const t = [
    2 * (qy * v[2] - qz * v[1]),
    2 * (qz * v[0] - qx * v[2]),
    2 * (qx * v[1] - qy * v[0]),
  ];
  return [
    v[0] + w * t[0] + (qy * t[2] - qz * t[1]),
    v[1] + w * t[1] + (qz * t[0] - qx * t[2]),
    v[2] + w * t[2] + (qx * t[1] - qy * t[0]),
  ];
}

const CARD = { widthPx: 60, heightPx: (60 * 8.9) / 6.397 };
const RECT = { left: 700, top: 400, width: 120, height: 168 };
const origin = { left: 10, top: 20 };

/** Screen px of a point `local` on the placed card (mesh-local, before scale). */
function screenOf(camera, placement, local) {
  const turned = rotate(placement.quaternion, local.map((n) => n * placement.scale));
  const world = turned.map((n, i) => n + placement.position[i]);
  return projectToScreen(camera, world);
}

for (const broadcast of [false, true]) {
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080, broadcast });

  test(`flightPlacement centres the card on the rect and matches its height (broadcast=${broadcast})`, () => {
    for (const lift of [0, 20, 50]) {
      const placement = flightPlacement(camera, { rect: RECT, lift }, CARD, origin);
      assert.ok(placement);
      const centre = screenOf(camera, placement, [0, 0, 0]);
      close(centre.x, RECT.left + RECT.width / 2 - origin.left, `centre x (lift ${lift})`);
      close(centre.y, RECT.top + RECT.height / 2 - origin.top, `centre y (lift ${lift})`);
      const a = screenOf(camera, placement, [0, CARD.heightPx / 2, 0]);
      const b = screenOf(camera, placement, [0, -CARD.heightPx / 2, 0]);
      close(Math.hypot(a.x - b.x, a.y - b.y), RECT.height, `projected height (lift ${lift})`);
    }
  });

  test(`flightPlacement turns the card clockwise on screen with rotateZDeg (broadcast=${broadcast})`, () => {
    const upright = flightPlacement(camera, { rect: RECT, lift: 30 }, CARD, origin);
    const top = (placement) => screenOf(camera, placement, [0, CARD.heightPx / 2, 0]);
    const centre = screenOf(camera, upright, [0, 0, 0]);
    const t0 = top(upright);
    assert.ok(t0.y < centre.y - 20 && Math.abs(t0.x - centre.x) < 1, 'unturned: top edge is up the screen');

    const upsideDown = flightPlacement(camera, { rect: RECT, lift: 30, rotateZDeg: 180 }, CARD, origin);
    const t180 = top(upsideDown);
    assert.ok(t180.y > centre.y + 20 && Math.abs(t180.x - centre.x) < 1, 'turned 180: top edge is down');

    const quarter = flightPlacement(camera, { rect: RECT, lift: 30, rotateZDeg: 90 }, CARD, origin);
    const t90 = top(quarter);
    assert.ok(t90.x > centre.x + 20 && Math.abs(t90.y - centre.y) < 6, 'turned 90 clockwise: top edge is to the right');
  });
}

test('flightPlacement: tiltXDeg leans the top edge away, flipDeg shows the back', () => {
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
  const flat = flightPlacement(camera, { rect: RECT, lift: 40 }, CARD, origin);
  const leaned = flightPlacement(camera, { rect: RECT, lift: 40, tiltXDeg: 30 }, CARD, origin);
  const depthOf = (placement) => rotate(placement.quaternion, [0, 1, 0])[2];
  assert.ok(depthOf(leaned) < depthOf(flat) - 0.2, 'top edge moves away from the viewer (smaller z)');

  const faceNormal = (placement) => rotate(placement.quaternion, [0, 0, 1]);
  const flipped = flightPlacement(camera, { rect: RECT, lift: 40, flipDeg: 180 }, CARD, origin);
  assert.ok(faceNormal(flat)[2] > 0.9, 'front cap faces the viewer');
  assert.ok(faceNormal(flipped)[2] < -0.9, 'flipped: the front cap faces away');
});

test('flightPlacement: unusable input gives null', () => {
  const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
  assert.equal(flightPlacement(camera, { rect: { left: 0, top: 0, width: 0, height: 10 } }, CARD), null);
  assert.equal(flightPlacement(camera, {}, CARD), null);
  assert.equal(flightPlacement(null, { rect: RECT }, CARD), null);
  assert.equal(flightPlacement(camera, { rect: RECT }, { widthPx: 0, heightPx: 0 }), null);
  // A plane above the eye is never hit.
  assert.equal(flightPlacement(camera, { rect: RECT, lift: 5000 }, CARD), null);
});

test('flightPoseFromTrack: px offsets from the rect centre become a rect, lift rises and settles', async () => {
  const { flightPoseFromTrack } = await import('../flight-pose.mjs');
  const rect = { left: 100, top: 200, width: 60, height: 84 };
  const track = { x: 40, y: -10, scale: 2, rotate: 30, tiltX: 12, flip: 90, opacity: 0.2 };
  const pose = flightPoseFromTrack(rect, track, 0.5, 30);
  assert.deepEqual(pose.rect, { left: 100 + 30 + 40 - 60, top: 200 + 42 - 10 - 84, width: 120, height: 168 });
  assert.equal(pose.rotateZDeg, 30);
  assert.equal(pose.tiltXDeg, 12);
  assert.equal(pose.flipDeg, 90);
  assert.equal(pose.lift, 30);
  assert.equal('opacity' in pose, false);

  assert.equal(flightPoseFromTrack(rect, track, 0, 30).lift, 0);
  assert.equal(flightPoseFromTrack(rect, track, 1, 30).lift, 0);
  const early = flightPoseFromTrack(rect, track, 0.075, 30).lift;
  assert.ok(early > 0 && early < 30, `ramps: ${early}`);
  assert.equal('flipDeg' in flightPoseFromTrack(rect, { x: 0, y: 0, rotate: 0, tiltX: 0, scale: 1 }, 0.5, 30), false);
  // Missing numbers fall back to an unmoved, unturned card.
  const bare = flightPoseFromTrack(rect, {}, 0.5, 0);
  assert.deepEqual(bare.rect, rect);
  assert.equal(bare.rotateZDeg, 0);
});

test("fit 'leaned': a card faced square-on covers the rect with its front face", () => {
  for (const tcgl of [false, true]) {
    const params = { viewportW: 1920, viewportH: 1080 };
    const camera = tcgl ? cameraTcgLive(params) : cameraFromCssTilt(params);
    const tiltDeg = camera.tiltDeg;
    const rect = { left: 300, top: 60, width: (588 * 6.397) / 8.9, height: 588 };
    const thickness = 1.2;
    const placement = flightPlacement(
      camera,
      { rect, tiltXDeg: -tiltDeg, lift: 180, fit: 'leaned' },
      { ...CARD, thicknessPx: thickness }
    );
    assert.ok(placement);
    const front = (x, y) => screenOf(camera, placement, [x, y, thickness / 2]);
    const [bottomLeft, topRight] = [
      front(-CARD.widthPx / 2, -CARD.heightPx / 2),
      front(CARD.widthPx / 2, CARD.heightPx / 2),
    ];
    close(bottomLeft.x, rect.left, 'left', 0.05);
    close(topRight.y, rect.top, 'top', 0.05);
    close(topRight.x, rect.left + rect.width, 'right', 0.05);
    close(bottomLeft.y, rect.top + rect.height, 'bottom', 0.05);
  }
});
