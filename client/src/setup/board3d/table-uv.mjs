/**
 * Mat art placement on the three.js table (design 074 §D3 "Table").
 *
 * `matUvFor` reproduces CSS `object-fit` as texture coordinates: it answers
 * which image coordinates the plane's bottom-left and top-right corners show.
 * Inside [0, 1] the image is cropped (`cover`); outside it the plane shows past
 * the image's edge (`contain` letterboxes), which `artQuadFor` turns into a
 * smaller quad so the letterbox stays the backing colour instead of smeared
 * edge texels. v runs up the image (three's flipY convention).
 *
 * Pure and DOM-free (no `three` import) so it runs under `node --test`.
 */

import { depthOf } from './board-layout.mjs';

const FULL_UV = Object.freeze({ u0: 0, v0: 0, u1: 1, v1: 1 });

const positive = (value) => Number.isFinite(value) && value > 0;

/**
 * @param {{ fit?: string, imageAspect?: number, planeAspect?: number }} params
 *   `fit` is a profile's `matFit`: `'contain'`, `'cover'` or `'100% 100%'`
 *   (stretch). Aspects are width / height.
 * @returns {{ u0: number, v0: number, u1: number, v1: number }}
 *   Stretch, an unknown fit, or a missing aspect fills the plane (0..1).
 */
export function matUvFor({ fit, imageAspect, planeAspect } = {}) {
  if (fit !== 'contain' && fit !== 'cover') return { ...FULL_UV };
  if (!positive(imageAspect) || !positive(planeAspect)) return { ...FULL_UV };
  const imageWider = imageAspect > planeAspect;
  // Share of the plane's width (or height) the image spans after scaling.
  const ratio = imageWider ? planeAspect / imageAspect : imageAspect / planeAspect;
  // contain: the image spans `ratio` of the plane on the short axis, so the
  // plane spans 1/ratio of the image. cover: the plane shows `ratio` of it.
  const span = fit === 'contain' ? 1 / ratio : ratio;
  const lo = 0.5 - span / 2;
  const hi = 0.5 + span / 2;
  if (fit === 'contain') {
    return imageWider ? { u0: 0, v0: lo, u1: 1, v1: hi } : { u0: lo, v0: 0, u1: hi, v1: 1 };
  }
  return imageWider ? { u0: lo, v0: 0, u1: hi, v1: 1 } : { u0: 0, v0: lo, u1: 1, v1: hi };
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The part of the plane the image actually covers, for a `matUvFor` result.
 * @param {{ u0: number, v0: number, u1: number, v1: number }} uv
 * @returns {{ rect: { x0: number, y0: number, x1: number, y1: number },
 *   uv: { u0: number, v0: number, u1: number, v1: number } }}
 *   `rect` in plane fractions (0..1 from the bottom-left), `uv` clamped to the image.
 */
export function artQuadFor(uv) {
  const { u0, v0, u1, v1 } = uv || FULL_UV;
  const du = u1 - u0 || 1;
  const dv = v1 - v0 || 1;
  const cu0 = clamp01(u0);
  const cu1 = clamp01(u1);
  const cv0 = clamp01(v0);
  const cv1 = clamp01(v1);
  return {
    rect: {
      x0: (cu0 - u0) / du,
      y0: (cv0 - v0) / dv,
      x1: (cu1 - u0) / du,
      y1: (cv1 - v0) / dv,
    },
    uv: { u0: cu0, v0: cv0, u1: cu1, v1: cv1 },
  };
}

const FULL_RECT = Object.freeze({ x0: 0, y0: 0, x1: 1, y1: 1 });

/**
 * A half's mat box (`--mat-width/height/offset-x/offset-y` of layoutToCssVars) in plane
 * fractions from the bottom-left. An aspect profile's box is `scale` planes tall, as wide as
 * that height times the aspect (at most the plane), centred across and lifted by
 * `max(0, (1 - scale) / 2)`; with `scale > 1` it overflows the plane's top (CSS clips it).
 * Without an aspect the box is the whole plane.
 * @param {{ boxAspect?: number|null, planeAspect: number, scale?: number }} params
 * @returns {{ x0: number, y0: number, x1: number, y1: number }}
 */
export function matBoxRect({ boxAspect, planeAspect, scale = 1 } = {}) {
  if (!positive(boxAspect) || !positive(planeAspect)) return { ...FULL_RECT };
  const height = positive(scale) ? scale : 1;
  const width = Math.min(planeAspect, height * boxAspect) / planeAspect;
  const x0 = (1 - width) / 2;
  const y0 = Math.max(0, (1 - height) / 2);
  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

/**
 * Clips a quad (plane-fraction `rect` showing image coordinates `uv`) to the plane, moving the
 * UVs with the clipped edges, the way `overflow: hidden` crops the mat half.
 * @returns {{ rect: object, uv: object } | null} null when nothing of the quad is on the plane
 */
export function clipQuad({ rect, uv }) {
  const x0 = Math.max(0, rect.x0);
  const x1 = Math.min(1, rect.x1);
  const y0 = Math.max(0, rect.y0);
  const y1 = Math.min(1, rect.y1);
  if (!(x1 > x0 && y1 > y0)) return null;
  const at = (lo, hi, from, to, value) => from + ((value - lo) / (hi - lo || 1)) * (to - from);
  return {
    rect: { x0, y0, x1, y1 },
    uv: {
      u0: at(rect.x0, rect.x1, uv.u0, uv.u1, x0),
      u1: at(rect.x0, rect.x1, uv.u0, uv.u1, x1),
      v0: at(rect.y0, rect.y1, uv.v0, uv.v1, y0),
      v1: at(rect.y0, rect.y1, uv.v0, uv.v1, y1),
    },
  };
}

/** Maps a rect given in fractions of `outer` into fractions of the plane that holds `outer`. */
export function nestRect(outer, rect) {
  const w = outer.x1 - outer.x0;
  const h = outer.y1 - outer.y0;
  return {
    x0: outer.x0 + rect.x0 * w,
    y0: outer.y0 + rect.y0 * h,
    x1: outer.x0 + rect.x1 * w,
    y1: outer.y0 + rect.y1 * h,
  };
}

/**
 * The flat rect the mat covers: both playfields, from the near edge (the
 * pivot, y = 0) to the far edge (y = 2·depth), one iframe wide, centred on x.
 * @param {{ half: { w: number, h: number }, depth?: number }} layout a `flatLayout` result
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function tableBounds(layout) {
  const half = layout?.half;
  if (!half || !positive(half.w) || !positive(half.h)) return { x: 0, y: 0, w: 0, h: 0 };
  const depth = positive(layout.depth) ? layout.depth : depthOf(half);
  return { x: -half.w / 2, y: 0, w: half.w, h: 2 * depth };
}
