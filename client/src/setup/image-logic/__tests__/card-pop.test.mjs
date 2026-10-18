import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import {
  POPOVER_SPIN_DEGREES,
  centerDeltaFor,
  createPopoverMotion,
  popoverScaleFor,
  previewSizeForSource,
  previewTargetSize,
  prizeFanCardSize,
  prizeFanSlots,
  viewportRectOf,
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

test('previewSizeForSource keeps the source aspect inside the preview box', () => {
  const source = { width: 80, height: 128 };
  const target = previewSizeForSource(source, viewport);
  assert.ok(target.width <= previewTargetSize(viewport).width + 0.01);
  assert.ok(target.height <= previewTargetSize(viewport).height + 0.01);
  assert.ok(Math.abs(target.height / target.width - 128 / 80) < 0.001);
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

test('retreat animates rotateY back to 0 for a reverse spin', () => {
  const { host } = fakeHost();
  const motion = createPopoverMotion(host);
  motion.popover({ left: 0, top: 0, width: 100, height: 140 });
  motion.retreat();
  assert.equal(motion.rotateTarget, 0);
  motion.stop();
});

test('prizeFanSlots lays out a centered sleeve-forward row', () => {
  const size = prizeFanCardSize(6, viewport);
  const slots = prizeFanSlots(6, viewport, size);
  assert.equal(slots.length, 6);
  assert.ok(size.width < 168);
  assert.ok(Math.abs(size.height / size.width - 1.397) < 0.001);
  const first = slots[0];
  const last = slots[5];
  assert.ok(first.left > 0);
  assert.ok(last.left + last.width < viewport.width);
  const mid = (first.left + last.left + last.width) / 2;
  assert.ok(Math.abs(mid - viewport.width / 2) < 1);
  assert.equal(first.top, viewport.height * 0.28);
});

test('prizeFanCardSize shrinks so six prizes fit the viewport', () => {
  const wide = prizeFanCardSize(2, viewport);
  const packed = prizeFanCardSize(6, viewport);
  assert.ok(packed.width <= wide.width);
  const row = packed.width * 6 + packed.gap * 5;
  assert.ok(row <= viewport.width * 0.86 + 0.01);
});

test('viewportRectOf is the element box as a plain left/top/width/height rect', () => {
  const el = { getBoundingClientRect: () => ({ left: 40, top: 80, width: 60, height: 84, right: 100, bottom: 164, x: 40, y: 80 }) };
  assert.deepEqual(viewportRectOf(el), { left: 40, top: 80, width: 60, height: 84 });
});
