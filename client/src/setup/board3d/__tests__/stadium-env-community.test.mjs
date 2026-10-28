import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  COMMUNITY_KEY,
  MAX_TREES,
  MIST_FRAGMENT,
  MIST_VERTEX,
  PLAZA_MARGIN_PX,
  POOL_FRAGMENT,
  POOL_VERTEX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  communityProps,
  communitySpots,
} from '../stadium-env-community.mjs';
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

// customhb-361 is Community Center (TWM 146) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Community Center by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-361' }), COMMUNITY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '361' }), COMMUNITY_KEY);
});

test('communitySpots: the square holds every card, the hall stands on its left edge, the cliff behind it', () => {
  for (const layout of layouts) {
    const { plaza, hall, cliffFoot, pool, u } = communitySpots(layout);
    for (const r of cardsOf(layout)) {
      assert.ok(r.x >= plaza.x0 + (PLAZA_MARGIN_PX * u) / 2 && r.x + r.w <= plaza.x1 - (PLAZA_MARGIN_PX * u) / 2);
      assert.ok(r.y >= plaza.y0 && r.y + r.h <= plaza.y1);
    }
    assert.equal(hall.x1, plaza.x0);
    assert.ok(cliffFoot < hall.x0 && pool.x <= cliffFoot + 10 * u);
    // The pool lies past the hall's far end.
    assert.ok(pool.y - pool.r > hall.y1);
  }
});

test('communitySpots: trees stand off the square, clear of the tent and kiosks', () => {
  for (const layout of layouts) {
    const { trees, plaza, tent, kiosks } = communitySpots(layout);
    assert.ok(trees.length <= MAX_TREES);
    for (const tree of trees) {
      assert.ok(tree.x > plaza.x1 || tree.y > plaza.y1, 'off the square');
      assert.ok(Math.hypot(tree.x - tent.x, tree.y - tent.y) > tent.half + tree.r);
      for (const kiosk of kiosks) assert.ok(Math.hypot(tree.x - kiosk.x, tree.y - kiosk.y) > tree.r + kiosk.w / 2);
    }
  }
});

test('nothing of the hall, tent, kiosks, flag or trees covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { hall, tent, kiosks, flag, trees, canopy } = communitySpots(layout);
    const points = [
      ...[hall.x0, hall.x1].flatMap((x) => [hall.y0, hall.y1].flatMap((y) => [[x, y, hall.height], [x, y, hall.height + 21 * layout.self.cardBox.active.w / 100]])),
      [flag.x, flag.y, flag.base + flag.h],
      [flag.x, flag.y + 78 * (layout.self.cardBox.active.w / 100), flag.base + flag.h],
      [canopy.x1, canopy.y0, canopy.z1],
      [canopy.x1, canopy.y1, canopy.z1],
      [tent.x - tent.half, tent.y - tent.half, tent.post],
      [tent.x, tent.y, tent.apex],
      ...kiosks.flatMap((k) => [[k.x - k.w / 2, k.y - k.d / 2, k.h], [k.x + k.w / 2, k.y + k.d / 2, k.h]]),
      ...trees.flatMap((t) => [[t.x - t.r, t.y, t.z + t.r], [t.x + t.r, t.y, t.z + t.r], [t.x, t.y - t.r, t.z + t.r], [t.x, t.y + t.r, t.z + t.r], [t.x, t.y, t.z + t.r]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('communitySpots is null without a layout; the props build into a good deal of geometry', () => {
  assert.equal(communitySpots(null), null);
  const props = communityProps(communitySpots(layouts[0]));
  assert.ok(props.vertexCount() > 3000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
});

test('Community Center shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, POOL_VERTEX, POOL_FRAGMENT, PROP_FRAGMENT, MIST_VERTEX, MIST_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
