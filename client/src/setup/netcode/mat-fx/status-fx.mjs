// Design 022 slice 3: presentation table for the `statusApplied` pop. Keys are
// the engine's condition names (shared/engine/rules/special-conditions.mjs).
export const STATUS_APPLY_MS = 700;

const STATUS_FX = {
  Poisoned: { key: 'poison', label: 'Poisoned' },
  Burned: { key: 'burn', label: 'Burned' },
  Asleep: { key: 'asleep', label: 'Asleep' },
  Paralyzed: { key: 'paralyzed', label: 'Paralyzed' },
  Confused: { key: 'confused', label: 'Confused' },
};

/** @returns {{key:string,label:string}|null} null for an unknown condition. */
export const statusFxFor = (condition) =>
  Object.hasOwn(STATUS_FX, condition) ? STATUS_FX[condition] : null;

/** Ring pops out from the card center and fades; label rises slightly. */
export function statusApplyPose(t) {
  const c = Math.max(0, Math.min(1, t));
  const out = 1 - (1 - c) ** 3;
  return {
    ringScale: 0.7 + 0.6 * out,
    ringOpacity: c < 0.15 ? c / 0.15 : 1 - (c - 0.15) / 0.85,
    labelY: -14 * out,
    labelOpacity: c < 0.7 ? 1 : Math.max(0, 1 - (c - 0.7) / 0.3),
  };
}
