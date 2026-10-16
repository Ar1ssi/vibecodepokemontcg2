import test from 'node:test';
import assert from 'node:assert/strict';

import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import {
  benchSlotRect,
  flatLayout,
  halfFromViewport,
  slotIndexAt,
} from '../board-layout.mjs';

const close = (actual, expected, message, tolerance = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

const closeRect = (actual, expected, message) => {
  for (const key of ['x', 'y', 'w', 'h']) close(actual[key], expected[key], `${message}.${key}`);
};

// sim at 1920×1080: iframe 75.5vw × 50vh = 1449.6 × 540 (index.css .self).
// Playfield W = 1449.6, D = 540 * (1 - 0.16) = 453.6; hand strip 0.16 * 540 = 86.4.
// Flat x = CSS left - W/2; flat y = CSS bottom (both from the playfield).
const VIEWPORT = { w: 1920, h: 1080 };
const HALF = { w: 1449.6, h: 540 };
const D = 453.6;

test('halfFromViewport is the 75.5% × 50% iframe box', () => {
  const half = halfFromViewport(VIEWPORT);
  close(half.w, 1449.6, 'w', 1e-9);
  close(half.h, 540, 'h', 1e-9);
});

test('sim zone rects equal the CSS vars in px', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF);
  close(layout.depth, D, 'depth', 1e-9);
  const { self } = layout;
  // --active-*: left 32.5%W = 471.12, bottom 63%D, width 35%W, height 32%D.
  closeRect(self.active, { x: 471.12 - 724.8, y: 0.63 * D, w: 507.36, h: 0.32 * D }, 'active');
  // --deck-*: right 1%W = 14.496, width 9%W = 130.464 → left 1304.64; bottom 64%D, height 28%D.
  closeRect(self.deck, { x: 579.84, y: 290.304, w: 130.464, h: 127.008 }, 'deck');
  // --discard-*: right 1%W, width 9%W, bottom 35%D, height 26%D.
  closeRect(self.discard, { x: 579.84, y: 158.76, w: 130.464, h: 117.936 }, 'discard');
  // --lost-zone-*: left 1%W, bottom 84%D, width 7%W, height 15%D.
  closeRect(self.lostZone, { x: -710.304, y: 381.024, w: 101.472, h: 68.04 }, 'lostZone');
  // .self-board: left 66%W, bottom 61%D, 24%W × 30%D plus #board's 5px padding each side.
  closeRect(self.board, { x: 231.936, y: 276.696, w: 357.904, h: 146.08 }, 'board');
  // #stadium (parent page): bottom 43.28vh = 467.424 - 86.4 strip; left 26% of 1920 = 499.2;
  // height 13.44vh = 145.152; width height * 0.718 (--card-aspect).
  closeRect(layout.stadium, { x: -225.6, y: 381.024, w: 104.219, h: 145.152 }, 'stadium');
  // Hand cards are two strips (2 * 86.4) tall, bottom one strip below the iframe edge.
  close(self.hand.baselineY, -172.8, 'hand baseline');
  close(self.hand.width, 1449.6, 'hand width');
  // Card boxes: active height * 0.718; deck min(130.464, 127.008 * 0.716).
  closeRect(
    { x: 0, y: 0, ...self.cardBox.active },
    { x: 0, y: 0, w: 145.152 * 0.718, h: 145.152 },
    'active card'
  );
  closeRect({ x: 0, y: 0, ...self.cardBox.pile }, { x: 0, y: 0, w: 90.938, h: 127.008 }, 'pile card');
});

test('sim bench slots follow the 5-column grid at --bench-gap', () => {
  const { self } = flatLayout(getMatLayout('sim'), HALF);
  // --bench-*: left 20%W = 289.92, width 60%W = 869.76, bottom 34%D, height 28%D.
  // gap 0.35vw = 5.0736; column = (869.76 - 4 * 5.0736) / 5 = 169.89312; pitch 174.96672.
  assert.equal(self.bench.length, 5);
  closeRect(self.bench[0], { x: -434.88, y: 154.224, w: 169.89312, h: 127.008 }, 'bench 0');
  closeRect(self.bench[4], { x: -434.88 + 4 * 174.96672, y: 154.224, w: 169.89312, h: 127.008 }, 'bench 4');
  close(self.bench[4].x + self.bench[4].w, -434.88 + 869.76, 'bench right edge');
});

test('a sixth bench card continues the row at the same pitch', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF);
  const sixth = benchSlotRect(layout, 'self', 5);
  close(sixth.x - layout.self.bench[4].x, 174.96672, 'pitch');
  closeRect(benchSlotRect(layout, 'opp', 5), {
    x: -(sixth.x + sixth.w),
    y: 2 * D - (sixth.y + sixth.h),
    w: sixth.w,
    h: sixth.h,
  }, 'opp sixth');
});

