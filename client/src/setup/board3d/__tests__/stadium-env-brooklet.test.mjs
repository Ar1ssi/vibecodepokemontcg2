import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BROOKLET_KEY,
  CROWN_FRAGMENT,
  CROWN_VERTEX,
  FALL_FRAGMENT,
  FALL_VERTEX,
  LAND_CARD_GAP_PX,
  MAX_ROCKS,
  MAX_TREES,
  MIST_FRAGMENT,
  MIST_VERTEX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  WATER_FRAGMENT,
  WATER_VERTEX,
  brookletProps,
  brookletSpots,
  crownGeometry,
  fallGeometry,
} from '../stadium-env-brooklet.mjs';
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
const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

// customhb-212 is Brooklet Hill in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Brooklet Hill by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-212' }), BROOKLET_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '212' }), BROOKLET_KEY);
});

test('brookletSpots: the far shore lies past the table; the terraces, the falls and the pier keep clear of every card', () => {
  for (const layout of layouts) {
    const { farShore, terrace, fall, pier, u } = brookletSpots(layout);
    const table = tableBounds(layout);
    assert.ok(farShore >= table.y + table.h);
    const gap = LAND_CARD_GAP_PX * u;
    for (const card of cardsOf(layout)) {
      if (terrace) {
        const box = { x: terrace.x0, y: terrace.y0, w: terrace.x1 - terrace.x0, h: terrace.y1 - terrace.y0 };
        const apart = Math.max(box.x - (card.x + card.w), card.x - (box.x + box.w), box.y - (card.y + card.h), card.y - (box.y + box.h));
        assert.ok(apart >= gap - 1e-6, 'terraces clear');
      }
      if (fall) assert.ok(distanceToRect(fall.x + fall.reach, fall.y, card) >= fall.width * 0.5, 'falls clear');
      if (pier) {
        for (let y = pier.y0; y <= pier.y1; y += 10) assert.ok(distanceToRect(pier.x, y, card) >= pier.width / 2, 'pier clear');
      }
    }
  }
});

test('brookletSpots: rocks in the water off every card; trees on the land', () => {
  for (const layout of layouts) {
    const { rocks, trees, farShore, u } = brookletSpots(layout);
    assert.ok(rocks.length <= MAX_ROCKS && trees.length <= MAX_TREES);
    for (const rock of rocks) {
      assert.ok(rock.y < farShore);
      for (const card of cardsOf(layout)) assert.ok(distanceToRect(rock.x, rock.y, card) >= rock.r + LAND_CARD_GAP_PX * u - 1e-6);
    }
  }
});

test('no tree, boulder, the pier or the falls covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const spots = brookletSpots(layout);
    const points = [
      ...spots.trees.flatMap((tree) => {
        const top = tree.z + tree.trunk + tree.r * 1.6;
        return [[tree.x - tree.r, tree.y, top - tree.r], [tree.x + tree.r, tree.y, top - tree.r], [tree.x, tree.y - tree.r, top - tree.r], [tree.x, tree.y, top]];
      }),
      ...spots.rocks.filter((rock) => !rock.sunk).map((rock) => [rock.x, rock.y, rock.h]),
      ...(spots.fall ? [[spots.fall.x, spots.fall.y, spots.fall.top], [spots.fall.x + spots.fall.reach, spots.fall.y, 0]] : []),
      ...(spots.pier ? [[spots.pier.x, spots.pier.y0, 8]] : []),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('brookletSpots is null without a layout; the props, crowns and falls build', () => {
  assert.equal(brookletSpots(null), null);
  const spots = brookletSpots(layouts[0]);
  assert.ok(brookletProps(spots).vertexCount() > 0);
  assert.equal(crownGeometry(three, spots.trees).instanceCount, spots.trees.length * 5);
  if (spots.fall) assert.ok(fallGeometry(three, spots.fall, spots.u).getAttribute('position').count > 50);
});

test('Brooklet Hill shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, WATER_VERTEX, WATER_FRAGMENT, FALL_VERTEX, FALL_FRAGMENT, CROWN_VERTEX, CROWN_FRAGMENT, PROP_FRAGMENT, MIST_VERTEX, MIST_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
