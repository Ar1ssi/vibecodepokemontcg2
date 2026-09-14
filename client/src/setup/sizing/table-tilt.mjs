/**
 * Pure tilt math for design 009 (see .agent/designs/009-tcg-live-table.md,
 * "Tilt (slices 1-2)").
 *
 * The board is three separately rendered planes: the NEAR iframe (class
 * `.self`, bottom of the screen, unflipped), the FAR iframe (class `.opp`,
 * top of the screen, flipped 180deg by the parent page) and the parent
 * page's `#battleMat`. All three must read as ONE table that recedes from
 * the viewer, like a camera looking down from above the near edge.
 *
 * Geometry, in screen px relative to the PIVOT: the centre of the near
 * playfield's bottom edge. `depthPx` (D) is the near playfield's height, so
 * the seam sits at y = -D and the far edge at y = -2D.
 * 1. rotateX(a) about the pivot: every point above it moves away (z < 0),
 *    so the near edge keeps its flat width and everything else shrinks.
 * 2. perspective(p) with the eye at the pivot too: perspective() uses the
 *    transform-origin as its eye point, and all three planes put their
 *    origin on the pivot, so they share one eye.
 * 3. A final translateY(shift) lifts the projected seam back to y = -D. The
 *    seam is the boundary between the two iframes; without the shift the
 *    far half's cards near the seam would render past the far iframe's
 *    bottom and be clipped.
 *
 * The far iframe is flipped 180deg after its content renders, so its local
 * transform is the flip-conjugate: shift and angle negate, perspective does
 * not. Its pivot lies outside its own box, D above its playfield's local top.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

export const DEFAULT_TILT_DEG = 14;
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

/** Screen shift that puts the projected seam back on the iframe boundary. */
export function seamShiftPx({ tiltDeg, perspectivePx, depthPx }) {
  if (!(depthPx > 0)) return 0;
  const seam = projectFromPivot(
    { x: 0, y: -depthPx },
    { deg: tiltDeg, perspectivePx }
  );
  return -depthPx - seam.y;
}

const round = (value) => Math.round(value * 100) / 100 || 0;

const half = (shiftPx, deg, perspectivePx, origin) => ({
  shiftPx,
  deg,
  origin,
  transform: `translateY(${shiftPx}px) perspective(${perspectivePx}px) rotateX(${deg}deg)`,
});

/**
 * @param {{ tiltDeg?: number, perspectivePx?: number, depthPx?: number }} [params]
 *   `depthPx` is the near playfield's on-screen height; 0 means "not
 *   measured yet" and disables the seam shift.
 * @returns {{
 *   near: { transform: string, origin: string, shiftPx: number, deg: number },
 *   far: { transform: string, origin: string, shiftPx: number, deg: number },
 *   mat: { transform: string, origin: string, shiftPx: number, deg: number },
 * }}
 */
export function tiltTransforms({
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
  depthPx = 0,
} = {}) {
  const shift = round(seamShiftPx({ tiltDeg, perspectivePx, depthPx }));
  const depth = round(depthPx > 0 ? depthPx : 0);
  return {
    near: half(shift, tiltDeg, perspectivePx, '50% 100%'),
    far: half(
      round(-shift),
      round(-tiltDeg),
      perspectivePx,
      `50% ${round(-depth)}px`
    ),
    mat: half(shift, tiltDeg, perspectivePx, '50% 100%'),
  };
}

/**
 * Where a plane's transform puts a point given relative to that plane's
 * transform-origin, in the same (local) frame: the math the browser does for
 * `translateY(s) perspective(p) rotateX(a)`.
 *
 * @param {{ x: number, y: number }} point
 * @param {{ shiftPx: number, deg: number }} spec - one half from tiltTransforms
 * @param {number} perspectivePx
 */
export function projectLocal(point, { shiftPx, deg }, perspectivePx) {
  const projected = projectFromPivot(point, { deg, perspectivePx });
  return { x: projected.x, y: projected.y + shiftPx };
}

/**
 * The parent `#battleMat` box that spans exactly the two playfields (the
 * iframes minus their cropped hand strips), and the near playfield's height
 * (the tilt's `depthPx`).
 *
 * @param {{
 *   nearRect: { top: number, height: number },
 *   farRect: { top: number, height: number },
 *   cropFrac: number,
 * }} geometry - frame rects in parent-viewport px; `cropFrac` is the hand
 *   strip's share of each iframe's height.
 * @returns {{ top: number, height: number, depth: number } | null}
 */
export function battleMatBox({ nearRect, farRect, cropFrac }) {
  if (!nearRect || !farRect || !(nearRect.height > 0) || !(farRect.height > 0))
    return null;
  const crop = Number.isFinite(cropFrac)
    ? Math.min(Math.max(cropFrac, 0), 0.9)
    : 0;
  const top = farRect.top + farRect.height * crop;
  const bottom = nearRect.top + nearRect.height * (1 - crop);
  if (!(bottom > top)) return null;
  return { top, height: bottom - top, depth: bottom - nearRect.top };
}