test('sim prize slots: three rows of two overlapping cards', () => {
  const { self } = flatLayout(getMatLayout('sim'), HALF);
  // --prizes-*: left 1%W → x -710.304, bottom 35%D = 158.76, 7%W = 101.472 × 46%D = 208.656.
  // Row height 69.552; back slots span 86.33% from the left and drop 6.75% of a row.
  const top = 158.76 + 208.656;
  closeRect(self.prizes[0], { x: -710.304, y: top - 69.552 * 1.0675, w: 87.6008, h: 69.552 }, 'prize 0');
  closeRect(self.prizes[1], { x: -710.304 + 13.8712, y: top - 69.552, w: 87.6008, h: 69.552 }, 'prize 1');
  closeRect(self.prizes[5], { x: -710.304 + 13.8712, y: 158.76, w: 87.6008, h: 69.552 }, 'prize 5');
});

test('one-player prizes: aspect-locked mat box, two per row', () => {
  const { self } = flatLayout(getMatLayout('one-player'), HALF);
  // --mat-height = D; --mat-width = min(W, D * 1.9394) = 879.71184;
  // --mat-offset-x = (1449.6 - 879.71184) / 2 = 284.94408.
  // prizes left = 284.94408 + 2% * 879.71184 = 302.53832 → x -422.26168;
  // width 13.6% = 119.64081; bottom 4.5%D = 20.412; height 92.4%D = 419.1264.
  const x = -422.26168;
  const w = 119.64081;
  const rowH = 419.1264 / 3;
  closeRect(self.prizes[0], { x, y: 20.412 + 2 * rowH - rowH * 0.0675, w: w * 0.8633, h: rowH }, 'prize 0');
  closeRect(self.prizes[1], { x: x + w * 0.1367, y: 20.412 + 2 * rowH, w: w * 0.8633, h: rowH }, 'prize 1');
  closeRect(self.prizes[4], { x, y: 20.412 - rowH * 0.0675, w: w * 0.8633, h: rowH }, 'prize 4');
  // Bench gap 1.9% of min(bench width, D * aspect): bench width 65.7% * 879.71184 = 577.97068.
  const gap = 0.019 * 577.97068;
  close(self.bench[1].x - self.bench[0].x, (577.97068 - 4 * gap) / 5 + gap, 'bench pitch');
});

test('opp rects are the exact 180° images of self rects about the seam centre', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF);
  const seam = layout.depth;
  const mirror = (r) => ({ x: -(r.x + r.w), y: 2 * seam - (r.y + r.h), w: r.w, h: r.h });
  for (const zone of ['active', 'deck', 'discard', 'lostZone', 'board']) {
    assert.deepEqual(layout.opp[zone], mirror(layout.self[zone]), zone);
  }
  layout.self.bench.forEach((r, i) => assert.deepEqual(layout.opp.bench[i], mirror(r), `bench ${i}`));
  layout.self.prizes.forEach((r, i) => assert.deepEqual(layout.opp.prizes[i], mirror(r), `prize ${i}`));
  assert.equal(layout.opp.hand.baselineY, 2 * seam - layout.self.hand.baselineY);
});

test('slotIndexAt hits bench slot 2 and misses outside', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF);
  const slot = layout.self.bench[2];
  const centre = { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
  assert.equal(slotIndexAt(layout, 'self', 'bench', centre), 2);
  assert.equal(slotIndexAt(layout, 'self', 'bench', { x: centre.x, y: slot.y - 10 }), -1);
  const gapX = layout.self.bench[0].x + layout.self.bench[0].w + 2;
  assert.equal(slotIndexAt(layout, 'self', 'bench', { x: gapX, y: centre.y }), -1);
  const opp = layout.opp.bench[2];
  assert.equal(slotIndexAt(layout, 'opp', 'bench', { x: opp.x + 1, y: opp.y + 1 }), 2);
  assert.equal(slotIndexAt(layout, 'self', 'active', { x: 0, y: 300 }), 0);
  assert.equal(slotIndexAt(layout, 'self', 'nope', centre), -1);
  assert.equal(slotIndexAt(layout, 'self', 'bench', null), -1);
});

test('slotIndexAt gives overlapping prizes to the card drawn on top', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF);
  const front = layout.self.prizes[1];
  assert.equal(slotIndexAt(layout, 'self', 'prizes', { x: front.x + 5, y: front.y + front.h / 2 }), 1);
  const back = layout.self.prizes[0];
  assert.equal(slotIndexAt(layout, 'self', 'prizes', { x: back.x + 2, y: back.y + back.h / 2 }), 0);
});

test('stadium vh resolve against an explicit viewport', () => {
  const layout = flatLayout(getMatLayout('sim'), HALF, { viewport: { w: 1920, h: 1200 } });
  // 43.28vh of 1200 = 519.36, minus the 86.4 hand strip; height 13.44vh = 161.28.
  close(layout.stadium.y, 432.96, 'stadium y');
  close(layout.stadium.h, 161.28, 'stadium h');
});
