import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGA_VORTEX_RIBBONS,
  drawMegaVortex,
  megaRibbonPose,
  sideRuns,
  strokeOutline,
  runColourStops,
  strokeTaper,
  tailFlare,
  vortexPoint,
} from '../mega-vortex.mjs';

const BURST = 0.5;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

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

test('megaRibbonPose: hidden until the burst and after the end, t clamped', () => {
  assert.equal(megaRibbonPose(BURST - 0.02, BURST).opacity, 0);
  assert.equal(megaRibbonPose(1, BURST).opacity, 0);
  assert.deepEqual(megaRibbonPose(-1, BURST), megaRibbonPose(0, BURST));
  assert.deepEqual(megaRibbonPose(2, BURST), megaRibbonPose(1, BURST));
  for (let i = 0; i <= 100; i += 1) {
    const { opacity } = megaRibbonPose(i / 100, BURST);
    assert.ok(opacity >= 0 && opacity <= 1, `${i / 100}: ${opacity}`);
  }
});

test('megaRibbonPose: flung out to the orbit, whips round and decelerates', () => {
  assert.ok(megaRibbonPose(0.6, BURST).opacity > 0.99);
  assert.ok(
    megaRibbonPose(0.6, BURST).spread > megaRibbonPose(BURST, BURST).spread
  );
  assert.ok(near(megaRibbonPose(0.7, BURST).spread, 1));
  const early =
    megaRibbonPose(0.58, BURST).sweep - megaRibbonPose(0.54, BURST).sweep;
  const late =
    megaRibbonPose(0.9, BURST).sweep - megaRibbonPose(0.86, BURST).sweep;
  assert.ok(early > late, 'sweep decelerates');
});

test('megaRibbonPose: draws in fast, then the tail catches the head as it fades', () => {
  assert.ok(near(megaRibbonPose(0.6, BURST).length, 1));
  assert.ok(megaRibbonPose(0.95, BURST).length < 0.5);
});

test('megaRibbonPose: lag delays the launch', () => {
  assert.ok(megaRibbonPose(BURST + 0.02, BURST).opacity > 0);
  assert.equal(megaRibbonPose(BURST + 0.02, BURST, 0.05).opacity, 0);
});

test('vortexPoint: stays on its orbit radius whatever the tilt and roll', () => {
  for (const ribbon of MEGA_VORTEX_RIBBONS)
    for (const a of [0, 45, 170, 300]) {
      const [x, y, z] = vortexPoint(ribbon, a);
      assert.ok(near(Math.hypot(x, y, z), ribbon.radius));
    }
});

test('vortexPoint: a tilted orbit passes behind (z < 0) and in front', () => {
  const ribbon = { radius: 1, tiltX: 60, roll: 0 };
  assert.ok(vortexPoint(ribbon, 90)[2] > 0);
  assert.ok(vortexPoint(ribbon, 270)[2] < 0);
});

test('every vortex stroke uses a palette colour and a positive size', () => {
  assert.ok(MEGA_VORTEX_RIBBONS.length >= 6);
  for (const r of MEGA_VORTEX_RIBBONS) {
    assert.ok(['orange', 'blue'].includes(r.from));
    assert.ok(['orange', 'blue'].includes(r.to));
    assert.ok(r.radius > 0 && r.width > 0 && r.arc > 0);
    assert.ok(r.spin === 1 || r.spin === -1);
  }
});

test('strokeTaper: pointed at both ends, fat through the middle', () => {
  assert.equal(strokeTaper(0), 0);
  assert.ok(strokeTaper(1) < 1e-9);
  assert.ok(strokeTaper(0.6) > 0.95);
  assert.ok(strokeTaper(0.6) > strokeTaper(0.15));
});

test('tailFlare: sharp prongs along the tail only', () => {
  for (let i = 0; i <= 100; i += 1) {
    const flare = tailFlare(i / 100, 3);
    assert.ok(flare >= 0 && flare <= 1, `${i / 100}: ${flare}`);
  }
  assert.ok([0.05, 0.1, 0.15, 0.2].some((u) => tailFlare(u, 3) > 0.4));
  assert.equal(tailFlare(0.1, 3, Math.PI), 0, 'shifted prongs interleave');
  assert.equal(tailFlare(0.7, 3), 0);
  assert.equal(tailFlare(0.1, 0), 0);
  assert.equal(tailFlare(NaN, 3), 0);
});

