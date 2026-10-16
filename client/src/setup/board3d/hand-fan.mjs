// Design 074 D3 "Hand": card poses for a fanned hand, pure math (no three).
// Units are whatever the caller passes (flat CSS px in the scene). x right, y up, the screen's
// bottom edge at y = 0; a pose is the card centre plus its turn about the screen normal.

const DEFAULT_CARD_W = 63;
const DEFAULT_CARD_H = 88;
const HOVER_SPREAD = 0.25;

const positive = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;
// -0 would make mirrored poses compare unequal.
const clean = (value) => (Object.is(value, -0) ? 0 : value);

/**
 * Angle between neighbouring cards: as wide as a full card's arc, capped by `maxSpreadDeg`
 * and by fitting `width`, but never so tight that less than `overlapMin * cardW` of a card
 * shows (the fan then runs past `width`, symmetrically). The whole fan stays within ±90°.
 */
function fanPitch(count, { width, radius, maxSpreadDeg, cardW, overlapMin }) {
  if (count < 2) return 0;
  const gaps = count - 1;
  const natural = cardW / radius;
  const spreadCap = toRad(Math.max(0, maxSpreadDeg)) / gaps;
  const halfFit = Math.asin(Math.min(1, Math.max(0, (width - cardW) / (2 * radius))));
  const fit = (2 * halfFit) / gaps;
  const floor = (Math.max(0, overlapMin) * cardW) / radius;
  const pitch = Math.max(floor, Math.min(natural, spreadCap, fit));
  return Math.min(pitch, Math.PI / gaps);
}

/**
 * @param {number} count cards (or hand-stack slots) in the fan
 * @param {{ width?: number, radius?: number, maxSpreadDeg?: number, cardW?: number,
 *   cardH?: number, hoverIndex?: number, crop?: number, lift?: number, overlapMin?: number }} [options]
 *   `crop` = share of the middle card's height below y = 0; `lift` = hover rise in card heights.
 * @returns {{ x:number, y:number, z:number, yawDeg:number, lift:number }[]} left to right;
 *   `yawDeg` counter-clockwise (cards right of centre lean right, negative); `z` = draw order
 *   (the hovered card on top); `lift` = how far that card was raised (already in `y`).
 */
export function handFanPoses(
  count,
  {
    width,
    radius,
    maxSpreadDeg = 40,
    cardW,
    cardH,
    hoverIndex = -1,
    crop = 0.45,
    lift = 0.35,
    overlapMin = 0.35,
  } = {}
) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (total === 0) return [];

  const w = positive(cardW, DEFAULT_CARD_W);
  const h = positive(cardH, DEFAULT_CARD_H);
  const fanWidth = positive(width, w * 7);
  const r = positive(radius, fanWidth * 2);
  const pitch = fanPitch(total, { width: fanWidth, radius: r, maxSpreadDeg, cardW: w, overlapMin });
  const centreY = h * (0.5 - (Number.isFinite(crop) ? crop : 0.45));
  const hovered = Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < total ? hoverIndex : -1;
  const rise = h * (Number.isFinite(lift) ? lift : 0.35);
  const spread = w * HOVER_SPREAD;

  return Array.from({ length: total }, (_, i) => {
    const angle = (i - (total - 1) / 2) * pitch;
    let x = r * Math.sin(angle);
    let y = centreY - r * (1 - Math.cos(angle));
    let cardLift = 0;
    if (hovered >= 0) {
      if (i < hovered) x -= spread;
      if (i > hovered) x += spread;
      if (i === hovered) {
        cardLift = rise;
        y += rise;
      }
    }
    return {
      x: clean(x),
      y: clean(y),
      z: i === hovered ? total : i,
      yawDeg: clean(-toDeg(angle)),
      lift: cardLift,
    };
  });
}
