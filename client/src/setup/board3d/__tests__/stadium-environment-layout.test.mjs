import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_UNITS } from '../card-geometry.mjs';
import { flatLayout } from '../board-layout.mjs';
import { placementPose } from '../card-poses.mjs';
import { pilePose } from '../pile-poses.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import {
  CRATER_FLOOR_MARGIN_PX,
  EMBLEM_CLEARANCE_PX,
  ENVIRONMENT_OVERRIDE_KEY,
  PEAK_CARD_GAP_PX,
  PEAK_EDGE_OVERHANG,
  PEAK_MAX_RADIUS,
  PEAK_MIN_RADIUS,
  RIDGE_HALF_WIDTH,
  VOLCANO_EDGE_OVERHANG,
  VOLCANO_MARGIN_PX,
  VOLCANO_MAX_RADIUS,
  VOLCANO_MIN_RADIUS,
  craterBowl,
  craterEmblem,
  environmentFootprints,
  environmentKeyFor,
  environmentOverride,
  mountainPeaks,
  sceneBounds,
  volcanoSpot,
} from '../stadium-environment-layout.mjs';

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

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

/** The rect of the card a pose draws: centred on it, `widthPx` wide, card-shaped. */
const drawnRect = (pose) => {
  const h = (pose.widthPx * CARD_UNITS.h) / CARD_UNITS.w;
  return { x: pose.x - pose.widthPx / 2, y: pose.y - h / 2, w: pose.widthPx, h };
};
const assertSameRect = (actual, expected, label) => {
  for (const key of ['x', 'y', 'w', 'h']) close(actual[key], expected[key], `${label}.${key}`);
};

// customhb-299 is Scorched Earth in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor maps Scorched Earth by id, or by set and number when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-299' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ set: 'customhb', number: '299' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ id: '', set: 'customhb', number: 299 }), 'scorched-earth');
  // customhb-001 is Weedle: not a Stadium.
  assert.equal(environmentKeyFor({ id: 'customhb-001' }), null);
  assert.equal(environmentKeyFor({ set: 'customhb', number: 'abc' }), null);
  assert.equal(environmentKeyFor({ set: 'sv1', number: '299' }), null);
  assert.equal(environmentKeyFor(null), null);
});

test('environmentKeyFor gives every Homebrew Stadium in set.json a board of its own, and no other card one', () => {
  const set = JSON.parse(readFileSync(new URL('../../../assets/custom-sets/customhb/set.json', import.meta.url), 'utf8'));
  const stadiums = set.cards.filter((card) => card.trainerType === 'Stadium');
  // The worktree's set.json holds 17 Stadiums; the full set (primary folder) holds 25, each with a board here.
  assert.ok(stadiums.length >= 17);
  const keys = stadiums.map((card) => environmentKeyFor({ id: card.id }));
  assert.ok(keys.every(Boolean), `unmapped: ${stadiums.filter((_, i) => !keys[i]).map((card) => card.name)}`);
  assert.equal(new Set(keys).size, stadiums.length);
  for (const card of set.cards.filter((each) => each.trainerType !== 'Stadium')) {
    assert.equal(environmentKeyFor({ id: card.id }), null, card.name);
  }
});

test('environmentOverride reads the URL first, then storage, and ignores unknown or unreadable values', () => {
  const storage = (value) => ({ getItem: (key) => (key === ENVIRONMENT_OVERRIDE_KEY ? value : null) });
  assert.equal(environmentOverride(storage('scorched-earth')), 'scorched-earth');
  assert.equal(environmentOverride(storage(null), '?e2e=1&stadiumEnv=scorched-earth'), 'scorched-earth');
  assert.equal(environmentOverride(storage('beach')), null);
  assert.equal(environmentOverride(null), null);
  assert.equal(environmentOverride({ getItem: () => { throw new Error('blocked'); } }), null);
});

for (const profile of PROFILES) {
  test(`environmentFootprints (${profile}) lies exactly under the cards the board's poses draw`, () => {
    const layout = layoutOf(profile, HALVES[0]);
    const { slabs, flats } = environmentFootprints(layout);
    // Per side: Active, 5 Bench, Prize block, deck, discard, Lost Zone; plus the Stadium.
    assert.equal(slabs.length, 21);
    assert.deepEqual(flats, [layout.self.board, layout.opp.board]);
    const active = placementPose({ side: 'self', zone: 'active', index: 0, instanceId: 1 }, layout);
    assertSameRect(slabs[0], drawnRect(active), 'self active');
    const bench = placementPose({ side: 'self', zone: 'bench', index: 2, instanceId: 2 }, layout);
    assertSameRect(slabs[3], drawnRect(bench), 'self bench 2');
    const prizes = [0, 1, 2, 3, 4, 5].map((index) =>
      drawnRect(placementPose({ side: 'self', zone: 'prizes', index, instanceId: 10 + index }, layout))
    );
    for (const prize of prizes) {
      assert.ok(prize.x >= slabs[6].x - 1e-9 && prize.x + prize.w <= slabs[6].x + slabs[6].w + 1e-9, 'prize inside block (x)');
      assert.ok(prize.y >= slabs[6].y - 1e-9 && prize.y + prize.h <= slabs[6].y + slabs[6].h + 1e-9, 'prize inside block (y)');
    }
    assertSameRect(slabs[7], drawnRect(pilePose('self', 'deck', layout)), 'self deck');
    const stadium = layout.stadium;
    assertSameRect(slabs.at(-1), drawnRect({ x: stadium.x + stadium.w / 2, y: stadium.y + stadium.h / 2, widthPx: stadium.w }), 'stadium');
  });
}

