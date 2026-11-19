// The scalar curves the Tera and Mega entry scenes (tera-entry.mjs, mega-entry.mjs) share.

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** `t` over [a, b] as 0 → 1, clamped. */
export const span = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t ** 3;
export const easeOutBack = (t) => (t <= 0 ? 0 : 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);

/** Up over [0, peak], down over [peak, 1]; 0 outside. */
export function pulse(t, peak) {
  if (t <= 0 || t >= 1) return 0;
  if (t <= peak) return t / peak;
  return 1 - (t - peak) / (1 - peak);
}

/** A damped swing from 1 to 0: one and a half swings, decaying by e⁻³. */
export const spring = (t) => Math.cos(Math.PI * 1.5 * t) * Math.exp(-3 * t);
