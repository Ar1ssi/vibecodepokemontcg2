import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPerfStats, formatPerf } from '../perf-stats.mjs';

const frame = (kind, extra = {}) => ({ kind, shadowPass: kind !== 'ambient', ms: 2, calls: 40, triangles: 900, ...extra });

describe('createPerfStats', () => {
  it('counts the last second of frames per kind', () => {
    const stats = createPerfStats();
    for (let i = 0; i < 30; i += 1) stats.record(frame('ambient'), i * 33);
    stats.record(frame('change', { ms: 6, calls: 52 }), 990);
    const summary = stats.summary(1000);
    assert.equal(summary.fps, 31);
    assert.equal(summary.ambientFps, 30);
    assert.equal(summary.changeFps, 1);
    assert.equal(summary.motionFps, 0);
    assert.equal(summary.shadowPassesPerSec, 1);
    assert.equal(summary.worstMs, 6);
    assert.ok(Math.abs(summary.meanMs - (30 * 2 + 6) / 31) < 1e-9);
    assert.equal(summary.calls, 52, 'draw calls of the last frame');
  });

  it('drops frames older than the window, so an idle board reads 0 fps', () => {
    const stats = createPerfStats();
    stats.record(frame('motion'), 0);
    stats.record(frame('motion'), 16);
    assert.equal(stats.summary(500).fps, 2);
    const idle = stats.summary(5000);
    assert.equal(idle.fps, 0);
    assert.equal(idle.meanMs, 0);
    assert.equal(idle.calls, 0);
  });

  it('ignores a missing frame or time and non-numeric fields', () => {
    const stats = createPerfStats();
    stats.record(null, 0);
    stats.record(frame('change'), Number.NaN);
    stats.record({ kind: 'change', ms: 'x' }, 10);
    const summary = stats.summary(20);
    assert.equal(summary.fps, 1);
    assert.equal(summary.meanMs, 0);
    assert.equal(summary.shadowPassesPerSec, 0);
  });
});

describe('formatPerf', () => {
  it('lays out the summary and the GPU counts, with ? for unknowns', () => {
    const text = formatPerf(createPerfStats().summary(0), { textures: 12, pixelRatio: 1.5, antialias: false });
    assert.match(text, /^fps 0 {2}\(motion 0 · change 0 · ambient 0\)/);
    assert.match(text, /textures 12 · geometries \? · programs \?/);
    assert.match(text, /pixel ratio 1\.5 · MSAA off/);
  });
});