test('environmentFootprints of a missing layout is empty', () => {
  assert.deepEqual(environmentFootprints(null), { slabs: [], flats: [] });
});

for (const profile of PROFILES) {
  for (const half of HALVES) {
    test(`volcanoSpot (${profile}, ${half.w} px half) stands left of the Stadium, clear of every footprint, little past an edge`, () => {
      const layout = layoutOf(profile, half);
      const footprints = environmentFootprints(layout);
      const spot = volcanoSpot(layout, footprints);
      assert.ok(spot, 'a volcano fits');
      assert.ok(spot.r >= VOLCANO_MIN_RADIUS && spot.r <= VOLCANO_MAX_RADIUS, `radius ${spot.r}`);
      assert.ok(spot.x <= layout.stadium.x, 'left of the Stadium');
      for (const rect of [...footprints.slabs, ...footprints.flats]) {
        assert.ok(distanceToRect(spot.x, spot.y, rect) >= spot.r + VOLCANO_MARGIN_PX - 1e-9, `clear of ${JSON.stringify(rect)}`);
      }
      const bounds = tableBounds(layout);
      const inner = spot.r * (1 - VOLCANO_EDGE_OVERHANG);
      assert.ok(spot.x - inner >= bounds.x - 1e-9);
      assert.ok(spot.y - inner >= bounds.y - 1e-9);
      assert.ok(spot.y + inner <= bounds.y + bounds.h + 1e-9);
    });
  }
}

test('volcanoSpot is null without a Stadium rect or when no circle fits', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.equal(volcanoSpot({ ...layout, stadium: null }, environmentFootprints(layout)), null);
  assert.equal(volcanoSpot(layout, { slabs: [tableBounds(layout)], flats: [] }), null);
});

// customhb-051 is Stormy Mountains in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor maps Stormy Mountains by id, or by set and number when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-051' }), 'stormy-mountains');
  assert.equal(environmentKeyFor({ set: 'customhb', number: '51' }), 'stormy-mountains');
  assert.equal(environmentOverride(null, '?stadiumEnv=stormy-mountains'), 'stormy-mountains');
});

// customhb-253 is Perilous Jungle in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor maps Perilous Jungle by id, or by set and number when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-253' }), 'perilous-jungle');
  assert.equal(environmentKeyFor({ set: 'customhb', number: '253' }), 'perilous-jungle');
  assert.equal(environmentOverride(null, '?stadiumEnv=perilous-jungle'), 'perilous-jungle');
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.deepEqual(sceneBounds(layout, 'perilous-jungle'), sceneBounds(layout, 'stormy-mountains'));
});

const cornersOf = (rect) => [
  [rect.x, rect.y],
  [rect.x + rect.w, rect.y],
  [rect.x, rect.y + rect.h],
  [rect.x + rect.w, rect.y + rect.h],
];

/** Each side's Active and Bench cards where the board's poses draw them. */
const playRects = (layout) =>
  ['self', 'opp'].map((side) => ({
    actives: [drawnRect(placementPose({ side, zone: 'active', index: 0, instanceId: 1 }, layout))],
    benches: layout[side].bench.map((_, index) =>
      drawnRect(placementPose({ side, zone: 'bench', index, instanceId: 2 + index }, layout))
    ),
  }));

test('sceneBounds runs Stormy Mountains past every table edge and leaves other boards on the table', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  const table = tableBounds(layout);
  assert.deepEqual(sceneBounds(layout, 'scorched-earth'), table);
  assert.deepEqual(sceneBounds(layout, null), table);
  const scene = sceneBounds(layout, 'stormy-mountains');
  assert.ok(scene.x < table.x && scene.y < table.y, 'past the left and near edges');
  assert.ok(scene.x + scene.w > table.x + table.w && scene.y + scene.h > table.y + table.h, 'past the right and far edges');
  close(scene.x + scene.w / 2, table.x + table.w / 2, 'centred across the table');
  // The default board's whole rim lies in the scene, so it closes round the arena.
  const bowl = craterBowl(layout);
  assert.ok(bowl.x - bowl.rim >= scene.x && bowl.x + bowl.rim <= scene.x + scene.w, 'rim inside across');
  assert.ok(bowl.y - bowl.rim >= scene.y && bowl.y + bowl.rim <= scene.y + scene.h, 'rim inside along');
  assert.deepEqual(sceneBounds(null, 'stormy-mountains'), { x: 0, y: 0, w: 0, h: 0 });
});

