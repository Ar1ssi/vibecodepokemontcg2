import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAPSED_FRACTION,
  FOV_DEG,
  FLIGHT_MS,
  EXPAND_MS,
  COLLAPSE_MS,
  perspectiveFor,
  focusRect,
  flightTransform,
  expandDurationMs,
  collapseDurationMs,
} from '../card-focus-geometry.mjs';

const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} not within ${tolerance} of ${expected}`
  );

const assertRect = (viewport, expected) => {
  const rect = focusRect(viewport);
  for (const key of ['left', 'top', 'width', 'height']) {
    near(rect[key], expected[key], 0.5, `${viewport.width}x${viewport.height} ${key}`);
  }
};

describe('constants', () => {
  it('match the TCG Live scene values', () => {
    assert.equal(FOV_DEG, 20);
    assert.equal(FLIGHT_MS, 250);
    assert.equal(EXPAND_MS, 300);
    assert.equal(COLLAPSE_MS, 150);
  });

  it('COLLAPSED_FRACTION is closedWindowHeight / maxWindowHeight', () => {
    assert.equal(COLLAPSED_FRACTION, 0.3 / 4.25);
  });
});

describe('perspectiveFor', () => {
  it('derives the CSS perspective from the 20 degree FOV', () => {
    near(perspectiveFor(1080), 3062.5, 0.1, 'perspective');
  });

  it('returns 0 for a non-finite or non-positive height', () => {
    assert.equal(perspectiveFor(0), 0);
    assert.equal(perspectiveFor(-5), 0);
    assert.equal(perspectiveFor(NaN), 0);
    assert.equal(perspectiveFor(Infinity), 0);
  });
});

describe('focusRect', () => {
  it('fits 1920x1080', () => {
    assertRect(
      { width: 1920, height: 1080 },
      { left: 428.8, top: 211.6, width: 472.1, height: 656.8 }
    );
  });

  it('fits 1280x720', () => {
    assertRect(
      { width: 1280, height: 720 },
      { left: 285.9, top: 141.1, width: 314.7, height: 437.9 }
    );
  });

  it('fits 1440x900', () => {
    assertRect(
      { width: 1440, height: 900 },
      { left: 277.3, top: 176.3, width: 393.4, height: 547.3 }
    );
  });

  it('keeps margin, width cap and aspect in portrait 900x1200', () => {
    const rect = focusRect({ width: 900, height: 1200 });
    assert.ok(rect.left >= 16, `left ${rect.left}`);
    assert.ok(rect.top >= 16, `top ${rect.top}`);
    assert.ok(rect.width <= 810, `width ${rect.width}`);
    near(rect.width / rect.height, 0.71876, 0.001, 'aspect');
  });

  it('shrinks to 90% width on a narrow viewport and keeps the aspect and margin', () => {
    const rect = focusRect({ width: 320, height: 1000 });
    near(rect.width, 288, 0.001, 'width');
    near(rect.width / rect.height, 0.71876, 0.001, 'aspect');
    assert.ok(rect.left >= 16, `left ${rect.left}`);
    assert.ok(rect.left + rect.width <= 320 - 16 + 0.001, 'right margin');
  });

  it('returns a zero rect for an invalid viewport', () => {
    const zero = { left: 0, top: 0, width: 0, height: 0 };
    assert.deepEqual(focusRect({ width: 0, height: 720 }), zero);
    assert.deepEqual(focusRect({ width: 1280, height: -1 }), zero);
    assert.deepEqual(focusRect({ width: NaN, height: 720 }), zero);
    assert.deepEqual(focusRect({ width: 1280, height: Infinity }), zero);
    assert.deepEqual(focusRect(undefined), zero);
  });
});

describe('flightTransform', () => {
  it('is the identity for identical rects without tilt', () => {
    const rect = { left: 40, top: 60, width: 200, height: 280 };
    assert.deepEqual(flightTransform(rect, rect, { tiltDeg: 0 }), {
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotateX: 0,
    });
  });

  it('scales by width and translates centre to centre', () => {
    const from = { left: 0, top: 0, width: 100, height: 140 };
    const to = { left: 100, top: 100, width: 200, height: 280 };
    assert.deepEqual(flightTransform(from, to, { tiltDeg: 12 }), {
      translateX: -150,
      translateY: -170,
      scale: 0.5,
      rotateX: 12,
    });
  });

  it('defaults the tilt to 0', () => {
    const rect = { left: 0, top: 0, width: 10, height: 14 };
    assert.equal(flightTransform(rect, rect).rotateX, 0);
  });
});

describe('list window durations', () => {
  it('expand scales linearly with the fraction travelled', () => {
    near(expandDurationMs(COLLAPSED_FRACTION, 1), 300, 1e-9, 'full expand');
    assert.equal(expandDurationMs(1, 1), 0);
  });

  it('collapse uses the shorter base duration', () => {
    near(collapseDurationMs(1, COLLAPSED_FRACTION), 150, 1e-9, 'full collapse');
    assert.equal(collapseDurationMs(0.5, 0.5), 0);
  });
});
