import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOX_MOUTH_Y,
  BULGE,
  BODY_INSET_U,
  CAMERA_DISTANCE,
  CAMERA_FOV_DEG,
  CARDS_FROM_V,
  CARDS_TO_V,
  FLY_FROM_WIDTH,
  FLY_SPIN_Y_DEG,
  PACK_DROP_ROTATE_X_DEG,
  PEEL_MAX_DEG,
  SEAL_BOTTOM_V,
  SEAL_TOP_V,
  SPREAD_SIDE_ROTATE_Y_DEG,
  SPREAD_SIDE_Z,
  TILT_MAX_X_DEG,
  TILT_MAX_Y_DEG,
  DEFAULT_PACK_SHAPE,
  REFLECTION_FADE,
  REFLECTION_GAP_VH,
  cardsEmergePose,
  reflectionFloor,
  packShape,
  packShapeKey,
  followTilt,
  packDropPose,
  packFlyParams,
  packFlyPose3d,
  packPlacement,
  packSpreadSlot3d,
  packTearLine,
  peelAngleDeg,
  peelSide,
  peelVertex,
  pillowZ,
  rectToWorld,
  ripTicksCrossed,
  smoothstep,
  stripFlightPose,
  swayPose,
  tearHingeV,
  tiltTarget,
  worldPerPixel,
  PACK_ASPECT,
  PACK_DROP_BRIGHTNESS,
  grabLevelPose,
  linearBrightness,
  packSpaceY,
  stackSettlePose,
  tearFarEnd,
  tearProgressPose,
} from '../pack3d.mjs';
import { packFlyPose, packSpreadSlot, packTearEdge } from '../unboxing.mjs';

const close = (actual, expected, epsilon = 1e-9, message) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    message || `${actual} ≉ ${expected}`
  );

test('smoothstep clamps and eases between its edges', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  close(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 0, 0), 1, 'a zero-width step is a hard edge');
});

test('pillowZ is flat on both seals and outside the body columns', () => {
  for (const u of [0, 0.3, 0.5, 1]) {
    assert.equal(pillowZ(u, 0), 0);
    assert.equal(pillowZ(u, SEAL_TOP_V - 1e-6), 0);
    assert.equal(pillowZ(u, SEAL_BOTTOM_V + 1e-6), 0);
    assert.equal(pillowZ(u, 1), 0);
  }
  for (const v of [0.3, 0.5, 0.8]) {
    assert.equal(pillowZ(BODY_INSET_U / 2, v), 0);
    assert.equal(pillowZ(1 - BODY_INSET_U / 2, v), 0);
  }
  assert.equal(pillowZ(Number.NaN, 0.5), 0);
});

test('pillowZ peaks at BULGE in the body centre and is symmetric across', () => {
  close(pillowZ(0.5, 0.5), BULGE);
  for (const u of [0.1, 0.25, 0.4])
    close(pillowZ(u, 0.5), pillowZ(1 - u, 0.5), 1e-12);
  assert.ok(pillowZ(0.25, 0.5) < BULGE && pillowZ(0.25, 0.5) > 0);
  assert.ok(
    pillowZ(0.5, SEAL_TOP_V + 0.01) < pillowZ(0.5, SEAL_TOP_V + 0.05),
    'ramps up off the seal'
  );
});

test('pillowZ follows a measured pack shape; a bad or missing shape falls back to the default', () => {
  const shape = { sealTopV: 0.06, sealBottomV: 0.95, bodyInsetU: 0.01 };
  assert.ok(pillowZ(0.5, 0.08, shape) > 0, 'bulges below a thinner top seal');
  assert.equal(pillowZ(0.5, 0.08), 0, 'the default seal is still flat there');
  assert.equal(pillowZ(0.5, 0.96, shape), 0);
  close(pillowZ(0.5, 0.5, shape), BULGE);
  assert.deepEqual(packShape(null), DEFAULT_PACK_SHAPE);
  assert.deepEqual(packShape({ sealTopV: 0.7, sealBottomV: 0.9, bodyInsetU: 0.02 }), DEFAULT_PACK_SHAPE);
  assert.equal(packShapeKey(null), packShapeKey(DEFAULT_PACK_SHAPE));
  assert.notEqual(packShapeKey(shape), packShapeKey(null));
});

