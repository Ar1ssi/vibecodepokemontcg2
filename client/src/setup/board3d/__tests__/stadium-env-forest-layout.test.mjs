import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, sceneBounds } from '../stadium-environment-layout.mjs';
import {
  CLEARING_RADIUS_PX,
  JUNGLE_KEY,
  MAX_CARD_RECTS,
  POOL_CARD_GAP_PX,
  POOL_EDGE_OVERHANG,
  POOL_MAX_RADIUS,
  POOL_MIN_RADIUS,
  STREAM_HALF_WIDTH,
  STREAM_POINTS,
  STREAM_SPAN_PX,
  clearingDistance,
  jungleBells,
  jungleLeaves,
  jungleSpikes,
  jungleSpots,
  poisonPool,
  poolIsland,
  streamCourse,
  waterDistance,
} from '../stadium-env-forest-layout.mjs';

// The no-mat profile the board draws by default, and the simulator's own, at the board width
// board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layoutOf = (profile, half) => flatLayout(getMatLayout(profile), half);

const distanceToRect = (x, y, rect) =>
  Math.hypot(Math.max(rect.x - x, 0, x - (rect.x + rect.w)), Math.max(rect.y - y, 0, y - (rect.y + rect.h)));

const cardRects = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

const nearestCard = (layout, x, y) => Math.min(...cardRects(layout).map((rect) => distanceToRect(x, y, rect)));

for (const profile of PROFILES) {
  for (const half of HALVES) {
    const label = `${profile}, ${half.w} px half`;

    test(`poisonPool (${label}) lies left of the cards, clear of every footprint, at most its overhang past the table`, () => {
      const layout = layoutOf(profile, half);
      const pool = poisonPool(layout);
      if (!pool) return;
      const table = tableBounds(layout);
      assert.ok(pool.r >= POOL_MIN_RADIUS && pool.r <= POOL_MAX_RADIUS, `radius ${pool.r}`);
      assert.ok(nearestCard(layout, pool.x, pool.y) >= pool.r + POOL_CARD_GAP_PX - 1e-9, 'clear of the cards');
      assert.ok(pool.x <= Math.min(...cardRects(layout).map((rect) => rect.x)), 'left of the cards');
      assert.ok(pool.x - pool.r >= table.x - pool.r * POOL_EDGE_OVERHANG - 1e-9, 'within its overhang');
      const island = poolIsland(pool);
      assert.ok(Math.hypot(island.x - pool.x, island.y - pool.y) + island.r < pool.r, 'the island lies in the pool');
    });

    test(`streamCourse (${label}) runs from the pool along the seam to past the scene's right edge`, () => {
      const layout = layoutOf(profile, half);
      const pool = poisonPool(layout);
      const course = streamCourse(layout, pool);
      const scene = sceneBounds(layout, JUNGLE_KEY);
      assert.equal(course.length, STREAM_POINTS);
      if (pool) assert.ok(Math.hypot(course[0].x - pool.x, course[0].y - pool.y) <= 8, 'from the centre of the pool');
      else assert.ok(course[0].x < scene.x, 'in from past the left edge');
      assert.ok(course.at(-1).x > scene.x + scene.w, 'out past the right edge');
      for (let i = 1; i < course.length; i += 1) assert.ok(course[i].x > course[i - 1].x, 'always downstream');
      for (const point of course) {
        assert.ok(Math.abs(point.y - layout.depth) <= STREAM_SPAN_PX + 1e-9, `on the seam's band at x ${point.x}`);
        assert.ok(point.w >= STREAM_HALF_WIDTH.min - 1e-9 && point.w <= STREAM_HALF_WIDTH.max + 1e-9, `width ${point.w}`);
      }
    });

    test(`the clearing (${label}) holds every card footprint, and the undergrowth closes in past the near and far edges`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      const table = tableBounds(layout);
      for (const rect of cardRects(layout)) {
        for (const [x, y] of [
          [rect.x, rect.y],
          [rect.x + rect.w, rect.y + rect.h],
          [rect.x + rect.w / 2, rect.y + rect.h / 2],
        ]) {
          const inside = -Math.min(CLEARING_RADIUS_PX, y - table.y, table.y + table.h - y);
          assert.ok(clearingDistance(spots, x, y) <= inside, `card at ${x}, ${y} in the clearing`);
        }
      }
      assert.ok(clearingDistance(spots, table.x + table.w / 2, table.y - 20) > 0, 'undergrowth past the near edge');
      assert.ok(clearingDistance(spots, table.x + table.w / 2, table.y + table.h + 20) > 0, 'undergrowth past the far edge');
    });

    test(`jungleLeaves (${label}) roots no leaf on or by a card, and the undergrowth's on dry ground, the same every time`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      const scene = sceneBounds(layout, JUNGLE_KEY);
      const leaves = jungleLeaves(spots, scene);
      assert.ok(leaves.length > 500, `${leaves.length} leaves`);
      assert.deepEqual(jungleLeaves(jungleSpots(layout), scene), leaves, 'deterministic');
      for (const leaf of leaves) {
        // Past the near and far edges the hedge stands right behind the cards there.
        assert.ok(nearestCard(layout, leaf.x, leaf.y) >= 20, `leaf at ${leaf.x}, ${leaf.y} clear of the cards`);
        if (leaf.follow === 1) assert.ok(waterDistance(spots, leaf.x, leaf.y) >= 2, 'undergrowth on dry ground');
      }
    });

    test(`the flowers (${label}) stand clear of the cards; every bell arches out toward the water`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      for (const flower of [...spots.bells, ...spots.spikes]) {
        assert.ok(nearestCard(layout, flower.x, flower.y) >= 50, `flower at ${flower.x}, ${flower.y}`);
      }
      for (const bell of spots.bells) {
        const tip = { x: bell.x + Math.cos(bell.yaw) * bell.reach, y: bell.y + Math.sin(bell.yaw) * bell.reach };
        assert.ok(waterDistance(spots, tip.x, tip.y) < waterDistance(spots, bell.x, bell.y), 'toward the water');
      }
    });
  }
}

test('jungleSpots keeps at most MAX_CARD_RECTS footprints; no layout gives no pool, course or flowers', () => {
  const spots = jungleSpots(layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]));
  assert.ok(spots.cards.length > 0 && spots.cards.length <= MAX_CARD_RECTS);
  assert.equal(poisonPool(null), null);
  assert.deepEqual(streamCourse(null, null), []);
  const empty = { pool: null, stream: [], cards: [], table: { x: 0, y: 0, w: 0, h: 0 } };
  assert.deepEqual(jungleBells(empty), []);
  assert.deepEqual(jungleSpikes(empty), []);
  assert.deepEqual(jungleLeaves(null, { x: 0, y: 0, w: 100, h: 100 }), []);
});
