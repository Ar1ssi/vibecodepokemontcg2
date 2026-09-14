/**
 * Pure tilt math for design 009 (see .agent/designs/009-tcg-live-table.md,
 * "Tilt (slices 1-2)").
 *
 * The board is three separately rendered planes: the NEAR iframe (class
 * `.self`, bottom of the screen, unflipped), the FAR iframe (class `.opp`,
 * top of the screen, flipped 180deg by the parent page) and the parent
 * page's `#battleMat`. All three must read as ONE table leaning away from
 * the viewer.
 *
 * Two rules make that true:
 * 1. Perspective lives inside each element's own transform
 *    (`perspective(p) rotateX(a)`), so every plane's eye point is its own
 *    transform-origin. All three origins sit on the seam's centre, so all
 *    three share one eye point. (An ancestor `perspective` property on
 *    `<html>` was tried first: it made `<html>` the containing block for
 *    every `position: fixed` zone and collapsed the board.)
 * 2. The far iframe is flipped 180deg AFTER its content is rendered.
 *    Conjugating rotateX(a) by that flip gives rotateX(-a), so the far
 *    half's local rotation is the negative of the near half's. With the
 *    same sign, the far edge would come TOWARD the viewer.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

export const DEFAULT_TILT_DEG = 14;
export const DEFAULT_PERSPECTIVE_PX = 1400;

const tiltTransform = (perspectivePx, deg) =>
  `perspective(${perspectivePx}px) rotateX(${deg}deg)`;

/**
 * @param {{ tiltDeg?: number, perspectivePx?: number }} [params]
 * @returns {{
 *   near: { transform: string, origin: string },
 *   far: { transform: string, origin: string },
 *   mat: { transform: string },
 * }} `origin` is the local top edge (the seam) of each iframe's
 *   `#playfield`. The mat's origin depends on measured geometry: see
 *   `battleMatBox`.
 */
export function tiltTransforms({
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
} = {}) {
  return {
    near: {
      transform: tiltTransform(perspectivePx, tiltDeg),
      origin: '50% 0%',
    },
    far: {
      transform: tiltTransform(perspectivePx, -tiltDeg),
      origin: '50% 0%',
    },
    mat: { transform: tiltTransform(perspectivePx, tiltDeg) },
  };
}

/**
 * The parent `#battleMat` box that spans exactly the two playfields (the
 * iframes minus their cropped hand strips), plus the seam's offset inside
 * it (the mat's rotation origin).
 *
 * @param {{
 *   nearRect: { top: number, height: number },
 *   farRect: { top: number, height: number },
 *   cropFrac: number,
 * }} geometry - frame rects in parent-viewport px; `cropFrac` is the hand
 *   strip's share of each iframe's height.
 * @returns {{ top: number, height: number, seamOffset: number } | null}
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
  return { top, height: bottom - top, seamOffset: nearRect.top - top };
}

/**
 * Project a point through `perspective(p) rotateX(a)` with the
 * transform-origin at (0, 0): the same math the browser applies. `x` and `y`
 * are local px relative to the origin, y pointing down.
 *
 * @param {{ x: number, y: number }} point
 * @param {{ tiltDeg?: number, perspectivePx?: number }} [params]
 * @param {'near'|'far'|'mat'} [half] - far uses the negated angle.
 * @returns {{ x: number, y: number }}
 */
export function projectPoint(
  point,
  { tiltDeg = DEFAULT_TILT_DEG, perspectivePx = DEFAULT_PERSPECTIVE_PX } = {},
  half = 'near'
) {
  const deg = half === 'far' ? -tiltDeg : tiltDeg;
  const rad = (deg * Math.PI) / 180;
  const z = point.y * Math.sin(rad);
  const scale = perspectivePx / (perspectivePx - z);
  return { x: point.x * scale, y: point.y * Math.cos(rad) * scale };
}
