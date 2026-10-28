import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  DISC_FRAGMENT,
  DISC_VERTEX,
  MAX_DISCS,
  MAX_ISLANDS,
  ROCK_FRAGMENT,
  ROCK_VERTEX,
  SPARKLE_FRAGMENT,
  SPARKLE_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  VALLEY_KEY,
  VOID_FRAGMENT,
  VOID_VERTEX,
  discGeometry,
  islandDistance,
  rockGeometry,
  valleySpots,
} from '../stadium-env-dimension.mjs';
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

// customhb-199 is Dimension Valley in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Dimension Valley by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-199' }), VALLEY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '199' }), VALLEY_KEY);
});

test('valleySpots: every card lies well inside the island; its outline traces the edge', () => {
  for (const layout of layouts) {
    const { island, outline, u } = valleySpots(layout);
    for (const r of cardsOf(layout)) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        assert.ok(islandDistance(island, x, y) < -20 * u, `card corner (${x | 0}, ${y | 0}) near the edge`);
      }
    }
    for (const [x, y] of outline) assert.ok(Math.abs(islandDistance(island, x, y)) < 0.5);
  }
});

test('valleySpots: discs on the grass off every card; small islands off the great one', () => {
  for (const layout of layouts) {
    const { island, discs, islands, u } = valleySpots(layout);
    assert.ok(discs.length > 0 && discs.length <= MAX_DISCS);
    assert.ok(islands.length >= 3 && islands.length <= MAX_ISLANDS);
    for (const disc of discs.filter((d) => d.bob === 0)) {
      assert.ok(islandDistance(island, disc.x, disc.y) < 0);
      for (const card of cardsOf(layout)) assert.ok(distanceToRect(disc.x, disc.y, card) >= disc.r);
    }
    for (const each of islands) assert.ok(islandDistance(island, each.x, each.y) >= each.r + 60 * u - 1e-6);
  }
});

test('no small island, its disc or the bare tree covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { islands, tree } = valleySpots(layout);
    const points = islands.flatMap((each) =>
      Array.from({ length: 12 }, (_, k) => {
        const angle = (k / 12) * 2 * Math.PI;
        // Its rim at its highest (tipped and bobbing up).
        return [each.x + Math.cos(angle) * each.r * 1.1, each.y + Math.sin(angle) * each.r * 1.1, each.z + each.bob + each.r * 0.25];
      })
    );
    if (tree) points.push([tree.x, tree.y, tree.z + tree.h]);
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('valleySpots is null without a layout; the rock and discs build into geometry', () => {
  assert.equal(valleySpots(null), null);
  const spots = valleySpots(layouts[0]);
  const rock = rockGeometry(three, spots);
  assert.ok(rock.getAttribute('position').count > spots.outline.length * 7);
  assert.equal(rock.getAttribute('aBob').itemSize, 2);
  assert.equal(discGeometry(three, spots.discs).instanceCount, spots.discs.length);
});

test('Dimension Valley shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, ROCK_VERTEX, ROCK_FRAGMENT, DISC_VERTEX, DISC_FRAGMENT, VOID_VERTEX, VOID_FRAGMENT, SPARKLE_VERTEX, SPARKLE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
