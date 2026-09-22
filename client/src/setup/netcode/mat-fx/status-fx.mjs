// Design 022 slice 3: presentation table for the `statusApplied` pop. Keys are
// the engine's condition names (shared/engine/rules/special-conditions.mjs).
export const STATUS_APPLY_MS = 1000;

// Design 026: each condition also names its particle look. `direction` /
// `spread` are degrees (-90 = up); `gravity` < 0 floats, > 0 falls; distance
// and size are fractions of the card width.
const STATUS_FX = {
  Poisoned: {
    key: 'poison',
    label: 'Poisoned',
    particles: { className: 'fx-particle--mote', count: 12, direction: -90, spread: 80, distance: 0.7, size: [0.08, 0.16], gravity: -0.2 },
  },
  Burned: {
    key: 'burn',
    label: 'Burned',
    particles: { className: 'fx-particle--mote', count: 16, direction: -90, spread: 70, distance: 0.85, size: [0.05, 0.11], gravity: -0.3 },
  },
  Asleep: {
    key: 'asleep',
    label: 'Asleep',
    particles: { className: 'fx-particle--z', count: 3, direction: -60, spread: 30, distance: 0.8, size: [0.16, 0.24], gravity: -0.1, orient: false },
  },
  Paralyzed: {
    key: 'paralyzed',
    label: 'Paralyzed',
    particles: { className: 'fx-particle--streak', count: 14, direction: 0, spread: 360, distance: 0.6, size: [0.12, 0.22], aspect: 0.14, gravity: 0 },
  },
  Confused: {
    key: 'confused',
    label: 'Confused',
    particles: { className: 'fx-particle--mote', count: 10, direction: 0, spread: 360, distance: 0.45, size: [0.07, 0.13], gravity: -0.15 },
  },
};

/** @returns {{key:string,label:string}|null} null for an unknown condition. */
export const statusFxFor = (condition) =>
  Object.hasOwn(STATUS_FX, condition) ? STATUS_FX[condition] : null;

/** Card-shaped glow pops out and fades; label drops in with a bounce, then fades. */
export function statusApplyPose(t) {
  const c = Math.max(0, Math.min(1, t));
  const out = 1 - (1 - c) ** 3;
  return {
    ringScale: 0.7 + 0.6 * out,
    ringOpacity: c < 0.15 ? c / 0.15 : 1 - (c - 0.15) / 0.85,
    labelY: -14 * out,
    labelScale: c < 0.12 ? 0.5 + 0.7 * (c / 0.12) : c < 0.24 ? 1.2 - 0.2 * ((c - 0.12) / 0.12) : 1,
    labelOpacity: c < 0.7 ? 1 : Math.max(0, 1 - (c - 0.7) / 0.3),
  };
}
