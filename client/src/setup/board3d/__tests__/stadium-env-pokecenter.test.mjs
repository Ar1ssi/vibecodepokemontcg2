import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  CENTER_KEY,
  KERB_GAP_PX,
  MAX_ROOF_UNITS,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  WALK_PX,
  WATER_FRAGMENT,
  WATER_VERTEX,
  centerProps,
  centerSpots,
} from '../stadium-env-pokecenter.mjs';
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

// customhb-362 is Pokemon Center (NXD 90) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Pokemon Center by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-362' }), CENTER_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '362' }), CENTER_KEY);
});

test('centerSpots: the kerbs stand clear of every card, the Center and the quay past them', () => {
  for (const layout of layouts) {
    const { centerKerb, quayKerb, quayX, wallX, center, tower, u, roofUnits } = centerSpots(layout);
    for (const r of cardsOf(layout)) {
      assert.ok(r.x >= centerKerb + (KERB_GAP_PX * u) / 2 - 1e-6 && r.x + r.w <= quayKerb - (KERB_GAP_PX * u) / 2 + 1e-6);
    }
    assert.ok(Math.abs(centerKerb - wallX - WALK_PX * u) < 1e-9 && center.x1 === wallX);
    assert.ok(quayX > quayKerb && tower.x1 > quayKerb && tower.x0 > wallX);
    assert.ok(roofUnits.length >= 3 && roofUnits.length <= MAX_ROOF_UNITS);
    for (const unit of roofUnits) assert.ok(unit.x > center.x0 && unit.x < center.x1 && unit.y > center.y0 && unit.y < center.y1);
  }
});

test('the tower stands off the far end, behind the opponent hand', () => {
  for (const layout of layouts) {
    const { tower, hand } = centerSpots(layout);
    if (hand) assert.ok(tower.y0 >= hand.y + hand.h);
  }
});

test('no part of the Center or the tower covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { center, tower } = centerSpots(layout);
    const points = [center, tower].flatMap((b) =>
      [b.x0, b.x1].flatMap((x) => [b.y0, b.y1].flatMap((y) => [[x, y, 0], [x, y, b.height]]))
    );
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('centerSpots is null without a layout; the props build into a good deal of geometry', () => {
  assert.equal(centerSpots(null), null);
  const props = centerProps(centerSpots(layouts[0]));
  assert.ok(props.vertexCount() > 2000);
  const geometry = props.build(three);
  assert.equal(geometry.getAttribute('position').count, props.vertexCount());
});

test('Pokemon Center shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, WATER_VERTEX, WATER_FRAGMENT, PROP_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
