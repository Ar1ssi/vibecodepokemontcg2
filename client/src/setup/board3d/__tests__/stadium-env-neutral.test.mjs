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
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  beamGeometry,
  neutralProps,
  neutralSpots,
} from '../stadium-env-neutral.mjs';
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

// customhb-378 is Neutralization Zone (SFA 60) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Neutralization Zone by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-378' }), NEUTRAL_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '378' }), NEUTRAL_KEY);
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

test('no wall, column or screen covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { beams, screens, walls } = neutralSpots(layout);
    const points = [
      ...beams.flatMap((b) => [[b.x, b.y, b.h], [b.x - b.r, b.y, b.h], [b.x + b.r, b.y, b.h]]),
      ...screens.flatMap((s) => [[s.x - s.w / 2, s.y, s.z + s.h / 2], [s.x + s.w / 2, s.y, s.z + s.h / 2], [s.x, s.y, s.z - s.h / 2]]),
      ...[walls.left, walls.right].flatMap((w) => [[w.x0, w.y0, walls.height], [w.x1, w.y0, walls.height], [w.x0, w.y1, walls.height], [w.x1, w.y1, walls.height]]),
      ...[walls.far.x0, walls.far.x1].flatMap((x) => [[x, walls.far.y0, walls.height], [x, walls.far.y1, walls.height]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
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
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, BEAM_VERTEX, BEAM_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
