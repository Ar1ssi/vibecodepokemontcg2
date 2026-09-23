import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERA_BURST_AT,
  TERA_ENTRY_MS,
  TERA_REVEAL_AT,
  buildTeraScene,
  drawTeraEntry,
  prismGrowth,
  projectPoint,
  teraEntryPose,
} from '../tera-crystal.mjs';

const BEATS = [
  'orb',
  'flash',
  'jewel',
  'streaks',
  'silhouette',
  'beams',
  'floor',
  'cluster',
  'spray',
  'glints',
  'rainbow',
  'whiteout',
  'burst',
  'reveal',
];

/** A 2D-context stand-in that records every drawing call. */
const recordingContext = () => {
  const calls = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    { globalAlpha: 1 },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient' || key === 'createRadialGradient')
          return () => gradient;
        return (...args) => calls.push([key, args]);
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }
  );
  return { ctx, calls };
};

const count = (calls, name) => calls.filter(([n]) => n === name).length;
const opts = (scene) => ({
  cx: 400,
  cy: 400,
  unit: 80,
  card: { width: 57, height: 80 },
  scene,
});

/** The first t (in 1/200 steps) at which a beat reaches full strength. */
const peakAt = (key) => {
  for (let i = 0; i <= 200; i += 1)
    if (teraEntryPose(i / 200)[key] > 0.999) return i / 200;
  return NaN;
};

test('teraEntryPose: every beat is in [0, 1] and hidden at both ends, t clamped', () => {
  for (let i = 0; i <= 200; i += 1) {
    const pose = teraEntryPose(i / 200);
    for (const key of BEATS)
      assert.ok(pose[key] >= 0 && pose[key] <= 1, `${key} at ${i / 200}`);
  }
  for (const key of BEATS) {
    assert.equal(teraEntryPose(0)[key], 0, `${key} at 0`);
    assert.equal(teraEntryPose(1)[key], 0, `${key} at 1`);
  }
  assert.deepEqual(teraEntryPose(-1), teraEntryPose(0));
  assert.deepEqual(teraEntryPose(2), teraEntryPose(1));
  assert.equal(teraEntryPose(1).time, TERA_ENTRY_MS / 1000);
});

test('teraEntryPose: orb, flash, jewel, silhouette, crystal, rainbow, whiteout, burst, reveal in order', () => {
  const order = [
    'orb',
    'flash',
    'jewel',
    'silhouette',
    'cluster',
    'rainbow',
    'whiteout',
    'burst',
    'reveal',
  ];
  const peaks = order.map(peakAt);
  for (let i = 0; i < peaks.length; i += 1)
    assert.ok(Number.isFinite(peaks[i]), `${order[i]} reaches full strength`);
  for (let i = 1; i < peaks.length; i += 1)
    assert.ok(peaks[i] > peaks[i - 1], `${order[i - 1]} before ${order[i]}`);
});

test('teraEntryPose: the burst peaks with the whiteout and the card shows after it', () => {
  const at = teraEntryPose(TERA_BURST_AT);
  assert.ok(at.whiteout > 0.999);
  assert.ok(at.burst > 0.5);
  assert.equal(teraEntryPose(TERA_REVEAL_AT).reveal, 0);
  assert.ok(teraEntryPose(TERA_REVEAL_AT + 0.02).reveal > 0.99);
  assert.ok(TERA_REVEAL_AT > TERA_BURST_AT);
  assert.equal(teraEntryPose(TERA_BURST_AT + 0.03).cluster, 0, 'crystal gone');
});

test('teraEntryPose: the crystal grows in, then shines white before the burst', () => {
  assert.equal(teraEntryPose(0.42).grow, 0);
  assert.equal(teraEntryPose(0.62).grow, 1);
  assert.equal(teraEntryPose(0.6).shine, 0);
  assert.ok(teraEntryPose(TERA_BURST_AT).shine > 0.999);
  assert.ok(teraEntryPose(0.4).orbDrop === 1, 'the orb has landed');
});

