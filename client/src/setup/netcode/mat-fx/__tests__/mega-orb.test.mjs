import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMegaShell,
  depthRuns,
  drawMegaOrb,
  fromLatLon,
  megaOrbPose,
  ribbonOutline,
  ribbonPoint,
  ribbonTaper,
} from '../mega-orb.mjs';

const BURST = 0.5;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const length = (p) => Math.hypot(p[0], p[1], p[2]);

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

test('buildMegaShell: fragments lie on the unit sphere and cover all of it', () => {
  const { fragments } = buildMegaShell(7);
  assert.ok(fragments.length >= 34, `${fragments.length} fragments`);
  for (const f of fragments) {
    assert.ok(f.points.length >= 3);
    for (const p of f.points) assert.ok(near(length(p), 1, 1e-9));
    assert.ok(near(length(f.centroid), 1, 1e-9));
    assert.ok(f.order >= 0 && f.order <= 1);
    assert.ok(f.crackWidth > 0);
  }
  const facing = (dir) =>
    fragments.some((f) =>
      f.centroid.every((v, i) => Math.abs(v - dir[i]) < 0.5)
    );
  for (const dir of [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ]) {
    assert.ok(facing(dir), `a fragment faces ${dir}`);
  }
});

test('buildMegaShell: deterministic per seed, different across seeds', () => {
  assert.deepEqual(buildMegaShell(3), buildMegaShell(3));
  assert.notDeepEqual(buildMegaShell(3), buildMegaShell(4));
});

test('buildMegaShell: cracks spread from one side of the orb', () => {
  const { fragments } = buildMegaShell(11);
  const origin = fromLatLon(14, -24);
  const nearOrigin = fragments.filter(
    (f) =>
      f.centroid[0] * origin[0] +
        f.centroid[1] * origin[1] +
        f.centroid[2] * origin[2] >
      0.8
  );
  const farSide = fragments.filter(
    (f) =>
      f.centroid[0] * origin[0] +
        f.centroid[1] * origin[1] +
        f.centroid[2] * origin[2] <
      -0.8
  );
  const mean = (list) =>
    list.reduce((sum, f) => sum + f.order, 0) / list.length;
  assert.ok(nearOrigin.length && farSide.length);
  assert.ok(mean(nearOrigin) < mean(farSide));
});

test('megaOrbPose: invisible at both ends, t clamped', () => {
  assert.equal(megaOrbPose(0, BURST).opacity, 0);
  assert.equal(megaOrbPose(1, BURST).opacity, 0);
  assert.deepEqual(megaOrbPose(-1, BURST), megaOrbPose(0, BURST));
  assert.deepEqual(megaOrbPose(2, BURST), megaOrbPose(1, BURST));
});

test('megaOrbPose: white-hot sphere, then shell, cracks, and the shatter at the burst', () => {
  const early = megaOrbPose(0.18, BURST);
  assert.equal(early.opacity, 1);
  assert.equal(early.white, 1);
  assert.equal(early.shell, 0);
  const shelled = megaOrbPose(0.33, BURST);
  assert.equal(shelled.white, 0);
  assert.equal(shelled.shell, 1);
  assert.ok(megaOrbPose(0.4, BURST).crack > megaOrbPose(0.34, BURST).crack);
  assert.equal(
    megaOrbPose(BURST - 0.04, BURST).crack,
    1,
    'fully cracked before the burst'
  );
  assert.equal(megaOrbPose(BURST - 0.01, BURST).shatter, 0);
  assert.ok(megaOrbPose(BURST + 0.05, BURST).shatter > 0.5);
  assert.equal(megaOrbPose(BURST + 0.16, BURST).shatter, 1);
});

test('megaOrbPose: the orb grows in, then swells under the strain', () => {
  assert.ok(megaOrbPose(0.07, BURST).radius < megaOrbPose(0.2, BURST).radius);
  assert.ok(near(megaOrbPose(0.2, BURST).radius, 1));
  assert.ok(megaOrbPose(BURST, BURST).radius > 1.25);
  assert.equal(megaOrbPose(0.3, BURST).shake, 0);
});

test('megaOrbPose: ribbons draw in before the shell and fade after the burst', () => {
  assert.equal(megaOrbPose(0.1, BURST).ribbon, 0);
  assert.ok(near(megaOrbPose(0.24, BURST).ribbon, 1));
  assert.equal(megaOrbPose(BURST + 0.07, BURST).ribbonAlpha, 0);
  assert.ok(megaOrbPose(0.3, BURST).flames > 0.99);
});

test('ribbonPoint: stays on its orbit radius whatever the tilt', () => {
  const ribbon = { radius: 1.3, tiltX: 40, tiltZ: -25 };
  for (const a of [0, 45, 170, 300])
    assert.ok(near(length(ribbonPoint(ribbon, a)), 1.3));
});

test('ribbonTaper: pointed at both ends, fattest past the middle', () => {
  assert.equal(ribbonTaper(0), 0);
  assert.ok(ribbonTaper(1) < 1e-9);
  assert.ok(ribbonTaper(0.65) > 0.99);
  assert.ok(ribbonTaper(0.65) > ribbonTaper(0.3));
});

test('ribbonOutline: a straight stroke becomes a band of the given width', () => {
  const outline = ribbonOutline([
    { x: 0, y: 0, w: 4 },
    { x: 10, y: 0, w: 4 },
  ]);
  assert.equal(outline.length, 4);
  const ys = outline.map((p) => p[1]).sort((a, b) => a - b);
  assert.deepEqual(ys, [-2, -2, 2, 2]);
});

test('depthRuns: splits a ribbon where it passes behind the orb', () => {
  const pts = [0.5, 0.4, -0.1, -0.3, 0.2, 0.3, 0.4].map((z, i) => ({
    x: i,
    y: 0,
    z,
    w: 1,
  }));
  assert.deepEqual(
    depthRuns(pts, 'front').map((r) => r.length),
    [2, 3]
  );
  assert.deepEqual(
    depthRuns(pts, 'back').map((r) => r.length),
    [2]
  );
});

test('drawMegaOrb: draws nothing while invisible, everything mid-flight, never throws', () => {
  const shell = buildMegaShell(5);
  const opts = { cx: 100, cy: 100, unit: 40 };
  const hidden = recordingContext();
  drawMegaOrb(hidden.ctx, megaOrbPose(0, BURST), shell, opts);
  assert.equal(hidden.calls.length, 0);
  for (let i = 1; i < 100; i += 1) {
    const { ctx, calls } = recordingContext();
    drawMegaOrb(ctx, megaOrbPose(i / 100, BURST), shell, {
      ...opts,
      time: i / 30,
    });
    const opacity = megaOrbPose(i / 100, BURST).opacity;
    if (opacity > 0)
      assert.ok(
        calls.some(([name]) => name === 'fill'),
        `draws at ${i / 100}`
      );
  }
  const cracked = recordingContext();
  drawMegaOrb(cracked.ctx, megaOrbPose(0.45, BURST), shell, opts);
  assert.ok(
    cracked.calls.filter(([name]) => name === 'stroke').length >
      shell.fragments.length / 2,
    'cracks stroked'
  );
});
