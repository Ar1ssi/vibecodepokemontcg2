// Design 076: reads the modifiers (gpu-canvas FX_MODS) each fill of a kit draw recorded into its
// paint row, so a kit test can prove which modules a fill carried and that `ctx.fxMod` came back.
import { ShapeUtils, Vector2 } from 'three';

import { FX_MODS, PAINT_TEXELS, VERTEX_FLOATS, createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';

const PAINT_FLOATS = PAINT_TEXELS * 4;
const EDGE_TEXEL = 18;

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const texel = (row, index) => Array.from(row.subarray(index * 4, index * 4 + 4));

const UNIT = 100;

/** A GPU canvas recorder in one front pass (unit 100 px), additive like a move scene. */
export function modRecorder() {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: UNIT, seed: 1 });
  canvas.ctx.globalCompositeOperation = 'lighter';
  return canvas;
}

/** The highest lift (lane units) among the vertices painted with each paint row. */
const rowHeights = (rec) => {
  const heights = new Array(rec.paintCount).fill(0);
  for (let v = 0; v < rec.vertexCount; v += 1) {
    const at = v * VERTEX_FLOATS;
    const row = Math.round(rec.vertices[at + 8]);
    if (row >= 0 && row < heights.length) heights[row] = Math.max(heights[row], rec.vertices[at + 2] / UNIT);
  }
  return heights;
};

/**
 * Every recorded paint row's modifiers: `distort`, `detail` and `volume` strengths (0 = off), the
 * dissolve `amount`, `width` and `gain`, the dissolve `edge` as 0–255 rgb (null when none was
 * named), and `z`, the row's lift in lane units (its highest vertex).
 */
export function recordedMods(recording) {
  const rec = recording();
  const heights = rowHeights(rec);
  return Array.from({ length: rec.paintCount }, (_, i) => {
    const row = rec.paints.subarray(i * PAINT_FLOATS, (i + 1) * PAINT_FLOATS);
    const [amount, width, gain] = texel(row, FX_MODS.dissolve.texel);
    const edge = texel(row, EDGE_TEXEL);
    return {
      distort: texel(row, FX_MODS.distort.texel)[0],
      detail: texel(row, FX_MODS.detail.texel)[0],
      volume: texel(row, FX_MODS.volume.texel)[0],
      z: heights[i],
      dissolve: { amount, width, gain },
      edge: edge[3] > 0.5 ? edge.slice(0, 3).map((v) => Math.round(v * 255)) : null,
    };
  });
}
