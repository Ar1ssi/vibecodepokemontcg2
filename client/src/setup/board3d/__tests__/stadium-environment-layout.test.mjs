import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_UNITS } from '../card-geometry.mjs';
import { flatLayout } from '../board-layout.mjs';
import { placementPose } from '../card-poses.mjs';
import { pilePose } from '../pile-poses.mjs';
import { tableBounds } from '../table-uv.mjs';
import { VOLCANO_SHAPE } from '../stadium-env-volcanic.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import {
  CRATER_FLOOR_MARGIN_PX,
  EMBLEM_CLEARANCE_PX,
  ENVIRONMENT_KEYS,
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
  VOLCANO_PAST_EDGE,
  VOLCANO_SEAM_GAP_PX,
  VOLCANO_RISE,
  LAVA_PATH,
  craterBowl,
  craterInView,
  craterEmblem,
  environmentFootprints,
  environmentKeyFor,
  environmentOverride,
  mountainPeaks,
  sceneBounds,
  lavaPath,
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

test('environmentKeyFor maps a Homebrew Stadium by its name, whatever its number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-293', name: 'Scorched Earth' }), 'scorched-earth');
  // The set is renumbered when cards are added: the number never picks the board.
  assert.equal(environmentKeyFor({ id: 'customhb-999', name: 'Scorched Earth' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ id: '', set: 'customhb', name: 'Scorched Earth' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ id: 'customhb-353', name: 'Pokémon Center' }), 'pokemon-center');
  // customhb-351 was Lumiose City before the renumbering and is Shopping Center after it.
  assert.equal(environmentKeyFor({ id: 'customhb-351', name: 'Shopping Center' }), 'shopping-center');
});

test('environmentKeyFor gives no board to other sets, other cards, or a card without a name', () => {
  // xy5-138 is the printed Scorched Earth: boards belong to the Homebrew set only.
  assert.equal(environmentKeyFor({ id: 'xy5-138', set: 'xy5', name: 'Scorched Earth' }), null);
  assert.equal(environmentKeyFor({ name: 'Scorched Earth' }), null);
  assert.equal(environmentKeyFor({ id: 'customhb-001', name: 'Weedle' }), null);
  assert.equal(environmentKeyFor({ id: 'customhb-293' }), null);
  assert.equal(environmentKeyFor({ id: 'customhb-293', name: '' }), null);
  assert.equal(environmentKeyFor({ id: 293, set: 'customhb', name: null }), null);
  assert.equal(environmentKeyFor(null), null);
});

// Homebrew Stadiums nobody has built a board for yet (I282). A Stadium added to the set fails the
// test below until it has a board or is named here.
const STADIUMS_WITHOUT_A_BOARD = [
  'Altar of the Moone',
  'Altar of the Sunne',
  'Broken Time-Space',
  'Shrine of Punishment',
  'Sky Field',
  'Sky Pillar',
  'Temple of Sinnoh',
];

