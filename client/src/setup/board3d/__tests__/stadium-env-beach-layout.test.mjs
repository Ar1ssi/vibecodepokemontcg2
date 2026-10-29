import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints } from '../stadium-environment-layout.mjs';
import {
  PALM_CLEARANCE_PX,
  PALM_DRY_PX,
  PALM_MAX,
  PALM_SPACING_PX,
  beachShore,
  beachSpots,
  shoreFrame,
} from '../stadium-env-beach-layout.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layoutOf = (profile, half) => flatLayout(getMatLayout(profile), half);

const distanceToRect = (x, y, rect) =>
  Math.hypot(Math.max(rect.x - x, 0, x - (rect.x + rect.w)), Math.max(rect.y - y, 0, y - (rect.y + rect.h)));

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

test('beachShore runs from the far edge to the left edge and bends into the land; shoreFrame is + out to sea', () => {
  const bounds = { x: -725, y: 0, w: 1450, h: 907 };
  const shore = beachShore(bounds);
  assert.equal(shore.a.y, bounds.h);
  assert.ok(shore.a.x > bounds.x && shore.a.x < bounds.x + bounds.w / 2, 'meets the far edge left of centre');
  assert.equal(shore.b.x, bounds.x);
  assert.ok(shore.b.y > 0 && shore.b.y < bounds.h / 2, 'meets the left edge in the near half');
  assert.ok(shoreFrame(shore, bounds.x, bounds.h).offshore > 0, 'the far-left corner is sea');
  assert.ok(shoreFrame(shore, bounds.x + bounds.w, 0).offshore < 0, 'the near-right corner is land');
  close(shoreFrame(shore, shore.a.x, shore.a.y).offshore, 0, 'a lies on the waterline');
  close(shoreFrame(shore, shore.b.x, shore.b.y).offshore, 0, 'b lies on the waterline');
  const middle = { x: (shore.a.x + shore.b.x) / 2, y: (shore.a.y + shore.b.y) / 2 };
  close(shoreFrame(shore, middle.x, middle.y).offshore, shore.bend, 'the chord middle is the bend out to sea');
});

for (const profile of PROFILES) {
  for (const half of HALVES) {
    test(`beachSpots (${profile}, ${half.w} px half): palms on dry sand clear of every footprint, apart; rocks on the table`, () => {
      const layout = layoutOf(profile, half);
      const footprints = environmentFootprints(layout);
      const spots = beachSpots(layout, footprints);
      const bounds = tableBounds(layout);
      assert.ok(spots.palms.length >= 3 && spots.palms.length <= PALM_MAX, `${spots.palms.length} palms`);
      for (const palm of spots.palms) {
        assert.ok(shoreFrame(spots.shore, palm.x, palm.y).offshore <= -PALM_DRY_PX, 'on dry sand');
        for (const rect of [...footprints.slabs, ...footprints.flats]) {
          assert.ok(distanceToRect(palm.x, palm.y, rect) >= PALM_CLEARANCE_PX - 1e-9, `clear of ${JSON.stringify(rect)}`);
        }
        assert.ok(palm.x > bounds.x && palm.x < bounds.x + bounds.w && palm.y > bounds.y && palm.y < bounds.y + bounds.h);
        assert.ok(palm.height > 0 && palm.lean > 0 && palm.seed >= 0 && palm.seed < 1);
      }
      spots.palms.forEach((palm, i) =>
        spots.palms.slice(i + 1).forEach((other) => assert.ok(Math.hypot(palm.x - other.x, palm.y - other.y) >= PALM_SPACING_PX))
      );
      assert.ok(spots.rocks.length >= 1 && spots.rocks.length <= 3);
      for (const rock of spots.rocks) {
        assert.ok(rock.x - rock.r >= bounds.x && rock.x + rock.r <= bounds.x + bounds.w, 'rock inside (x)');
        assert.ok(rock.y - rock.r >= bounds.y && rock.y + rock.r <= bounds.y + bounds.h, 'rock inside (y)');
      }
      assert.ok(spots.barAt >= 110 && spots.barAt <= 220);
      assert.deepEqual(beachSpots(layout, footprints), spots, 'the same layout always gives the same beach');
    });
  }
}

test('beachSpots is null without a table', () => {
  assert.equal(beachSpots(null), null);
});
