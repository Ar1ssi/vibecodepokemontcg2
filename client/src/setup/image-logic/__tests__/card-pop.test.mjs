import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import {
  POPOVER_SPIN_DEGREES,
  centerDeltaFor,
  createPopoverMotion,
  popoverScaleFor,
  previewTargetSize,
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

test('popoverScaleFor grows a board card to the original preview size', () => {
  const target = previewTargetSize(viewport);
  assert.equal(target.height, 800 * 0.88);
  assert.equal(target.width, target.height / 1.397);
  assert.equal(
    popoverScaleFor({ width: 100, height: 139.7 }, viewport),
    target.width / 100
  );
  assert.ok(popoverScaleFor({ width: 100, height: 140 }, viewport) > 4);
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

test('popover can start from a board-sized scale and grow to 1', () => {
  const { host } = fakeHost();
  const motion = createPopoverMotion(host, { homeScale: 0.2 });
  motion.popover({ left: 0, top: 0, width: 500, height: 700 }, { startScale: 0.2, endScale: 1 });
  assert.equal(motion.scaleTarget, 1);
  motion.retreat();
  assert.equal(motion.scaleTarget, 0.2);
  motion.stop();
});

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

test('retreat snaps rotateY to 0 immediately so close is not blocked', () => {
  const { host, flip } = fakeHost();
  const motion = createPopoverMotion(host);
  motion.popover({ left: 0, top: 0, width: 100, height: 140 });
  motion.retreat();
  assert.equal(motion.rotateTarget, 0);
  assert.match(flip.style.transform, /rotateY\(0deg\)/);
  motion.stop();
});
