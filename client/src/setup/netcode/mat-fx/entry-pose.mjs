// Design 027: pure timelines for the signature entries (Tera crystal, Mega
// keystone). Each pose takes t in [0, 1] over the whole entry, so the phases
// of one entry share a single clock; entry.js samples them into keyframes.

export const TERA_ENTRY_MS = 2100;
export const MEGA_ENTRY_MS = 1900;

// Tera beats (fractions of TERA_ENTRY_MS).
export const TERA_SHATTER_AT = 0.62;
export const TERA_GLINT_AT = 0.8;

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

/** 1. White flash over the card; hands over to the slab. */
export function teraFlashPose(t) {
  const c = clamp01(t);
  return { opacity: plateau(c, 0, 0.1, 0.14, 0.26) };
}

/**
 * 2. The crystal slab covers the card: pops in with a small overshoot, glows
 * in a slow pulse, and is gone at the shatter (hidden under the whiteout).
 */
export function teraSlabPose(t) {
  const c = clamp01(t);
  if (c < 0.1 || c >= TERA_SHATTER_AT) return { opacity: 0, scale: 1, glow: 0 };
  const inT = span(c, 0.1, 0.22);
  const scale =
    c < 0.22
      ? 0.9 + 0.1 * easeOutBack(inT)
      : 1 + 0.015 * Math.sin((c - 0.22) * Math.PI * 6);
  const glow =
    0.55 + 0.45 * Math.sin(span(c, 0.1, TERA_SHATTER_AT) * Math.PI * 3) ** 2;
  return { opacity: easeOutCubic(inT), scale, glow };
}

/** The crystal crown grows out of the slab's top edge, then fades before the shatter. */
export function teraCrownPose(t) {
  const c = clamp01(t);
  const grow = span(c, 0.22, 0.42);
  return {
    scale: grow === 0 ? 0 : easeOutBack(grow),
    opacity: plateau(c, 0.22, 0.3, 0.52, TERA_SHATTER_AT),
  };
}

/** Orbit arcs sweep around the slab while it charges. */
export function teraArcPose(t) {
  const c = clamp01(t);
  return {
    rotate: 220 * easeInOutCubic(span(c, 0.18, TERA_SHATTER_AT)),
    scale: 0.85 + 0.25 * span(c, 0.18, TERA_SHATTER_AT),
    opacity: plateau(c, 0.18, 0.28, 0.5, 0.6),
  };
}

/** 3. Whiteout: opaque at the shatter so the slab can vanish unseen, then drains. */
export function teraWhiteoutPose(t) {
  const c = clamp01(t);
  if (c <= 0.5) return { opacity: 0, scale: 1 };
  if (c <= TERA_SHATTER_AT) {
    const e = easeInCubic(span(c, 0.5, TERA_SHATTER_AT));
    return { opacity: e, scale: 1 + 0.06 * e };
  }
  const out = easeOutCubic(span(c, TERA_SHATTER_AT, 0.8));
  return { opacity: 1 - out, scale: 1.06 + 0.1 * out };
}

/** 4. Light rays burst from the shatter point and turn slowly as they fade. */
export function teraRaysPose(t) {
  const c = clamp01(t);
  const k = span(c, TERA_SHATTER_AT, 1);
  return {
    opacity: plateau(c, TERA_SHATTER_AT, 0.67, 0.72, 0.95),
    scale: 0.6 + 1.1 * easeOutCubic(k),
    rotate: 30 * k,
  };
}

/** A violet smoke puff billows out of the shatter and thins away. */
export function teraSmokePose(t) {
  const c = clamp01(t);
  const k = span(c, TERA_SHATTER_AT, 1);
  return {
    opacity: 0.75 * plateau(c, TERA_SHATTER_AT, 0.68, 0.74, 1),
    scale: 0.7 + 1.2 * easeOutCubic(k),
  };
}

/** Mega: the keystone sphere swells around the card, holds, then bursts outward. */
export function megaSpherePose(t) {
  const c = clamp01(t);
  if (c < 0.26) {
    const k = span(c, 0, 0.26);
    return { scale: 0.4 + 0.6 * easeOutBack(k), opacity: easeOutCubic(k) };
  }
  if (c < 0.78)
    return { scale: 1 + 0.02 * Math.sin((c - 0.26) * Math.PI * 5), opacity: 1 };
  const out = easeOutCubic(span(c, 0.78, 1));
  return { scale: 1 + 0.35 * out, opacity: 1 - out };
}

/** Prismatic hex pattern inside the sphere: fades in, drifts, fades out. */
export function megaHexPose(t) {
  const c = clamp01(t);
  return { opacity: 0.8 * plateau(c, 0.12, 0.32, 0.66, 0.84), rotate: 18 * c };
}

/**
 * One brush-stroke swoosh orbiting the sphere. `phase` (degrees) spreads the
 * swooshes around the circle; `spin` (+1 / -1) sets the orbit direction.
 */
export function megaSwirlPose(t, { phase = 0, spin = 1 } = {}) {
  const c = clamp01(t);
  return {
    rotate: phase + spin * 400 * easeInOutCubic(span(c, 0.08, 0.86)),
    scale: 0.7 + 0.45 * easeOutCubic(span(c, 0.08, 0.5)),
    opacity: plateau(c, 0.08, 0.24, 0.66, 0.86),
  };
}

/** Closing flash on the card: a quick white pop that settles back to size. */
export function megaFlashPose(t) {
  const c = clamp01(t);
  const k = span(c, 0.74, 1);
  return {
    opacity: plateau(c, 0.74, 0.8, 0.82, 0.98),
    scale: k === 0 ? 1 : 1 + 0.08 * Math.sin(k * Math.PI),
  };
}
