import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  MAX_BEAMS,
  MAX_SCREENS,
  NEUTRAL_KEY,
  PLATFORM_MARGIN_PX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  beamGeometry,
  neutralProps,
  neutralSpots,
} from '../stadium-env-neutral.mjs';
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

test('environmentKeyFor: Neutralization Zone by id, and by set', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-369', name: 'Neutralization Zone' }), NEUTRAL_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', name: 'Neutralization Zone' }), NEUTRAL_KEY);
});

test('neutralSpots: the platform holds every card; columns stand outside it, never on the near arc', () => {
  for (const layout of layouts) {
    const { platform, centre, beams, screens, walls, u } = neutralSpots(layout);
    for (const r of cardsOf(layout)) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        assert.ok(Math.hypot(x - centre.x, y - centre.y) <= platform - PLATFORM_MARGIN_PX * u + 1e-6);
      }
    }
    assert.ok(beams.length >= 2 && beams.length <= MAX_BEAMS, `${beams.length} columns`);
    for (const beam of beams) {
      assert.ok(Math.hypot(beam.x - centre.x, beam.y - centre.y) >= platform);
      assert.ok(beam.y >= centre.y - platform * 0.2 - 1e-6, 'none on the near arc');
    }
    assert.equal(screens.length, MAX_SCREENS);
    assert.ok(walls.far.y0 > layout.opp.hand.baselineY - 1e6);
  }
});

// Design 084: each column's base light pools round it; the screens float over the rim's side arcs.
test('neutralSpots: a glow at every column; the screens over the rim beside the platform, facing it', () => {
  for (const layout of layouts) {
    const { beams, glows, screens, platform, centre } = neutralSpots(layout);
    assert.equal(glows.length, beams.length);
    glows.forEach((glow, i) => assert.deepEqual([glow.x, glow.y], [beams[i].x, beams[i].y]));
    for (const s of screens) {
      assert.ok(Math.hypot(s.x - centre.x, s.y - centre.y) > platform, 'past the rim');
      assert.ok(Math.abs(s.y - centre.y) < platform * 0.5, 'on a side arc, not the far one behind the hand');
      const toCentre = Math.atan2(centre.y - s.y, centre.x - s.x);
      assert.ok(Math.abs(Math.cos(toCentre - s.facing) - 1) < 1e-9, 'facing the platform');
    }
  }
});

test('no wall, column or screen covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const geometry = neutralProps(neutralSpots(layout)).build(three);
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('neutralSpots is null without a layout; the props and columns build', () => {
  assert.equal(neutralSpots(null), null);
  const spots = neutralSpots(layouts[0]);
  const props = neutralProps(spots);
  assert.ok(props.vertexCount() > 1500);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
  assert.equal(beamGeometry(three, spots.beams).getAttribute('position').count, spots.beams.length * 2 * 15);
});

test('Neutralization Zone shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, BEAM_VERTEX, BEAM_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
