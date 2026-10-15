// Where things sit on the tabletop (design 073 § Pure modules). Table space is millimetres: the
// table top is y = 0, x runs right, z runs toward the viewer, and the box stands near the origin.
// Hand space is the camera's: x right, y up, −z away from the eye.

import { CARD } from './physical.mjs';

const DEG = Math.PI / 180;

/** The sealed box: upright, turned so the front and its left side face the viewer (the renders' view). */
export const BOX_SPOT = Object.freeze({ x: 0, z: -30, rotYDeg: 25 });

// Things taken out of the box, lying flat. `rotYDeg` turns them about the table normal.
export const DECK_SPOT = Object.freeze({ x: -168, z: 18, rotYDeg: -9 });
export const PROMO_SPOT = Object.freeze({ x: -158, z: 128, rotYDeg: 5 });
export const CODE_SPOT = Object.freeze({ x: 160, z: 12, rotYDeg: 13 });
export const LEAFLET_SPOT = Object.freeze({ x: 182, z: -92, rotYDeg: 19 });
export const WRAP_SPOT = Object.freeze({ x: -205, z: -128, rotYDeg: 0 });
const WRAPPER_DISCARD = Object.freeze({ x: 232, z: 118 });

/** A sealed pack's place in the loose row in front of the box; a finished pack's cards pile there. */
export function packRowSpot(visual, count = 4) {
  const n = Math.max(1, count | 0);
  const middle = (n - 1) / 2;
  const offset = (Number(visual) || 0) - middle;
  return {
    x: offset * 74,
    z: 168 - Math.abs(offset) * 9,
    rotYDeg: offset * 3.5,
  };
}

/** Emptied wrappers land loosely in a heap at the front right. */
export function wrapperSpot(k) {
  const index = Math.max(0, Number(k) || 0);
  return {
    x: WRAPPER_DISCARD.x + ((index * 37) % 23) - 11,
    z: WRAPPER_DISCARD.z - index * 9,
    rotYDeg: ((index * 53) % 70) - 35,
  };
}

/** A card's resting tilt in a face-up pile: each lands a little off square. */
export function pileJitter(k) {
  const index = Math.max(0, Number(k) || 0);
  return {
    dx: ((index * 17) % 9) - 4,
    dz: ((index * 29) % 7) - 3,
    rotYDeg: ((index * 41) % 11) - 5,
  };
}

// Held things float in front of the eye at arm's length.
export const HAND = Object.freeze({ x: 0, y: -14, z: -330, tiltXDeg: -7 });
// The revealed cards of a pack are fanned a little further away, in two rows of five.
const SUMMARY_DISTANCE = 540;
const SUMMARY_PITCH_X = 70;
const SUMMARY_ROW_GAP = 8;

/** @returns {{x: number, y: number, z: number}} hand-space centre of summary card `k` of `count`. */
export function summarySlot(k, count = 10) {
  const n = Math.max(1, count | 0);
  const perRow = Math.ceil(n / 2);
  const row = k < perRow ? 0 : 1;
  const column = row === 0 ? k : k - perRow;
  const inRow = row === 0 ? perRow : n - perRow;
  return {
    x: (column - (inRow - 1) / 2) * SUMMARY_PITCH_X,
    y: (row === 0 ? 1 : -1) * (CARD.height / 2 + SUMMARY_ROW_GAP / 2),
    z: -SUMMARY_DISTANCE,
  };
}

/**
 * The camera distance at which a region `halfWidth` × `halfHeight` (mm) fills the view, for a
 * vertical field of view `fovDeg` and an aspect ratio `aspect` (width / height).
 */
export function fitDistance(halfWidth, halfHeight, fovDeg, aspect) {
  const tanV = Math.tan((fovDeg / 2) * DEG);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const byHeight = halfHeight / tanV;
  const byWidth = halfWidth / (tanV * ratio);
  return Math.max(byHeight, byWidth);
}

// Each camera pose frames a region of the table: its centre, its half extents, and the angle the
// eye looks down at it from.
const FRAMES = Object.freeze({
  box: { target: { x: 0, y: 66, z: -30 }, halfWidth: 120, halfHeight: 92, elevationDeg: 17 },
  open: { target: { x: 0, y: 70, z: -24 }, halfWidth: 125, halfHeight: 100, elevationDeg: 36 },
  table: { target: { x: 0, y: 0, z: 36 }, halfWidth: 285, halfHeight: 205, elevationDeg: 50 },
});
export const CAMERA_FOV_DEG = 30;

/**
 * @param {'box'|'open'|'table'} name
 * @param {number} aspect the viewport's width / height
 * @returns {{position: {x, y, z}, target: {x, y, z}, fov: number}}
 */
export function cameraPose(name, aspect) {
  const frame = FRAMES[name] || FRAMES.box;
  const distance = fitDistance(frame.halfWidth, frame.halfHeight, CAMERA_FOV_DEG, aspect);
  const elevation = frame.elevationDeg * DEG;
  const { target } = frame;
  return {
    position: {
      x: target.x,
      y: target.y + distance * Math.sin(elevation),
      z: target.z + distance * Math.cos(elevation),
    },
    target: { ...target },
    fov: CAMERA_FOV_DEG,
  };
}
