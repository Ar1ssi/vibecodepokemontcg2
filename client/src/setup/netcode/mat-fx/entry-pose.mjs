// Design 027 / 034: pure timelines for the Mega entry's DOM layers, modelled
// frame by frame on TCG Live. Each pose takes t in [0, 1] over the whole entry,
// so its phases share a single clock; entry.js samples them into keyframes.
// The Tera entry's timeline lives in tera-crystal.mjs (design 037).

export const MEGA_ENTRY_MS = 3200;

// Mega beat (fraction of MEGA_ENTRY_MS): the keystone orb's shell shatters
// and the brush-stroke vortex launches. The orb's timeline is in mega-orb.mjs,
// the vortex's in mega-vortex.mjs.
export const MEGA_BURST_AT = 0.5;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
/** 0 before `a`, 1 after `b`, linear between. */
const span = (t, a, b) => clamp01((t - a) / (b - a));
/** Rises over [a, b], holds, falls over [c, d]. */
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};

// ---- Mega: the whole mat turns into a prismatic hex field; the card goes
// ---- white-hot inside the keystone orb (mega-orb.mjs), whose shell shatters
// ---- into a vortex of orange and blue brush strokes around the revealed card.

/** The hex field over the mat: `reveal` is the clip radius as a fraction of its max. */
export function megaFieldPose(t) {
  const c = clamp01(t);
  return {
    reveal: easeOutCubic(span(c, 0, 0.16)),
    opacity: plateau(c, 0, 0.03, 0.8, 0.97),
  };
}

/** The bright wavefront riding the edge of the field reveal. */
export function megaWavePose(t) {
  const c = clamp01(t);
  return {
    scale: 0.05 + 0.95 * easeOutCubic(span(c, 0, 0.16)),
    opacity: plateau(c, 0, 0.02, 0.1, 0.18),
  };
}

/** Slow holographic drift of the field's colour wash (fractions of its size). */
export function megaWashPose(t) {
  const c = clamp01(t);
  return { x: -0.04 + 0.08 * c, y: 0.03 - 0.06 * c, opacity: 1 };
}

/** The glass lens centred on the card: pops in, pulses at the burst, fades with the field. */
export function megaLensPose(t) {
  const c = clamp01(t);
  const kick = Math.sin(span(c, MEGA_BURST_AT, MEGA_BURST_AT + 0.1) * Math.PI);
  return {
    scale: 0.6 + 0.4 * easeOutBack(span(c, 0.03, 0.14)) + 0.06 * kick,
    opacity: plateau(c, 0.03, 0.1, 0.78, 0.95),
  };
}

/** The card flashes white-hot and swells slightly as the orb forms around it. */
export function megaSilhouettePose(t) {
  const c = clamp01(t);
  return {
    opacity: plateau(c, 0.02, 0.06, 0.1, 0.15),
    scale: 1 + 0.06 * easeOutCubic(span(c, 0.02, 0.12)),
  };
}

/** The white burst that hands the orb over to the revealed card. */
export function megaFlashPose(t) {
  const c = clamp01(t);
  return {
    opacity: plateau(
      c,
      MEGA_BURST_AT - 0.03,
      MEGA_BURST_AT,
      MEGA_BURST_AT + 0.02,
      MEGA_BURST_AT + 0.13
    ),
    scale:
      0.6 +
      1.2 * easeOutCubic(span(c, MEGA_BURST_AT - 0.03, MEGA_BURST_AT + 0.13)),
  };
}

const validRect = (r) =>
  Boolean(r) &&
  [r.left, r.top, r.width, r.height].every(Number.isFinite) &&
  r.width > 1 &&
  r.height > 1;

/**
 * Fallback stage for the Mega field when the mat surface is missing: 5 card
 * heights wide and 3.4 tall around the card, clipped to the viewport.
 * @returns {{left:number, top:number, width:number, height:number}}
 */
export function megaStageRect(cardRect, viewport) {
  const cx = cardRect.left + cardRect.width / 2;
  const cy = cardRect.top + cardRect.height / 2;
  let left = cx - cardRect.height * 2.5;
  let right = cx + cardRect.height * 2.5;
  let top = cy - cardRect.height * 1.7;
  let bottom = cy + cardRect.height * 1.7;
  if (validRect(viewport)) {
    left = Math.max(left, viewport.left);
    top = Math.max(top, viewport.top);
    right = Math.min(right, viewport.left + viewport.width);
    bottom = Math.min(bottom, viewport.top + viewport.height);
  }
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Where the card sits inside the Mega field's own (untransformed) box.
 * `surfaceRect` is the field element's on-screen box, `surfaceSize` its
 * layout size: the mat is tilted, so screen pixels are scaled into the
 * element's pixels. Returns null when either box is unusable.
 * @returns {{x:number, y:number, unit:number, reach:number} | null}
 *   card centre, card height and farthest-corner distance, in field pixels
 */
export function megaFieldPlacement(cardRect, surfaceRect, surfaceSize) {
  if (!validRect(cardRect) || !validRect(surfaceRect)) return null;
  const width = surfaceSize?.width;
  const height = surfaceSize?.height;
  if (!(width > 1) || !(height > 1)) return null;
  const sx = width / surfaceRect.width;
  const sy = height / surfaceRect.height;
  const x = (cardRect.left + cardRect.width / 2 - surfaceRect.left) * sx;
  const y = (cardRect.top + cardRect.height / 2 - surfaceRect.top) * sy;
  const reach = Math.max(
    Math.hypot(x, y),
    Math.hypot(width - x, y),
    Math.hypot(x, height - y),
    Math.hypot(width - x, height - y)
  );
  return { x, y, unit: cardRect.height * sx, reach };
}
