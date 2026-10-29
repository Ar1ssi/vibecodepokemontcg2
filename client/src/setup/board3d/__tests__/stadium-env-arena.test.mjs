import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  ARENA_KEY,
  BAKE_FIELD_FRAGMENT,
  BOARD_FRAGMENT,
  LATTICE_VERTEX,
  GLINT_FRAGMENT,
  GLINT_VERTEX,
  LASER_COUNT,
  LASER_VERTEX,
  POST_PX,
  PROP_FRAGMENT,
  RIG_PX,
  RING_GAP_PX,
  TERRAIN_FRAGMENT,
  adBoardGeometry,
  arenaProps,
  arenaSpots,
  glintGeometry,
  laserGeometry,
  laserLights,
  latticeCrossings,
  latticeGeometry,
  rigLamps,
  rigOutline,
} from '../stadium-env-arena.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

const three = {
  BufferGeometry: class {
    constructor() {
      this.attributes = {};
    }
    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
    }
    setIndex(index) {
      this.index = index;
    }
  },
  Float32BufferAttribute: class {
    constructor(array, size) {
      this.array = array;
      this.size = size;
    }
  },
};

test('environmentKeyFor: Fighting Stadium by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-239' }), ARENA_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '239' }), ARENA_KEY);
});

test('arenaSpots: the ring holds every card footprint, the ropes the gap clear of them', () => {
  for (const layout of layouts) {
    const { ring, boards } = arenaSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    for (const r of [...slabs, ...flats]) {
      assert.ok(r.x - (ring.x - ring.hw) >= RING_GAP_PX.side - 1e-6 && ring.x + ring.hw - (r.x + r.w) >= RING_GAP_PX.side - 1e-6);
      assert.ok(r.y - (ring.y - ring.hh) >= RING_GAP_PX.end - 1e-6 && ring.y + ring.hh - (r.y + r.h) >= RING_GAP_PX.end - 1e-6);
    }
    assert.ok(boards.hw > ring.hw && boards.hh > ring.hh, 'the ad boards stand outside the ring');
  }
  assert.equal(arenaSpots(null), null);
});

test('arenaProps, ad boards and lasers build geometry', () => {
  const spots = arenaSpots(layouts[0]);
  assert.ok(arenaProps(spots).vertexCount() > 500);
  const boards = adBoardGeometry(three, spots);
  assert.equal(boards.attributes.aAd.array.length / 3, boards.attributes.position.array.length / 3);
  const lasers = laserGeometry(three);
  const ids = new Set(Array.from({ length: lasers.attributes.aBeam.array.length / 3 }, (_, i) => lasers.attributes.aBeam.array[i * 3 + 2]));
  assert.equal(ids.size, LASER_COUNT);
});

test('the rig runs round outside the ropes, a lamp at each of its corners and the lamps evenly spread', () => {
  for (const layout of layouts) {
    const { ring } = arenaSpots(layout);
    const outline = rigOutline(ring);
    assert.equal(outline.length, 8);
    for (const [x, y] of outline) {
      const outside = Math.max(Math.abs(x - ring.x) - ring.hw, Math.abs(y - ring.y) - ring.hh);
      assert.ok(Math.abs(outside - RIG_PX.out) < 1e-6, 'every corner lies on the rig\'s rect, out past the ropes');
    }
    const lamps = rigLamps(ring);
    for (const corner of outline) assert.ok(lamps.some(([x, y]) => x === corner[0] && y === corner[1]));
    for (let i = 0; i < lamps.length; i += 1) {
      const [ax, ay] = lamps[i];
      const [bx, by] = lamps[(i + 1) % lamps.length];
      const gap = Math.hypot(bx - ax, by - ay);
      assert.ok(gap > RIG_PX.lampEvery * 0.6 && gap < RIG_PX.lampEvery * 1.5, `lamp gap ${gap}`);
    }
    const lights = laserLights(arenaSpots(layout));
    const glints = glintGeometry(three, lamps, lights);
    assert.equal(glints.attributes.aGlint.array.length / 4, (lamps.length + lights.length) * 4);
    assert.equal(glints.index.length, (lamps.length + lights.length) * 6);
  }
});

test('latticeCrossings: the white shafts cross over the side stands, out past the ad boards', () => {
  for (const layout of layouts) {
    const spots = arenaSpots(layout);
    const crossings = latticeCrossings(spots);
    assert.equal(crossings.length, 4);
    for (const [x, y] of crossings) {
      assert.ok(Math.abs(x - spots.ring.x) > spots.boards.hw, 'past the ad boards');
      assert.ok(Math.abs(y - spots.ring.y) < spots.boards.hh, 'beside the ring');
    }
    const lattice = latticeGeometry(three, spots);
    const count = lattice.attributes.position.array.length / 3;
    assert.equal(lattice.attributes.aFrom.array.length / 3, count);
    assert.equal(lattice.attributes.aBeam.array.length / 2, count);
  }
});

test('laserLights: one high in each corner, out past the ad boards', () => {
  for (const layout of layouts) {
    const spots = arenaSpots(layout);
    const lights = laserLights(spots);
    assert.equal(lights.length, 4);
    for (const [x, y, z] of lights) {
      assert.ok(Math.abs(x - spots.ring.x) > spots.boards.hw && Math.abs(y - spots.ring.y) > spots.boards.hh, 'past a corner of the boards');
      assert.ok(z > POST_PX.height, 'high over the ring');
    }
    const [farLeft, farRight, nearLeft, nearRight] = lights;
    assert.ok(farLeft[0] < spots.ring.x && farRight[0] > spots.ring.x && nearLeft[0] < spots.ring.x && nearRight[0] > spots.ring.x);
    assert.ok(farLeft[1] > spots.ring.y && farRight[1] > spots.ring.y && nearLeft[1] < spots.ring.y && nearRight[1] < spots.ring.y);
  }
});

test('Fighting Stadium shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round|step)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_FRAGMENT, BOARD_FRAGMENT, LASER_VERTEX, PROP_FRAGMENT, GLINT_VERTEX, GLINT_FRAGMENT, LATTICE_VERTEX]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});
