import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { artQuadFor, clipQuad, matBoxRect, matUvFor, nestRect, tableBounds } from '../table-uv.mjs';
import { flatLayout, halfFromViewport } from '../board-layout.mjs';

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

describe('matUvFor', () => {
  it('contain letterboxes a 1.94 image on a 1.6 plane (bands above and below)', () => {
    const uv = matUvFor({ fit: 'contain', imageAspect: 1.94, planeAspect: 1.6 });
    const pad = (1.94 / 1.6 - 1) / 2;
    close(uv.u0, 0, 'u0');
    close(uv.u1, 1, 'u1');
    close(uv.v0, -pad, 'v0');
    close(uv.v1, 1 + pad, 'v1');
  });

  it('contain pillarboxes a narrow image on a wide plane', () => {
    const uv = matUvFor({ fit: 'contain', imageAspect: 1, planeAspect: 2 });
    assert.deepEqual(uv, { u0: -0.5, v0: 0, u1: 1.5, v1: 1 });
  });

  it('cover crops the sides of a wider image', () => {
    const uv = matUvFor({ fit: 'cover', imageAspect: 1.94, planeAspect: 1.6 });
    const keep = 1.6 / 1.94;
    close(uv.u0, 0.5 - keep / 2, 'u0');
    close(uv.u1, 0.5 + keep / 2, 'u1');
    assert.equal(uv.v0, 0);
    assert.equal(uv.v1, 1);
  });

  it('cover crops top and bottom of a taller image', () => {
    assert.deepEqual(matUvFor({ fit: 'cover', imageAspect: 1, planeAspect: 2 }), {
      u0: 0,
      v0: 0.25,
      u1: 1,
      v1: 0.75,
    });
  });

  it('stretch ("100% 100%") fills the plane whatever the aspects', () => {
    assert.deepEqual(matUvFor({ fit: '100% 100%', imageAspect: 1.94, planeAspect: 1.6 }), {
      u0: 0,
      v0: 0,
      u1: 1,
      v1: 1,
    });
  });

  it('fills the plane when an aspect is missing or invalid', () => {
    const full = { u0: 0, v0: 0, u1: 1, v1: 1 };
    assert.deepEqual(matUvFor({ fit: 'contain', imageAspect: null, planeAspect: 1.6 }), full);
    assert.deepEqual(matUvFor({ fit: 'cover', imageAspect: 2, planeAspect: 0 }), full);
    assert.deepEqual(matUvFor(), full);
  });
});

describe('artQuadFor', () => {
  it('shrinks a letterboxed plane to the image and clamps its UVs', () => {
    const { rect, uv } = artQuadFor(matUvFor({ fit: 'contain', imageAspect: 2, planeAspect: 1 }));
    close(rect.x0, 0, 'x0');
    close(rect.x1, 1, 'x1');
    close(rect.y0, 0.25, 'y0');
    close(rect.y1, 0.75, 'y1');
    assert.deepEqual(uv, { u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it('keeps a cropped plane whole with the cropped UVs', () => {
    const { rect, uv } = artQuadFor(matUvFor({ fit: 'cover', imageAspect: 1, planeAspect: 2 }));
    assert.deepEqual(rect, { x0: 0, y0: 0, x1: 1, y1: 1 });
    assert.deepEqual(uv, { u0: 0, v0: 0.25, u1: 1, v1: 0.75 });
  });
});

describe('tableBounds', () => {
  it('covers both playfields of the 1920×1080 half', () => {
    const half = halfFromViewport({ w: 1920, h: 1080 });
    const bounds = tableBounds(flatLayout('sim', half));
    close(bounds.x, -724.8, 'x');
    assert.equal(bounds.y, 0);
    close(bounds.w, 1449.6, 'w');
    close(bounds.h, 2 * 540 * 0.84, 'h');
  });

  it('is empty for a missing layout', () => {
    assert.deepEqual(tableBounds(null), { x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('matBoxRect', () => {
  it('contains an aspect box in the half, centred across, on the near edge', () => {
    const box = matBoxRect({ boxAspect: 1.9394, planeAspect: 1449.6 / 453.6 });
    const width = (453.6 * 1.9394) / 1449.6;
    close(box.x0, (1 - width) / 2, 'x0');
    close(box.x1, (1 + width) / 2, 'x1');
    assert.equal(box.y0, 0);
    assert.equal(box.y1, 1);
  });

  it('lifts a scaled-down box by half the spare height and overflows a scaled-up one', () => {
    const small = matBoxRect({ boxAspect: 2, planeAspect: 4, scale: 0.8 });
    close(small.y0, 0.1, 'small y0');
    close(small.y1, 0.9, 'small y1');
    const big = matBoxRect({ boxAspect: 2, planeAspect: 4, scale: 1.2 });
    assert.equal(big.y0, 0);
    close(big.y1, 1.2, 'big y1');
  });

  it('is the whole plane without an aspect', () => {
    assert.deepEqual(matBoxRect({ boxAspect: null, planeAspect: 3 }), { x0: 0, y0: 0, x1: 1, y1: 1 });
  });
});

describe('clipQuad / nestRect', () => {
  it('crops the overflowing top and moves the top UV with it', () => {
    const clipped = clipQuad({ rect: { x0: 0, y0: 0, x1: 1, y1: 1.25 }, uv: { u0: 0, v0: 0, u1: 1, v1: 1 } });
    assert.deepEqual(clipped.rect, { x0: 0, y0: 0, x1: 1, y1: 1 });
    close(clipped.uv.v1, 0.8, 'v1');
  });

  it('returns null for a quad entirely off the plane', () => {
    assert.equal(clipQuad({ rect: { x0: 1.1, y0: 0, x1: 2, y1: 1 }, uv: { u0: 0, v0: 0, u1: 1, v1: 1 } }), null);
  });

  it('nests a box-relative rect into the plane', () => {
    assert.deepEqual(nestRect({ x0: 0.2, y0: 0, x1: 0.8, y1: 1 }, { x0: 0, y0: 0.25, x1: 1, y1: 0.75 }), {
      x0: 0.2,
      y0: 0.25,
      x1: 0.8,
      y1: 0.75,
    });
  });
});
