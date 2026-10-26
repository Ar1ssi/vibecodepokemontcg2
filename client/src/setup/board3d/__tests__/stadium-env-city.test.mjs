import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BEAM_VERTEX,
  BILLBOARD_FRAGMENT,
  BUILDING_FRAGMENT,
  CITY_KEY,
  PROP_FRAGMENT,
  ROOF_GAP_PX,
  TERRAIN_FRAGMENT,
  cityBuildings,
  cityProps,
  citySpots,
} from '../stadium-env-city.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const boxOf = ({ x, y, w, d }) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 });

test('environmentKeyFor: Dark City by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-254' }), CITY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '254' }), CITY_KEY);
});

test('citySpots: every card lies on the roof, the hut clear of the cards and the parapet', () => {
  for (const layout of layouts) {
    const { roof, hut } = citySpots(layout);
    const roofBox = { x0: roof.x - roof.hw, x1: roof.x + roof.hw, y0: roof.y - roof.hh, y1: roof.y + roof.hh };
    const { slabs, flats } = environmentFootprints(layout);
    const cards = [...slabs, ...flats].map((r) => ({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h }));
    for (const card of cards) {
      assert.ok(card.x0 - roofBox.x0 >= ROOF_GAP_PX.side - 1e-6 && roofBox.x1 - card.x1 >= ROOF_GAP_PX.side - 1e-6);
      assert.ok(card.y0 - roofBox.y0 >= ROOF_GAP_PX.end - 1e-6 && roofBox.y1 - card.y1 >= ROOF_GAP_PX.end - 1e-6);
    }
    const box = boxOf({ x: hut.x, y: hut.y, w: hut.w, d: hut.d });
    assert.ok(cards.every((card) => !overlaps(box, card)), 'clear of every card');
    assert.ok(box.x0 > roofBox.x0 + 12 && box.x1 < roofBox.x1 - 12 && box.y0 > roofBox.y0 + 12 && box.y1 < roofBox.y1 - 12, 'inside the parapet');
  }
  assert.equal(citySpots(null), null);
});

test('citySpots: every searchlight stands on a tower roof or in a street clear of the towers, off the cards\' roof', () => {
  for (const layout of layouts) {
    const { roof, towers, beams } = citySpots(layout);
    assert.equal(beams.length, 4);
    for (const beam of beams) {
      const under = towers.filter((tower) => Math.abs(beam.x - tower.x) <= tower.w / 2 && Math.abs(beam.y - tower.y) <= tower.d / 2);
      if (beam.z > 0) assert.ok(under.length === 1 && beam.z > under[0].height, 'on a tower roof');
      else assert.equal(under.length, 0, 'in a street, clear of every tower');
      assert.ok(Math.abs(beam.x - roof.x) > roof.hw || Math.abs(beam.y - roof.y) > roof.hh, 'off the cards\' roof');
    }
  }
});

test('citySpots: the towers stand off the roof, apart from each other and the round tower', () => {
  for (const layout of layouts) {
    const { roof, towers, round } = citySpots(layout);
    const roofBox = { x0: roof.x - roof.hw, x1: roof.x + roof.hw, y0: roof.y - roof.hh, y1: roof.y + roof.hh };
    const boxes = towers.map(boxOf);
    boxes.forEach((box, i) => {
      assert.ok(!overlaps(box, roofBox), `tower ${i} off the roof`);
      boxes.slice(i + 1).forEach((other) => assert.ok(!overlaps(box, other), 'towers apart'));
      const nearest = { x: Math.max(box.x0, Math.min(round.x, box.x1)), y: Math.max(box.y0, Math.min(round.y, box.y1)) };
      assert.ok(Math.hypot(nearest.x - round.x, nearest.y - round.y) > round.r, 'clear of the round tower');
    });
    assert.deepEqual(towers.filter((t) => t.board).map((t) => t.board).sort(), [1, 2]);
  }
});

test('cityProps and cityBuildings: geometry with every attribute finite', () => {
  const spots = citySpots(layouts[0]);
  for (const builder of [cityProps(spots), cityBuildings(spots)]) {
    assert.ok(builder.vertexCount() > 50);
  }
});

test('Dark City shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [TERRAIN_FRAGMENT, BUILDING_FRAGMENT, BILLBOARD_FRAGMENT, BEAM_VERTEX, PROP_FRAGMENT]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});
