import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evalColor, evalMinMax, isZeroCurve, maxMagnitude } from '../impact-curves.mjs';
import {
  DEG,
  axisScales,
  length,
  mat4Compose,
  mat4Identity,
  mat4Mul,
  project,
  quatEuler,
  quatLook,
  quatMul,
  quatRotate,
  topDownViewProjection,
  transformPoint,
  transformVector,
} from '../impact-math.mjs';
import { noise3, noiseVector } from '../impact-noise.mjs';
import { createRandom, randomUnit } from '../impact-random.mjs';
import { SHAPE, emitFromShape } from '../impact-shapes.mjs';

const near = (actual, expected, tolerance = 1e-6) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} vs ${expected}`));

test('quatEuler applies Z, then X, then Y, as Unity does', () => {
  // Unity: pitching +90° about X tips forward (+Z) down to −Y.
  near(quatRotate(quatEuler(90 * DEG, 0, 0), [0, 0, 1]), [0, -1, 0]);
  // The prefabs' "LocationAndScale" node is Euler(−90, 180, 180): its XY plane is the board,
  // +Z toward the camera, +Y down the screen (design 068 › Current state).
  const q = quatEuler(-90 * DEG, 180 * DEG, 180 * DEG);
  near(quatRotate(q, [1, 0, 0]), [1, 0, 0]);
  near(quatRotate(q, [0, 1, 0]), [0, 0, -1]);
  near(quatRotate(q, [0, 0, 1]), [0, 1, 0]);
  // Z first: a roll changes which way the later pitch tips the X axis.
  near(quatRotate(quatEuler(90 * DEG, 0, 90 * DEG), [1, 0, 0]), [0, 0, 1]);
});

test('quatMul composes right to left and quatLook aims +Z', () => {
  const a = quatEuler(0, 90 * DEG, 0);
  const b = quatEuler(90 * DEG, 0, 0);
  near(quatRotate(quatMul(a, b), [0, 0, 1]), quatRotate(a, quatRotate(b, [0, 0, 1])));
  near(quatLook([0, 0, 1]), [0, 0, 0, 1]);
  near(quatRotate(quatLook([1, 0, 0]), [0, 0, 1]), [1, 0, 0]);
  near(quatRotate(quatLook([0, 1, 0]), [0, 0, 1]), [0, 1, 0]);
  near(quatRotate(quatLook([0.3, -0.5, 0.2]), [0, 0, 1]), [0.3, -0.5, 0.2].map((v) => v / Math.hypot(0.3, 0.5, 0.2)));
});

test('matrices place, scale and chain', () => {
  const parent = mat4Compose([1, 2, 3], quatEuler(0, 90 * DEG, 0), [2, 2, 2]);
  near(transformPoint(parent, [0, 0, 1]), [3, 2, 3]);
  near(transformVector(parent, [0, 0, 1]), [2, 0, 0]);
  near(axisScales(parent), [2, 2, 2]);
  const child = mat4Compose([0, 0, 1], [0, 0, 0, 1], [0.5, 0.5, 0.5]);
  near(transformPoint(mat4Mul(parent, child), [0, 0, 0]), [3, 2, 3]);
  near(axisScales(mat4Mul(parent, child)), [1, 1, 1]);
  near([...mat4Mul(mat4Identity(), parent)], [...parent]);
});

test('the board camera looks straight down with +X right and +Z up', () => {
  const camera = topDownViewProjection({ target: [5, 0, 7], height: 183, fovDeg: 20, aspect: 2 });
  const ndc = (point) => {
    const clip = project(camera, point);
    return [clip[0] / clip[3], clip[1] / clip[3]];
  };
  // The matrix is single precision, as WebGL takes it.
  near(ndc([5, 0, 7]), [0, 0], 1e-5);
  assert.ok(ndc([6, 0, 7])[0] > 0 && Math.abs(ndc([6, 0, 7])[1]) < 1e-5);
  assert.ok(ndc([5, 0, 8])[1] > 0 && Math.abs(ndc([5, 0, 8])[0]) < 1e-5);
  // The view is 2 · 183 · tan(10°) ≈ 64.5 units tall at the board.
  near([ndc([5, 0, 7 + 183 * Math.tan(10 * DEG)])[1]], [1], 1e-5);
  // Nearer the camera reads larger.
  assert.ok(ndc([6, 50, 7])[0] > ndc([6, 0, 7])[0]);
  const clip = project(camera, [5, 0, 7]);
  assert.ok(Math.abs(clip[2] / clip[3]) < 1, 'the board is inside the depth range');
});

test('createRandom is repeatable and forks do not disturb their parent', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  const first = [a.next(), a.next(), a.next()];
  b.fork(7).next();
  assert.deepEqual([b.next(), b.next(), b.next()], first);
  assert.notEqual(createRandom(42).fork(1).next(), createRandom(42).fork(2).next());
  assert.notEqual(createRandom(1).next(), createRandom(2).next());
  const random = createRandom(9);
  for (let i = 0; i < 200; i += 1) {
    const value = random.next();
    assert.ok(value >= 0 && value < 1);
    assert.ok(Math.abs(length(randomUnit(random)) - 1) < 1e-9);
  }
});

test('evalMinMax reads the four curve forms', () => {
  assert.equal(evalMinMax(2.5, 0.3, 0.7), 2.5);
  assert.equal(evalMinMax([1, 3], 0, 0.25), 1.5);
  assert.equal(evalMinMax({ k: [[0, 0], [1, 1]], s: 4 }, 0.5), 2);
  assert.equal(evalMinMax({ k: [[0, 1]], k2: [[0, 0]], s: 2 }, 0.5, 0.25), 0.5);
  assert.equal(evalMinMax({ k: [], s: 3 }, 0.5), 0);
  assert.equal(evalMinMax(undefined), 0);
  assert.equal(maxMagnitude([-5, 2]), 5);
  assert.equal(maxMagnitude({ k: [[0, 0.5], [1, -2]], s: 3 }), 6);
  assert.ok(isZeroCurve(0) && isZeroCurve([0, 0]) && isZeroCurve({ k: [], s: 9 }) && !isZeroCurve([0, 1]));
});

test('evalColor reads the five gradient forms', () => {
  const gradient = { color: [[0, [1, 0, 0]], [1, [0, 0, 1]]], alpha: [[0, 1], [1, 0]] };
  assert.deepEqual(evalColor([1, 0.5, 0, 1]), [1, 0.5, 0, 1]);
  assert.deepEqual(evalColor({ g: gradient }, 0.5), [0.5, 0, 0.5, 0.5]);
  assert.deepEqual(evalColor({ c2: [[0, 0, 0, 0], [1, 1, 1, 1]] }, 0, 0.25), [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(evalColor({ g: gradient, g2: { color: [[0, [0, 1, 0]]], alpha: [[0, 1]] } }, 0, 0.5), [0.5, 0.5, 0, 1]);
  assert.deepEqual(evalColor({ rnd: gradient }, 0.9, 0), [1, 0, 0, 1]);
  assert.deepEqual(evalColor(null), [1, 1, 1, 1]);
});

test('noise is smooth, bounded, repeatable and zero on the lattice', () => {
  assert.equal(noise3(3, -2, 7), 0);
  assert.equal(noise3(0.3, 1.7, -4.2), noise3(0.3, 1.7, -4.2));
  let most = 0;
  for (let i = 0; i < 500; i += 1) most = Math.max(most, Math.abs(noise3(i * 0.137, i * 0.071 - 3, i * 0.211 + 1)));
  assert.ok(most > 0.3 && most <= 1.05, `peak ${most}`);
  assert.ok(Math.abs(noise3(0.5, 0.5, 0.5) - noise3(0.501, 0.5, 0.5)) < 0.01);
  const one = noiseVector([0.4, 0.2, 0.9]);
  const two = noiseVector([0.4, 0.2, 0.9], { octaves: 2 });
  assert.equal(one.length, 3);
  assert.notDeepEqual(one, two);
  assert.notEqual(one[0], one[1]);
});

const shape = (overrides) => ({
  type: SHAPE.CONE,
  radius: 1,
  thickness: 1,
  angle: 25,
  length: 5,
  donut: 0.2,
  arc: 360,
  arcMode: 0,
  arcSpread: 0,
  box: [0, 0, 0],
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  scale: [1, 1, 1],
  align: false,
  rndDir: 0,
  sphDir: 0,
  rndPos: 0,
  ...overrides,
});
const samples = (spec, count = 300) => {
  const random = createRandom(5);
  return Array.from({ length: count }, (_, index) => emitFromShape(spec, random, { index, count }));
};

test('no shape emits from the origin along +Z', () => {
  assert.deepEqual(emitFromShape(undefined, createRandom(1)), { position: [0, 0, 0], direction: [0, 0, 1] });
  assert.throws(() => emitFromShape(shape({ type: 6 }), createRandom(1)), /unsupported shape type 6/);
});

test('every shape emits inside itself with a unit heading', () => {
  const inside = {
    [SHAPE.SPHERE]: (p) => length(p) <= 1 + 1e-9,
    [SHAPE.HEMISPHERE]: (p) => length(p) <= 1 + 1e-9 && p[2] >= 0,
    [SHAPE.CONE]: (p) => Math.hypot(p[0], p[1]) <= 1 + 1e-9 && Math.abs(p[2]) < 1e-9,
    [SHAPE.CONE_VOLUME]: (p) => p[2] >= 0 && p[2] <= 5 + 1e-9,
    [SHAPE.CIRCLE]: (p) => Math.hypot(p[0], p[1]) <= 1 + 1e-9 && p[2] === 0,
    [SHAPE.DONUT]: (p) => Math.abs(Math.hypot(Math.hypot(p[0], p[1]) - 1, p[2])) <= 0.2 + 1e-9,
    [SHAPE.BOX]: (p) => p.every((v) => Math.abs(v) <= 0.5),
    [SHAPE.RECTANGLE]: (p) => Math.abs(p[0]) <= 0.5 && Math.abs(p[1]) <= 0.5 && p[2] === 0,
    [SHAPE.EDGE]: (p) => Math.abs(p[0]) <= 1 && p[1] === 0 && p[2] === 0,
  };
  for (const [type, test_] of Object.entries(inside)) {
    for (const sample of samples(shape({ type: Number(type) }))) {
      assert.ok(test_(sample.position), `type ${type}: ${sample.position}`);
      assert.ok(Math.abs(length(sample.direction) - 1) < 1e-9, `type ${type}: ${sample.direction}`);
    }
  }
});

test('a cone of angle 0 heads along its axis, wherever the module turns it', () => {
  for (const sample of samples(shape({ angle: 0 }), 20)) near(sample.direction, [0, 0, 1]);
  // The prefabs turn their cones −90° about X to fire up, toward the camera.
  for (const sample of samples(shape({ angle: 0, rot: [-90, 0, 0] }), 20)) near(sample.direction, [0, 1, 0]);
  const wide = samples(shape({ angle: 60 }));
  assert.ok(wide.every((sample) => sample.direction[2] >= Math.cos(60 * DEG) - 1e-9));
  assert.ok(wide.some((sample) => sample.direction[2] < 0.7));
});

test('thickness 0 keeps a circle on its rim, heading outward', () => {
  for (const sample of samples(shape({ type: SHAPE.CIRCLE, radius: 4, thickness: 0 }), 50)) {
    assert.ok(Math.abs(Math.hypot(sample.position[0], sample.position[1]) - 4) < 1e-9);
    near(sample.direction, [sample.position[0] / 4, sample.position[1] / 4, 0]);
  }
});

test('a burst-spread arc spaces a burst evenly; the module then places and scales it', () => {
  const ring = samples(shape({ type: SHAPE.CIRCLE, thickness: 0, arcMode: 3, arc: 180 }), 4);
  near(ring.map((sample) => Math.atan2(sample.position[1], sample.position[0]) / DEG), [0, 45, 90, 135], 1e-6);
  const moved = samples(shape({ type: SHAPE.RECTANGLE, pos: [10, 0, 0], scale: [2, 4, 1] }));
  assert.ok(moved.every((sample) => Math.abs(sample.position[0] - 10) <= 1 && Math.abs(sample.position[1]) <= 2));
  assert.ok(moved.some((sample) => Math.abs(sample.position[1]) > 1));
  const stray = samples(shape({ angle: 0, rndDir: 1 }));
  assert.ok(stray.some((sample) => sample.direction[2] < 0));
  const jitter = samples(shape({ type: SHAPE.EDGE, radius: 0, rndPos: 0.5 }));
  assert.ok(jitter.every((sample) => sample.position.every((v) => Math.abs(v) <= 0.5)) && jitter.some((sample) => sample.position[2] !== 0));
});