test('packTearLine is packTearEdge point for point, left to right, in 0..1', () => {
  for (const seed of [1, 18, 42, 999]) {
    for (let packIndex = 0; packIndex < 4; packIndex += 1) {
      const fromEdge = packTearEdge(seed, packIndex)
        .slice('polygon('.length, -1)
        .split(', ')
        .slice(2)
        .map((point) =>
          point.split(' ').map((value) => Number.parseFloat(value) / 100)
        )
        .reverse();
      const line = packTearLine(seed, packIndex);
      assert.equal(line.length, fromEdge.length);
      line.forEach((point, index) => {
        close(point.x, fromEdge[index][0], 5e-5);
        close(point.y, fromEdge[index][1], 5e-5);
      });
      assert.equal(line[0].x, 0);
      assert.equal(line.at(-1).x, 1);
    }
  }
});

test('packTearEdge keeps its seeded output (the numeric line is shared, not changed)', () => {
  assert.ok(
    packTearEdge(42, 0).startsWith(
      'polygon(0% 0%, 100% 0%, 100% 7%, 95.83% 11.36%, 91.67% 7%, 87.5% 9.88%, 83.33% 7%, 79.17% 10.75%'
    )
  );
});

test('tearHingeV is the mean depth of the line, inside the teeth band', () => {
  const hinge = tearHingeV(packTearLine(42, 0));
  assert.ok(hinge > 0.07 && hinge < 0.12, `${hinge}`);
  assert.equal(tearHingeV([]), 0);
  close(
    tearHingeV([
      { x: 0, y: 0.1 },
      { x: 1, y: 0.2 },
    ]),
    0.15
  );
});

test('peelSide: a press in the left half tears left → right', () => {
  const rect = { left: 100, top: 0, width: 200, height: 50 };
  assert.equal(peelSide(120, rect), 1);
  assert.equal(peelSide(250, rect), -1);
  assert.equal(peelSide(Number.NaN, rect), 1);
  assert.equal(peelSide(120, { left: 0, top: 0, width: 0, height: 0 }), 1);
});

test('peelAngleDeg: flat before the drag, fully folded at the end, monotonic, mirrored by side', () => {
  for (const u of [0, 0.3, 0.7, 1]) {
    assert.equal(peelAngleDeg(u, 0, 1), 0);
    assert.equal(peelAngleDeg(u, 1, 1), PEEL_MAX_DEG);
    assert.equal(peelAngleDeg(u, 1, -1), PEEL_MAX_DEG);
  }
  let previous = -1;
  for (let step = 0; step <= 20; step += 1) {
    const angle = peelAngleDeg(0.4, step / 20, 1);
    assert.ok(angle >= previous);
    previous = angle;
  }
  assert.ok(
    peelAngleDeg(0.1, 0.4, 1) > peelAngleDeg(0.9, 0.4, 1),
    'the start side folds first'
  );
  close(peelAngleDeg(0.2, 0.4, 1), peelAngleDeg(0.8, 0.4, -1), 1e-12);
});

test('peelVertex: identity at 0°, hinge fixed, 90° lays the strip toward the camera', () => {
  assert.deepEqual(
    peelVertex({ y: 1.2, z: 0.01 }, { hingeY: 1, angleDeg: 0 }),
    { y: 1.2, z: 0.01 }
  );
  const onHinge = peelVertex({ y: 1, z: 0 }, { hingeY: 1, angleDeg: 120 });
  close(onHinge.y, 1);
  close(onHinge.z, 0);
  const d = 0.001;
  const folded = peelVertex({ y: 1 + d, z: 0 }, { hingeY: 1, angleDeg: 90 });
  close(folded.y, 1, 1e-6);
  close(folded.z, d, 1e-6);
  const high = peelVertex({ y: 1.2, z: 0 }, { hingeY: 1, angleDeg: 90 });
  assert.ok(
    high.z > 0.19 && high.y < 1,
    'points above the hinge curl a little past 90°'
  );
});

