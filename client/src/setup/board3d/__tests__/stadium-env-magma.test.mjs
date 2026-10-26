import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import {
  BAKE_BASIN_FRAGMENT,
  BAKE_FIELD_FRAGMENT,
  EMBER_VERTEX,
  ISLAND_MARGIN_PX,
  LAVA_FRAGMENT,
  MAX_FALLS,
  MOAT_PX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  basinSpots,
  magmaBasinBoard,
} from '../stadium-env-magma.mjs';

// The no-mat profile the board draws by default, and the simulator's own, at the board width
// board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
// Every mat profile: the no-mat default, the simulator's, one-player mats, full-size two-player mats.
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

test('basinSpots: each fall stands on the moat\'s outer shore of its side, facing up the wall', () => {
  for (const layout of layouts) {
    const { island, falls } = basinSpots(layout);
    assert.ok(falls.length > 0 && falls.length <= MAX_FALLS);
    for (const fall of falls) {
      const dx = Math.round(Math.cos(fall.angle));
      const dy = Math.round(Math.sin(fall.angle));
      if (dx !== 0) {
        assert.ok(Math.abs(fall.x - island.x) >= island.hw + MOAT_PX.side, 'beyond the side moat');
        assert.equal(Math.sign(fall.x - island.x), dx, 'faces away from the island');
        assert.ok(Math.abs(fall.y - island.y) <= island.hh - island.r, 'on the straight run of its side');
      } else {
        assert.ok(Math.abs(fall.y - island.y) >= island.hh + MOAT_PX.end, 'beyond the end moat');
        assert.equal(Math.sign(fall.y - island.y), dy, 'faces away from the island');
        assert.ok(Math.abs(fall.x - island.x) <= island.hw - island.r, 'on the straight run of its side');
      }
    }
    assert.ok(falls.every((fall) => fall.y > island.y - island.hh), 'none on the near wall, under the hand');
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
