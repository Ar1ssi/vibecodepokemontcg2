import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { arenaRects, environmentFootprints, environmentKeyFor, sceneBounds } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  DAIS_MARGIN_PX,
  LAB_KEY,
  MAX_PADS,
  PAD_MARGIN_PX,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  daisDistance,
  labProps,
  labSpots,
} from '../stadium-env-lab.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const cornersOf = (rect) => [
  [rect.x, rect.y],
  [rect.x + rect.w, rect.y],
  [rect.x, rect.y + rect.h],
  [rect.x + rect.w, rect.y + rect.h],
];

test('environmentKeyFor: Full Metal Lab by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-163' }), LAB_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '163' }), LAB_KEY);
});

test('labSpots: the dais holds every Active and Bench card; every footprint lies on it or a pad', () => {
  for (const layout of layouts) {
    const { dais } = labSpots(layout);
    assert.ok(dais.pads.length <= MAX_PADS);
    for (const rect of arenaRects(layout)) {
      for (const [x, y] of cornersOf(rect)) {
        assert.ok(Math.hypot(x - dais.x, y - dais.y) <= dais.r - DAIS_MARGIN_PX + 1e-6, 'inside the round top');
      }
    }
    const { slabs, flats } = environmentFootprints(layout);
    for (const rect of [...slabs, ...flats]) {
      for (const [x, y] of cornersOf(rect)) {
        assert.ok(daisDistance(x, y, dais) <= -PAD_MARGIN_PX / 2, `corner ${x},${y} on the dais`);
      }
    }
  }
});

test('labSpots: the stair stands on the outline; tanks stand on the deck, apart, inside the scene', () => {
  for (const layout of layouts) {
    const spots = labSpots(layout);
    assert.ok(Math.abs(daisDistance(spots.stair.x, spots.stair.y, spots.dais)) < 2, 'stair at the edge');
    const scene = sceneBounds(layout, LAB_KEY);
    spots.tanks.forEach((tank, i) => {
      assert.ok(daisDistance(tank.x, tank.y, spots.dais) > tank.radius, 'off the dais');
      assert.ok(tank.x - tank.radius > scene.x && tank.x + tank.radius < scene.x + scene.w);
      assert.ok(tank.y - tank.radius > scene.y && tank.y + tank.radius < scene.y + scene.h);
      for (const other of spots.tanks.slice(i + 1)) {
        assert.ok(Math.hypot(tank.x - other.x, tank.y - other.y) > tank.radius + other.radius);
      }
    });
    assert.ok(spots.tanks.length >= 4, `${spots.tanks.length} tanks`);
  }
  assert.equal(labSpots(null), null);
});

test('labProps: one geometry with every attribute filled', () => {
  const props = labProps(labSpots(layouts[0]));
  assert.ok(props.vertexCount() > 1000);
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
  const geometry = props.build(three);
  const count = geometry.attributes.position.array.length / 3;
  assert.equal(geometry.attributes.normal.array.length / 3, count);
  assert.equal(geometry.attributes.aColor.array.length / 4, count);
  assert.ok(geometry.index.every((i) => i >= 0 && i < count));
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));
});

test('Full Metal Lab shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_FRAGMENT, PROP_FRAGMENT]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});

test('labSpots: pipe arches stand on the deck tangent to the dais; pipe runs stay on the deck, clear of every tank', () => {
  for (const layout of layouts) {
    const spots = labSpots(layout);
    const scene = sceneBounds(layout, LAB_KEY);
    for (const arch of spots.arches) {
      const tangent = [-Math.sin(arch.angle), Math.cos(arch.angle)];
      for (const side of [-1, 1]) {
        const x = arch.x + tangent[0] * arch.half * side;
        const y = arch.y + tangent[1] * arch.half * side;
        assert.ok(daisDistance(x, y, spots.dais) > arch.radius, 'each foot off the dais');
        assert.ok(x > scene.x && x < scene.x + scene.w && y > scene.y && y < scene.y + scene.h, 'each foot in the scene');
        for (const tank of spots.tanks) assert.ok(Math.hypot(x - tank.x, y - tank.y) > tank.radius + arch.radius);
      }
    }
    for (const bundle of spots.bundles) {
      for (let t = 0; t <= bundle.length; t += 5) {
        const x = bundle.x + bundle.dx * t;
        const y = bundle.y + bundle.dy * t;
        assert.ok(daisDistance(x, y, spots.dais) > 0, 'on the deck');
        for (const tank of spots.tanks) assert.ok(Math.hypot(x - tank.x, y - tank.y) > tank.radius, 'clear of the tanks');
      }
    }
  }
});
