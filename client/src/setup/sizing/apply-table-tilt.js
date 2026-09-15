/**
 * Applies design 009's table tilt to the board (math in table-tilt.mjs).
 *
 * Each iframe's `#playfield` reads `--tilt-transform`/`--tilt-origin` from
 * its own documentElement. Which values it gets depends on the frame's
 * CURRENT class, not its id: a board flip swaps `.self`/`.opp` between the
 * two iframes, and only the `.opp` (flipped, far) frame needs the negated
 * angle. The same per-frame flag sets `--deck-stack-dir`, so the 3D deck
 * rises toward the far side of the table on both halves.
 *
 * `#battleMat` is sized to span exactly the two playfields (not the hand
 * strips) and rotates about the seam, so the mat art stays under the zones.
 */

import { battleMatBox, tiltTransforms } from './table-tilt.mjs';

const FRAME_IDS = ['selfContainer', 'oppContainer'];
const DEFAULT_CROP_FRAC = 0.16;

const readFrame = (id) => {
  const frame = document.getElementById(id);
  const doc = frame?.contentDocument;
  if (!frame || !doc?.documentElement) return null;
  return { frame, doc, isFar: frame.classList.contains('opp') };
};

/** `--hand-crop-height` is in vh of the iframe, i.e. percent of its height. */
const cropFraction = (doc) => {
  const raw = doc.defaultView
    ?.getComputedStyle(doc.documentElement)
    .getPropertyValue('--hand-crop-height');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value / 100 : DEFAULT_CROP_FRAC;
};

const measureBoard = (near, far) => {
  if (!near || !far) return null;
  return battleMatBox({
    nearRect: near.frame.getBoundingClientRect(),
    farRect: far.frame.getBoundingClientRect(),
    cropFrac: cropFraction(near.doc),
  });
};

const writeHalf = (entry, half) => {
  const root = entry.doc.documentElement;
  root.style.setProperty('--tilt-transform', half.transform);
  root.style.setProperty('--tilt-origin', half.origin);
  root.style.setProperty('--deck-stack-dir', entry.isFar ? '1' : '-1');
};

const writeBattleMat = (box, matHalf) => {
  const mat = document.getElementById('battleMat');
  if (!mat || !box) return;
  mat.style.top = `${box.top}px`;
  mat.style.height = `${box.height}px`;
  // Mat halves size their art from this; each half is one playfield tall.
  mat.style.setProperty('--mat-half-height', `${box.height / 2}px`);
  mat.style.setProperty('--tilt-transform', matHalf.transform);
  mat.style.setProperty('--tilt-origin', matHalf.origin);
};

/** @param {{ tiltDeg?: number, perspectivePx?: number }} [params] */
export const applyTableTilt = (params) => {
  const frames = FRAME_IDS.map(readFrame).filter(Boolean);
  const near = frames.find((entry) => !entry.isFar) || null;
  const far = frames.find((entry) => entry.isFar) || null;
  const box = measureBoard(near, far);
  // Without both frames measured, depth 0 still tilts, just without the
  // seam shift; the next load/resize re-applies with real geometry.
  const tilt = tiltTransforms({
    ...params,
    depthPx: box?.depth ?? 0,
    widthPx: near?.frame.getBoundingClientRect().width ?? 0,
  });

  for (const entry of frames)
    writeHalf(entry, entry.isFar ? tilt.far : tilt.near);
  writeBattleMat(box, tilt.mat);
};

export const initializeTableTilt = (params) => {
  const reapply = () => applyTableTilt(params);
  reapply();

  for (const id of FRAME_IDS) {
    const frame = document.getElementById(id);
    if (!frame) continue;
    frame.addEventListener('load', reapply);
    // Covers window resize, the split resizer, the right drawer and the
    // height swap on board flip, none of which fire a single shared event.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(reapply).observe(frame);
    }
  }
  if (typeof ResizeObserver !== 'function')
    window.addEventListener('resize', reapply);
  document.addEventListener('mat-layout-applied', reapply);
};
