import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  FAIRY_KEY,
  MAX_LEAVES,
  MAX_ORBS,
  MAX_TREES,
  ORB_FRAGMENT,
  ORB_VERTEX,
  PROP_FRAGMENT,
  SPARKLE_FRAGMENT,
  SPARKLE_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  fairyProps,
  fairySpots,
} from '../stadium-env-fairy.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

// customhb-428 is Fairy Garden (FCO 100) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Fairy Garden by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-428' }), FAIRY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '428' }), FAIRY_KEY);
});

test('fairySpots: the ring between the Actives, trees, orbs and leaves clear of every card and the hand', () => {
  for (const layout of layouts) {
    const { ring, trees, orbs, leaves, clear } = fairySpots(layout);
    assert.ok(ring === null || ring.r > 0);
    assert.ok(trees.length >= 2 && trees.length <= MAX_TREES, `${trees.length} trees`);
    assert.ok(orbs.length >= 2 && orbs.length <= MAX_ORBS, `${orbs.length} orbs`);
    assert.ok(leaves.length <= MAX_LEAVES);
    for (const tree of trees) assert.ok(clear(tree.x, tree.y, tree.r * 0.8, 22), 'tree');
    for (const orb of orbs) assert.ok(clear(orb.x, orb.y, 34 + orb.z, 14), 'orb');
  }
});

test('no tree crown, orb or leaf covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { trees, orbs, leaves } = fairySpots(layout);
    const points = [
      ...trees.flatMap((t) => [
        [t.x, t.y, t.h + t.r],
        [t.x - t.r, t.y, t.h],
        [t.x + t.r, t.y, t.h],
        [t.x, t.y - t.r, t.h],
        [t.x, t.y + t.r, t.h],
      ]),
      ...orbs.flatMap((o) => [[o.x, o.y, o.z], [o.x - o.r * 4, o.y, o.z], [o.x + o.r * 4, o.y, o.z]]),
      ...leaves.flatMap((l) => [[l.x, l.y, 12], [l.x + Math.cos(l.yaw) * l.len, l.y + Math.sin(l.yaw) * l.len, 8]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('fairySpots is null without a layout; the props build', () => {
  assert.equal(fairySpots(null), null);
  const props = fairyProps(fairySpots(layouts[0]));
  assert.ok(props.vertexCount() > 2500);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
});

test('Fairy Garden shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, ORB_VERTEX, ORB_FRAGMENT, SPARKLE_VERTEX, SPARKLE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
