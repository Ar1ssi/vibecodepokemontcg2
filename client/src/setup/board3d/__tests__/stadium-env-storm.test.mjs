import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BOLT_FRAGMENT,
  BOLT_VERTEX,
  DOME_FRAGMENT,
  DOME_VERTEX,
  FIELD_FRAGMENT,
  FIELD_VERTEX,
  MAX_ARCS,
  MAX_CLUMPS,
  MAX_FIELD_ARCS,
  MAX_PADS,
  MAX_TREES,
  PROP_FRAGMENT,
  STORM_KEY,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  boltGeometry,
  boltPath,
  domeGeometry,
  stormProps,
  stormSpots,
} from '../stadium-env-storm.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

// customhb-358 is Magnetic Storm (FLF 91) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Magnetic Storm by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-358' }), STORM_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '358' }), STORM_KEY);
});

test('boltPath: jagged between its ends, arching up, the same every time', () => {
  const a = boltPath([0, 0, 10], [100, 0, 10], 50, 20, 3);
  assert.deepEqual(a, boltPath([0, 0, 10], [100, 0, 10], 50, 20, 3));
  assert.equal(a.length, 17);
  assert.deepEqual(a[0].map((v) => Math.abs(v)), [0, 0, 10]);
  assert.deepEqual(a[16].map((v) => Math.abs(Math.round(v))), [100, 0, 10]);
  assert.ok(Math.max(...a.map((p) => p[2])) > 40);
  assert.ok(a.some((p) => Math.abs(p[1]) > 1));
});

test('stormSpots: pads and arcs in the side bands, clear of every card; trees, boulders and reeds too', () => {
  for (const layout of layouts) {
    const { pads, arcs, trees, boulders, clumps, ring, clear, core } = stormSpots(layout);
    assert.ok(pads.length === MAX_PADS && arcs.length <= MAX_ARCS && trees.length <= MAX_TREES && clumps.length <= MAX_CLUMPS);
    assert.ok(ring === null || ring.r > 0);
    for (const pad of pads) assert.ok(clear(pad.x, pad.y, pad.r * 0.7, 6) || pad.x < core.x || pad.x > core.x + core.w, 'pad beside the cards');
    for (const tree of trees) assert.ok(clear(tree.x, tree.y, 50 + tree.h * 0.5, 14), 'tree');
    for (const rock of boulders) assert.ok(clear(rock.x, rock.y, rock.r + 18, 8), 'boulder');
    for (const clump of clumps) assert.ok(clear(clump.x, clump.y, 10, 18), 'reeds');
  }
});

test('stormSpots: a pole in the middle of each side band, the force field over the arena, strikes landing on it', () => {
  for (const layout of layouts) {
    const { poles, pads, dome, arcs, trees, boulders, clumps, clear, centre, u } = stormSpots(layout);
    assert.equal(poles.length, 2);
    const [north, south] = poles;
    assert.ok(north.x < centre.x && south.x > centre.x && north.y === centre.y && south.y === centre.y, 'a pole each side');
    for (const pole of poles) {
      assert.ok(clear(pole.x, pole.y, pole.r * 1.5, 8 * u), 'pole clear of the cards');
      assert.ok(((pole.x - dome.x) / dome.a) ** 2 + ((pole.y - dome.y) / dome.b) ** 2 < 0.9, 'pole under the dome');
    }
    for (const pad of pads) assert.ok(((pad.x - dome.x) / dome.a) ** 2 + ((pad.y - dome.y) / dome.b) ** 2 < 0.9, 'pad under the dome');
    const landings = arcs.filter((arc) => arc.dir);
    assert.equal(landings.length, MAX_PADS, 'a strike from every pad');
    for (const arc of landings) {
      const end = arc.points.at(-1);
      const onDome = ((end[0] - dome.x) / dome.a) ** 2 + ((end[1] - dome.y) / dome.b) ** 2 + (end[2] / dome.h) ** 2;
      assert.ok(Math.abs(onDome - 1) < 1e-6, 'the strike ends on the dome');
      assert.ok(Math.abs(Math.hypot(...arc.dir) - 1) < 1e-9 && arc.dir[2] > 0, 'its landing direction is a unit vector, up');
    }
    for (const tree of trees) for (const pole of poles) assert.ok(Math.hypot(tree.x - pole.x, tree.y - pole.y) > pole.r, 'tree off a pole');
    for (const rock of boulders) for (const pole of poles) assert.ok(Math.hypot(rock.x - pole.x, rock.y - pole.y) > pole.r + rock.r, 'boulder off a pole');
    for (const clump of clumps) for (const pole of poles) assert.ok(Math.hypot(clump.x - pole.x, clump.y - pole.y) > pole.r, 'reeds off a pole');
  }
});

