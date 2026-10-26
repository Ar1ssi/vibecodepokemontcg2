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
  LASER_COUNT,
  LASER_VERTEX,
  PROP_FRAGMENT,
  RING_GAP_PX,
  TERRAIN_FRAGMENT,
  adBoardGeometry,
  arenaProps,
  arenaSpots,
  laserGeometry,
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

test('Fighting Stadium shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round|step)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_FRAGMENT, BOARD_FRAGMENT, LASER_VERTEX, PROP_FRAGMENT]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});
