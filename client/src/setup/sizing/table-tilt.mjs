/**
 * Pure tilt math for design 009 slice 2 (see .agent/designs/009-tcg-live-table.md,
 * "Tilt (slices 1-2)").
 *
 * The board is three separate 3D rendering contexts: the self iframe, the opp
 * iframe (each its own document — a `perspective()`/`rotateX()` inside one
 * iframe never affects the other, or the parent page), and the parent page's
 * `#battleMat`. All three must lean the same way and meet at one continuous
 * seam.
 *
 * Every half rotates around an axis that sits exactly ON the seam:
 * `#playfield` (self/opp) pivots at its own local top edge (y=0), which is
 * where the seam lands in BOTH iframes — self because its box starts at the
 * seam, opp because its box is flipped 180° so its local top edge lands on
 * the seam too (see the design's "Current state" + Hand section). `#battleMat`
 * spans the full mat height, so its seam is its own vertical center.
 *
 * `rotateX` only displaces points that are OFF its rotation axis (y=0
 * relative to the transform-origin); every point exactly on that axis stays
 * fixed no matter what `tiltDeg`/`perspectivePx` are. Pivoting all three
 * halves' rotation axis on the seam is therefore what keeps the seam
 * continuous — not a coincidence of chosen numbers. `projectPoint` below is
 * the same math the browser performs for `perspective()`/`rotateX()`, used by
 * the seam-continuity unit test to prove that invariant holds.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

export const DEFAULT_TILT_DEG = 14;
export const DEFAULT_PERSPECTIVE_PX = 1400;
export const DEFAULT_EYE_Y_FRAC = 0.5;

/**
 * @param {{ tiltDeg?: number, perspectivePx?: number, eyeYFrac?: number }} [params]
 * @returns {{
 *   perspectivePx: number,
 *   self: { transform: string, origin: string, perspectiveOrigin: string },
 *   opp: { transform: string, origin: string, perspectiveOrigin: string },
 *   mat: { transform: string, origin: string, perspectiveOrigin: string },
 * }}
 */
export function tiltTransforms({
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
  eyeYFrac = DEFAULT_EYE_Y_FRAC,
} = {}) {
  const rotate = `rotateX(${tiltDeg}deg)`;
  const perspectiveOrigin = `50% ${eyeYFrac * 100}%`;

  return {
    perspectivePx,
    // Pivot at the local top edge — the seam in both iframes.
    self: { transform: rotate, origin: '50% 0%', perspectiveOrigin },
    opp: { transform: rotate, origin: '50% 0%', perspectiveOrigin },
    // #battleMat spans the full mat height; its seam is its own center.
    mat: { transform: rotate, origin: '50% 50%', perspectiveOrigin },
  };
}

/**
 * Project a point given in a half's own local (pre-transform) CSS pixel
 * coordinates through that half's `perspective`(ancestor) + `rotateX`(this
 * element) pipeline — the same math the browser applies. Used only by the
 * seam-continuity test.
 *
 * @param {{ x: number, y: number, height?: number }} point - `height` is
 *   only needed for `half === 'mat'`, to locate its center pivot.
 * @param {{ tiltDeg?: number, perspectivePx?: number }} [params]
 * @param {'self'|'opp'|'mat'} [half]
 * @returns {{ x: number, y: number }}
 */
export function projectPoint(
  point,
  { tiltDeg = DEFAULT_TILT_DEG, perspectivePx = DEFAULT_PERSPECTIVE_PX } = {},
  half = 'self'
) {
  const originY = half === 'mat' ? (point.height ?? 0) / 2 : 0;
  const x = point.x;
  const y = point.y - originY;
  const rad = (tiltDeg * Math.PI) / 180;
  const rotatedY = y * Math.cos(rad);
  const z = y * Math.sin(rad);
  const scale = perspectivePx > 0 ? perspectivePx / (perspectivePx - z) : 1;
  return {
    x: x * scale,
    y: originY + rotatedY * scale,
  };
}
