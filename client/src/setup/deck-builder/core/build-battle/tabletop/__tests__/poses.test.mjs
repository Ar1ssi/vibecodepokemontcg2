import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LID_OPEN_DEG,
  POCKET_TEAR_MS,
  arcPoint,
  cameraBlend,
  cardTurnPose,
  deckWrapPose,
  dragProgress,
  easeOutBack,
  handSway,
  lidAngleDeg,
  pocketTearLight,
  settleBounce,
  slideOffPose,
  springStep,
  stackPullPose,
  wrapPeelPose,
} from '../poses.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the lid swings past open by about 5 % and settles on it', () => {
  assert.equal(lidAngleDeg(0), 0);
  assert.ok(near(lidAngleDeg(1), LID_OPEN_DEG));
  let peak = 0;
  for (let i = 0; i <= 200; i += 1) peak = Math.max(peak, lidAngleDeg(i / 200));
  assert.ok(peak > LID_OPEN_DEG * 1.04 && peak < LID_OPEN_DEG * 1.06, `peak ${peak}`);
  assert.ok(near(easeOutBack(0.5, 0), 1 - 0.125), 'c1 = 0 is ease-out cubic');
});

test('a shut lid creeps open from rest before it swings; one already moving swings on', () => {
  assert.ok(lidAngleDeg(0.1) < 5, `at 10 % ${lidAngleDeg(0.1)}`);
  assert.ok(lidAngleDeg(0.02) - lidAngleDeg(0) < 0.2, 'it starts from rest');
  const angles = Array.from({ length: 101 }, (_, i) => lidAngleDeg(i / 100));
  const peakAt = angles.indexOf(Math.max(...angles));
  for (let i = 1; i <= peakAt; i += 1) assert.ok(angles[i] >= angles[i - 1], `it never dips on the way up (${i})`);
  assert.ok(lidAngleDeg(0.1, { fromRest: false }) > 30, 'a lid let go mid-lift keeps its speed');
  assert.ok(near(lidAngleDeg(1, { fromRest: false }), LID_OPEN_DEG));
});

test('an arc starts and ends on its points and rises above both', () => {
  const from = { x: 0, y: 10, z: 0 };
  const to = { x: 100, y: 0, z: 50 };
  const start = arcPoint(from, to, 0, 60);
  const end = arcPoint(from, to, 1, 60);
  assert.deepEqual([start.x, start.y, start.z], [0, 10, 0]);
  assert.deepEqual([end.x, end.y, end.z], [100, 0, 50]);
  assert.ok(arcPoint(from, to, 0.5, 60).y > 10);
  assert.equal(arcPoint(from, to, 0.5, 60).s, 0.5);
});

test('a carry over the chord bows above the straight line but never climbs past the higher end', () => {
  const table = { x: -200, y: 2, z: -40 };
  const eye = { x: 0, y: 320, z: 260 };
  let highest = -Infinity;
  for (let i = 0; i <= 100; i += 1) highest = Math.max(highest, arcPoint(table, eye, i / 100, 20, { over: 'chord' }).y);
  assert.ok(highest <= eye.y + 1e-9, `peak ${highest}`);
  assert.ok(arcPoint(table, eye, 0.5, 20, { over: 'chord' }).y > (table.y + eye.y) / 2, 'it bows upward');
  const toss = Array.from({ length: 101 }, (_, i) => arcPoint(table, eye, i / 100, 20).y);
  assert.ok(Math.max(...toss) > eye.y, 'over the higher end it overshoots');
});

test('a landing rebound is zero at both ends and small', () => {
  assert.equal(settleBounce(0), 0);
  assert.ok(near(settleBounce(1), 0));
  for (let i = 0; i <= 50; i += 1) assert.ok(settleBounce(i / 50) <= 1.6);
});

test('film and deck wrap poses run 0 → 1 in order', () => {
  assert.deepEqual(wrapPeelPose(0), { open: 0, lift: 0, crumple: 0 });
  assert.deepEqual(wrapPeelPose(1), { open: 1, lift: 1, crumple: 1 });
  assert.ok(wrapPeelPose(0.25).open > wrapPeelPose(0.25).crumple);
  assert.deepEqual(deckWrapPose(0), { open: 0, slide: 0 });
  assert.deepEqual(deckWrapPose(1), { open: 1, slide: 1 });
});

