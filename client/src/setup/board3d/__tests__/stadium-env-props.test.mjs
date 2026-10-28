import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { createPropBuilder } from '../stadium-env-props.mjs';
import { disc } from '../stadium-env-buildings.mjs';

const read = (props) => {
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('aColor');
  return { geometry, position, normal, color };
};

test('triangle: three vertices with one unit normal, facing where the winding faces, each carrying the colour', () => {
  const props = createPropBuilder();
  props.triangle([0, 0, 0], [10, 0, 0], [0, 10, 0], [0.2, 0.4, 0.6, 0.3]);
  assert.equal(props.vertexCount(), 3);
  const { geometry, normal, color } = read(props);
  assert.equal(geometry.getIndex().count, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual([normal.getX(i), normal.getY(i), normal.getZ(i)], [0, 0, 1], 'counter-clockwise seen from +z faces +z');
    assert.deepEqual([color.getX(i), color.getY(i), color.getZ(i)].map((v) => Math.round(v * 10) / 10), [0.2, 0.4, 0.6]);
    assert.ok(Math.abs(color.getW(i) - 0.3) < 1e-6);
  }
});

test('triangle: a degenerate one does not poison the geometry with NaN normals', () => {
  const props = createPropBuilder();
  props.triangle([1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1, 0]);
  const { normal } = read(props);
  for (let i = 0; i < 3; i += 1) assert.ok(Number.isFinite(normal.getX(i)) && Number.isFinite(normal.getY(i)) && Number.isFinite(normal.getZ(i)));
});

test('disc: a fan of triangles on the circle in the plane through `out` and up, a half disc covering half the arc', () => {
  const whole = createPropBuilder();
  disc(whole, { centre: [5, 6, 20], out: [0, 1], r: 8, color: [1, 1, 1, 0], sides: 16 });
  assert.equal(whole.vertexCount(), 16 * 3);
  const { position } = read(whole);
  for (let i = 0; i < position.count; i += 1) {
    assert.ok(Math.abs(position.getX(i) - 5) < 1e-9, 'every vertex in the plane x = 5 (out is +y)');
    assert.ok(Math.hypot(position.getY(i) - 6, position.getZ(i) - 20) <= 8 + 1e-4, 'within the radius');
  }
  const top = createPropBuilder();
  disc(top, { centre: [0, 0, 0], out: [1, 0], r: 4, color: [1, 0, 0, 0], from: 0, to: Math.PI, sides: 10 });
  const { position: upper } = read(top);
  for (let i = 0; i < upper.count; i += 1) assert.ok(upper.getZ(i) >= -1e-9, 'the upper half only');
});
