import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BEACH_KEY,
  MAX_ROCKS,
  RUNUP_MAX_PX,
  SEA_FRAGMENT,
  SEA_VERTEX,
  SHORE_WANDER_PX,
  SPRAY_FRAGMENT,
  SPRAY_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  beachSpots,
  shoreDistance,
} from '../stadium-env-beach.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const cardsOf = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

// customhb-209 is Surfing Beach in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Surfing Beach by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-209' }), BEACH_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '209' }), BEACH_KEY);
});

test('beachSpots: every card keeps dry sand past the highest run-up, the waterline wander and all', () => {
  for (const layout of layouts) {
    const spots = beachSpots(layout);
    for (const r of cardsOf(layout)) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]]) {
        // Up the beach from the waterline: -shoreDistance, less the wander either way.
        assert.ok(-shoreDistance(spots, x, y) - SHORE_WANDER_PX >= RUNUP_MAX_PX, `card at (${x | 0}, ${y | 0})`);
      }
    }
  }
});

test('beachSpots: there is sea in the scene, and the rocks stand in the surf', () => {
  for (const layout of layouts) {
    const spots = beachSpots(layout);
    assert.ok(spots.deepest > 100, `deepest ${spots.deepest}`);
    assert.ok(spots.rocks.length >= 1 && spots.rocks.length <= MAX_ROCKS);
    for (const rock of spots.rocks) {
      const out = shoreDistance(spots, rock.x, rock.y);
      assert.ok(out > -6 * spots.u - 1e-6 && out < 70 * spots.u + 1e-6);
    }
  }
});

test('no rock covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { rocks } = beachSpots(layout);
    const points = rocks.flatMap((rock) => [[rock.x - rock.r, rock.y, rock.h], [rock.x + rock.r, rock.y, rock.h], [rock.x, rock.y - rock.r, rock.h], [rock.x, rock.y + rock.r, rock.h]]);
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('beachSpots is null without a layout', () => {
  assert.equal(beachSpots(null), null);
  assert.equal(beachSpots({}), null);
});

test('Surfing Beach shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, SEA_VERTEX, SEA_FRAGMENT, SPRAY_VERTEX, SPRAY_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