test('stripFlightPose starts where it tore, falls below, and fades out', () => {
  const start = stripFlightPose(0, { side: 1 });
  assert.deepEqual(
    [
      start.x,
      start.y,
      start.z,
      start.rotX,
      start.rotY,
      start.rotZ,
      start.opacity,
    ],
    [0, 0, 0, -0, 0, 0, 1]
  );
  const end = stripFlightPose(1, { side: 1 });
  assert.equal(end.opacity, 0);
  assert.ok(end.y < 0 && end.x > 0 && end.z > 0);
  const mirrored = stripFlightPose(1, { side: -1 });
  close(mirrored.x, -end.x);
  close(mirrored.rotZ, -end.rotZ);
  assert.equal(stripFlightPose(0.5).opacity, 1, 'opaque until STRIP_FADE_FROM');
});

test('cardsEmergePose and packDropPose endpoints', () => {
  close(cardsEmergePose(0).v, CARDS_FROM_V);
  close(cardsEmergePose(1).v, CARDS_TO_V);
  const start = packDropPose(0, { viewportWorldH: 3 });
  close(start.y, 0);
  close(start.rotateXDeg, 0);
  const end = packDropPose(1, { viewportWorldH: 3 });
  close(end.y, -4.2);
  close(end.rotateXDeg, PACK_DROP_ROTATE_X_DEG);
  close(packDropPose(1, { viewportWorldH: Number.NaN }).y, 0);
});

test('packFlyPose3d keeps every packFlyPose field and turns −180° → 0°', () => {
  const params = { dxPx: -120, dyPx: 80, fromScale: 0.3 };
  for (const t of [0, 0.4, 1]) {
    const pose = packFlyPose3d(t, params);
    for (const [key, value] of Object.entries(packFlyPose(t, params)))
      assert.equal(pose[key], value);
  }
  assert.equal(packFlyPose3d(0, params).rotateYDeg, FLY_SPIN_Y_DEG);
  assert.equal(packFlyPose3d(1, params).rotateYDeg, 0);
});

test('packSpreadSlot3d: the focus pack sits at the front, the queue sits back and turns in', () => {
  const focus = packSpreadSlot3d(1, 1, 300);
  assert.deepEqual(focus, {
    ...packSpreadSlot(1, 1, 300),
    zWorld: 0,
    rotateYDeg: 0,
  });
  const side = packSpreadSlot3d(3, 1, 300);
  assert.equal(side.zWorld, SPREAD_SIDE_Z);
  assert.equal(side.rotateYDeg, SPREAD_SIDE_ROTATE_Y_DEG);
  assert.equal(side.xPx, packSpreadSlot(3, 1, 300).xPx);
});

test('swayPose is bounded, seeded by the pack index, and still for a bad clock', () => {
  assert.deepEqual(swayPose(Number.NaN, 0), {
    rotateYDeg: 0,
    rotateXDeg: 0,
    bob: 0,
  });
  for (let time = 0; time < 9000; time += 250) {
    const pose = swayPose(time, 2);
    assert.ok(Math.abs(pose.rotateYDeg) <= 4 && Math.abs(pose.rotateXDeg) <= 2);
  }
  assert.notEqual(swayPose(1000, 0).rotateYDeg, swayPose(1000, 1).rotateYDeg);
});

