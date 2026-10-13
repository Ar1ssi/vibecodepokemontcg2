import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COIN_AMBIENT,
  COIN_BACK_SUBMESH,
  COIN_CAMERA,
  COIN_FRONT_SUBMESH,
  COIN_LIFT_UNITS,
  COIN_LIGHT,
  COIN_TILT_MAX_DEG,
  coinTangents,
  coinTiltFromPointer,
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

test('coinTiltFromPointer: centre is flat; the side under the pointer leans away from the viewer', () => {
  assert.deepEqual(coinTiltFromPointer(0, 0), { angle: 0, yaw: 0, lift: 0 });
  const front = (pose) => normalAfter(COIN_FRONT_SUBMESH, posedCoin(mesh, tangents, pose.angle, pose.lift, pose.yaw));
  assert.ok(front(coinTiltFromPointer(0, -1))[1] > 0.4, 'pointer at the top: the face turns up, its top edge away');
  assert.ok(front(coinTiltFromPointer(0, 1))[1] < -0.4, 'pointer at the bottom: the face turns down');
  assert.ok(front(coinTiltFromPointer(1, 0))[0] > 0.4, 'pointer at the right: the face turns right, its right edge away');
  assert.ok(front(coinTiltFromPointer(-1, 0))[0] < -0.4, 'pointer at the left: the face turns left');
});

test('coinTiltFromPointer clamps outside the coin and reads a missing coordinate as centre', () => {
  assert.deepEqual(coinTiltFromPointer(3, -7), { angle: -COIN_TILT_MAX_DEG, yaw: COIN_TILT_MAX_DEG, lift: 0 });
  assert.deepEqual(coinTiltFromPointer(Number.NaN, undefined), { angle: 0, yaw: 0, lift: 0 });
});

test('yaw turns the disc about the vertical axis without moving it up or down', () => {
  const flat = posedCoin(mesh, tangents, 15, 0);
  const turned = posedCoin(mesh, tangents, 15, 0, 30);
  for (let vertex = 0; vertex < mesh.p.length / 3; vertex += 7) {
    const at = vertex * 3;
    assert.ok(Math.abs(turned.positions[at + 1] - flat.positions[at + 1]) < 1e-6, `vertex ${vertex} keeps its height`);
    const radiusFlat = Math.hypot(flat.positions[at], flat.positions[at + 2]);
    const radiusTurned = Math.hypot(turned.positions[at], turned.positions[at + 2]);
    assert.ok(Math.abs(radiusFlat - radiusTurned) < 1e-5, `vertex ${vertex} stays on its circle about Y`);
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

const frameFor = () => ({
  viewProjection: coinViewProjection({ width: 200, height: 100, radius: 1.7 }),
  cameraPosition: [1, 2, 3],
  timeSeconds: 4,
});

/** The floats a dynamic slot of `kind` received, from the first block of `shader` that has one. */
const dynamicValues = (shader, blocks, kind, count) => {
  for (const buffer of [...shader.buffers.v, ...shader.buffers.f]) {
    const slot = buffer.dynamic.find((entry) => entry.kind === kind);
    if (slot) return Array.from(blocks[buffer.uniform].slice(slot.at, slot.at + count));
  }
  return null;
};

test('shaderUniformBlocks fills view-projection, camera, light and ambient', () => {
  const material = materials[coins.cn_absolmega_slvi.front];
  const shader = shaders[material.shader];
  const frame = frameFor();
  const blocks = shaderUniformBlocks(shader, material, frame);

  assert.deepEqual(dynamicValues(shader, blocks, 'viewProjection', 16), Array.from(frame.viewProjection), 'view-projection');
  assert.deepEqual(dynamicValues(shader, blocks, 'cameraPosition', 3), [1, 2, 3], 'camera position');
  const close = (actual, expected) => actual.every((value, index) => Math.abs(value - expected[index]) < 1e-6);
  assert.ok(close(dynamicValues(shader, blocks, 'lightColor', 4), [...COIN_LIGHT.color, 1]), 'light colour');
  assert.ok(close(dynamicValues(shader, blocks, 'lightDirection', 4), [...COIN_LIGHT.direction, 0]), 'light direction, w 0');
  assert.ok(close(dynamicValues(shader, blocks, 'ambientGreen', 4), [0, 0, 0, COIN_AMBIENT[1]]), 'ambient only in the constant band');
  assert.equal(material.v[0].length, blocks.vcb0.length, 'material constants keep their length');
});

test('every committed coin shader asks only for built-ins the stage fills', () => {
  for (const shader of shaders) {
    const material = materials.find((entry) => entry.shader === shaders.indexOf(shader));
    assert.doesNotThrow(() => shaderUniformBlocks(shader, material, frameFor()), shader.name);
  }
});

test('every committed coin shader is lit: a light colour and direction slot', () => {
  for (const shader of shaders) {
    const kinds = [...shader.buffers.v, ...shader.buffers.f].flatMap((buffer) => buffer.dynamic.map((slot) => slot.kind));
    assert.ok(kinds.includes('lightColor') && kinds.includes('lightDirection'), shader.name);
  }
});

test('shaderUniformBlocks refuses a built-in the stage does not fill', () => {
  const shader = shaders[0];
  const material = materials.find((entry) => entry.shader === 0);
  const unknown = {
    ...shader,
    buffers: { v: shader.buffers.v, f: [{ ...shader.buffers.f[0], dynamic: [{ at: 0, kind: 'projection' }] }, ...shader.buffers.f.slice(1)] },
  };
  assert.throws(() => shaderUniformBlocks(unknown, material, frameFor()), /"projection"/);
});

test('glslBody drops the version line three.js writes itself', () => {
  assert.equal(glslBody('#version 300 es\nprecision highp float;\nvoid main() {}\n'), 'precision highp float;\nvoid main() {}\n');
});

test('glslBody refuses a shader without a GLSL ES 3.00 version line', () => {
  assert.throws(() => glslBody('precision highp float;\nvoid main() {}\n'), /#version 300 es/);
  assert.throws(() => glslBody(''), /#version 300 es/);
});
