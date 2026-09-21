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

const fakeTarget = (classes = []) => {
  const handlers = {};
  return {
    handlers,
    classList: { contains: (c) => classes.includes(c) },
    getBoundingClientRect: () => rect,
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
  return { vars, style: { setProperty: (k, v) => (vars[k] = v) } };
};

test('attachMatTilt: pointermove sets vars, leave/dragstart reset them', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  attachMatTilt(wrapper, image);
  image.handlers.pointermove({ clientX: 200, clientY: 200 });
  assert.equal(wrapper.vars['--fx-tilt-x'], '5.00deg');
  assert.equal(wrapper.vars['--fx-tilt-y'], '5.00deg');
  image.handlers.pointerleave();
  assert.equal(wrapper.vars['--fx-tilt-x'], '0.00deg');
  image.handlers.pointermove({ clientX: 200, clientY: 200 });
  image.handlers.dragstart();
  assert.equal(wrapper.vars['--fx-tilt-y'], '0.00deg');
});

test('attachMatTilt: disabled or dragging cards stay flat', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  let enabled = false;
  attachMatTilt(wrapper, image, { isEnabled: () => enabled });
  image.handlers.pointermove({ clientX: 200, clientY: 340 });
  assert.equal(wrapper.vars['--fx-tilt-x'], '0.00deg');

  const draggingWrapper = fakeWrapper();
  const draggingImage = fakeTarget(['dragging']);
  attachMatTilt(draggingWrapper, draggingImage);
  draggingImage.handlers.pointermove({ clientX: 200, clientY: 340 });
  assert.equal(draggingWrapper.vars['--fx-tilt-x'], '0.00deg');
});

test('attachMatTilt: idempotent per image; detach removes listeners', () => {
  const wrapper = fakeWrapper();
  const image = fakeTarget();
  const detach = attachMatTilt(wrapper, image);
  const second = attachMatTilt(wrapper, image);
  second();
  assert.equal(typeof image.handlers.pointermove, 'function');
  detach();
  assert.equal(image.handlers.pointermove, undefined);
  assert.equal(attachMatTilt(null, image)(), undefined);
});
