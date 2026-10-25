// Design 076: reads the modifiers (gpu-canvas FX_MODS) each fill of a kit draw recorded into its
// paint row, so a kit test can prove which modules a fill carried and that `ctx.fxMod` came back.
import { ShapeUtils, Vector2 } from 'three';

import { FX_MODS, PAINT_TEXELS, createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';

const PAINT_FLOATS = PAINT_TEXELS * 4;
const EDGE_TEXEL = 18;

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const texel = (row, index) => Array.from(row.subarray(index * 4, index * 4 + 4));

/** A GPU canvas recorder in one front pass, additive like a move scene. */
export function modRecorder() {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: 100, seed: 1 });
  canvas.ctx.globalCompositeOperation = 'lighter';
  return canvas;
}

/**
 * Every recorded paint row's modifiers: `distort` and `detail` strengths (0 = off), the dissolve
 * `amount`, `width` and `gain`, and the dissolve `edge` as 0–255 rgb (null when none was named).
 */
export function recordedMods(recording) {
  const rec = recording();
  return Array.from({ length: rec.paintCount }, (_, i) => {
    const row = rec.paints.subarray(i * PAINT_FLOATS, (i + 1) * PAINT_FLOATS);
    const [amount, width, gain] = texel(row, FX_MODS.dissolve.texel);
    const edge = texel(row, EDGE_TEXEL);
    return {
      distort: texel(row, FX_MODS.distort.texel)[0],
      detail: texel(row, FX_MODS.detail.texel)[0],
      dissolve: { amount, width, gain },
      edge: edge[3] > 0.5 ? edge.slice(0, 3).map((v) => Math.round(v * 255)) : null,
    };
  });
}
