import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  MAX_BALLOONS,
  MAX_FIXTURES,
  PROP_FRAGMENT,
  SHOPPING_KEY,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  shoppingProps,
  shoppingSpots,
} from '../stadium-env-shopping.mjs';
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

// customhb-360 is Shopping Center (EVS 157) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Shopping Center by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-360' }), SHOPPING_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '360' }), SHOPPING_KEY);
});

test('shoppingSpots: tables, racks and mannequins stand clear of every card, inside the walls', () => {
  for (const layout of layouts) {
    const { tables, racks, mannequins, wall, balloons, u } = shoppingSpots(layout);
    assert.ok(balloons.length > 0 && balloons.length <= MAX_BALLOONS);
    assert.ok(shoppingSpots(layout).columns.length === 4);
    for (const card of cardsOf(layout)) {
      for (const table of tables) assert.ok(distanceToRect(table.x, table.y, card) >= table.w / 2 + 8 * u, 'table');
      for (const m of mannequins) assert.ok(distanceToRect(m.x, m.y, card) >= 18 * u + 6 * u, 'mannequin');
      for (const rack of racks) {
        assert.ok(distanceToRect(rack.x, rack.y - rack.len / 2, card) >= 14 * u && distanceToRect(rack.x, rack.y + rack.len / 2, card) >= 14 * u, 'rack');
      }
      for (const b of balloons) assert.ok(distanceToRect(b.x, b.y, card) >= b.r * 0.5, 'balloon');
    }
    for (const rack of racks) assert.ok(rack.x > wall.left && rack.x < wall.right);
  }
});

test('the escalators climb to the mezzanine behind the opponent hand', () => {
  for (const layout of layouts) {
    const { escalators, mezzanine, hand } = shoppingSpots(layout);
    assert.equal(escalators.length, 2);
    for (const e of escalators) {
      assert.equal(e.y1, mezzanine.y0);
      assert.equal(e.height, mezzanine.height);
    }
    if (hand) assert.ok(mezzanine.y0 > hand.y + hand.h);
  }
});

test('no balloon, mannequin, rack, column or escalator covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { balloons, mannequins, racks, columns, escalators, tables } = shoppingSpots(layout);
    const points = [
      ...balloons.flatMap((b) => [[b.x, b.y, b.z + b.r], [b.x - b.r, b.y, b.z], [b.x + b.r, b.y, b.z], [b.x, b.y - b.r, b.z], [b.x, b.y + b.r, b.z]]),
      ...mannequins.flatMap((m) => [[m.x, m.y, m.h], [m.x - 20, m.y - 20, m.h * 0.8], [m.x + 20, m.y + 20, m.h * 0.8]]),
      ...racks.flatMap((r) => [[r.x, r.y - r.len / 2, 60], [r.x, r.y + r.len / 2, 60]]),
      ...columns.map((c) => [c.x, c.y, c.h]),
      ...escalators.flatMap((e) => [[e.x - e.width / 2, e.y0, 38], [e.x + e.width / 2, e.y0, 38], [e.x - e.width / 2, e.y1, e.height + 40], [e.x + e.width / 2, e.y1, e.height + 40]]),
      ...tables.flatMap((t) => [[t.x - t.w / 2, t.y - t.d / 2, t.h + 9], [t.x + t.w / 2, t.y + t.d / 2, t.h + 9]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('shoppingSpots is null without a layout; the props build; fixtures fit the shader', () => {
  assert.equal(shoppingSpots(null), null);
  const spots = shoppingSpots(layouts[0]);
  const props = shoppingProps(spots);
  assert.ok(props.vertexCount() > 3000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
  for (const layout of layouts) {
    const each = shoppingSpots(layout);
    assert.ok(each.tables.length + each.columns.length + each.mannequins.length <= MAX_FIXTURES);
  }
});

test('Shopping Center shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
