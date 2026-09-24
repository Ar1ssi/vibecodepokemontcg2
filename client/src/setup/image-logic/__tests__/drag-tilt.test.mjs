import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAG_TILT,
  DRAG_TILT_STILL,
  createDragTilt,
  dragAvatarTransform,
  grabOffset,
  returnTransform,
  stepDragTilt,
  tiltTargets,
} from '../drag-tilt.mjs';

// Drive the pointer at a constant velocity (px/ms) for `ms`, one frame per
// `frameMs`, from `state`. Returns the final state.
const drive = (
  state,
  { vx = 0, vy = 0, ms, frameMs = 1000 / 60, params = DRAG_TILT }
) => {
  let current = state;
  for (let t = 0; t < ms - 1e-9; t += frameMs) {
    const point = {
      x: current.point.x + vx * frameMs,
      y: current.point.y + vy * frameMs,
    };
    current = stepDragTilt(current, point, frameMs, params);
  }
  return current;
};

const hold = (state, ms, frameMs = 1000 / 60) => drive(state, { ms, frameMs });

const translateOf = (transform) => {
  const match = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
  return { x: Number(match[1]), y: Number(match[2]) };
};

test('a picked-up card starts flat, at the pointer', () => {
  const state = createDragTilt({ x: 40, y: 50 });
  assert.deepEqual(state.point, { x: 40, y: 50 });
  assert.equal(state.roll, 0);
  assert.equal(state.pitch, 0);
  assert.deepEqual(createDragTilt(null).point, { x: 0, y: 0 });
});

test('a zero, negative or invalid frame, or an invalid point, changes nothing', () => {
  const state = createDragTilt({ x: 0, y: 0 });
  assert.equal(stepDragTilt(state, { x: 30, y: 0 }, 0), state);
  assert.equal(stepDragTilt(state, { x: 30, y: 0 }, -16), state);
  assert.equal(stepDragTilt(state, { x: 30, y: 0 }, Number.NaN), state);
  assert.equal(stepDragTilt(state, { x: Number.NaN, y: 0 }, 16), state);
  assert.equal(stepDragTilt(state, null, 16), state);
});

test('moving right rolls the card clockwise, moving left counter-clockwise', () => {
  const right = drive(createDragTilt({ x: 0, y: 0 }), { vx: 0.5, ms: 200 });
  const left = drive(createDragTilt({ x: 0, y: 0 }), { vx: -0.5, ms: 200 });
  assert.ok(right.roll > 5, `rightward roll ${right.roll}`);
  assert.ok(left.roll < -5, `leftward roll ${left.roll}`);
});

test('even a slow drag leans most of the way, as in the footage', () => {
  const slow = drive(createDragTilt({ x: 0, y: 0 }), { vx: 0.3, ms: 300 });
  assert.ok(slow.roll > DRAG_TILT.maxRollDeg * 0.6, `slow roll ${slow.roll}`);
});

test('the roll never swings past its limit, however fast the drag', () => {
  let state = createDragTilt({ x: 0, y: 0 });
  let peak = 0;
  for (let i = 0; i < 120; i += 1) {
    state = drive(state, { vx: 8, ms: 1000 / 60 });
    peak = Math.max(peak, Math.abs(state.roll));
  }
  assert.ok(peak <= DRAG_TILT.maxRollDeg * 1.05, `peak roll ${peak}`);
  assert.ok(peak > DRAG_TILT.maxRollDeg * 0.9, `peak roll ${peak}`);
});

test('the card lags the pointer instead of snapping to its lean', () => {
  const first = drive(createDragTilt({ x: 0, y: 0 }), { vx: 1, ms: 1000 / 60 });
  const target = tiltTargets({ x: 1, y: 0 }).roll;
  assert.ok(first.roll > 0);
  assert.ok(
    first.roll < target * 0.3,
    `first-frame roll ${first.roll} of ${target}`
  );
});

test('moving up tips the top edge away; moving down tips it toward the viewer', () => {
  const up = drive(createDragTilt({ x: 0, y: 0 }), { vy: -0.6, ms: 200 });
  const down = drive(createDragTilt({ x: 0, y: 0 }), { vy: 0.6, ms: 200 });
  assert.ok(up.pitch > 1, `up pitch ${up.pitch}`);
  assert.ok(down.pitch < -1, `down pitch ${down.pitch}`);
  assert.ok(Math.abs(up.pitch) <= DRAG_TILT.maxPitchDeg * 1.05);
});

test('each axis only answers its own direction of motion', () => {
  const sideways = drive(createDragTilt({ x: 0, y: 0 }), { vx: 0.8, ms: 200 });
  const vertical = drive(createDragTilt({ x: 0, y: 0 }), { vy: 0.8, ms: 200 });
  assert.ok(
    Math.abs(sideways.pitch) < 1e-9,
    `sideways pitch ${sideways.pitch}`
  );
  assert.ok(Math.abs(vertical.roll) < 1e-9, `vertical roll ${vertical.roll}`);
});

