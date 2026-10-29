import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints } from '../stadium-environment-layout.mjs';
import {
  DOCK_CARD_GAP_PX,
  FALL_KINDS,
  FALL_MAX,
  FENCE_INSET_PX,
  FENCE_MAX_POSTS,
  FENCE_SPACING_PX,
  KERB_PX,
  POOL_SINK_PX,
  ROCK_CARD_GAP_PX,
  ROCK_MAX,
  STONEWORK_ON_GROUND,
  STONEWORK_PARTS,
  STRUCTURE_CARD_GAP_PX,
  SUNKEN_CARD_GAP_PX,
  SUNKEN_MAX,
  SUNKEN_OFFSHORE_PX,
  TOWER_MAX,
  TOWER_WALL_PX,
  TREE_CARD_GAP_PX,
  TREE_MAX,
  brookletSpots,
  cardGap,
  lakeDistance,
  ledgeFront,
  nearShare,
  pathWidth,
  stonework,
} from '../stadium-env-brooklet-layout.mjs';

// The no-mat profile the board draws by default, and the simulator's own, at the board width
// board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layoutOf = (profile, half) => flatLayout(getMatLayout(profile), half);

const cardRects = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

for (const profile of PROFILES) {
  for (const half of HALVES) {
    const label = `${profile}, ${half.w} px half`;

    test(`brookletSpots (${label}) lays every card on the lake, well in from its shore`, () => {
      const layout = layoutOf(profile, half);
      const spots = brookletSpots(layout);
      for (const rect of cardRects(layout)) {
        const points = [
          [rect.x, rect.y],
          [rect.x + rect.w, rect.y],
          [rect.x, rect.y + rect.h],
          [rect.x + rect.w, rect.y + rect.h],
          [rect.x + rect.w / 2, rect.y + rect.h / 2],
        ];
        for (const [x, y] of points) assert.ok(lakeDistance(spots, x, y) <= -12, `(${x}, ${y}) of ${JSON.stringify(rect)} on the water`);
      }
    });

    test(`brookletSpots (${label}) keeps the towers, the basin and their falls clear of the cards`, () => {
      const layout = layoutOf(profile, half);
      const rects = cardRects(layout);
      const spots = brookletSpots(layout);
      assert.ok(spots.towers.length <= TOWER_MAX);
      for (const ring of [...spots.towers, spots.basin].filter(Boolean)) {
        assert.ok(cardGap(rects, ring.x, ring.y) - ring.r >= STRUCTURE_CARD_GAP_PX - 1e-9, `ring at (${ring.x}, ${ring.y})`);
      }
      assert.ok(spots.falls.length <= FALL_MAX);
      for (const fall of spots.falls) {
        assert.ok(fall.top > fall.bottom, 'falls down');
        const landing = { x: fall.x + fall.dx * fall.landing, y: fall.y + fall.dy * fall.landing };
        if (fall.kind === FALL_KINDS.lake) assert.ok(lakeDistance(spots, landing.x, landing.y) < 0, 'lands in the lake');
        if (fall.kind === FALL_KINDS.pool) {
          const into = spots.towers.find((tower) => Math.hypot(landing.x - tower.x, landing.y - tower.y) < tower.r - TOWER_WALL_PX);
          assert.ok(into, 'lands in a pool');
          assert.ok(Math.abs(fall.bottom - (into.rim - POOL_SINK_PX)) < 1e-9, "at that pool's level");
        }
        if (fall.kind === FALL_KINDS.basin) {
          const { basin } = spots;
          assert.ok(Math.hypot(landing.x - basin.x, landing.y - basin.y) < basin.r - KERB_PX, 'lands in the basin');
        }
      }
    });

    test(`brookletSpots (${label}) sets the boulders, rocks under the surface and bushes clear of the cards and each other`, () => {
      const layout = layoutOf(profile, half);
      const rects = cardRects(layout);
      const spots = brookletSpots(layout);
      assert.ok(spots.rocks.length <= ROCK_MAX && spots.sunken.length <= SUNKEN_MAX && spots.trees.length <= TREE_MAX);
      spots.rocks.forEach((rock, i) => {
        assert.ok(cardGap(rects, rock.x, rock.y) >= rock.r + ROCK_CARD_GAP_PX - 1e-9, `boulder ${i} clear of the cards`);
        for (const other of spots.rocks.slice(i + 1)) {
          assert.ok(Math.hypot(other.x - rock.x, other.y - rock.y) >= rock.r + other.r, `boulder ${i} clear of the others`);
        }
      });
      for (const rock of spots.sunken) {
        assert.ok(lakeDistance(spots, rock.x, rock.y) <= -(SUNKEN_OFFSHORE_PX + rock.r), 'out in open water');
        assert.ok(cardGap(rects, rock.x, rock.y) - rock.r >= SUNKEN_CARD_GAP_PX, 'clear of the cards');
      }
      spots.trees.forEach((tree, i) => {
        assert.ok(cardGap(rects, tree.x, tree.y) >= tree.r + TREE_CARD_GAP_PX - 1e-9, `bush ${i} clear of the cards`);
        for (const other of spots.trees.slice(i + 1)) {
          assert.ok(Math.hypot(other.x - tree.x, other.y - tree.y) >= tree.r + other.r, `bush ${i} clear of the others`);
        }
      });
    });

    test(`brookletSpots (${label}) runs the pier straight out over the water, clear of the cards`, () => {
      const layout = layoutOf(profile, half);
      const { dock } = brookletSpots(layout);
      assert.ok(dock, 'a pier');
      for (let along = 0; along <= dock.length; along += 4) {
        for (const side of [-1, 1]) {
          const x = dock.x + dock.dx * along - dock.dy * side * dock.halfWidth;
          const y = dock.y + dock.dy * along + dock.dx * side * dock.halfWidth;
          assert.ok(cardGap(cardRects(layout), x, y) >= DOCK_CARD_GAP_PX - 1e-9, `clear at ${along} px out`);
        }
      }
    });

    test(`brookletSpots (${label}) stands the ledge's walls on the shore and its front edge, outside every tower`, () => {
      const spots = brookletSpots(layoutOf(profile, half));
      const [front, ...shore] = spots.ledge.runs;
      for (const point of front) assert.ok(Math.abs(point.y - ledgeFront(spots.zones.ledgeY, point.x)) < 1e-9, 'on the front edge');
      for (const point of shore.flat()) {
        assert.ok(Math.abs(lakeDistance(spots, point.x, point.y)) < 0.5, `(${point.x}, ${point.y}) on the shore`);
        for (const tower of spots.towers) assert.ok(Math.hypot(point.x - tower.x, point.y - tower.y) >= tower.r - 2, 'outside the towers');
      }
      for (const point of [...front, ...shore.flat()]) assert.ok(Math.abs(Math.hypot(point.nx, point.ny) - 1) < 1e-6, 'a unit face');
    });

    test(`brookletSpots (${label}) posts the fence along the near path's outer edge`, () => {
      const spots = brookletSpots(layoutOf(profile, half));
      assert.ok(spots.fence.length >= 3 && spots.fence.length <= FENCE_MAX_POSTS, `${spots.fence.length} posts`);
      for (const post of spots.fence) {
        const edge = pathWidth(post.x, post.y) - FENCE_INSET_PX;
        assert.ok(Math.abs(lakeDistance(spots, post.x, post.y) - edge) < 0.5, `(${post.x}, ${post.y}) on the edge`);
        assert.ok(nearShare(spots.zones, post.x, post.y) >= 0.95, 'on the near shore');
      }
      for (let i = 1; i < spots.fence.length; i += 1) {
        const apart = Math.hypot(spots.fence[i].x - spots.fence[i - 1].x, spots.fence[i].y - spots.fence[i - 1].y);
        assert.ok(apart >= FENCE_SPACING_PX * 0.8, `posts ${i - 1}, ${i} ${apart} px apart`);
      }
    });
  }
}

