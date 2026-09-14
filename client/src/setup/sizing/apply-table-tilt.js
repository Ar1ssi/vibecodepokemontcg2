/**
 * Applies design 009's table tilt (slice 2) to the board.
 *
 * The board is three separate 3D rendering contexts (self iframe, opp
 * iframe, parent page — see table-tilt.mjs's header). Each context's `html`
 * root gets `perspective`/`perspective-origin` (the eye point for that
 * context), and the element that actually leans (`#playfield` inside each
 * iframe, `#battleMat` on the parent page) gets `transform: rotateX(...)`
 * pivoted on the seam. CSS custom properties carry both down (they inherit),
 * so the two rules in self/opp-containers.css and index.css that consume
 * them need no per-slice changes beyond this file.
 */

import { tiltTransforms } from './table-tilt.mjs';
import { visualRectOf } from '../image-logic/iframe-rect.mjs';

/** @param {'self'|'opp'} target */
const frameDocument = (target) => {
  const id = target === 'opp' ? 'oppContainer' : 'selfContainer';
  const doc = document.getElementById(id)?.contentDocument;
  return doc?.documentElement ? doc : null;
};

/**
 * Design's "parent #battleMat rect shrinks to the union of both playfields"
 * (slice 1, never built until now — the mat was still drawing full-height
 * behind the cropped hand strips). Measures each iframe's #playfield through
 * the same iframe-transform projection shuffle/knockout flights use, so the
 * mat tracks the tilt/crop exactly instead of duplicating that math.
 */
const resizeBattleMat = () => {
  const mat = document.getElementById('battleMat');
  const selfPlayfield = frameDocument('self')?.getElementById('playfield');
  const oppPlayfield = frameDocument('opp')?.getElementById('playfield');
  if (!mat || !selfPlayfield || !oppPlayfield) return;

  const selfRect = visualRectOf(selfPlayfield);
  const oppRect = visualRectOf(oppPlayfield);
  if (selfRect.width < 2 || oppRect.width < 2) return;

  const top = Math.min(selfRect.top, oppRect.top);
  const bottom = Math.max(selfRect.top + selfRect.height, oppRect.top + oppRect.height);
  mat.style.top = `${top}px`;
  mat.style.height = `${bottom - top}px`;
};

const writeHalf = (root, half) => {
  if (!root) return;
  root.style.setProperty('--tilt-transform', half.transform);
  root.style.setProperty('--tilt-origin', half.origin);
  root.style.setProperty('--tilt-perspective-origin', half.perspectiveOrigin);
};

/** @param {Parameters<typeof tiltTransforms>[0]} [params] */
export const applyTableTilt = (params) => {
  const { perspectivePx, self, opp, mat } = tiltTransforms(params);
  const perspectivePxValue = `${perspectivePx}px`;

  const selfDoc = frameDocument('self');
  const oppDoc = frameDocument('opp');

  if (selfDoc?.documentElement) {
    selfDoc.documentElement.style.setProperty('--tilt-perspective-px', perspectivePxValue);
    writeHalf(selfDoc.documentElement, self);
  }
  if (oppDoc?.documentElement) {
    oppDoc.documentElement.style.setProperty('--tilt-perspective-px', perspectivePxValue);
    writeHalf(oppDoc.documentElement, opp);
  }

  document.documentElement.style.setProperty('--tilt-perspective-px', perspectivePxValue);
  writeHalf(document.documentElement, mat);

  resizeBattleMat();
};

export const initializeTableTilt = (params) => {
  applyTableTilt(params);

  for (const id of ['selfContainer', 'oppContainer']) {
    document.getElementById(id)?.addEventListener('load', () => applyTableTilt(params));
  }
  window.addEventListener('resize', () => applyTableTilt(params));
  document.addEventListener('mat-layout-applied', () => applyTableTilt(params));
};
