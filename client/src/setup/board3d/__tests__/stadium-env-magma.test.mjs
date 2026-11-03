import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { SCREEN_VIEWS, screenView } from './stadium-screen.mjs';
import {
  BAKE_BASIN_FRAGMENT,
  BAKE_FIELD_FRAGMENT,
  EMBER_VERTEX,
  ISLAND_MARGIN_PX,
  LAVA_FRAGMENT,
  MAX_FALLS,
  MOAT_PX,
  NEAR_REACH_PX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  basinSpots,
  magmaBasinBoard,
} from '../stadium-env-magma.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

/** Signed px from a rounded rect's outline (negative inside), as the shader's roundedRect. */
const roundedRect = (x, y, island) => {
  const qx = Math.abs(x - island.x) - (island.hw - island.r);
  const qy = Math.abs(y - island.y) - (island.hh - island.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - island.r;
};

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

const cornersOf = (rect) => [
  [rect.x, rect.y],
  [rect.x + rect.w, rect.y],
  [rect.x, rect.y + rect.h],
  [rect.x + rect.w, rect.y + rect.h],
];

test('environmentKeyFor: Magma Basin by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-289' }), 'magma-basin');
  assert.equal(environmentKeyFor({ set: 'customhb', number: '289' }), 'magma-basin');
});

test('basinSpots: the island runs on past the near cards by NEAR_REACH_PX, under the hand row', () => {
  for (const layout of layouts) {
    const { island } = basinSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    const nearest = Math.min(...[...slabs, ...flats].map((r) => r.y));
    const farthest = Math.max(...[...slabs, ...flats].map((r) => r.y + r.h));
    const nearShore = nearest - (island.y - island.hh);
    const farShore = island.y + island.hh - farthest;
    assert.ok(Math.abs(nearShore - farShore - NEAR_REACH_PX) < 1e-6, `near ${nearShore}, far ${farShore}`);
  }
});

test('basinSpots: the island holds every card footprint, its margin clear inside the shore', () => {
  for (const layout of layouts) {
    const { island } = basinSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    for (const rect of [...slabs, ...flats]) {
      for (const [x, y] of cornersOf(rect)) {
        assert.ok(roundedRect(x, y, island) <= -ISLAND_MARGIN_PX + 1e-6, `corner ${x},${y} inside by the margin`);
      }
    }
  }
});

// Design 084: the falls pour down the far wall's corners, where both cameras see them past the
// opponent's hand row, each straight down the wall's face (the corner's outward normal; I277).
test('basinSpots: the falls stand round the far corners past the moat, each pouring down the wall\'s face', () => {
  for (const layout of layouts) {
    const { island, falls } = basinSpots(layout);
    assert.equal(falls.length, MAX_FALLS);
    for (const fall of falls) {
      const corner = Math.sign(fall.x - island.x);
      const centre = [island.x + corner * (island.hw - island.r), island.y + (island.hh - island.r)];
      const out = Math.atan2(fall.y - centre[1], fall.x - centre[0]);
      close(Math.cos(fall.angle - out), 1, 'its line runs along the corner\'s outward normal');
      assert.ok(fall.y > island.y + island.hh - island.r, 'past the far corners\' centres');
      assert.ok(Math.abs(fall.x - island.x) > island.hw - island.r, 'round a corner, off the far run');
      assert.ok(roundedRect(fall.x, fall.y, island) >= MOAT_PX.end, 'past the moat');
    }
    assert.equal(falls.filter((fall) => fall.x < island.x).length, 3, 'three on the left corner, the one tcgl shows');
    assert.equal(falls.filter((fall) => fall.fork).length, 1, 'one forked');
  }
});

