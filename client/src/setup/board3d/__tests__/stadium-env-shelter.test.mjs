import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor, sceneBounds } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import {
  FLOOR_FRAGMENT,
  HALL_GAP_PX,
  WALL_FRAGMENT,
  WALL_PX,
  WALL_VERTEX,
  shelterSpots,
  wallGeometry,
} from '../stadium-env-shelter.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

test('environmentKeyFor: Steel Shelter by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-162' }), 'steel-shelter');
  assert.equal(environmentKeyFor({ set: 'customhb', number: 162 }), 'steel-shelter');
});

test('shelterSpots: every card footprint lies on the floor, the walls\' feet the gap clear of it', () => {
  for (const layout of layouts) {
    const { hall } = shelterSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    for (const rect of [...slabs, ...flats]) {
      assert.ok(rect.x - (hall.x - hall.hw) >= HALL_GAP_PX.side - 1e-6, 'left wall clear');
      assert.ok(hall.x + hall.hw - (rect.x + rect.w) >= HALL_GAP_PX.side - 1e-6, 'right wall clear');
      assert.ok(rect.y - (hall.y - hall.hh) >= HALL_GAP_PX.end - 1e-6, 'near wall clear');
      assert.ok(hall.y + hall.hh - (rect.y + rect.h) >= HALL_GAP_PX.end - 1e-6, 'far wall clear');
    }
  }
});

test('shelterSpots: the gate stands in the middle of the side walls, narrower than them; null without a table', () => {
  for (const layout of layouts) {
    const { hall, gate } = shelterSpots(layout);
    assert.equal(gate.u, hall.y);
    assert.ok(gate.half > 0 && gate.half < hall.hh, 'fits along the side wall');
  }
  assert.equal(shelterSpots(null), null);
});

test('wallGeometry: four walls and their roofs, every vertex inside the scene, normals facing the hall', () => {
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
  const layout = layouts[0];
  const bounds = sceneBounds(layout, 'steel-shelter');
  const { hall } = shelterSpots(layout);
  const geometry = wallGeometry(three, hall, bounds);
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;
  const paints = geometry.attributes.aPaint.array;
  assert.equal(positions.length / 3, paints.length / 4);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = positions.slice(i, i + 3);
    assert.ok(x >= bounds.x - 1e-6 && x <= bounds.x + bounds.w + 1e-6 && y >= bounds.y - 1e-6 && y <= bounds.y + bounds.h + 1e-6);
    assert.ok(z >= 0 && z <= WALL_PX.height + 1e-6);
    // A wall's normal points back into the hall (or straight up on a roof).
    const [nx, ny, nz] = normals.slice(i, i + 3);
    assert.ok(nz > 0);
    assert.ok(nx * (x - hall.x) + ny * (y - hall.y) <= 1e-6);
  }
  assert.deepEqual(new Set(Array.from({ length: paints.length / 4 }, (_, i) => paints[i * 4 + 3])), new Set([0, 1, 2]));
  assert.ok(tableBounds(layout).w > 0);
});

test('Steel Shelter shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout)\b/;
  for (const shader of [FLOOR_FRAGMENT, WALL_VERTEX, WALL_FRAGMENT]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});
