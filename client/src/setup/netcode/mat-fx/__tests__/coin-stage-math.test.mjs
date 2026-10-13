import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COIN_BACK_SUBMESH,
  COIN_CAMERA,
  COIN_FRONT_SUBMESH,
  COIN_LIFT_UNITS,
  COIN_LIGHT,
  coinTangents,
  coinViewProjection,
  discRadius,
  glslBody,
  multiplyMatrices,
  posedCoin,
  shaderUniformBlocks,
} from '../coin-stage-math.mjs';
import { coinFlipAngle } from '../coin-pose.mjs';

const assetDir = new URL('../../../../assets/coins/tcgl/', import.meta.url);
const readAsset = (name) => JSON.parse(readFileSync(new URL(name, assetDir), 'utf8'));
const mesh = readAsset('coin-mesh.json');
const { coins, materials } = readAsset('coins.json');
const shaders = readAsset('shaders.json');

const submesh = (name) => mesh.submeshes.find((entry) => entry.name === name);

/** The stored normal of the first corner of a submesh's first triangle. */
const capNormal = (name) => {
  const { start } = submesh(name);
  const vertex = mesh.i[start];
  return [mesh.n[vertex * 3], mesh.n[vertex * 3 + 1], mesh.n[vertex * 3 + 2]];
};

const normalAfter = (name, posed) => {
  const { start } = submesh(name);
  const vertex = mesh.i[start];
  return [posed.normals[vertex * 3], posed.normals[vertex * 3 + 1], posed.normals[vertex * 3 + 2]];
};

const tangents = coinTangents(mesh);

test('at rest the front cap faces the camera; at 180 degrees the back does', () => {
  const rest = posedCoin(mesh, tangents, coinFlipAngle(0, 'heads') % 360, 0);
  const restFront = normalAfter(COIN_FRONT_SUBMESH, rest);
  assert.ok(restFront[2] > 0.999, `front normal ${restFront} points at the camera (+Z)`);
  assert.ok(capNormal(COIN_FRONT_SUBMESH)[1] < -0.999, 'the front cap normal is -Y in the mesh');

  const tails = posedCoin(mesh, tangents, coinFlipAngle(0, 'tails') % 360, 0);
  assert.ok(normalAfter(COIN_FRONT_SUBMESH, tails)[2] < -0.999, 'the front faces away at tails');
  assert.ok(normalAfter(COIN_BACK_SUBMESH, tails)[2] > 0.999, 'the back faces the camera at tails');
});

test('a pose keeps every vertex on its circle about the spin axis', () => {
  const before = posedCoin(mesh, tangents, 0, 0);
  const after = posedCoin(mesh, tangents, 137, 0);
  for (let vertex = 0; vertex < mesh.p.length / 3; vertex += 7) {
    const radiusBefore = Math.hypot(before.positions[vertex * 3 + 1], before.positions[vertex * 3 + 2]);
    const radiusAfter = Math.hypot(after.positions[vertex * 3 + 1], after.positions[vertex * 3 + 2]);
    assert.ok(Math.abs(radiusBefore - radiusAfter) < 1e-4, `vertex ${vertex}`);
    assert.equal(after.positions[vertex * 3], before.positions[vertex * 3], 'x is the spin axis');
  }
});

test('lift raises the whole disc by COIN_LIFT_UNITS at the top of the arc', () => {
  const low = posedCoin(mesh, tangents, 40, 0);
  const high = posedCoin(mesh, tangents, 40, 1);
  for (let vertex = 0; vertex < mesh.p.length / 3; vertex += 11) {
    assert.ok(Math.abs(high.positions[vertex * 3 + 1] - low.positions[vertex * 3 + 1] - COIN_LIFT_UNITS) < 1e-5);
  }
});

test('a non-finite lift is treated as the table', () => {
  const table = posedCoin(mesh, tangents, 40, 0);
  const broken = posedCoin(mesh, tangents, 40, Number.NaN);
  assert.deepEqual(broken.positions, table.positions);
});

