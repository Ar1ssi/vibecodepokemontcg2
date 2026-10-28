// Rolling frame statistics for the board's `?perf=1` readout (perf-hud.js). Pure, so node:test
// runs it. Each drawn frame is recorded with what board-scene.js `onRender` reports.

const DEFAULT_WINDOW_MS = 1000;

const finite = (value) => (Number.isFinite(value) ? value : 0);

/**
 * @param {{ windowMs?: number }} [options]
 * @returns {{ record: (frame: object, atMs: number) => void, summary: (atMs: number) => object }}
 *   `frame`: `{ kind: 'change'|'ambient'|'motion', shadowPass: boolean, ms: number, calls: number,
 *   triangles: number }`. `summary(at)` covers the frames of the last `windowMs` before `at`:
 *   frames per second in all and per kind, shadow passes per second, mean and worst ms per render
 *   (CPU time spent submitting the frame), and the last frame's draw calls and triangles.
 */
export function createPerfStats({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  const frames = [];

  const prune = (at) => {
    while (frames.length > 0 && at - frames[0].at > windowMs) frames.shift();
  };

  const record = (frame, at) => {
    if (!frame || !Number.isFinite(at)) return;
    frames.push({
      at,
      kind: frame.kind,
      shadowPass: Boolean(frame.shadowPass),
      ms: finite(frame.ms),
      calls: finite(frame.calls),
      triangles: finite(frame.triangles),
    });
    prune(at);
  };

  const summary = (at) => {
    prune(at);
    const perSecond = 1000 / windowMs;
    const count = (test) => frames.filter(test).length * perSecond;
    const last = frames.at(-1);
    const totalMs = frames.reduce((sum, frame) => sum + frame.ms, 0);
    return {
      fps: frames.length * perSecond,
      motionFps: count((frame) => frame.kind === 'motion'),
      changeFps: count((frame) => frame.kind === 'change'),
      ambientFps: count((frame) => frame.kind === 'ambient'),
      shadowPassesPerSec: count((frame) => frame.shadowPass),
      meanMs: frames.length > 0 ? totalMs / frames.length : 0,
      worstMs: frames.reduce((worst, frame) => Math.max(worst, frame.ms), 0),
      calls: last?.calls ?? 0,
      triangles: last?.triangles ?? 0,
    };
  };

  return { record, summary };
}

/**
 * The readout's text lines.
 * @param {ReturnType<ReturnType<typeof createPerfStats>['summary']>} summary
 * @param {{ textures?: number, geometries?: number, programs?: number, pixelRatio?: number,
 *   antialias?: boolean }} [gpu]
 * @returns {string}
 */
export function formatPerf(summary, gpu = {}) {
  const round = (value) => Math.round(value);
  const ms = (value) => value.toFixed(1);
  return [
    `fps ${round(summary.fps)}  (motion ${round(summary.motionFps)} · change ${round(summary.changeFps)} · ambient ${round(summary.ambientFps)})`,
    `shadow passes/s ${round(summary.shadowPassesPerSec)}`,
    `render ms mean ${ms(summary.meanMs)} · worst ${ms(summary.worstMs)}`,
    `draw calls ${summary.calls} · triangles ${summary.triangles}`,
    `textures ${gpu.textures ?? '?'} · geometries ${gpu.geometries ?? '?'} · programs ${gpu.programs ?? '?'}`,
    `pixel ratio ${gpu.pixelRatio ?? '?'} · MSAA ${gpu.antialias === undefined ? '?' : gpu.antialias ? 'on' : 'off'}`,
  ].join('\n');
}
