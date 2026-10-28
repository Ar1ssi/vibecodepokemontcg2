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
  MAX_ARCS,
  MAX_CLUMPS,
  MAX_PADS,
  MAX_TREES,
  PROP_FRAGMENT,
  STORM_KEY,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  boltGeometry,
  boltPath,
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

test('no lightning, tree or boulder covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { arcs, trees, clumps } = stormSpots(layout);
    const points = [
      ...arcs.flatMap((arc) => arc.points),
      ...trees.flatMap((t) => [[t.x, t.y, t.h], [t.x - t.h * 0.5, t.y, t.h * 0.8], [t.x + t.h * 0.5, t.y, t.h * 0.8], [t.x, t.y - t.h * 0.5, t.h * 0.8], [t.x, t.y + t.h * 0.5, t.h * 0.8]]),
      ...clumps.map((c) => [c.x, c.y, c.h]),
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('stormSpots is null without a layout; the props and bolts build', () => {
  assert.equal(stormSpots(null), null);
  const spots = stormSpots(layouts[0]);
  const props = stormProps(spots);
  assert.ok(props.vertexCount() > 2000);
  assert.equal(props.build(three).getAttribute('position').count, props.vertexCount());
  const bolts = boltGeometry(three, spots.arcs, spots.u);
  assert.equal(bolts.getAttribute('position').count, spots.arcs.reduce((sum, arc) => sum + arc.points.length * 2, 0));
});

test('Magnetic Storm shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT, BOLT_VERTEX, BOLT_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
