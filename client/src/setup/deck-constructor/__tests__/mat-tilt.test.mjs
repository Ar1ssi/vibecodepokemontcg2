import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAT_TILT_MAX_DEG, attachMatTilt, matTiltAngles } from '../mat-tilt.mjs';

const rect = { left: 100, top: 200, width: 100, height: 140 };

test('matTiltAngles: center is flat, corners hit the cap, far outside clamps', () => {
  const center = matTiltAngles(rect, 150, 270);
  assert.ok(Math.abs(center.x) < 1e-9 && Math.abs(center.y) < 1e-9);
  const corner = matTiltAngles(rect, 200, 340);
  assert.equal(corner.x, MAT_TILT_MAX_DEG);
  assert.equal(corner.y, -MAT_TILT_MAX_DEG);
  assert.equal(matTiltAngles(rect, 9999, -9999).x, MAT_TILT_MAX_DEG);
});

test('matTiltAngles: degenerate rect yields no tilt', () => {
  assert.deepEqual(matTiltAngles({ left: 0, top: 0, width: 0, height: 10 }, 5, 5), { x: 0, y: 0 });
  assert.deepEqual(matTiltAngles(null, 5, 5), { x: 0, y: 0 });
});

const fakeTarget = (classes = [], targetRect = rect) => {
  const handlers = {};
  return {
    handlers,
    classList: { contains: (c) => classes.includes(c) },
    getBoundingClientRect: () => targetRect,
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    removeEventListener: (type) => {
      delete handlers[type];
    },
  };
};
const fakeWrapper = () => {
  const vars = {};
  return { ...fakeTarget(), vars, style: { setProperty: (k, v) => (vars[k] = v) } };
};

test('attachMatTilt: pointermove sets vars, leave/dragstart reset them', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  attachMatTilt(wrapper, image);
  wrapper.handlers.pointermove({ clientX: 200, clientY: 200 });
  assert.equal(wrapper.vars['--fx-tilt-x'], '5.00deg');
  assert.equal(wrapper.vars['--fx-tilt-y'], '5.00deg');
  wrapper.handlers.pointerleave();
  assert.equal(wrapper.vars['--fx-tilt-x'], '0.00deg');
  wrapper.handlers.pointermove({ clientX: 200, clientY: 200 });
  image.handlers.dragstart();
  assert.equal(wrapper.vars['--fx-tilt-y'], '0.00deg');
});

// The <img> lives inside the tilted rotator: tilting pulls the pointed-at edge
// out from under the cursor. Tracking the <img> made hover flap tilted/flat.
test('attachMatTilt: tracks the untilted wrapper, not the tilted <img>', () => {
  const wrapper = fakeWrapper();
  const tiltedImage = fakeTarget([], { left: 110, top: 205, width: 80, height: 130 });
  attachMatTilt(wrapper, tiltedImage);
  assert.equal(tiltedImage.handlers.pointerleave, undefined);
  wrapper.handlers.pointermove({ clientX: 195, clientY: 270 });
  assert.equal(wrapper.vars['--fx-tilt-x'], '4.50deg');
  assert.equal(wrapper.vars['--fx-tilt-y'], '0.00deg');
});

test('attachMatTilt: disabled or dragging cards stay flat', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  let enabled = false;
  attachMatTilt(wrapper, image, { isEnabled: () => enabled });
  wrapper.handlers.pointermove({ clientX: 200, clientY: 340 });
  assert.equal(wrapper.vars['--fx-tilt-x'], '0.00deg');

  const draggingWrapper = fakeWrapper();
  const draggingImage = fakeTarget(['dragging']);
  attachMatTilt(draggingWrapper, draggingImage);
  draggingWrapper.handlers.pointermove({ clientX: 200, clientY: 340 });
  assert.equal(draggingWrapper.vars['--fx-tilt-x'], '0.00deg');
});

test('attachMatTilt: idempotent per image; detach removes listeners', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  const detach = attachMatTilt(wrapper, image);
  const second = attachMatTilt(wrapper, image);
  second();
  assert.equal(typeof wrapper.handlers.pointermove, 'function');
  detach();
  assert.equal(wrapper.handlers.pointermove, undefined);
  assert.equal(image.handlers.dragstart, undefined);
  assert.equal(attachMatTilt(null, image)(), undefined);
});
