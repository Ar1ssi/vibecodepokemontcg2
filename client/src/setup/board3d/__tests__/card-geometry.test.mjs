import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_UNITS,
  cardCornerRadius,
  cardScaleFor,
  roundedRectShapePoints,
} from '../card-geometry.mjs';

test('CARD_UNITS is the TCG Live card mesh (design 067:30)', () => {
  assert.deepEqual({ ...CARD_UNITS }, { w: 6.397, h: 8.9, t: 0.064 });
});

test('cardScaleFor maps card units to the drawn width', () => {
  assert.equal(cardScaleFor(120), 120 / 6.397);
  assert.equal(cardScaleFor(CARD_UNITS.w), 1);
});

test('cardCornerRadius is 4.8% of the width', () => {
  assert.equal(cardCornerRadius(100), 4.8);
  assert.equal(cardCornerRadius(0), 0);
});

test('roundedRectShapePoints: 4·segs points in the w×h box, counter-clockwise ring', () => {
  const w = 120;
  const h = 167;
  const r = cardCornerRadius(w);
  const points = roundedRectShapePoints(w, h, r);
  assert.equal(points.length, 64);
  for (const [x, y] of points) {
    assert.ok(
      Math.abs(x) <= w / 2 + 1e-9 && Math.abs(y) <= h / 2 + 1e-9,
      `${x},${y} outside`
    );
  }
  // Starts on the lower right arc where it meets the bottom edge.
  assert.ok(Math.abs(points[0][0] - (w / 2 - r)) < 1e-9);
  assert.ok(Math.abs(points[0][1] + h / 2) < 1e-9);
  // The ring is open: the last point (bottom-left arc end) is not the first.
  const last = points.at(-1);
  assert.ok(
    Math.abs(last[0] + (w / 2 - r)) < 1e-9 && Math.abs(last[1] + h / 2) < 1e-9
  );
  // Shoelace area > 0 ⇒ counter-clockwise; close to the rounded rect's true area.
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    twice += x0 * y1 - x1 * y0;
  }
  const area = twice / 2;
  const exact = w * h - (4 - Math.PI) * r * r;
  assert.ok(area > 0, 'counter-clockwise');
  assert.ok(Math.abs(area - exact) / exact < 1e-3, `area ${area} vs ${exact}`);
});

test('roundedRectShapePoints honours segs and clamps the radius', () => {
  assert.equal(roundedRectShapePoints(10, 10, 1, 4).length, 16);
  const clamped = roundedRectShapePoints(10, 4, 50, 8);
  for (const [x, y] of clamped)
    assert.ok(Math.abs(x) <= 5 + 1e-9 && Math.abs(y) <= 2 + 1e-9);
  assert.throws(() => roundedRectShapePoints(0, 10, 1), RangeError);
});
