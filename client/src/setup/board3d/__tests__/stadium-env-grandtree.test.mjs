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
  GRAND_SUN,
  JUNGLE_CAP,
  JUNGLE_FROM_PX,
  MAX_BALLS,
  VEIN_GOLD,
  GRAND_CLUMP_CAP,
  GRAND_GROUND_CEILING_PX,
  MAX_ROOTS,
  MOTE_FRAGMENT,
  MOTE_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  grandProps,
  grandSpots,
} from '../stadium-env-grandtree.mjs';
import { SCREEN_VIEWS, geometryOnCard, screenView } from './stadium-screen.mjs';

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

test('grandSpots: the trunk beside the cards, roots, crown balls and ferns clear of them seen from above', () => {
  for (const layout of layouts) {
    const { tree, roots, balls, pieces, toadstools, clear, core, u } = grandSpots(layout);
    const ferns = pieces.filter((piece) => piece.asset === 'fern');
    assert.ok(tree.x < core.x, 'the trunk stands left of the cards');
    assert.equal(roots.length, MAX_ROOTS);
    assert.ok(balls.length >= 5 && balls.length <= MAX_BALLS, `${balls.length} balls`);
    assert.ok(ferns.length >= 2, `${ferns.length} ferns`);
    for (const root of roots) {
      const out = tree.foot + root.length;
      assert.ok(clear(tree.x + Math.cos(root.angle) * out, tree.y + Math.sin(root.angle) * out, 14 * u, 18 * u) || root.length <= 40 * u, 'root end');
    }
    for (const ball of balls) assert.ok(clear(ball.x, ball.y, ball.r + 30 * u, 18 * u), 'crown ball');
    for (const fern of ferns) assert.ok(clear(fern.x, fern.y, fern.reach, 12 * u - 1e-6), 'fern');
    for (const t of toadstools) assert.ok(clear(t.x, t.y, t.size * 1.1, 12 * u - 1e-6), 'toadstool');
  }
});

test('no solid (trunk, crown, small tree, clumps, toadstools) covers a card on screen, in either camera preset, risen on the swells', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const geometry = grandProps(grandSpots(layout)).build(three);
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project, { ground: () => [0, GRAND_GROUND_CEILING_PX] });
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
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, MOTE_VERTEX, MOTE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});

test('the floor\'s clumps: mixed kinds over the clover, at most GRAND_CLUMP_CAP, the swells under the ceiling (design 083)', () => {
  const spots = grandSpots(layouts[0]);
  assert.ok(spots.pieces.length >= 8 && spots.pieces.length <= GRAND_CLUMP_CAP, `${spots.pieces.length} pieces`);
  assert.ok(new Set(spots.pieces.map((piece) => piece.asset)).size >= 3, 'ferns, bushes and more');
  assert.match(BAKE_FIELD_FRAGMENT, /away \* \(3\.0 \+ 11\.0 \* fbm3\(p \/ 210\.0 \+ 3\.0\)\)/);
  assert.ok(0.25 + 3 + 11 <= GRAND_GROUND_CEILING_PX);
  assert.ok(spots.driftEmitters.length >= 2 && spots.driftEmitters.length <= 12);
});

test('design 084: a jungle band closes round the clearing, the veins light the floor, the sun is low from the top left', () => {
  const [sx, sy, sz] = GRAND_SUN;
  assert.ok(sx < 0 && sy > 0 && sz < 0.8, 'a low sun from the top left: long shadows');
  for (const layout of layouts) {
    const spots = grandSpots(layout);
    assert.ok(spots.jungle.length >= 12 && spots.jungle.length <= JUNGLE_CAP, `${spots.jungle.length} jungle pieces`);
    for (const piece of spots.jungle) {
      const off = Math.hypot(Math.max(spots.core.x - piece.x, 0, piece.x - spots.core.x - spots.core.w), Math.max(spots.core.y - piece.y, 0, piece.y - spots.core.y - spots.core.h));
      assert.ok(off >= JUNGLE_FROM_PX * spots.u + piece.reach - 1e-6, 'out in the band round the clearing');
    }
    assert.ok(new Set(spots.jungle.map((piece) => piece.asset)).size >= 2, 'big-leaf plants, ferns and bushes');
    assert.equal(spots.glows.length, 1);
    assert.equal(spots.glows[0].colour, VEIN_GOLD);
    assert.deepEqual([spots.glows[0].x, spots.glows[0].y], [spots.tree.x, spots.tree.y]);
  }
});