test('the stack pull is monotonic with a catch in the middle', () => {
  assert.equal(stackPullPose(0), 0);
  assert.ok(near(stackPullPose(1), 1));
  let last = -1;
  for (let i = 0; i <= 100; i += 1) {
    const v = stackPullPose(i / 100);
    assert.ok(v >= last - 1e-12);
    last = v;
  }
  assert.ok(near(stackPullPose(0.5), 0.55), 'the catch holds at the first stroke');
});

test('a card slides off toward its side and turns over with a lift', () => {
  assert.deepEqual(slideOffPose(0, 1), { dx: 0, rotZDeg: -0 });
  assert.ok(near(slideOffPose(1, 1).dx, 1.05));
  assert.ok(near(slideOffPose(1, -1).dx, -1.05));
  assert.deepEqual(cardTurnPose(0), { angleDeg: 0, lift: 0 });
  assert.ok(near(cardTurnPose(1).angleDeg, 180));
  assert.ok(near(cardTurnPose(0.5).lift, 14));
});

test('the spring converges without overshoot and ignores a zero step', () => {
  let state = { value: 0, velocity: 0 };
  let peak = 0;
  for (let i = 0; i < 120; i += 1) {
    state = springStep(state.value, state.velocity, 1, 16);
    peak = Math.max(peak, state.value);
  }
  assert.ok(near(state.value, 1, 1e-3));
  assert.ok(peak <= 1.001);
  assert.deepEqual(springStep(0.3, 2, 1, 0), { value: 0.3, velocity: 2 });
});

test('hand sway stays within a couple of degrees and a millimetre', () => {
  for (let t = 0; t < 20000; t += 137) {
    const sway = handSway(t);
    assert.ok(Math.abs(sway.rotXDeg) < 1.5 && Math.abs(sway.rotYDeg) < 2 && Math.abs(sway.y) < 1);
  }
});

test('camera blend lands on both poses; drag progress clamps', () => {
  const a = { position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 30 };
  const b = { position: { x: 10, y: 5, z: 20 }, target: { x: 1, y: 1, z: 1 }, fov: 40 };
  assert.deepEqual(cameraBlend(a, b, 0), a);
  assert.deepEqual(cameraBlend(a, b, 1), b);
  assert.equal(dragProgress(50, 100), 0.5);
  assert.equal(dragProgress(500, 100), 1);
  assert.equal(dragProgress(-5, 100), 0);
  assert.equal(dragProgress(5, 0), 0);
});

test('pocketTearLight: dark before and after, in the order the recording shows', () => {
  const lights = ['flash', 'halo', 'beam', 'glint'];
  for (const ms of [0, POCKET_TEAR_MS, POCKET_TEAR_MS + 500]) {
    for (const part of lights) assert.equal(pocketTearLight(ms)[part], 0, `${part} at ${ms} ms`);
  }
  assert.deepEqual(pocketTearLight(Number.NaN), pocketTearLight(0));
  const at = (ms) => pocketTearLight(ms);
  // The cut the finger left is lit as it completes, and has melted into the flash by ~140 ms.
  assert.equal(at(0).cut, 1);
  assert.equal(at(140).cut, 0);
  // ~70 ms in: the flash and the halo at their height, the beam forming.
  assert.ok(at(70).flash > 0.9 && at(70).halo > 0.6 && at(70).beam > 0.5);
  // The halo is gone into the beam before the beam is gone; the glint outlasts both.
  assert.equal(at(130).halo, 0);
  assert.ok(at(130).beam > 0.9);
  assert.equal(at(330).beam, 0);
  assert.ok(at(330).glint > 0.9);
  // The halo flattens as it folds in; the beam only ever thins, to a hairline by ~230 ms.
  assert.ok(at(120).haloSquash < at(40).haloSquash);
  let previous = Infinity;
  for (let ms = 0; ms <= 320; ms += 10) {
    const { beamMm } = at(ms);
    assert.ok(beamMm <= previous && beamMm > 0);
    previous = beamMm;
  }
  assert.ok(at(230).beamMm < 0.5);
});
