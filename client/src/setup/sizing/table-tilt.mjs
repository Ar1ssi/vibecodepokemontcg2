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

/** Screen shift that puts the projected seam back on the iframe boundary. */
export function seamShiftPx({ tiltDeg, perspectivePx, depthPx }) {
  if (!(depthPx > 0)) return 0;
  const seam = projectFromPivot(
    { x: 0, y: -depthPx },
    { deg: tiltDeg, perspectivePx }
  );
  return -depthPx - seam.y;
}

/**
 * Chrome rasterizes a layer whose screen transform has perspective at 1 texel
 * per CSS px, ignoring the device pixel ratio, so tilted cards look fuzzy on
 * HiDPI screens (measured: sharpness 76 flat vs 8 tilted at DPR 1.5). Each
 * `#playfield` is therefore laid out OVERSAMPLE times larger (`zoom: 2` in
 * self/opp-containers.css; keep the two in step) and shrunk back by
 * scale(1/OVERSAMPLE) inside its own transform. Zoom also scales the
 * transform's own lengths, so every length below is divided by OVERSAMPLE.
 */
export const OVERSAMPLE = 2;

const round = (value) => Math.round(value * 100) / 100 || 0;

const half = (shiftPx, deg, perspectivePx, origin) => ({
  shiftPx,
  deg,
  origin,
  transform: `translateY(${shiftPx}px) perspective(${perspectivePx}px) rotateX(${deg}deg)`,
});

/**
 * The same plane as `half()`, written for a zoomed `#playfield` with
 * transform-origin 0 0: move to the pivot, tilt, move back, then shrink the
 * oversampled layout. `pivot` is in unzoomed local px.
 */
const zoomedHalf = (shiftPx, deg, perspectivePx, pivot) => {
  const k = OVERSAMPLE;
  const x = round(pivot.x / k);
  const back = `translate(${-x}px, ${round(-pivot.y / k)}px)`;
  return {
    shiftPx,
    deg,
    origin: '0 0',
    transform:
      `translate(${x}px, ${round((pivot.y + shiftPx) / k)}px) ` +
      `perspective(${round(perspectivePx / k)}px) rotateX(${deg}deg) ${back} scale(${1 / k})`,
  };
};

/** Flat, correctly sized playfield until the board has been measured. */
export const UNMEASURED_PLAYFIELD = {
  transform: `scale(${1 / OVERSAMPLE})`,
  origin: '0 0',
};

/**
 * @param {{ tiltDeg?: number, perspectivePx?: number, depthPx?: number, widthPx?: number }} [params]
 *   `depthPx` is the near playfield's on-screen height and `widthPx` the
 *   iframes' width. Until both are measured the playfields render flat.
 * @returns {{
 *   near: { transform: string, origin: string, shiftPx?: number, deg?: number },
 *   far: { transform: string, origin: string, shiftPx?: number, deg?: number },
 *   mat: { transform: string, origin: string, shiftPx: number, deg: number },
 * }} near/far are for the zoomed `#playfield`s, mat for the unzoomed
 *   `#battleMat`.
 */
export function tiltTransforms({
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
  depthPx = 0,
  widthPx = 0,
} = {}) {
  const shift = round(seamShiftPx({ tiltDeg, perspectivePx, depthPx }));
  const mat = half(shift, tiltDeg, perspectivePx, '50% 100%');
  if (!(depthPx > 0 && widthPx > 0)) {
    return { near: UNMEASURED_PLAYFIELD, far: UNMEASURED_PLAYFIELD, mat };
  }
  const depth = round(depthPx);
  const centre = widthPx / 2;
  return {
    near: zoomedHalf(shift, tiltDeg, perspectivePx, { x: centre, y: depth }),
    far: zoomedHalf(round(-shift), round(-tiltDeg), perspectivePx, {
      x: centre,
      y: -depth,
    }),
    mat,
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
