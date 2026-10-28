import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palmGeometry } from '../stadium-env-palms.mjs';

const PALM = { x: 120, y: 80, height: 180, lean: 0.4, leanAngle: Math.PI / 3, seed: 0.37 };
const TRUNK_VERTICES = 23 * 10;
const FROND_VERTICES = 17 * 4;
const COCONUT_VERTICES = 6 * 8;

const kindsOf = (geometry) => {
  const counts = [0, 0, 0];
  for (let i = 0; i < geometry.part.length; i += 4) counts[geometry.part[i]] += 1;
  return counts;
};

test('palmGeometry of no palms is empty', () => {
  const geometry = palmGeometry([]);
  for (const key of ['position', 'normal', 'tree', 'part', 'frond', 'index']) assert.equal(geometry[key].length, 0, key);
});

test('palmGeometry builds a trunk, 12-14 fronds and 3-4 coconuts per palm, all indexed in range', () => {
  const geometry = palmGeometry([PALM]);
  const vertices = geometry.position.length / 3;
  const [trunk, frond, coconut] = kindsOf(geometry);
  assert.equal(trunk, TRUNK_VERTICES);
  assert.ok(frond % FROND_VERTICES === 0 && frond / FROND_VERTICES >= 12 && frond / FROND_VERTICES <= 14, `${frond} frond vertices`);
  assert.ok(coconut % COCONUT_VERTICES === 0 && coconut / COCONUT_VERTICES >= 3 && coconut / COCONUT_VERTICES <= 4);
  assert.equal(trunk + frond + coconut, vertices);
  assert.equal(geometry.normal.length, vertices * 3);
  assert.equal(geometry.tree.length, vertices * 4);
  assert.equal(geometry.frond.length, vertices);
  for (let v = 0; v < vertices; v += 1) {
    const onFrond = geometry.part[v * 4] === 1;
    assert.ok(onFrond ? geometry.frond[v] >= 0 && geometry.frond[v] < 1 : geometry.frond[v] === 0, 'frond seed only on fronds');
  }
  assert.equal(geometry.index.length % 3, 0);
  assert.ok(geometry.index.every((i) => i < vertices));
  for (let i = 0; i < geometry.tree.length; i += 4) {
    assert.deepEqual([...geometry.tree.slice(i, i + 4)], [PALM.x, PALM.y, Math.fround(PALM.seed), PALM.height]);
  }
  for (let i = 0; i < geometry.normal.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(...geometry.normal.slice(i, i + 3)) - 1) < 1e-5, 'unit normals');
  }
});

test('the trunk stands on its base, reaches the palm height, and leans toward leanAngle', () => {
  const { position, part } = palmGeometry([PALM]);
  // The foot ring (9 sides; the 10th vertex closes the seam) is centred on the base.
  const foot = [0, 1, 2].map((axis) => [...Array(9).keys()].reduce((sum, v) => sum + position[v * 3 + axis], 0) / 9);
  foot.forEach((value, axis) => assert.ok(Math.abs(value) < 0.5, `foot centre axis ${axis}: ${value}`));
  let highest = -Infinity;
  let top = [0, 0];
  for (let v = 0; v < position.length / 3; v += 1) {
    if (part[v * 4] !== 0) continue;
    const z = position[v * 3 + 2];
    if (z > highest) {
      highest = z;
      top = [position[v * 3], position[v * 3 + 1]];
    }
  }
  assert.ok(Math.abs(highest - PALM.height) < PALM.height * 0.05, `top ${highest}`);
  const along = top[0] * Math.cos(PALM.leanAngle) + top[1] * Math.sin(PALM.leanAngle);
  assert.ok(along > PALM.height * PALM.lean * 0.6, 'the top leans out');
});

test('frond vertices carry along 0..1 and across -1..1; the sway grows to the tips', () => {
  const { part } = palmGeometry([PALM]);
  for (let i = 0; i < part.length; i += 4) {
    const [kind, along, across, sway] = part.slice(i, i + 4);
    assert.ok(along >= 0 && along <= 1);
    if (kind === 1) {
      assert.ok(across >= -1 && across <= 1);
      assert.ok(Math.abs(sway - (0.5 + 1.5 * along * along)) < 1e-6);
    }
  }
});

test('palmGeometry is the same for the same palms', () => {
  assert.deepEqual(palmGeometry([PALM, { ...PALM, x: -40, seed: 0.81 }]), palmGeometry([PALM, { ...PALM, x: -40, seed: 0.81 }]));
});