test('every board belongs to exactly one Homebrew Stadium in set.json, and no other card has one', () => {
  const set = JSON.parse(readFileSync(new URL('../../../assets/custom-sets/customhb/set.json', import.meta.url), 'utf8'));
  const stadiums = set.cards.filter((card) => card.trainerType === 'Stadium');
  const keyOf = (card) => environmentKeyFor({ id: card.id, name: card.name });
  const boarded = stadiums.filter(keyOf);
  assert.deepEqual(boarded.map(keyOf).sort(), [...ENVIRONMENT_KEYS].sort());
  const boardless = stadiums.filter((card) => !keyOf(card)).map((card) => card.name);
  assert.deepEqual(boardless.sort(), STADIUMS_WITHOUT_A_BOARD);
  for (const card of set.cards.filter((each) => each.trainerType !== 'Stadium')) {
    assert.equal(keyOf(card), null, card.name);
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
    // Design 084: the volcano is the board's top-left landmark; design 085: a bigger, lower mountain.
    test(`volcanoSpot (${profile}, ${half.w} px half) stands far and left of the Stadium, clear of every footprint`, () => {
      const layout = layoutOf(profile, half);
      const footprints = environmentFootprints(layout);
      const rects = [...footprints.slabs, ...footprints.flats];
      const spot = volcanoSpot(layout, footprints);
      assert.ok(spot, 'a volcano fits');
      assert.ok(spot.r >= VOLCANO_MIN_RADIUS && spot.r <= VOLCANO_MAX_RADIUS, `radius ${spot.r}`);
      assert.ok(spot.x <= layout.stadium.x, 'left of the Stadium');
      for (const rect of rects) {
        assert.ok(distanceToRect(spot.x, spot.y, rect) >= spot.r + VOLCANO_MARGIN_PX - 1e-9, `clear of ${JSON.stringify(rect)}`);
      }
      assert.ok(spot.y >= layout.depth + VOLCANO_SEAM_GAP_PX - 1e-9, 'in the far half');
      const table = tableBounds(layout);
      const scene = sceneBounds(layout, 'scorched-earth');
      assert.ok(spot.y <= table.y + table.h + 1e-9, 'centre on the table along');
      assert.ok(spot.x >= table.x - VOLCANO_PAST_EDGE * (table.x - scene.x) - 1e-9, 'centre little past the left edge');
      const inner = spot.r * (1 - VOLCANO_EDGE_OVERHANG);
      assert.ok(spot.x - inner >= scene.x - 1e-9 && spot.y + inner <= scene.y + scene.h + 1e-9, 'inside the scene');
      // The default board keeps its table's left edge free: the crater stands in view there, and the
      // mountain is a landmark, not a stamp (design 085).
      if (profile === NO_MAT_LAYOUT_ID) {
        assert.ok(craterInView(spot, table), 'crater in view');
        assert.ok(spot.r >= table.w * 0.13, `radius ${spot.r.toFixed(0)} at least 0.13 of the table's width`);
      }
    });

    // Design 085: the river is the card's wide flow, from the volcano's foot down the free strip left
    // of the cards, never under them.
    test(`lavaPath (${profile}, ${half.w} px half) runs from the volcano's foot to the near margin, its banks clear of every card`, () => {
      const layout = layoutOf(profile, half);
      const footprints = environmentFootprints(layout);
      const rects = [...footprints.slabs, ...footprints.flats];
      const volcano = volcanoSpot(layout, footprints);
      const path = lavaPath(layout, volcano, footprints);
      assert.equal(path.length, LAVA_PATH.points);
      const table = tableBounds(layout);
      const scene = sceneBounds(layout, 'scorched-earth');
      assert.ok(path.at(-1).y < table.y, 'its mouth in the near margin');
      for (let k = 1; k < path.length; k += 1) {
        assert.ok(path[k].y < path[k - 1].y, 'it runs down toward the near side');
        assert.ok(path[k].w > path[k - 1].w, 'it widens downstream');
      }
      for (const point of path) assert.ok(point.x - point.w >= scene.x - 1e-9, 'inside the scene');
      if (profile === NO_MAT_LAYOUT_ID) {
        assert.ok(Math.hypot(path[0].x - volcano.x, path[0].y - volcano.y) <= volcano.r, "its source at the volcano's foot");
      }
      for (let k = 1; k < path.length; k += 1) {
        const [a, b] = [path[k - 1], path[k]];
        for (let s = 0; s <= 1.0001; s += 0.05) {
          const x = a.x + (b.x - a.x) * s;
          const y = a.y + (b.y - a.y) * s;
          const w = a.w + (b.w - a.w) * s;
          for (const rect of rects) {
            assert.ok(distanceToRect(x, y, rect) >= w + LAVA_PATH.clear * 0.5, `bank ${(distanceToRect(x, y, rect) - w).toFixed(1)} px off ${JSON.stringify(rect)}`);
          }
        }
      }
    });
  }
}

test('lavaPath is empty without a volcano or a table', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.deepEqual(lavaPath(layout, null, environmentFootprints(layout)), []);
  assert.deepEqual(lavaPath(null, { x: 0, y: 0, r: 100 }), []);
});

test('VOLCANO_RISE is the crater rim height VOLCANO_SHAPE builds, as a share of the radius', () => {
  const rim = VOLCANO_SHAPE.height * Math.pow(1 - VOLCANO_SHAPE.crater, 1.25);
  assert.ok(Math.abs(VOLCANO_RISE - rim) < 0.01, `VOLCANO_RISE ${VOLCANO_RISE} vs rim ${rim}`);
});

test('volcanoSpot is null without a Stadium rect or when no circle fits', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  assert.equal(volcanoSpot({ ...layout, stadium: null }, environmentFootprints(layout)), null);
  assert.equal(volcanoSpot(layout, { slabs: [sceneBounds(layout, 'scorched-earth')], flats: [] }), null);
});

test('environmentKeyFor maps Stormy Mountains, by id or by set when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-051', name: 'Stormy Mountains' }), 'stormy-mountains');
  assert.equal(environmentKeyFor({ set: 'customhb', name: 'Stormy Mountains' }), 'stormy-mountains');
  assert.equal(environmentOverride(null, '?stadiumEnv=stormy-mountains'), 'stormy-mountains');
});

test('environmentKeyFor maps Perilous Jungle, by id or by set when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-249', name: 'Perilous Jungle' }), 'perilous-jungle');
  assert.equal(environmentKeyFor({ set: 'customhb', name: 'Perilous Jungle' }), 'perilous-jungle');
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

test('sceneBounds runs Stormy Mountains past every table edge and leaves a board without margins on the table', () => {
  const layout = layoutOf(NO_MAT_LAYOUT_ID, HALVES[0]);
  const table = tableBounds(layout);
  // Design 084: Scorched Earth runs past the table like every other board.
  assert.deepEqual(sceneBounds(layout, 'scorched-earth'), sceneBounds(layout, 'stormy-mountains'));
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
