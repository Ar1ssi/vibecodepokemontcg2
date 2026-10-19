/**
 * Tilt constants and projection math for design 009's table (see
 * .agent/designs/009-tcg-live-table.md, "Tilt (slices 1-2)"), now read by the
 * three.js board's camera (`board3d/board-camera.mjs`) and card meshes.
 *
 * Geometry, in screen px relative to the PIVOT: the centre of the near
 * playfield's bottom edge. `depthPx` (D) is the near playfield's height, so
 * the seam sits at y = -D and the far edge at y = -2D.
 * 1. rotateX(a) about the pivot: every point above it moves away (z < 0),
 *    so the near edge keeps its flat width and everything else shrinks.
 * 2. perspective(p) with the eye at the pivot.
 * 3. A final translateY(shift) lifts the projected seam back to y = -D.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

export const DEFAULT_TILT_DEG = 12;
export const DEFAULT_PERSPECTIVE_PX = 1400;

/**
 * Rotate + project a pivot-relative screen point, before the seam shift.
 * @param {{ x: number, y: number }} point
 * @param {{ deg: number, perspectivePx: number }} params
 */
export function projectFromPivot({ x, y }, { deg, perspectivePx }) {
  const rad = (deg * Math.PI) / 180;
  const z = y * Math.sin(rad);
  const scale = perspectivePx / (perspectivePx - z);
  return { x: x * scale, y: y * Math.cos(rad) * scale };
}

/** Screen shift that puts the projected seam back at y = -depthPx. */
export function seamShiftPx({ tiltDeg, perspectivePx, depthPx }) {
  if (!(depthPx > 0)) return 0;
  const seam = projectFromPivot(
    { x: 0, y: -depthPx },
    { deg: tiltDeg, perspectivePx }
  );
  return -depthPx - seam.y;
}

const round = (value) => Math.round(value * 100) / 100 || 0;

/**
 * The mat plane's tilt: `shiftPx` is the rounded seam shift the camera's principal point
 * follows. Only `mat` is returned; the near/far playfield transforms were the iframes'.
 *
 * @param {{ tiltDeg?: number, perspectivePx?: number, depthPx?: number }} [params]
 *   `depthPx` is the near playfield's on-screen height.
 * @returns {{ mat: { shiftPx: number, deg: number, origin: string, transform: string } }}
 */
export function tiltTransforms({
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
  depthPx = 0,
} = {}) {
  const shiftPx = round(seamShiftPx({ tiltDeg, perspectivePx, depthPx }));
  return {
    mat: {
      shiftPx,
      deg: tiltDeg,
      origin: '50% 100%',
      transform: `translateY(${shiftPx}px) perspective(${perspectivePx}px) rotateX(${tiltDeg}deg)`,
    },
  };
}
