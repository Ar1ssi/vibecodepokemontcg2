import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import {
  POPOVER_SPIN_DEGREES,
  centerDeltaFor,
  createPopoverMotion,
  popoverScaleFor,
} from '../card-pop.mjs';

const viewport = { width: 1200, height: 800 };

before(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
  }
  globalThis.innerWidth = viewport.width;
  globalThis.innerHeight = viewport.height;
});

test('popoverScaleFor caps at 1.75 and fits 90% of the viewport', () => {
  assert.equal(popoverScaleFor({ width: 100, height: 140 }, viewport), 1.75);
  assert.equal(
    popoverScaleFor({ width: 800, height: 1118 }, viewport),
    Math.min((1200 / 800) * 0.9, (800 / 1118) * 0.9, 1.75)
  );
});

test('centerDeltaFor moves the card center onto the viewport center', () => {
  assert.deepEqual(centerDeltaFor({ left: 100, top: 50, width: 200, height: 100 }, viewport), {
    x: 400,
    y: 300,
  });
});

const fakeHost = () => {
  const flip = { style: { transform: '' } };
  return {
    host: {
      style: { transform: '' },
      querySelector: (sel) => (sel === '.card-preview-flip' ? flip : null),
    },
    flip,
  };
};

test('popover always targets a 360° spin, including a second open', () => {
  const { host } = fakeHost();
  const motion = createPopoverMotion(host);
  const rect = { left: 40, top: 80, width: 120, height: 168 };

  motion.popover(rect);
  assert.equal(motion.rotateTarget, POPOVER_SPIN_DEGREES);

  motion.reset();
  motion.popover(rect);
  assert.equal(motion.rotateTarget, POPOVER_SPIN_DEGREES);

  motion.stop();
});

test('retreat targets rotateY 0 so the card lands face-up on the mat', () => {
  const { host } = fakeHost();
  const motion = createPopoverMotion(host);
  motion.popover({ left: 0, top: 0, width: 100, height: 140 });
  motion.retreat();
  assert.equal(motion.rotateTarget, 0);
  motion.stop();
});