test('runColourStops: one colour stays solid, two switch hard at the split', () => {
  assert.deepEqual(runColourStops('blue', 'blue', 0, 1), [
    [0, 'blue'],
    [1, 'blue'],
  ]);
  const whole = runColourStops('orange', 'blue', 0, 1);
  assert.equal(whole.length, 4);
  assert.deepEqual(
    whole.map(([, c]) => c),
    ['orange', 'orange', 'blue', 'blue']
  );
  assert.ok(whole[2][0] - whole[1][0] <= 0.05, 'no long muddy blend');
  for (let i = 1; i < whole.length; i += 1)
    assert.ok(whole[i][0] >= whole[i - 1][0], 'offsets ascend');
  assert.deepEqual(runColourStops('orange', 'blue', 0, 0.3), [
    [0, 'orange'],
    [1, 'orange'],
  ]);
  assert.deepEqual(runColourStops('orange', 'blue', 0.7, 1), [
    [0, 'blue'],
    [1, 'blue'],
  ]);
  assert.deepEqual(runColourStops('orange', 'blue', 0.7, 0.7), [
    [0, 'blue'],
    [1, 'blue'],
  ]);
});

test('strokeOutline: the outer half-width lies away from the centre', () => {
  const points = [
    { x: 0, y: -10, half: 1, outer: 4, inner: 1 },
    { x: 10, y: -10, half: 1, outer: 4, inner: 1 },
  ];
  const outline = strokeOutline(points, { x: 5, y: 0 });
  assert.equal(outline.length, 4);
  assert.deepEqual(
    outline.map((p) => p[1]),
    [-14, -14, -9, -9]
  );
});

test('sideRuns: splits a stroke where it passes behind the card, without a gap', () => {
  const pts = [0.5, 0.4, -0.1, -0.3, 0.2, 0.3, 0.4].map((z, i) => ({
    x: i,
    y: 0,
    z,
  }));
  const front = sideRuns(pts, 'front');
  const back = sideRuns(pts, 'back');
  assert.deepEqual(
    front.map((r) => r.map((p) => p.x)),
    [
      [0, 1, 2],
      [3, 4, 5, 6],
    ]
  );
  assert.deepEqual(
    back.map((r) => r.map((p) => p.x)),
    [[1, 2, 3, 4]]
  );
});

test('drawMegaVortex: nothing before the burst, strokes mid-flight, never throws', () => {
  const opts = { cx: 300, cy: 300, unit: 60, burstAt: BURST };
  const before = recordingContext();
  drawMegaVortex(before.ctx, BURST - 0.05, opts);
  assert.equal(before.calls.length, 0);
  const none = recordingContext();
  drawMegaVortex(none.ctx, 0.7, { ...opts, unit: 0 });
  assert.equal(none.calls.length, 0);
  for (let i = 0; i <= 100; i += 1) {
    const { ctx, calls } = recordingContext();
    drawMegaVortex(ctx, i / 100, opts);
    if (i >= 55 && i <= 85)
      assert.ok(
        calls.filter(([name]) => name === 'fill').length >=
          MEGA_VORTEX_RIBBONS.length,
        `strokes at ${i / 100}`
      );
  }
});

test('drawMegaVortex: with a card, the far side is clipped around it, state balanced', () => {
  const { ctx, calls } = recordingContext();
  ctx.globalAlpha = 0.5;
  drawMegaVortex(ctx, 0.65, {
    cx: 300,
    cy: 300,
    unit: 60,
    card: { width: 43, height: 60 },
    burstAt: BURST,
  });
  const clip = calls.find(([name]) => name === 'clip');
  assert.deepEqual(clip?.[1], ['evenodd']);
  assert.ok(calls.filter(([name]) => name === 'rect').length === 2);
  assert.equal(
    calls.filter(([name]) => name === 'save').length,
    calls.filter(([name]) => name === 'restore').length
  );
  const plain = recordingContext();
  drawMegaVortex(plain.ctx, 0.65, {
    cx: 300,
    cy: 300,
    unit: 60,
    burstAt: BURST,
  });
  assert.ok(!plain.calls.some(([name]) => name === 'clip'));
});
