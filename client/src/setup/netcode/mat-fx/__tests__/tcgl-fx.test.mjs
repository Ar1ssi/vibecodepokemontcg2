import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOf,
  curveAt,
  dissolveAlpha,
  fillDissolve,
  fillFrame,
  fillPolar,
  gradientAt,
  limitedTravel,
  lutAt,
  pointOnRectEdge,
  railsAround,
  rateBirths,
  sampleField,
  sampleMask,
  spinAngle,
  texelRgb,
  turnPoints,
} from '../tcgl-fx.mjs';
import { seededRandom } from '../flow-pose.mjs';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const flat = (value, w = 4, h = 4) => ({ w, h, data: new Uint8Array(w * h).fill(value) });

test('ageOf: null before birth and after death, normalized in between', () => {
  assert.equal(ageOf(0.1, 0.2, 1), null);
  assert.equal(ageOf(1.3, 0.2, 1), null);
  assert.ok(close(ageOf(0.7, 0.2, 1), 0.5));
  assert.equal(ageOf(Number.NaN, 0, 1), null);
  assert.equal(ageOf(0.5, 0, 0), null);
});

test('curveAt: linear between keys, held flat outside, safe on bad input', () => {
  const keys = [[0, 1], [0.5, 0], [1, 2]];
  assert.equal(curveAt(keys, -1), 1);
  assert.ok(close(curveAt(keys, 0.25), 0.5));
  assert.ok(close(curveAt(keys, 0.75), 1));
  assert.equal(curveAt(keys, 9), 2);
  assert.equal(curveAt(keys, Number.NaN), 1);
  assert.equal(curveAt([], 0.5), 0);
});

test('gradientAt: colour and alpha keys interpolate; no alpha keys is opaque', () => {
  const g = { color: [[0, [1, 0, 0]], [1, [0, 0, 1]]], alpha: [[0, 0], [1, 1]] };
  const mid = gradientAt(g, 0.5);
  assert.deepEqual(mid.rgb.map((c) => +c.toFixed(3)), [0.5, 0, 0.5]);
  assert.ok(close(mid.a, 0.5));
  assert.equal(gradientAt({ color: [[0, [1, 1, 1]]] }, 0.3).a, 1);
  assert.equal(gradientAt(g, 7).a, 1, 'clamped to the end key');
});

test('rateBirths: the burst at 0, then one particle per whole unit of the rate integral', () => {
  const births = rateBirths({ burst: 1, rate: 22, curve: [[0, 1], [0.162, 1], [0.164, 0]], duration: 4 });
  assert.equal(births[0], 0);
  assert.ok(births.length >= 14 && births.length <= 16, `got ${births.length}`);
  assert.ok(births.every((b, i) => i === 0 || b >= births[i - 1]), 'sorted');
  assert.ok(births.at(-1) <= 0.66, 'rate stops where its curve drops');
  assert.deepEqual(rateBirths({ burst: 3 }), [0, 0, 0]);
});

test('limitedTravel: free flight without a limit; a limit damps the excess; sign kept', () => {
  assert.ok(close(limitedTravel(4, {}, 0.5), 2));
  const damped = limitedTravel(20, { limit: 1, dampen: 0.35 }, 1);
  assert.ok(damped > 1 && damped < 3, `damped ${damped}`);
  assert.ok(limitedTravel(-5, { limit: 1, dampen: 0.5 }, 1) < 0);
  assert.equal(limitedTravel(5, {}, Number.NaN), 0);
});

test('spinAngle: a constant curve spins at scalar rad/s for the time lived', () => {
  assert.ok(close(spinAngle(2, [[0, 1]], 0.5, 1), 1));
  assert.equal(spinAngle(2, [[0, 1]], 0, 1), 0);
  assert.ok(spinAngle(10, [[0, -0.3], [0.8, -1]], 1, 1) < -5);
});

test('sampleField wraps; sampleMask reads 0 outside its square; a missing field reads 0', () => {
  const field = { w: 2, h: 1, data: new Uint8Array([0, 255]) };
  assert.ok(close(sampleField(field, 0.75, 0.5), 1));
  assert.ok(close(sampleField(field, 1.75, 0.5), 1), 'wraps');
  assert.equal(sampleMask(field, 1.2, 0.5), 0);
  assert.equal(sampleField(null, 0.5, 0.5), 0);
});