test('tiltTarget turns the face toward the pointer and clamps outside the pack', () => {
  const rect = { left: 0, top: 0, width: 200, height: 400 };
  assert.deepEqual(tiltTarget({ x: 100, y: 200 }, rect), {
    rotateYDeg: 0,
    rotateXDeg: -0,
  });
  assert.deepEqual(tiltTarget({ x: 900, y: -900 }, rect), {
    rotateYDeg: TILT_MAX_Y_DEG,
    rotateXDeg: -TILT_MAX_X_DEG,
  });
  assert.deepEqual(tiltTarget(null, rect), { rotateYDeg: 0, rotateXDeg: 0 });
});

test('followTilt converges on the target and ignores a zero or negative frame', () => {
  const current = { rotateYDeg: 0, rotateXDeg: 0 };
  const target = { rotateYDeg: 10, rotateXDeg: -5 };
  assert.equal(followTilt(current, target, 0), current);
  assert.equal(followTilt(current, target, -16), current);
  let tilt = current;
  for (let frame = 0; frame < 120; frame += 1)
    tilt = followTilt(tilt, target, 16);
  close(tilt.rotateYDeg, 10, 1e-3);
  close(tilt.rotateXDeg, -5, 1e-3);
});

test('worldPerPixel × viewport height is the visible height at the z = 0 plane', () => {
  const visible =
    2 * CAMERA_DISTANCE * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  close(worldPerPixel(900) * 900, visible);
  assert.equal(worldPerPixel(0), 0);
});

test('rectToWorld maps the viewport centre to the origin, y up', () => {
  const viewport = { width: 1600, height: 900 };
  const centred = rectToWorld(
    { left: 700, top: 350, width: 200, height: 200 },
    viewport
  );
  close(centred.x, 0);
  close(centred.y, 0);
  close(centred.width, 200 * worldPerPixel(900));
  const upperLeft = rectToWorld(
    { left: 0, top: 0, width: 100, height: 100 },
    viewport
  );
  assert.ok(upperLeft.x < 0 && upperLeft.y > 0);
  assert.equal(
    rectToWorld({ left: 0, top: 0, width: 0, height: 10 }, viewport),
    null
  );
  assert.equal(
    rectToWorld(
      { left: 0, top: 0, width: 10, height: 10 },
      { width: 0, height: 0 }
    ),
    null
  );
});

test('reflectionFloor sits a gap below the object and fades over a share of its height', () => {
  const floor = reflectionFloor({ left: 100, top: 200, width: 300, height: 500 }, 1000);
  close(floor.y, 200 + 500 + (REFLECTION_GAP_VH / 100) * 1000);
  close(floor.fade, 500 * REFLECTION_FADE);
  assert.ok(floor.x0 < 100 && floor.x1 > 400, 'the column is a little wider than the object');
  close(floor.x0 + floor.x1, 2 * 250, 1e-9, 'centred on it');
  assert.equal(reflectionFloor({ left: 0, top: 0, width: 0, height: 10 }, 1000), null);
  assert.equal(reflectionFloor({ left: 0, top: 0, width: 10, height: 10 }, 0), null);
});

test('ripTicksCrossed counts whole 10 % marks crossed going up', () => {
  assert.equal(ripTicksCrossed(0.05, 0.31), 3);
  assert.equal(ripTicksCrossed(0.3, 0.2), 0);
  assert.equal(
    ripTicksCrossed(0.2, 0.3),
    1,
    '0.3 / 0.1 must not round down to 2'
  );
  assert.equal(ripTicksCrossed(0, 1), 10);
  assert.equal(ripTicksCrossed(Number.NaN, 0.5), 5);
});

