import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packCoinMesh, parseCoinObj } from '../lib/coin-mesh.mjs';

// Two groups: a quad (fan-triangulated) and a triangle that reuses the quad's first corner.
const OBJ = `g coin_model
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 2 0 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
g coin_model_0
f 1/1/1 2/2/1 3/3/1 4/4/1
g coin_model_1
f 1/1/1 3/3/1 5/3/1
`;

test('a quad fans into two triangles and each group is a submesh over them', () => {
  const mesh = parseCoinObj(OBJ);
  assert.deepEqual(mesh.submeshes, [
    { name: 'coin_model_0', start: 0, count: 6 },
    { name: 'coin_model_1', start: 6, count: 3 },
  ]);
  assert.deepEqual(mesh.indices, [0, 1, 2, 0, 2, 3, 0, 2, 4]);
});

test('a corner used twice is one vertex; positions, uvs and normals stay paired', () => {
  const mesh = parseCoinObj(OBJ);
  assert.equal(mesh.positions.length, 5);
  assert.deepEqual(mesh.positions[4], [2, 0, 0]);
  assert.deepEqual(mesh.uvs[2], [1, 1]);
  assert.deepEqual(mesh.normals[0], [0, 0, 1]);
});

test('packCoinMesh flattens to p, n, uv and i with the submeshes kept', () => {
  const packed = packCoinMesh(parseCoinObj(OBJ));
  assert.equal(packed.p.length, 5 * 3);
  assert.equal(packed.n.length, 5 * 3);
  assert.equal(packed.uv.length, 5 * 2);
  assert.deepEqual(packed.i.slice(0, 3), [0, 1, 2]);
  assert.equal(packed.submeshes.length, 2);
});

test('a face corner without a uv or normal is refused, naming the corner', () => {
  const noUv = OBJ.replace('f 1/1/1 3/3/1 5/3/1', 'f 1//1 3/3/1 5/3/1');
  assert.throws(() => parseCoinObj(noUv), /face corner "1\/\/1" needs position, uv and normal/);
});

test('a face that points past the defined positions is refused', () => {
  const badIndex = OBJ.replace('f 1/1/1 3/3/1 5/3/1', 'f 1/1/1 3/3/1 9/3/1');
  assert.throws(() => parseCoinObj(badIndex), /position 9 is not defined/);
});

test('a face with fewer than three corners and an OBJ with no faces are refused', () => {
  assert.throws(() => parseCoinObj('v 0 0 0\nvt 0 0\nvn 0 0 1\ng a\nf 1/1/1 1/1/1\n'), /fewer than three corners/);
  assert.throws(() => parseCoinObj('v 0 0 0\n'), /no faces/);
});
