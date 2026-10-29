// The board's dev-only frame readout, shown when the page URL carries `?perf=1` (board3d.js).
// It reads what board-scene.js reports for each drawn frame plus three's renderer.info, so a
// change to the render loop can be compared before and after on a real board.
import { createPerfStats, formatPerf } from './perf-stats.mjs';

const REFRESH_MS = 500;

/** Whether the page asked for the readout. */
export function perfHudWanted(win = globalThis.window) {
  try {
    return new URLSearchParams(win?.location?.search ?? '').get('perf') === '1';
  } catch {
    return false;
  }
}

/**
 * @param {{ doc: Document, renderer: () => import('three').WebGLRenderer|null,
 *   now?: () => number }} options `renderer` is read on each refresh (a lost context rebuilds it).
 * @returns {{ record: (frame: object) => void, dispose: () => void }}
 */
export function createPerfHud({ doc, renderer, now = () => globalThis.performance?.now?.() ?? Date.now() }) {
  const stats = createPerfStats();
  const panel = doc.createElement('pre');
  panel.id = 'board3dPerfHud';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    zIndex: '2147483647',
    margin: '0',
    padding: '6px 8px',
    font: '11px/1.35 ui-monospace, Consolas, monospace',
    color: '#d8f5d0',
    background: 'rgba(0, 0, 0, 0.72)',
    borderRadius: '4px',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  });
  doc.body?.appendChild(panel);

  const refresh = () => {
    const gl = renderer();
    const memory = gl?.info?.memory;
    let antialias;
    try {
      antialias = gl?.getContext?.().getContextAttributes?.()?.antialias;
    } catch {
      antialias = undefined;
    }
    panel.textContent = formatPerf(stats.summary(now()), {
      textures: memory?.textures,
      geometries: memory?.geometries,
      programs: gl?.info?.programs?.length,
      pixelRatio: gl?.getPixelRatio?.(),
      antialias,
    });
  };
  refresh();
  const timer = setInterval(refresh, REFRESH_MS);

  return {
    record: (frame) => stats.record(frame, now()),
    dispose: () => {
      clearInterval(timer);
      panel.remove();
    },
  };
}