test('packFlyParams starts the pack at the box mouth, in the slot’s own pixels', () => {
  const box = { left: 100, top: 50, width: 200, height: 300 };
  const anchor = { left: 500, top: 200, width: 100, height: 180 };
  const params = packFlyParams(box, anchor);
  close(params.dxPx, 100 + 100 - 550);
  close(params.dyPx, 50 + 300 * BOX_MOUTH_Y - 290);
  close(params.fromScale, (200 * FLY_FROM_WIDTH) / 100);
  const scaled = packFlyParams(box, anchor, 0.5);
  close(
    scaled.dxPx,
    params.dxPx / 0.5,
    1e-9,
    'offsets divide by the slot scale'
  );
  close(
    scaled.fromScale,
    params.fromScale,
    1e-9,
    'the start size is already relative to the rect'
  );
  const pose = packFlyPose(0, params);
  close(
    anchor.left + anchor.width / 2 + pose.translateXPx,
    box.left + box.width / 2
  );
  assert.equal(packFlyParams(null, anchor), null);
  assert.equal(
    packFlyParams(box, { left: 0, top: 0, width: 0, height: 0 }),
    null
  );
  assert.deepEqual(
    packFlyParams(box, anchor, 0),
    params,
    'a bad slot scale counts as 1'
  );
});

test('packPlacement puts a pack at rest on its home, sized by the rect width', () => {
  const home = { x: 0.3, y: -0.2, width: 0.9, height: 1.6 };
  const rest = packPlacement({
    home,
    slot: packSpreadSlot3d(0, 0, 200),
    worldPerPx: 0.004,
  });
  assert.deepEqual(rest, {
    x: 0.3,
    y: -0.2,
    z: 0,
    rotateXDeg: 0,
    rotateYDeg: 0,
    rotateZDeg: -0,
    scale: 0.9,
  });
  const side = packPlacement({
    home,
    slot: packSpreadSlot3d(2, 0, 200),
    worldPerPx: 0.004,
  });
  assert.equal(side.z, SPREAD_SIDE_Z);
  assert.equal(side.rotateYDeg, SPREAD_SIDE_ROTATE_Y_DEG);
  assert.equal(packPlacement({ home: null }), null);
  assert.equal(packPlacement({ home: { ...home, width: 0 } }), null);
});

test('packPlacement adds sway, tilt and the flight (CSS y down, clockwise) in world terms', () => {
  const home = { x: 0, y: 0, width: 1, height: 1.8 };
  const placed = packPlacement({
    home,
    slot: { zWorld: 0, rotateYDeg: 0 },
    sway: { rotateYDeg: 2, rotateXDeg: 1, bob: 0.01 },
    tilt: { rotateYDeg: 5, rotateXDeg: -3 },
    fly: {
      translateXPx: 100,
      translateYPx: 50,
      rotateZDeg: -24,
      scale: 0.5,
      rotateYDeg: -180,
    },
    worldPerPx: 0.01,
  });
  close(placed.x, 1);
  close(
    placed.y,
    -0.5 + 0.01 * 0.5,
    1e-9,
    'a flight down the screen is down in world y'
  );
  close(placed.scale, 0.5);
  close(placed.rotateYDeg, 2 + 5 - 180);
  close(placed.rotateXDeg, -2);
  close(
    placed.rotateZDeg,
    24,
    1e-9,
    'a counter-clockwise CSS turn is a positive world z turn'
  );
  const landed = packPlacement({
    home,
    fly: packFlyPose3d(
      1,
      packFlyParams(
        { left: 0, top: 0, width: 200, height: 300 },
        { left: 400, top: 300, width: 100, height: 180 }
      )
    ),
    worldPerPx: 0.01,
  });
  close(landed.x, 0);
  close(landed.y, 0);
  close(landed.scale, 1);
  close(landed.rotateYDeg, 0);
  close(landed.rotateZDeg, 0);
});

test('cardsEmergePose also gives the stack centre in pack space', () => {
  for (const t of [0, 0.5, 1]) {
    const pose = cardsEmergePose(t);
    close(pose.y, pose.v * PACK_ASPECT);
  }
});

test('packSpaceY maps art rows to pack space: top edge up, bottom edge down', () => {
  close(packSpaceY(0), PACK_ASPECT / 2);
  close(packSpaceY(0.5), 0);
  close(packSpaceY(1), -PACK_ASPECT / 2);
  close(packSpaceY(Number.NaN), PACK_ASPECT / 2);
});