test('when the pointer stops, the card settles back upright', () => {
  const moving = drive(createDragTilt({ x: 0, y: 0 }), {
    vx: 0.6,
    vy: -0.6,
    ms: 250,
  });
  assert.ok(Math.abs(moving.roll) > 5);
  const settled = hold(moving, 450);
  assert.ok(Math.abs(settled.roll) < 0.5, `settled roll ${settled.roll}`);
  assert.ok(Math.abs(settled.pitch) < 0.5, `settled pitch ${settled.pitch}`);
});

test('the swing is the same at 60 Hz and 144 Hz', () => {
  const at60 = drive(createDragTilt({ x: 0, y: 0 }), {
    vx: 0.4,
    ms: 200,
    frameMs: 1000 / 60,
  });
  const at144 = drive(createDragTilt({ x: 0, y: 0 }), {
    vx: 0.4,
    ms: 200,
    frameMs: 1000 / 144,
  });
  assert.ok(
    Math.abs(at60.roll - at144.roll) < 1,
    `${at60.roll} vs ${at144.roll}`
  );
});

test('a long stall neither lurches nor produces NaN', () => {
  const moving = drive(createDragTilt({ x: 0, y: 0 }), { vx: 0.5, ms: 200 });
  // Tab hidden for 5 s while the pointer crept 300 px: 0.06 px/ms, not 3 px/ms.
  const after = stepDragTilt(
    moving,
    { x: moving.point.x + 300, y: moving.point.y },
    5000
  );
  assert.ok(Number.isFinite(after.roll) && Number.isFinite(after.pitch));
  assert.ok(Math.abs(after.velocity.x) < 0.5, `velocity ${after.velocity.x}`);
  assert.ok(Math.abs(after.roll) <= DRAG_TILT.maxRollDeg * 1.05);
  assert.ok(
    Number.isFinite(stepDragTilt(moving, { x: 1, y: 1 }, Infinity).roll)
  );
});

test('reduced motion keeps the card flat', () => {
  const still = drive(createDragTilt({ x: 0, y: 0 }), {
    vx: 2,
    vy: -2,
    ms: 300,
    params: DRAG_TILT_STILL,
  });
  assert.ok(Math.abs(still.roll) < 1e-9 && Math.abs(still.pitch) < 1e-9);
  const targets = tiltTargets({ x: 5, y: 5 }, DRAG_TILT_STILL);
  assert.ok(targets.roll === 0 && targets.pitch === 0);
});

test('the grab point is where the pointer holds the card, clamped onto it', () => {
  const rect = { left: 100, top: 200, width: 120, height: 168 };
  assert.deepEqual(grabOffset(rect, { x: 130, y: 250 }), { x: 30, y: 50 });
  assert.deepEqual(grabOffset(rect, { x: 50, y: 900 }), { x: 0, y: 168 });
});

test('the avatar keeps the grab point under the pointer, at full size', () => {
  const grab = { x: 30, y: 50 };
  const tilt = { roll: 8.123, pitch: -2 };
  const transform = dragAvatarTransform({ x: 400, y: 300 }, grab, tilt);
  assert.deepEqual(translateOf(transform), { x: 370, y: 250 });
  assert.match(transform, /rotateX\(-2deg\) rotateZ\(8\.12deg\) scale\(1\)$/);
  assert.match(
    transform,
    new RegExp(`perspective\\(${DRAG_TILT.perspectivePx}px\\)`)
  );
});

test('a cancelled drag lands flat on its source slot', () => {
  const grab = { x: 30, y: 50 };
  const size = { width: 120, height: 168 };
  const same = returnTransform(
    { left: 10, top: 20, width: 120, height: 168 },
    size,
    grab
  );
  assert.deepEqual(translateOf(same), { x: 10, y: 20 });
  assert.match(same, /rotateX\(0deg\) rotateZ\(0deg\) scale\(1\)$/);

  // Slot re-laid out to 60 px wide: scale 0.5 about the grab point, top-left on the slot.
  const smaller = returnTransform(
    { left: 10, top: 20, width: 60, height: 84 },
    size,
    grab
  );
  const { x, y } = translateOf(smaller);
  assert.match(smaller, /scale\(0\.5\)$/);
  assert.equal(grab.x + x - 0.5 * grab.x, 10);
  assert.equal(grab.y + y - 0.5 * grab.y, 20);

  const degenerate = returnTransform(
    { left: 0, top: 0, width: 0, height: 0 },
    size,
    grab
  );
  assert.match(degenerate, /scale\(1\)$/);
});
