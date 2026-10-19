// Where things sit on the tabletop (design 073 § Pure modules). Table space is millimetres: the
// table top is y = 0, x runs right, z runs toward the viewer, and the box stands near the origin.
// Hand space is the camera's: x right, y up, −z away from the eye.

import { CARD } from './physical.mjs';

const DEG = Math.PI / 180;

// The rubber mat under everything: a 610 × 356 mm full-size playmat, 2 mm thick; its top is y = 0.
export const MAT = Object.freeze({ width: 610, depth: 356, thickness: 2, x: 0, z: 30 });

/** The sealed box: upright, turned so the front and its left side face the viewer (the renders' view). */
export const BOX_SPOT = Object.freeze({ x: 0, z: -70, rotYDeg: 25 });

// Things taken out of the box, lying flat. `rotYDeg` turns them about the table normal. The box
// sits at the back; the deck goes left with its promo between it and the box, the paper right, the
// packs in a loose row in front, and the cards of an opened pack collect at the front right.
export const DECK_SPOT = Object.freeze({ x: -206, z: -36, rotYDeg: -9 });
export const PROMO_SPOT = Object.freeze({ x: -112, z: -28, rotYDeg: 4 });
// The leaflet overhangs the mat's back edge onto the desk.
export const LEAFLET_SPOT = Object.freeze({ x: 186, z: -158, rotYDeg: 19 });
// The balled-up shrink-wrap is tossed onto the back left of the mat: a loose wad this wide.
export const WRAP_SPOT = Object.freeze({ x: -160, z: -118, rotYDeg: 0 });
export const WRAP_BALL_RADIUS = 28;
export const REVEAL_SPOT = Object.freeze({ x: 186, z: 150, rotYDeg: -7 });
export const EXTRAS_SPOT = Object.freeze({ x: 238, z: 46, rotYDeg: 11 });
const WRAPPER_DISCARD = Object.freeze({ x: -244, z: 128 });

// The packs' row sits left of centre, leaving the front right for the opened cards.
export const PACK_ROW_X = -40;

/** A sealed pack's place in the loose row in front of the box; a finished pack's cards pile there. */
export function packRowSpot(visual, count = 4) {
  const n = Math.max(1, count | 0);
  const middle = (n - 1) / 2;
  const offset = (Number(visual) || 0) - middle;
  return {
    x: PACK_ROW_X + offset * 74,
    z: 150 - Math.abs(offset) * 8,
    rotYDeg: offset * 3.5,
  };
}

/** Emptied wrappers land loosely in a heap at the front left, clear of the pack row. */
export function wrapperSpot(k) {
  const index = Math.max(0, Number(k) || 0);
  return {
    x: WRAPPER_DISCARD.x + ((index * 37) % 15) - 7,
    z: WRAPPER_DISCARD.z - (index % 4) * 9,
    rotYDeg: ((index * 53) % 40) - 20,
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
export const HAND = Object.freeze({ x: 0, y: 8, z: -330, tiltXDeg: -7 });
// The revealed cards of a pack are fanned a little further away: two rows of five on a wide
// screen, more rows of fewer on a narrow one (`summaryColumns`).
const SUMMARY_DISTANCE = 540;
const SUMMARY_PITCH_X = 70;
const SUMMARY_ROW_GAP = 8;
const SUMMARY_MARGIN = 8;

/**
 * @param {number} k the card's place in the fan (0-based)
 * @param {number} count the cards in the fan
 * @param {number} columns cards per full row
 * @returns {{x: number, y: number, z: number}} hand-space centre of summary card `k` of `count`.
 */
export function summarySlot(k, count = 10, columns = 5) {
  const n = Math.max(1, count | 0);
  const perRow = Math.max(1, Math.min(n, columns | 0 || 5));
  const rows = Math.ceil(n / perRow);
  const row = Math.min(rows - 1, Math.floor(k / perRow));
  const column = k - row * perRow;
  const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
  return {
    x: (column - (inRow - 1) / 2) * SUMMARY_PITCH_X,
    y: ((rows - 1) / 2 - row) * (CARD.height + SUMMARY_ROW_GAP),
    z: -SUMMARY_DISTANCE,
  };
}

/**
 * The fan's column count that shows `count` cards biggest on a screen of `aspect` (2–5 columns),
 * and the camera distance that fits it.
 * @returns {{columns: number, distance: number}}
 */
export function summaryColumns(count = 10, aspect = 16 / 9, fovDeg = CAMERA_FOV_DEG) {
  const n = Math.max(1, count | 0);
  let best = null;
  for (let columns = Math.min(2, n); columns <= Math.min(5, n); columns += 1) {
    const rows = Math.ceil(n / columns);
    const halfWidth = (columns * SUMMARY_PITCH_X) / 2 + SUMMARY_MARGIN;
    const halfHeight = (rows * (CARD.height + SUMMARY_ROW_GAP)) / 2 + SUMMARY_MARGIN;
    const distance = fitDistance(halfWidth, halfHeight, fovDeg, aspect);
    if (!best || distance < best.distance - 1e-9) best = { columns, distance };
  }
  return best;
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
// eye looks down at it from. A portrait screen (`narrow`) frames tighter across and, at the
// table, looks down more steeply, so the box and the mat aren't lost in empty floor.
const FRAMES = Object.freeze({
  box: { target: { x: 0, y: 50, z: -70 }, halfWidth: 150, halfHeight: 118, elevationDeg: 18, narrow: { halfWidth: 92 } },
  open: { target: { x: 0, y: 72, z: -78 }, halfWidth: 170, halfHeight: 142, elevationDeg: 34, narrow: { halfWidth: 112 } },
  table: {
    target: { x: 10, y: 10, z: 18 },
    halfWidth: 300,
    halfHeight: 255,
    elevationDeg: 52,
    narrow: { halfWidth: 262, elevationDeg: 62 },
  },
});
export const CAMERA_FOV_DEG = 30;
const NARROW_ASPECT = 1;

/**
 * @param {'box'|'open'|'table'} name
 * @param {number} aspect the viewport's width / height
 * @returns {{position: {x, y, z}, target: {x, y, z}, fov: number}}
 */
export function cameraPose(name, aspect) {
  const base = FRAMES[name] || FRAMES.box;
  const frame = Number.isFinite(aspect) && aspect > 0 && aspect < NARROW_ASPECT ? { ...base, ...base.narrow } : base;
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
