import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BAKE_LIGHT_FRAGMENT,
  LUMIOSE_KEY,
  MAX_BUILDINGS,
  MAX_CAFES,
  MAX_LAMPS,
  MAX_TREES,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  TOWER_HEIGHT_PX,
  lumioseProps,
  lumioseSpots,
  towerRadius,
  MAX_CASTERS,
} from '../stadium-env-lumiose.mjs';
import { SCREEN_VIEWS, geometryOnCard, screenView } from './stadium-screen.mjs';

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

test('environmentKeyFor: Lumiose City by id, and by set', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-342', name: 'Lumiose City' }), LUMIOSE_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', name: 'Lumiose City' }), LUMIOSE_KEY);
});

test('lumioseSpots: the square holds every card; buildings stand outside it, never on a card', () => {
  for (const layout of layouts) {
    const { square, buildings, beds } = lumioseSpots(layout);
    assert.ok(buildings.length >= 6 && buildings.length <= MAX_BUILDINGS, `${buildings.length} buildings`);
    for (const r of cardsOf(layout)) {
      assert.ok(r.x >= square.x0 && r.x + r.w <= square.x1 && r.y >= square.y0 && r.y + r.h <= square.y1);
      for (const b of buildings) {
        const apart = r.x + r.w <= b.x0 || b.x1 <= r.x || r.y + r.h <= b.y0 || b.y1 <= r.y;
        assert.ok(apart, 'a building lies on a card');
      }
      for (const bed of beds) assert.ok(r.x + r.w <= bed.x0 || bed.x1 <= r.x || r.y + r.h <= bed.y0 || bed.y1 <= r.y, 'a bed lies on a card');
    }
  }
});

test('lumioseSpots: trees, lamps, benches and cafes stand clear of every card, the tower on its own in the left strip', () => {
  for (const layout of layouts) {
    const { trees, pits, lamps, benches, cafes, tower, square, clear, u } = lumioseSpots(layout);
    assert.ok(trees.length <= MAX_TREES && lamps.length <= MAX_LAMPS && cafes.length <= MAX_CAFES);
    assert.equal(pits.length, trees.length, 'a grate for every tree');
    for (const t of trees) assert.ok(clear(t.x, t.y, t.r, 10 * u), 'tree');
    for (const l of lamps) assert.ok(clear(l.x, l.y, 8 * u, 10 * u), 'lamp');
    for (const b of benches) assert.ok(clear(b.x, b.y, 26 * u, 10 * u), 'bench');
    for (const c of cafes) assert.ok(clear(c.x, c.y, c.r, 10 * u), 'cafe');
    assert.ok(clear(tower.x, tower.y, tower.r, 10 * u), 'tower foot');
    assert.ok(tower.x - tower.r > square.x0 && tower.h === TOWER_HEIGHT_PX * u, 'the tower stands inside the plaza, in the left strip');
    for (const l of lamps) assert.ok(Math.hypot(l.x - tower.x, l.y - tower.y) > tower.r + 8 * u, 'lamp off the tower');
    for (const t of trees) assert.ok(Math.hypot(t.x - tower.x, t.y - tower.y) > tower.r + t.r * 0.6, 'tree off the tower');
  }
});

// Design 084: the tower at the view's top-left, where both cameras draw it upright; every tree and lamp
// casts a shadow (the terrain draws them).
test('lumioseSpots: the tower stands past the far cards in the left strip; a shadow caster per tree and lamp', () => {
  for (const layout of layouts) {
    const { tower, core, square, trees, lamps, casters } = lumioseSpots(layout);
    assert.ok(tower.y > core.y + core.h && tower.y < square.y1, 'past the far cards, inside the plaza');
    assert.ok(tower.x < core.x, 'left of the cards');
    assert.equal(casters.length, trees.length + lamps.length);
    assert.ok(casters.length <= MAX_CASTERS);
    assert.equal(casters.filter((c) => c.r > 0).length, trees.length, 'trees have crowns, lamps none');
    assert.ok(casters.every((c) => c.h > 0), 'each has a height');
  }
});

test('towerRadius: legs flare at the foot, a slim waist, a swollen crown, closing at the spire', () => {
  const h = 540;
  assert.ok(Math.abs(towerRadius(0, h) - h * 0.118) < 0.01 * h, 'foot');
  assert.ok(towerRadius(0.5, h) < towerRadius(0.05, h) * 0.5, 'waist narrower than the foot');
  assert.ok(towerRadius(0.83, h) > towerRadius(0.55, h) * 1.4, 'the crown swells over the waist');
  assert.ok(towerRadius(1, h) < 0.002 * h, 'the spire closes');
});

test('no building, tree, lamp, parasol, flower or the tower covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const geometry = lumioseProps(lumioseSpots(layout)).build(three);
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('lumioseSpots is null without a layout; the props build into a good deal of geometry', () => {
  assert.equal(lumioseSpots(null), null);
  const props = lumioseProps(lumioseSpots(layouts[0]));
  assert.ok(props.vertexCount() > 8000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
});

test('Lumiose City shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, BAKE_LIGHT_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
