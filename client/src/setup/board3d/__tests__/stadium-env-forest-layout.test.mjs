import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, sceneBounds } from '../stadium-environment-layout.mjs';
import {
  BOG_CARD_GAP_PX,
  BOG_EDGE_OVERHANG,
  BOG_LOBE,
  BOG_SEAM_GAP_PX,
  CLEARING_RADIUS_PX,
  JUNGLE_KEY,
  MAX_BOG_LOBES,
  MAX_CARD_RECTS,
  MAX_TREES,
  PLANT_CLEARING_GAP_PX,
  PUFF_REACH,
  TREE_CARD_GAP_PX,
  TREE_CLEARING_REACH_PX,
  TREE_SPACING_PX,
  clearingCore,
  clearingDistance,
  jungleBells,
  jungleLeaves,
  junglePlants,
  jungleSpikes,
  jungleSpots,
  jungleTrees,
  poisonBogs,
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

/** Whether a lobe runs past no edge of `bounds` by more than BOG_EDGE_OVERHANG of its radius. */
const withinOverhang = (lobe, bounds) => {
  const inset = lobe.r * (1 - BOG_EDGE_OVERHANG) - 1e-9;
  return (
    lobe.x - bounds.x >= inset &&
    bounds.x + bounds.w - lobe.x >= inset &&
    lobe.y - bounds.y >= inset &&
    bounds.y + bounds.h - lobe.y >= inset
  );
};

/** Every part of a tree as a circle seen from above: its foliage, its limbs' ends, its vines. */
const treeParts = (tree) => [
  ...tree.puffs.map((puff) => ({ x: puff.x, y: puff.y, r: puff.r * PUFF_REACH })),
  ...tree.limbs.flatMap((limb) =>
    [limb.from, limb.via, limb.to].map(([x, y], i) => ({
      x,
      y,
      // The trunk's foot flares to nearly twice its radius.
      r: (i === 0 ? limb.r0 * (1 + 0.9 * limb.flare) : Math.max(limb.r0, limb.r1)) + 1e-9,
    }))
  ),
  ...tree.vines.map((vine) => ({ x: vine.x, y: vine.y, r: vine.width / 2 })),
];

for (const profile of PROFILES) {
  for (const half of HALVES) {
    const label = `${profile}, ${half.w} px half`;

    test(`poisonBogs (${label}) lie in opposite corners away from the seam, clear of every footprint, within their overhang`, () => {
      const layout = layoutOf(profile, half);
      const bogs = poisonBogs(layout);
      assert.equal(bogs.length, 2, `${bogs.length} bogs`);
      assert.deepEqual(poisonBogs(layout), bogs, 'deterministic');
      const rects = cardRects(layout);
      const seam = layout.depth;
      const [farLeft, nearRight] = bogs.map((bog) => bog.lobes[0]);
      assert.ok(farLeft.x <= Math.min(...rects.map((rect) => rect.x)) && farLeft.y >= seam + BOG_SEAM_GAP_PX, 'far end, left of the cards');
      assert.ok(nearRight.x >= Math.max(...rects.map((rect) => rect.x + rect.w)) && nearRight.y <= seam - BOG_SEAM_GAP_PX, 'near end, right of the cards');
      const table = tableBounds(layout);
      const scene = sceneBounds(layout, JUNGLE_KEY);
      for (const { lobes, island } of bogs) {
        const [main, ...others] = lobes;
        assert.ok(main.r >= BOG_LOBE.min && main.r <= BOG_LOBE.max, `radius ${main.r}`);
        assert.ok(lobes.length <= MAX_BOG_LOBES, `${lobes.length} lobes`);
        const bounds = withinOverhang(main, table) ? table : scene;
        for (const lobe of lobes) {
          const at = `lobe at ${lobe.x.toFixed(0)}, ${lobe.y.toFixed(0)}`;
          assert.ok(nearestCard(layout, lobe.x, lobe.y) >= lobe.r + BOG_CARD_GAP_PX - 1e-9, `${at} clear of the cards`);
          assert.ok(withinOverhang(lobe, bounds), `${at} within its overhang`);
        }
        for (const lobe of others) assert.ok(lobe.r < main.r && waterDistance({ bogs }, (lobe.x + main.x) / 2, (lobe.y + main.y) / 2) < 0, 'a smaller lobe joined to the biggest');
        assert.ok(Math.hypot(island.x - main.x, island.y - main.y) + island.r < main.r, 'the island lies in the biggest lobe');
      }
    });

    test(`the clearing (${label}) holds every card footprint, and the jungle closes in past the near and far edges`, () => {
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
      assert.ok(clearingDistance(spots, table.x + table.w / 2, table.y - 20) > 0, 'jungle past the near edge');
      assert.ok(clearingDistance(spots, table.x + table.w / 2, table.y + table.h + 20) > 0, 'jungle past the far edge');
    });

    test(`the clearing (${label}) fills every gap between the cards: no jungle inside the block of cards`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      const core = clearingCore(cardRects(layout));
      assert.deepEqual(spots.core, core);
      for (let x = core.x; x <= core.x + core.w; x += 10) {
        for (let y = core.y; y <= core.y + core.h; y += 10) {
          assert.ok(clearingDistance(spots, x, y) < -CLEARING_RADIUS_PX + 1e-6, `clearing at ${x.toFixed(0)}, ${y.toFixed(0)}`);
        }
      }
    });

    test(`jungleTrees (${label}): every part of every tree stays outside the cards' columns, inside its crown's circle`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      const rects = cardRects(layout);
      const left = Math.min(...rects.map((rect) => rect.x)) - TREE_CARD_GAP_PX;
      const right = Math.max(...rects.map((rect) => rect.x + rect.w)) + TREE_CARD_GAP_PX;
      assert.ok(spots.trees.length > 0 && spots.trees.length <= MAX_TREES, `${spots.trees.length} trees`);
      for (const tree of spots.trees) {
        const at = `tree at ${tree.x.toFixed(0)}, ${tree.y.toFixed(0)}`;
        if (tree.side < 0) assert.ok(tree.cx + tree.crown <= left + 1e-9, `${at} left of the cards`);
        else assert.ok(tree.cx - tree.crown >= right - 1e-9, `${at} right of the cards`);
        for (const part of treeParts(tree)) {
          const out = Math.hypot(part.x - tree.cx, part.y - tree.cy) + part.r;
          assert.ok(out <= tree.crown + 1e-6, `${at}: a part reaches ${out.toFixed(1)} of its crown's ${tree.crown.toFixed(1)}`);
        }
      }
    });

    test(`jungleTrees (${label}) stand apart, rooted on dry ground at the clearing's edge or past it, the same every time`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      assert.deepEqual(jungleTrees(layout, spots), spots.trees, 'deterministic');
      for (const tree of spots.trees) {
        assert.ok(waterDistance(spots, tree.x, tree.y) >= tree.trunk * 2.2 + 8 - 1e-9, 'out of the bogs');
        assert.ok(clearingDistance(spots, tree.x, tree.y) >= -TREE_CLEARING_REACH_PX, 'not out in the clearing');
        for (const other of spots.trees) {
          if (other !== tree) assert.ok(Math.hypot(other.x - tree.x, other.y - tree.y) >= TREE_SPACING_PX, 'apart');
        }
      }
    });

    test(`junglePlants (${label}) dot the jungle floor past the clearing, on dry ground, clear of the trunks`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      assert.deepEqual(junglePlants(spots, sceneBounds(layout, JUNGLE_KEY)), spots.plants, 'deterministic');
      assert.ok(spots.plants.length > 40, `${spots.plants.length} plants`);
      for (const plant of spots.plants) {
        const at = `plant at ${plant.x.toFixed(0)}, ${plant.y.toFixed(0)}`;
        assert.ok(clearingDistance(spots, plant.x, plant.y) >= PLANT_CLEARING_GAP_PX, `${at} past the clearing`);
        assert.ok(waterDistance(spots, plant.x, plant.y) >= 24, `${at} on dry ground`);
        for (const tree of spots.trees) assert.ok(Math.hypot(plant.x - tree.x, plant.y - tree.y) >= tree.trunk * 2.4 + 14, `${at} off a trunk`);
      }
    });

    test(`jungleLeaves (${label}) roots no leaf on or by a card, and keeps the floor dotted, not carpeted`, () => {
      const layout = layoutOf(profile, half);
      const spots = jungleSpots(layout);
      const leaves = jungleLeaves(spots);
      assert.ok(leaves.length > 300 && leaves.length < 1600, `${leaves.length} leaves`);
      assert.deepEqual(jungleLeaves(jungleSpots(layout)), leaves, 'deterministic');
      for (const leaf of leaves) assert.ok(nearestCard(layout, leaf.x, leaf.y) >= 20, `leaf at ${leaf.x}, ${leaf.y} clear of the cards`);
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

test('jungleSpots keeps at most MAX_CARD_RECTS footprints; no layout gives no bogs, trees, plants or flowers', () => {
  const spots = jungleSpots(layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]));
  assert.ok(spots.cards.length > 0 && spots.cards.length <= MAX_CARD_RECTS);
  assert.ok(spots.trees.some((tree) => tree.side < 0) && spots.trees.some((tree) => tree.side > 0), 'trees on both sides');
  assert.deepEqual(poisonBogs(null), []);
  assert.equal(clearingCore([]), null);
  assert.equal(waterDistance({ bogs: [] }, 0, 0), Infinity);
  const empty = { bogs: [], cards: [], core: null, table: { x: 0, y: 0, w: 0, h: 0 }, trees: [], plants: [] };
  assert.deepEqual(jungleTrees(null, empty), []);
  assert.deepEqual(junglePlants(empty, { x: 0, y: 0, w: 0, h: 0 }), []);
  assert.deepEqual(jungleBells(empty), []);
  assert.deepEqual(jungleSpikes(empty), []);
  assert.deepEqual(jungleLeaves(null), []);
  const none = jungleSpots(null);
  assert.deepEqual([none.bogs, none.core, none.trees, none.plants, none.bells, none.spikes], [[], null, [], [], [], []]);
});
