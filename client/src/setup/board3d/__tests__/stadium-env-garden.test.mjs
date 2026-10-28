import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BLOB_FRAGMENT,
  BLOB_VERTEX,
  FIREFLY_FRAGMENT,
  FIREFLY_VERTEX,
  GARDEN_KEY,
  HALO_FRAGMENT,
  HALO_VERTEX,
  MAX_LANTERNS,
  PLAZA_MARGIN_PX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  blobGeometry,
  gardenProps,
  gardenSpots,
} from '../stadium-env-garden.mjs';
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

// customhb-197 is Mystery Garden in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Mystery Garden by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-197' }), GARDEN_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '197' }), GARDEN_KEY);
});

test('gardenSpots: the plaza holds every card; the pool rings the Actives inside the Bench', () => {
  for (const layout of layouts) {
    const { centre, plaza, emblem, ringR, posts, u } = gardenSpots(layout);
    for (const r of cardsOf(layout)) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        assert.ok(Math.hypot(x - centre.x, y - centre.y) <= plaza - PLAZA_MARGIN_PX * u + 1e-6);
      }
    }
    assert.ok(emblem === null || (emblem.r > 0 && emblem.r < plaza));
    assert.ok(ringR > plaza);
    assert.ok(posts.length >= 8);
  }
});

test('gardenSpots: lanterns light the balustrade and the vases, no more than the shader holds', () => {
  for (const layout of layouts) {
    const { lanterns, posts, vases } = gardenSpots(layout);
    assert.ok(lanterns.length > 0 && lanterns.length <= MAX_LANTERNS);
    assert.ok(lanterns.length <= posts.filter((post) => post.lantern).length + vases.length);
  }
});

test('no prop of the garden covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const spots = gardenSpots(layout);
    const top = spots.ground + 70;
    const points = [
      ...spots.posts.flatMap((post) => [[post.x, post.y, spots.ground], [post.x, post.y, top]]),
      ...spots.vases.flatMap((vase) => [[vase.x, vase.y, spots.ground], [vase.x, vase.y, spots.ground + vase.h + 70]]),
      ...spots.pillars.flatMap((pillar) => [0, 0.5, 1].map((f) => [pillar.x, pillar.y, spots.ground + pillar.h * f])),
      ...spots.hedges.map((hedge) => [hedge.x, hedge.y, hedge.z + hedge.r]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('gardenSpots is null without a layout; the props and blobs build into geometry', () => {
  assert.equal(gardenSpots(null), null);
  const spots = gardenSpots(layouts[0]);
  assert.ok(gardenProps(spots).vertexCount() > 1000);
  const blobs = blobGeometry(three, spots);
  assert.ok(blobs.instanceCount >= spots.hedges.length + spots.leaves.length);
});

test('Mystery Garden shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, BLOB_VERTEX, BLOB_FRAGMENT, PROP_FRAGMENT, FIREFLY_VERTEX, FIREFLY_FRAGMENT, HALO_VERTEX, HALO_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