test("brookletSpots places the map's pieces on the default board: four pools, five falls, thirteen boulders", () => {
  const spots = brookletSpots(layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]));
  assert.equal(spots.towers.length, 4);
  assert.deepEqual(
    spots.falls.map((fall) => fall.kind),
    [FALL_KINDS.lake, FALL_KINDS.pool, FALL_KINDS.lake, FALL_KINDS.pool, FALL_KINDS.basin]
  );
  assert.equal(spots.rocks.length, 13);
  assert.equal(spots.sunken.length, SUNKEN_MAX);
  assert.ok(spots.cave && spots.basin && spots.ledge && spots.dock, 'the cave, the basin, the ledge and the pier');
  // The pier off the right shore, the basin and the ledge on the left, as the map has them.
  assert.ok(spots.dock.dx < 0 && spots.basin.x < spots.core.x0 && spots.zones.ledgeY > spots.basin.y + spots.basin.r);
});

test('brookletSpots is null without a table, and the same every time', () => {
  assert.equal(brookletSpots(null), null);
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.deepEqual(brookletSpots(layout), brookletSpots(layout));
});

test('stonework builds one indexed mesh: every index in range, unit normals, a part and levels per vertex', () => {
  const spots = brookletSpots(layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]));
  const { positions, normals, parts, levels, index } = stonework(spots);
  const count = positions.length / 3;
  assert.ok(count > 0 && Number.isInteger(count));
  assert.equal(normals.length, positions.length);
  assert.equal(parts.length, count * 3);
  assert.equal(levels.length, count * 2);
  assert.equal(index.length % 3, 0);
  assert.ok(index.every((i) => Number.isInteger(i) && i >= 0 && i < count));
  for (let i = 0; i < count; i += 1) {
    const length = Math.hypot(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]);
    assert.ok(Math.abs(length - 1) < 1e-6, `normal ${i}`);
    assert.ok(Object.values(STONEWORK_PARTS).includes(parts[3 * i]), `part ${parts[3 * i]}`);
    const [top, water] = [levels[2 * i], levels[2 * i + 1]];
    assert.ok(water === STONEWORK_ON_GROUND || water < top, `vertex ${i} levels`);
  }
  // The ledge's walls are in it.
  assert.ok(parts.some((part, i) => i % 3 === 0 && part === STONEWORK_PARTS.ledgeWall));
});

test('stonework of nothing is empty', () => {
  assert.deepEqual(stonework(), { positions: [], normals: [], parts: [], levels: [], index: [] });
});