test('tangents are unit length, perpendicular to the normal, with a ±1 bitangent sign', () => {
  for (let vertex = 0; vertex < mesh.p.length / 3; vertex += 1) {
    const [tx, ty, tz, w] = [tangents[vertex * 4], tangents[vertex * 4 + 1], tangents[vertex * 4 + 2], tangents[vertex * 4 + 3]];
    const [nx, ny, nz] = [mesh.n[vertex * 3], mesh.n[vertex * 3 + 1], mesh.n[vertex * 3 + 2]];
    assert.ok(Math.abs(Math.hypot(tx, ty, tz) - 1) < 1e-4, `vertex ${vertex} tangent length`);
    assert.ok(Math.abs(tx * nx + ty * ny + tz * nz) < 1e-4, `vertex ${vertex} tangent is perpendicular`);
    assert.ok(w === 1 || w === -1, `vertex ${vertex} sign ${w}`);
  }
});

test('the disc radius is the furthest vertex from the spin axis', () => {
  const radius = discRadius(mesh.p);
  assert.ok(radius > 1.69 && radius < 1.71, `radius ${radius}`);
});

test('at rest the disc edge sits at COIN_CAMERA.discFill of the half-height', () => {
  const radius = discRadius(mesh.p);
  const viewProjection = coinViewProjection({ width: 300, height: 300, radius });
  const edge = [radius, 0, 0, 1];
  const clip = [0, 1, 2, 3].map((row) => [0, 1, 2, 3].reduce((sum, column) => sum + viewProjection[column * 4 + row] * edge[column], 0));
  assert.ok(Math.abs(clip[0] / clip[3] - COIN_CAMERA.discFill) < 1e-5);
  assert.ok(Math.abs(clip[1]) < 1e-6, 'centred vertically');
});

test('multiplyMatrices follows column-major order', () => {
  const translate = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);
  const scale = Float32Array.from([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
  const product = multiplyMatrices(translate, scale);
  assert.deepEqual(Array.from(product.slice(12, 15)), [5, 6, 7], 'translation kept, not scaled');
  assert.equal(product[0], 2);
});

test('shaderUniformBlocks fills the dynamic slots and the light the importer left at zero', () => {
  const coin = coins.cn_absolmega_slvi ?? Object.values(coins).find((entry) => entry.front !== null);
  const material = materials[coin.front];
  const shader = shaders[material.shader];
  const viewProjection = coinViewProjection({ width: 200, height: 100, radius: 1.7 });
  const blocks = shaderUniformBlocks(shader, material, { viewProjection, cameraPosition: [1, 2, 3], timeSeconds: 4 });

  const vcb2 = blocks.vcb2;
  assert.deepEqual(Array.from(vcb2.slice(68, 84)), Array.from(viewProjection), 'view-projection in vcb2 at float 68');

  const fcb1 = blocks.fcb1;
  assert.deepEqual(Array.from(fcb1.slice(16, 19)), [1, 2, 3], 'camera position at float 16');

  if (shader.name === 'TPCi/Surface/BumpSpec Relective') {
    assert.deepEqual(Array.from(blocks.fcb0.slice(8, 11)), COIN_LIGHT.color, 'light colour in fcb0[2]');
    assert.deepEqual(Array.from(blocks.fcb2.slice(0, 3)), COIN_LIGHT.direction, 'light direction in fcb2[0]');
  }
  assert.equal(material.v[0].length, blocks.vcb0.length, 'material constants keep their length');
});

test('shaderUniformBlocks: the light sits in a block the shader has', () => {
  const surface = shaders.find((shader) => shader.name === 'TPCi/Surface/BumpSpec Relective');
  const badShader = { ...surface, buffers: { v: surface.buffers.v, f: surface.buffers.f.filter((block) => block.uniform !== 'fcb0') } };
  const material = materials.find((entry) => entry.shader === shaders.indexOf(surface));
  const frame = { viewProjection: new Float32Array(16), cameraPosition: [0, 0, 0], timeSeconds: 0 };
  assert.throws(() => shaderUniformBlocks(badShader, material, frame), /light block/);
});

test('glslBody drops the version line three.js writes itself', () => {
  assert.equal(glslBody('#version 300 es\nprecision highp float;\nvoid main() {}\n'), 'precision highp float;\nvoid main() {}\n');
});

test('glslBody refuses a shader without a GLSL ES 3.00 version line', () => {
  assert.throws(() => glslBody('precision highp float;\nvoid main() {}\n'), /#version 300 es/);
  assert.throws(() => glslBody(''), /#version 300 es/);
});
