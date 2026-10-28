import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  CRYSTAL_CARD_GAP_PX,
  CRYSTAL_FRAGMENT,
  CRYSTAL_KEY,
  CRYSTAL_VERTEX,
  MAX_CLUSTERS,
  SPARKLE_FRAGMENT,
  SPARKLE_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  crystalGeometry,
  crystalSpots,
  wallFloorAt,
} from '../stadium-env-crystal.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
const tipOf = (c) => {
  const reach = c.height + c.radius * 1.7;
  return [c.x + c.axis[0] * reach, c.y + c.axis[1] * reach, c.z + c.axis[2] * reach];
};

// customhb-052 is Crystal Cave in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Crystal Cave by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-052' }), CRYSTAL_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '52' }), CRYSTAL_KEY);
});

test('crystalSpots: the emblem between the Actives where it fits, clusters round the cards, every crystal clear of them', () => {
  for (const layout of layouts) {
    const { emblem, centre, clusters } = crystalSpots(layout);
    assert.ok(emblem === null || (emblem.r > 0 && emblem.x === centre.x && emblem.y === centre.y));
    assert.ok(clusters.length >= 8 && clusters.length <= MAX_CLUSTERS, `${clusters.length} clusters`);
    const { slabs, flats } = environmentFootprints(layout);
    for (const crystal of clusters.flatMap((cluster) => cluster.crystals)) {
      for (const [x, y] of [[crystal.x, crystal.y], tipOf(crystal)]) {
        for (const card of [...slabs, ...flats]) assert.ok(distanceToRect(x, y, card) >= crystal.radius + CRYSTAL_CARD_GAP_PX);
      }
    }
  }
});

test('crystals grow out of the floor or the rock, never above it', () => {
  assert.equal(wallFloorAt(0, 1), -6);
  assert.ok(wallFloorAt(1000, 1) > 50);
  for (const layout of layouts) {
    for (const crystal of crystalSpots(layout).clusters.flatMap((cluster) => cluster.crystals)) {
      assert.ok(crystal.z <= -6 || crystal.z < 170, 'foot at or under the rock');
      assert.ok(crystal.axis[2] > 0.8, 'leaning, not lying');
    }
  }
});

test('no crystal covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const points = crystalSpots(layout).clusters.flatMap((cluster) =>
      cluster.crystals.flatMap((c) => {
        const tip = tipOf(c);
        return Array.from({ length: 9 }, (_, i) => [0, 1, 2].map((k) => [c.x, c.y, c.z][k] + (tip[k] - [c.x, c.y, c.z][k]) * (i / 8)));
      })
    );
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('crystalSpots is null without a layout; the crystals build into geometry', () => {
  assert.equal(crystalSpots(null), null);
  const { clusters } = crystalSpots(layouts[0]);
  const geometry = crystalGeometry(three, clusters);
  const crystals = clusters.reduce((sum, cluster) => sum + cluster.crystals.length, 0);
  // Six side faces (4 vertices) and six point faces (3) per crystal.
  assert.equal(geometry.getAttribute('position').count, crystals * 6 * 7);
  assert.equal(geometry.getAttribute('aFacet').itemSize, 2);
});

test('Crystal Cave shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, CRYSTAL_VERTEX, CRYSTAL_FRAGMENT, SPARKLE_VERTEX, SPARKLE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