test('stormSpots: the field arcs leave the north pole and reach the south, under the dome', () => {
  for (const layout of layouts) {
    const { fieldArcs, poles, dome } = stormSpots(layout);
    assert.equal(fieldArcs.length, MAX_FIELD_ARCS);
    for (const arc of fieldArcs) {
      assert.deepEqual(arc.points[0].map(Math.round), [poles[0].x, poles[0].y, poles[0].h].map(Math.round));
      assert.deepEqual(arc.points.at(-1).map(Math.round), [poles[1].x, poles[1].y, poles[1].h].map(Math.round));
      for (const [x, y, z] of arc.points) {
        assert.ok(z >= poles[0].h - 1e-6 && z < dome.h, 'under the dome');
        assert.ok(((x - dome.x) / dome.a) ** 2 + ((y - dome.y) / dome.b) ** 2 < 1, 'inside its footprint');
      }
    }
    // Some lie flat on their axis, some stand upright over it, and they fan to both sides of it.
    assert.ok(fieldArcs.some((arc) => Math.max(...arc.points.map((p) => p[2])) < poles[0].h * 1.8));
    assert.ok(fieldArcs.some((arc) => Math.max(...arc.points.map((p) => p[2])) > poles[0].h * 2.4));
    assert.ok(fieldArcs.some((arc) => arc.points.some((p) => p[1] > poles[0].y + 40)) && fieldArcs.some((arc) => arc.points.some((p) => p[1] < poles[0].y - 40)));
  }
});

// The links between the pads, the trees, the reeds and the pylons stay off the cards; the strikes up to the
// dome and the field's arcs fly over the arena and pass behind them (the board draws over the environment).
test('no pad link, tree, pylon or reed covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { arcs, trees, clumps, poles } = stormSpots(layout);
    const points = [
      ...arcs.slice(0, 2).flatMap((arc) => arc.points),
      ...trees.flatMap((t) => [[t.x, t.y, t.h], [t.x - t.h * 0.5, t.y, t.h * 0.8], [t.x + t.h * 0.5, t.y, t.h * 0.8], [t.x, t.y - t.h * 0.5, t.h * 0.8], [t.x, t.y + t.h * 0.5, t.h * 0.8]]),
      ...clumps.map((c) => [c.x, c.y, c.h]),
      ...poles.flatMap((p) => [[p.x, p.y, p.h + p.r], [p.x - p.r, p.y, 0], [p.x + p.r, p.y, 0], [p.x, p.y - p.r, 0], [p.x, p.y + p.r, 0]]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('stormSpots is null without a layout; the props, bolts and field arcs build', () => {
  assert.equal(stormSpots(null), null);
  const spots = stormSpots(layouts[0]);
  const props = stormProps(spots);
  assert.ok(props.vertexCount() > 3000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
  const bolts = boltGeometry(three, spots.arcs, spots.u);
  assert.equal(bolts.getAttribute('position').count, spots.arcs.reduce((sum, arc) => sum + arc.points.length * 2, 0));
  const field = boltGeometry(three, spots.fieldArcs, spots.u);
  assert.equal(field.getAttribute('position').count, spots.fieldArcs.reduce((sum, arc) => sum + arc.points.length * 2, 0));
});

test('domeGeometry: a hemisphere of unit directions, the apex straight up, the rim on the ground', () => {
  const geometry = domeGeometry(three, 8, 12);
  const positions = geometry.getAttribute('position');
  assert.equal(positions.count, 9 * 13);
  let rim = 0;
  for (let i = 0; i < positions.count; i += 1) {
    const [x, y, z] = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6 && z > -1e-9, 'a unit direction at or above the ground');
    if (Math.abs(z) < 1e-9) rim += 1;
  }
  assert.equal(rim, 13, 'one ring of vertices on the ground');
  assert.equal(geometry.getIndex().count, 8 * 12 * 6);
  assert.ok(geometry.getIndex().array.every((i) => i < positions.count));
});

test('Magnetic Storm shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, BOLT_VERTEX, BOLT_FRAGMENT, DOME_VERTEX, DOME_FRAGMENT, FIELD_VERTEX, FIELD_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
