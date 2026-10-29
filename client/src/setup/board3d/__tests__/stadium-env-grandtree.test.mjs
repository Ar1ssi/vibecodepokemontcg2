import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  GRAND_KEY,
  MAX_BALLS,
  MAX_LEAVES,
  MAX_ROOTS,
  MOTE_FRAGMENT,
  MOTE_VERTEX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  grandProps,
  grandSpots,
} from '../stadium-env-grandtree.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

// customhb-376 is Grand Tree (SCR 136) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Grand Tree by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-376' }), GRAND_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '376' }), GRAND_KEY);
});

test('grandSpots: the trunk beside the cards, roots, crown balls and leaves clear of them seen from above', () => {
  for (const layout of layouts) {
    const { tree, roots, balls, leaves, clear, core, u } = grandSpots(layout);
    assert.ok(tree.x < core.x, 'the trunk stands left of the cards');
    assert.equal(roots.length, MAX_ROOTS);
    assert.ok(balls.length >= 5 && balls.length <= MAX_BALLS, `${balls.length} balls`);
    assert.ok(leaves.length <= MAX_LEAVES);
    for (const root of roots) {
      const out = tree.foot + root.length;
      assert.ok(clear(tree.x + Math.cos(root.angle) * out, tree.y + Math.sin(root.angle) * out, 14 * u, 18 * u) || root.length <= 40 * u, 'root end');
    }
    for (const ball of balls) assert.ok(clear(ball.x, ball.y, ball.r + 30 * u, 18 * u), 'crown ball');
    for (const leaf of leaves) assert.ok(clear(leaf.x, leaf.y, leaf.len * 0.7, 12 * u), 'leaf');
  }
});

test('neither the crown nor the small tree covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { balls, small, tree } = grandSpots(layout);
    const points = [
      ...balls.flatMap((b) => [[b.x, b.y, b.z + b.r], [b.x - b.r, b.y, b.z], [b.x + b.r, b.y, b.z], [b.x, b.y - b.r, b.z], [b.x, b.y + b.r, b.z]]),
      [small.x, small.y, small.h + small.r],
      [small.x - small.r, small.y, small.h],
      [small.x + small.r, small.y, small.h],
      [tree.x, tree.y, tree.crownZ],
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('grandSpots is null without a layout; the props build into a good deal of geometry', () => {
  assert.equal(grandSpots(null), null);
  const props = grandProps(grandSpots(layouts[0]));
  assert.ok(props.vertexCount() > 10000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
});

test('Grand Tree shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, MOTE_VERTEX, MOTE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