for (const profile of PROFILES) {
  for (const half of HALVES) {
    test(`craterBowl (${profile}, ${half.w} px half) is centred on the table, its floor holding every Active and Bench card`, () => {
      const layout = layoutOf(profile, half);
      const bowl = craterBowl(layout);
      const table = tableBounds(layout);
      close(bowl.x, table.x + table.w / 2, 'centre x');
      close(bowl.y, table.y + table.h / 2, 'centre y');
      assert.ok(bowl.floor < bowl.rim && bowl.rim < bowl.foot, 'floor, rim and foot run outward');
      for (const { actives, benches } of playRects(layout)) {
        for (const rect of [...actives, ...benches]) {
          for (const [x, y] of cornersOf(rect)) {
            assert.ok(Math.hypot(x - bowl.x, y - bowl.y) <= bowl.floor - CRATER_FLOOR_MARGIN_PX + 1e-9, `corner ${x},${y}`);
          }
        }
      }
    });

    test(`mountainPeaks (${profile}, ${half.w} px half) stand clear of every card, little past a table edge, the summit on the right`, () => {
      const layout = layoutOf(profile, half);
      const bowl = craterBowl(layout);
      const peaks = mountainPeaks(layout, bowl);
      const { slabs, flats } = environmentFootprints(layout);
      const cards = [...slabs, ...flats];
      const table = tableBounds(layout);
      for (const [name, peak] of Object.entries(peaks)) {
        assert.ok(peak, `${name} fits`);
        assert.ok(peak.r >= PEAK_MIN_RADIUS && peak.r <= PEAK_MAX_RADIUS, `${name} radius ${peak.r}`);
        assert.ok(peak.h > 0, `${name} height`);
        for (const rect of cards) {
          assert.ok(distanceToRect(peak.x, peak.y, rect) >= peak.r + PEAK_CARD_GAP_PX - 1e-9, `${name} clear of ${JSON.stringify(rect)}`);
        }
        const inner = peak.r * (1 - PEAK_EDGE_OVERHANG);
        assert.ok(peak.x - inner >= table.x - 1e-9 && peak.x + inner <= table.x + table.w + 1e-9, `${name} across`);
        assert.ok(peak.y - inner >= table.y - 1e-9 && peak.y + inner <= table.y + table.h + 1e-9, `${name} along`);
        for (let k = 1; k <= 10; k += 1) {
          const x = peak.x + ((peak.ridge.x - peak.x) * k) / 10;
          const y = peak.y + ((peak.ridge.y - peak.y) * k) / 10;
          for (const rect of cards) {
            assert.ok(distanceToRect(x, y, rect) >= peak.r * RIDGE_HALF_WIDTH + PEAK_CARD_GAP_PX - 1e-9, `${name} ridge at ${k}/10`);
          }
        }
      }
      assert.ok(peaks.left.x < bowl.x && peaks.right.x > bowl.x, 'lesser peak left, summit right');
      assert.ok(peaks.right.h > peaks.left.h, 'the summit stands taller');
    });

    test(`craterEmblem (${profile}, ${half.w} px half) rings the Actives, clear of them and of the Bench`, () => {
      const layout = layoutOf(profile, half);
      const bowl = craterBowl(layout);
      const emblem = craterEmblem(layout, bowl);
      const rects = playRects(layout);
      const actives = rects.flatMap((side) => side.actives);
      const benches = rects.flatMap((side) => side.benches);
      const inner = Math.max(...actives.flatMap(cornersOf).map(([x, y]) => Math.hypot(x - bowl.x, y - bowl.y)));
      const outer = Math.min(...benches.map((rect) => distanceToRect(bowl.x, bowl.y, rect)));
      if (outer - inner < 2 * EMBLEM_CLEARANCE_PX) {
        assert.equal(emblem, null, 'no room between the Actives and the Bench');
        return;
      }
      assert.ok(emblem.r - inner >= EMBLEM_CLEARANCE_PX - 1e-9, 'clear of the Actives');
      assert.ok(outer - emblem.r >= EMBLEM_CLEARANCE_PX - 1e-9, 'clear of the Bench');
      assert.deepEqual([emblem.x, emblem.y], [bowl.x, bowl.y]);
    });
  }
}

test('craterBowl, mountainPeaks and craterEmblem are empty without a layout or a bowl', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.equal(craterBowl(null), null);
  assert.deepEqual(mountainPeaks(layout, null), { left: null, right: null });
  assert.deepEqual(mountainPeaks(null, craterBowl(layout)), { left: null, right: null });
  assert.equal(craterEmblem(layout, null), null);
  assert.equal(craterEmblem(null, craterBowl(layout)), null);
});
