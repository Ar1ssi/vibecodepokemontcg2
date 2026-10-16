// Card dimensions and outline for the three.js board (design 074 O5-A). Pure: card-mesh.js turns
// the outline into an ExtrudeGeometry; nothing here imports three.

/** TCG Live's card mesh in its own units (design 067:30): width, height, thickness. */
export const CARD_UNITS = Object.freeze({ w: 6.397, h: 8.9, t: 0.064 });

/** Corner radius as a share of the card width (the 3 mm of a 63 mm card, as foilGeometry uses). */
const CORNER_RADIUS_FRAC = 0.048;

/** Card units → flat px for a card drawn `widthPx` wide. */
export function cardScaleFor(widthPx) {
  return widthPx / CARD_UNITS.w;
}

/** Corner radius for a card `w` wide, in the same unit as `w`. */
export function cardCornerRadius(w) {
  return w * CORNER_RADIUS_FRAC;
}

/** Start angle (degrees) of each corner arc, counter-clockwise from the lower right. */
const CORNERS = [
  { sx: 1, sy: -1, start: -90 },
  { sx: 1, sy: 1, start: 0 },
  { sx: -1, sy: 1, start: 90 },
  { sx: -1, sy: -1, start: 180 },
];

/**
 * Rounded rectangle centred on the origin as a counter-clockwise ring of `4 * segs` points,
 * `segs` per corner arc (both arc ends included, so each straight edge joins two arcs). It
 * starts on the lower right corner's arc where it meets the bottom edge. The ring is open:
 * the last point joins the first. `r` is clamped to half the shorter side; `segs = 1` puts
 * each corner's single point at the arc's middle.
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @param {number} [segs]
 * @returns {[number, number][]}
 */
export function roundedRectShapePoints(w, h, r, segs = 16) {
  if (!(w > 0 && h > 0))
    throw new RangeError('rounded rect needs a positive width and height');
  const count = Math.max(1, Math.floor(Number(segs) || 0));
  const radius = Math.min(Math.max(0, Number(r) || 0), w / 2, h / 2);
  const points = [];
  for (const { sx, sy, start } of CORNERS) {
    const cx = sx * (w / 2 - radius);
    const cy = sy * (h / 2 - radius);
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0.5 : k / (count - 1);
      const angle = ((start + 90 * t) * Math.PI) / 180;
      points.push([
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
      ]);
    }
  }
  return points;
}