test('dissolveAlpha: ≤ 0 shows all, ≥ 1 shows nothing, brighter texels survive longer', () => {
  assert.equal(dissolveAlpha(0, -1), 1);
  assert.equal(dissolveAlpha(1, 1.2), 0);
  assert.ok(dissolveAlpha(0.9, 0.5) > dissolveAlpha(0.2, 0.5));
  assert.equal(dissolveAlpha(0.3, Number.NaN), 1);
});

test('fillDissolve: alpha = mask × dissolve; a fully eaten layer is empty', () => {
  const out = new Uint8ClampedArray(4 * 4 * 4);
  fillDissolve(out, 4, 4, { mask: flat(255), noise: flat(128), amount: -1, rgb: [1, 0, 0] });
  assert.equal(out[3], 255);
  assert.equal(out[0], 255);
  assert.equal(out[1], 0);
  fillDissolve(out, 4, 4, { mask: flat(255), noise: flat(128), amount: 1.5 });
  assert.ok(Array.from({ length: 16 }, (_, i) => out[i * 4 + 3]).every((a) => a === 0));
  fillDissolve(out, 4, 4, { mask: flat(0), noise: flat(255), amount: -1 });
  assert.equal(out[3], 0, 'no mask, no pixel');
});

test('fillDissolve: a colour texture paints the layer', () => {
  const out = new Uint8ClampedArray(4);
  const colors = { w: 1, h: 1, data: new Uint8ClampedArray([0, 255, 0, 255]) };
  fillDissolve(out, 1, 1, { mask: flat(255, 1, 1), noise: null, colors, amount: -1 });
  assert.deepEqual(Array.from(out), [0, 255, 0, 255]);
  assert.deepEqual(texelRgb(colors, 0.5, 0.5, [0.5, 0.5, 0.5]), [0, 0.5, 0]);
});

test('fillPolar: a disc leaves the corners empty; `inner` cuts the hub', () => {
  const size = 16;
  const out = new Uint8ClampedArray(size * size * 4);
  fillPolar(out, size, { noise: flat(255), levels: [0, 1], inner: 0.3 });
  const alphaAt = (x, y) => out[(y * size + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 0, 'corner outside the disc');
  assert.equal(alphaAt(8, 8), 0, 'hub inside `inner`');
  assert.ok(alphaAt(8, 2) > 200, 'ring');
  fillPolar(out, size, { noise: flat(255), levels: [0, 1], shape: 'open' });
  assert.ok(alphaAt(0, 0) > 200, 'open shape keeps the corners');
});

test('fillFrame: nothing over the card, flames on its edges', () => {
  const w = 20;
  const h = 20;
  const out = new Uint8ClampedArray(w * h * 4);
  fillFrame(out, w, h, { outer: [20, 20], inner: [10, 10], mask: flat(255), noise: flat(255), amount: -1 });
  assert.equal(out[(10 * w + 10) * 4 + 3], 0, 'card centre');
  assert.ok(out[(10 * w + 1) * 4 + 3] > 200, 'left band');
});

test('lutAt wraps around; turnPoints rotates and scales; railsAround spans the width', () => {
  const lut = [[1, 0, 0], [0, 0, 1]];
  assert.deepEqual(lutAt(lut, 0), [1, 0, 0]);
  assert.deepEqual(lutAt(lut, 1), [1, 0, 0], 'u = 1 wraps to 0');
  const [p] = turnPoints([[1, 0]], Math.PI / 2, 2);
  assert.ok(close(p[0], 0) && close(p[1], 2));
  const { a, b } = railsAround([[0, 0], [10, 0]], [1, 1]);
  assert.ok(close(a[0][1] - b[0][1], 2));
});

test('pointOnRectEdge: every point lies on the rectangle', () => {
  const rand = seededRandom(3);
  for (let i = 0; i < 200; i += 1) {
    const [x, y] = pointOnRectEdge(rand, 8, 12);
    const onX = close(Math.abs(x), 4, 1e-9) && Math.abs(y) <= 6 + 1e-9;
    const onY = close(Math.abs(y), 6, 1e-9) && Math.abs(x) <= 4 + 1e-9;
    assert.ok(onX || onY, `${x},${y}`);
  }
});
