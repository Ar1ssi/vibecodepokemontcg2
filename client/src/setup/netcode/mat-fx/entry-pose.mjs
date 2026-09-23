// Design 027 / 034: pure timelines for the signature entries, modelled frame by
// frame on TCG Live. Each pose takes t in [0, 1] over the whole entry, so the
// phases of one entry share a single clock; entry.js samples them into keyframes.

export const TERA_ENTRY_MS = 1900;
export const MEGA_ENTRY_MS = 3200;

// Tera beats (fractions of TERA_ENTRY_MS): the card is fully white and bursts
// into smoke, rays and glitter; the twinkles follow the reveal.
export const TERA_BURST_AT = 0.58;
export const TERA_GLINT_AT = 0.7;

// Mega beat (fraction of MEGA_ENTRY_MS): the keystone orb's shell shatters
// and the slash vortex launches. The orb's own timeline is in mega-orb.mjs.
export const MEGA_BURST_AT = 0.5;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
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

// ---- Tera: the card turns into a mint crystal, a Tera jewel rises from it,
// ---- the crystal fills with white light and bursts in violet smoke.

/** 1. White flash as the evolution lands; hands over to the crystal. */
export function teraFlashPose(t) {
  const c = clamp01(t);
  return { opacity: plateau(c, 0, 0.03, 0.05, 0.12) };
}

/**
 * 2. The mint crystal replaces the card with a small pop, glows in a slow
 * pulse, and is gone at the burst (hidden under the whiteout).
 */
export function teraSlabPose(t) {
  const c = clamp01(t);
  if (c < 0.03 || c >= TERA_BURST_AT) return { opacity: 0, scale: 1, glow: 0 };
  const inT = span(c, 0.03, 0.1);
  const scale =
    c < 0.1
      ? 0.94 + 0.06 * easeOutBack(inT)
      : 1 + 0.012 * Math.sin((c - 0.1) * Math.PI * 7);
  const glow =
    0.5 + 0.5 * Math.sin(span(c, 0.03, TERA_BURST_AT) * Math.PI * 3) ** 2;
  return { opacity: easeOutCubic(inT), scale, glow };
}

/** Horizontal lens streaks shoot out of the crystal as it forms, then thin away. */
export function teraStreakPose(t) {
  const c = clamp01(t);
  return {
    scaleX: 0.2 + 0.8 * easeOutCubic(span(c, 0.03, 0.2)),
    opacity: plateau(c, 0.03, 0.08, 0.26, 0.44),
  };
}

/**
 * The Tera jewel grows out of the crystal's upper half, pulses while it
 * charges, turns white with the crystal and vanishes at the burst.
 * `white` is the opacity of its white-hot copy.
 */
export function teraJewelPose(t) {
  const c = clamp01(t);
  const grow = span(c, 0.12, 0.26);
  if (grow === 0 || c >= TERA_BURST_AT)
    return { scale: 0, opacity: 0, white: 0 };
  const pulse = c > 0.26 ? 0.03 * Math.sin((c - 0.26) * Math.PI * 10) : 0;
  return {
    scale: easeOutBack(grow) + pulse,
    opacity: plateau(c, 0.12, 0.18, 0.5, TERA_BURST_AT),
    white: easeInCubic(span(c, 0.34, 0.52)),
  };
}

/** Thin arcs of light orbit the crystal while it charges. */
export function teraRingPose(t) {
  const c = clamp01(t);
  return {
    rotate: 200 * easeInOutCubic(span(c, 0.14, 0.52)),
    scale: 0.85 + 0.3 * easeOutCubic(span(c, 0.14, 0.52)),
    opacity: plateau(c, 0.14, 0.22, 0.4, 0.52),
  };
}

/** White light fills the crystal from the bottom up (scaleY, origin bottom). */
export function teraFillPose(t) {
  const c = clamp01(t);
  if (c <= 0.28 || c >= TERA_BURST_AT) return { scaleY: 0, opacity: 0 };
  return {
    scaleY: easeInOutCubic(span(c, 0.28, 0.5)),
    opacity: easeOutCubic(span(c, 0.28, 0.33)),
  };
}

/** 3. Whiteout: opaque at the burst so the crystal can vanish unseen, then drains. */
export function teraWhiteoutPose(t) {
  const c = clamp01(t);
  if (c <= 0.46) return { opacity: 0, scale: 1 };
  if (c <= TERA_BURST_AT) {
    const e = easeInCubic(span(c, 0.46, TERA_BURST_AT));
    return { opacity: e, scale: 1 + 0.05 * e };
  }
  const out = easeOutCubic(span(c, TERA_BURST_AT, 0.7));
  return { opacity: 1 - out, scale: 1.05 + 0.08 * out };
}

/** 4. Light rays burst from the card and turn slowly as they fade. */
export function teraRaysPose(t) {
  const c = clamp01(t);
  const k = span(c, TERA_BURST_AT, 1);
  return {
    opacity: plateau(c, TERA_BURST_AT, 0.6, 0.64, 0.8),
    scale: 0.5 + 1.1 * easeOutCubic(k),
    rotate: 24 * k,
  };
}

/** A ring of violet smoke billows out of the burst and thins away. */
export function teraSmokePose(t) {
  const c = clamp01(t);
  const k = span(c, TERA_BURST_AT - 0.02, 1);
  return {
    opacity: 0.9 * plateau(c, TERA_BURST_AT - 0.02, 0.62, 0.66, 0.86),
    scale: 0.55 + 0.95 * easeOutCubic(k),
    rotate: 40 * k,
  };
}

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

/**
 * One brush stroke of the vortex. It is flung out of the burst to its orbit
 * `radius` (a multiple of the card height, applied by the caller), whips round
 * fast and decelerates, then fades. `phase` (degrees) spreads the strokes,
 * `spin` (+1 / -1) sets the orbit direction, `lag` staggers its launch.
 */
export function megaSlashPose(t, { phase = 0, spin = 1, lag = 0 } = {}) {
  const c = clamp01(t);
  const start = MEGA_BURST_AT - 0.01 + lag;
  const k = span(c, start, 1);
  return {
    rotate: phase + spin * 400 * easeOutCubic(k),
    radius: 0.25 + 0.75 * easeOutCubic(span(c, start, start + 0.12)),
    scale: 0.4 + 0.6 * easeOutBack(span(c, start, start + 0.1)),
    opacity: plateau(c, start, start + 0.03, 0.72, 0.94 - lag),
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