test('tearFarEnd is the end of the tear line the peel runs toward', () => {
  const line = packTearLine(42, 0);
  const right = tearFarEnd(line, 1);
  assert.equal(right.x, 0.5);
  close(right.y, packSpaceY(line.at(-1).y));
  const left = tearFarEnd(line, -1);
  assert.equal(left.x, -0.5);
  close(left.y, packSpaceY(line[0].y));
  assert.deepEqual(tearFarEnd([], 1), { x: 0.5, y: packSpaceY(0) });
});

test('tearProgressPose eases from the release point to the target', () => {
  close(tearProgressPose(0, 0.3, 0), 0.3);
  close(tearProgressPose(1, 0.3, 0), 0);
  close(tearProgressPose(1, 0.4, 1), 1);
  assert.ok(
    tearProgressPose(0.5, 0.4, 1) > 0.4 + 0.3,
    'eases out: most of the way by half time'
  );
  close(tearProgressPose(2, 2, -1), 0, 1e-9, 'inputs clamp to 0..1');
});

test('grabLevelPose runs 0 → 1', () => {
  assert.equal(grabLevelPose(0), 0);
  assert.equal(grabLevelPose(1), 1);
  assert.ok(grabLevelPose(0.5) > 0 && grabLevelPose(0.5) < 1);
});

test('stackSettlePose glides from the risen stack to the DOM card', () => {
  const from = { x: 0.1, y: 0.9, z: 0.02, scale: 0.8 };
  const to = { x: 0, y: 0.2, z: 0, scale: 1.3 };
  const start = stackSettlePose(0, from, to);
  const end = stackSettlePose(1, from, to);
  for (const key of ['x', 'y', 'z', 'scale']) {
    close(start[key], from[key], 1e-6);
    close(end[key], to[key], 1e-6);
  }
  close(start.turn, 0, 1e-6);
  close(end.turn, 1, 1e-6);
  const mid = stackSettlePose(0.5, from, to);
  assert.ok(mid.turn > 0.5 && mid.turn < 1);
  assert.ok(mid.y < from.y && mid.y > to.y);
});

test('linearBrightness matches CSS brightness() once the renderer encodes to sRGB', () => {
  assert.equal(linearBrightness(1), 1);
  assert.equal(linearBrightness(0), 0);
  close(linearBrightness(0.55) ** (1 / 2.2), 0.55, 1e-9);
  assert.ok(
    linearBrightness(0.55) < 0.3,
    'side packs dim far more in linear light'
  );
  assert.equal(linearBrightness(2), 1);
});

test('packPlacement: level stills sway and tilt, drop moves the pack away', () => {
  const home = { x: 0, y: 0, width: 1, height: 1.8 };
  const sway = { rotateYDeg: 3, rotateXDeg: 2, bob: 0.01 };
  const tilt = { rotateYDeg: 5, rotateXDeg: -4 };
  const loose = packPlacement({ home, sway, tilt, level: 0 });
  close(loose.rotateYDeg, 8);
  const still = packPlacement({ home, sway, tilt, level: 1 });
  close(still.rotateYDeg, 0);
  close(still.rotateXDeg, 0);
  close(still.y, 0);
  const half = packPlacement({ home, sway, tilt, level: 0.5 });
  close(half.rotateYDeg, 4);
  const dropped = packPlacement({
    home,
    level: 1,
    drop: { y: -2, rotateXDeg: -14 },
  });
  close(dropped.y, -2);
  close(dropped.rotateXDeg, -14);
});

test('packDropPose dims the falling pack to the queued packs’ level', () => {
  assert.equal(packDropPose(0).brightness, 1);
  close(packDropPose(1).brightness, PACK_DROP_BRIGHTNESS, 1e-6);
  assert.ok(packDropPose(0.5).brightness < 1);
});