// Design 084 (I277): the falls are the card's identity, so both camera presets show them: on the
// default board at least two falls' feet lie in each preset's frame (left of the chat panel, clear of
// the opponent's hand row), and on screen each runs across the moat beside it, never along it (a fall
// laid parallel to the moat read as a second moat).
test('the falls show in both camera presets, each crossing the moat beside it on screen', () => {
  for (const view of [SCREEN_VIEWS[0], SCREEN_VIEWS[2]]) {
    const { layout, projectors } = screenView(view);
    const { viewport } = view;
    const { falls } = basinSpots(layout);
    for (const { preset, project } of projectors) {
      const seen = falls.filter((fall) => {
        const foot = project(fall.x, fall.y, -8);
        if (!foot || foot.x < 0 || foot.x > viewport.w * 0.755 || foot.y < 0 || foot.y > viewport.h) return false;
        const way = [Math.cos(fall.angle), Math.sin(fall.angle)];
        const crest = project(fall.x + way[0] * 108, fall.y + way[1] * 108, 120);
        const shoreA = project(fall.x + way[1] * 40, fall.y - way[0] * 40, -8);
        const shoreB = project(fall.x - way[1] * 40, fall.y + way[0] * 40, -8);
        const fallTurn = Math.atan2(crest.y - foot.y, crest.x - foot.x);
        const moatTurn = Math.atan2(shoreB.y - shoreA.y, shoreB.x - shoreA.x);
        let apart = Math.abs(fallTurn - moatTurn) % Math.PI;
        if (apart > Math.PI / 2) apart = Math.PI - apart;
        assert.ok(apart > Math.PI / 3, `${viewport.w} ${preset}: a fall only ${((apart * 180) / Math.PI).toFixed(0)} deg off its moat`);
        return true;
      });
      assert.ok(seen.length >= 2, `${viewport.w} ${preset} shows ${seen.length} falls`);
    }
  }
});

test('basinSpots: the emblem rings the Actives at the table\'s middle, where it has room; null without a table', () => {
  assert.ok(basinSpots(layouts[0]).emblem?.r > 0, 'the default board has room for it');
  for (const layout of layouts) {
    const { emblem } = basinSpots(layout);
    if (!emblem) continue;
    const table = tableBounds(layout);
    assert.equal(emblem.x, table.x + table.w / 2);
    assert.equal(emblem.y, layout.depth);
  }
  assert.equal(basinSpots(null), null);
});

// Design 084: the bake's target is half float (largest 65504). The falls' "no fall" distance stored
// unclamped became Inf, filtered to NaN, and lit every wall with the falls' glow.
test('BAKE_BASIN stores the falls distance clamped under the half-float maximum', () => {
  const stored = BAKE_BASIN_FRAGMENT.match(/gl_FragColor = vec4\([^;]*min\(fallsDistance\(p, outerSD\), ([0-9.]+)\)\)/);
  assert.ok(stored, 'the A channel is min(fallsDistance(...), cap)');
  assert.ok(Number(stored[1]) < 65504, `cap ${stored[1]}`);
});

test('Magma Basin shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short)\b/;
  for (const shader of [BAKE_BASIN_FRAGMENT, BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, LAVA_FRAGMENT, EMBER_VERTEX]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});

test('magmaBasinBoard: apply fills every fall slot, unused ones off', () => {
  const vector = () => ({ value: null, set(...v) { this.value = v; return this; } });
  const three = {
    Vector3: function Vector3() { return vector(); },
    Vector4: function Vector4() { return vector(); },
    Mesh: function Mesh(geometry) { this.geometry = geometry; },
    Points: function Points(geometry) { this.geometry = geometry; },
    BufferGeometry: function BufferGeometry() { this.dispose = () => {}; },
    PlaneGeometry: function PlaneGeometry() { this.translate = () => this; },
    AdditiveBlending: 2,
  };
  const uniforms = [];
  const board = magmaBasinBoard({
    three,
    material: (vertex, fragment, extra, own) => (uniforms.push(own), { own }),
    seeded: () => new three.BufferGeometry(),
    terrainGrid: () => new three.BufferGeometry(),
    replaceGeometry: (mesh, geometry) => (mesh.geometry = geometry),
    bakeOptions: {},
  });
  const spots = board.spots(layouts[0]);
  board.apply(spots, tableBounds(layouts[0]));
  const slots = uniforms[0].uFalls.value.map((slot) => slot.value);
  assert.equal(slots.length, MAX_FALLS);
  assert.equal(slots.filter((slot) => slot[3] > 0).length, spots.falls.length);
  assert.equal(slots.filter((slot) => slot[3] === 2).length, 1, 'one forked fall');
});