test('buildTeraScene: the same seed gives the same scene, another seed another', () => {
  assert.deepEqual(buildTeraScene(7), buildTeraScene(7));
  assert.notDeepEqual(buildTeraScene(7), buildTeraScene(8));
});

test('buildTeraScene: faces index real vertices and glitter sits inside its fan triangle', () => {
  const { prisms } = buildTeraScene(3);
  assert.ok(prisms.length >= 6);
  for (const prism of prisms) {
    assert.equal(prism.vertices.length, prism.sides * 3);
    assert.equal(prism.faces.length, prism.sides * 2 + 1);
    for (const face of prism.faces) {
      assert.ok(face.idx.length >= 3);
      for (const i of face.idx)
        assert.ok(Number.isInteger(i) && i >= 0 && i < prism.vertices.length);
      for (const speck of face.glitter) {
        assert.ok(speck.tri >= 1 && speck.tri + 1 < face.idx.length);
        assert.ok(speck.u >= 0 && speck.v >= 0 && speck.u + speck.v <= 1);
      }
    }
    for (const [, y] of prism.vertices.slice(prism.sides))
      assert.ok(y > 0, 'tops stand above the base');
  }
});

test('projectPoint: the origin lands on the centre and nearer points spread out', () => {
  const g = { cx: 100, cy: 50, unit: 40 };
  assert.deepEqual(projectPoint([0, 0, 0], g).slice(0, 2), [100, 50]);
  const [x, y] = projectPoint([1, 1, 0], g);
  assert.deepEqual([x, y], [140, 10]);
  const [nearX] = projectPoint([1, 0, 1], g);
  const [farX] = projectPoint([1, 0, -1], g);
  assert.ok(nearX > x && farX < x);
});

test("prismGrowth: nothing before a block's delay, and blocks grow in turn", () => {
  const { prisms } = buildTeraScene(1);
  const late = prisms.reduce((a, b) => (b.delay > a.delay ? b : a));
  assert.equal(prismGrowth(late, late.delay), 0);
  assert.ok(prismGrowth(prisms[0], late.delay) > 0.5);
  assert.ok(Math.abs(prismGrowth(late, 1) - 1) < 1e-9);
});

test('drawTeraEntry: draws nothing without a size or scene, or at either end', () => {
  const scene = buildTeraScene(2);
  for (const bad of [
    { ...opts(scene), unit: 0 },
    { ...opts(scene), unit: NaN },
    { ...opts(null) },
  ]) {
    const { ctx, calls } = recordingContext();
    drawTeraEntry(ctx, 0.6, bad);
    assert.equal(calls.length, 0);
  }
  for (const t of [0, 1]) {
    const { ctx, calls } = recordingContext();
    drawTeraEntry(ctx, t, opts(scene));
    assert.equal(count(calls, 'fill') + count(calls, 'stroke'), 0, `t=${t}`);
    assert.equal(count(calls, 'fillRect'), 0, `t=${t}`);
  }
});

test('drawTeraEntry: every frame draws, never throws, and balances save/restore', () => {
  const scene = buildTeraScene(5);
  for (let i = 1; i < 200; i += 1) {
    const { ctx, calls } = recordingContext();
    ctx.globalAlpha = 0.8;
    drawTeraEntry(ctx, i / 200, opts(scene));
    assert.equal(count(calls, 'save'), count(calls, 'restore'), `t=${i / 200}`);
    assert.ok(
      count(calls, 'fill') + count(calls, 'stroke') + count(calls, 'fillRect') >
        0,
      `something drawn at ${i / 200}`
    );
  }
});

test('drawTeraEntry: the crystal cluster fills many faces once grown', () => {
  const scene = buildTeraScene(4);
  const { ctx, calls } = recordingContext();
  drawTeraEntry(ctx, 0.7, opts(scene));
  assert.ok(count(calls, 'fill') > scene.prisms.length * 3);
  const noCard = recordingContext();
  drawTeraEntry(noCard.ctx, 0.7, { ...opts(scene), card: undefined });
  assert.ok(count(noCard.calls, 'fill') > 0, 'card size falls back to unit');
});
